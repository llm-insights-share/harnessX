import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace } from "./paths.js";
import { AssetManifest } from "./schemas.js";
import { effectiveProfileTaskSet } from "./profileAssets.js";
import { resolveSuiteSensors } from "./profileResolve.js";
import { resolveHarnessGuideDef, resolveHarnessSensorDef } from "./harnessCompose.js";
import { taskById, type DeliveryStage } from "./stages.js";
import { SKILL_ENTRY } from "./skill.js";
import { hasTaskEntryForTask } from "./taskShell.js";

export type CompletenessLevel = "error" | "warn" | "info";

export interface CompletenessFinding {
  level: CompletenessLevel;
  code: string;
  message: string;
  suggestion?: string;
}

export interface CompletenessReport {
  ok: boolean;
  findings: CompletenessFinding[];
}

export interface CompletenessOptions {
  /** Profile to validate (defaults to config.profile). */
  profile?: string;
  /** When true, treat warn findings as errors for ok/throw. */
  strict?: boolean;
  /** Skip hub-cache ↔ harness registration checks. */
  skipHubCache?: boolean;
  /** Skip stale IDE skill checks. */
  skipIdeSkills?: boolean;
}

function readCacheManifest(dir: string): AssetManifest | null {
  const f = path.join(dir, "asset.yaml");
  if (!fs.existsSync(f)) return null;
  try {
    return AssetManifest.parse(YAML.parse(fs.readFileSync(f, "utf8")));
  } catch {
    return null;
  }
}

function guideSourceExists(ws: Workspace, source: string, kind: string): boolean {
  const abs = path.join(ws.base, source);
  if (!fs.existsSync(abs)) return false;
  if (kind === "guide.skill") {
    const skill = fs.statSync(abs).isDirectory() ? path.join(abs, SKILL_ENTRY) : abs;
    return fs.existsSync(skill);
  }
  return true;
}

function listHubCachePackages(ws: Workspace): { id: string; dir: string }[] {
  const cacheRoot = path.join(ws.base, ".hub-cache");
  if (!fs.existsSync(cacheRoot)) return [];
  return fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ id: e.name, dir: path.join(cacheRoot, e.name) }));
}

/** Format findings for CLI / error messages. */
export function formatCompletenessFindings(findings: CompletenessFinding[]): string {
  return findings
    .map((f) => {
      const sug = f.suggestion ? ` — ${f.suggestion}` : "";
      return `[${f.level}] ${f.code}: ${f.message}${sug}`;
    })
    .join("\n");
}

/**
 * Validate harness.yaml against STAGE_TASKS, hub cache, and on-disk sources.
 * Used after init / project create / sync-hub and by `hx harness lint --completeness`.
 */
export function validateHarnessCompleteness(ws: Workspace, opts: CompletenessOptions = {}): CompletenessReport {
  const findings: CompletenessFinding[] = [];
  if (!fs.existsSync(ws.harnessFile)) {
    return {
      ok: false,
      findings: [
        {
          level: "error",
          code: "missing_harness",
          message: "harness.yaml not found",
          suggestion: "Run hx init or hx project create"
        }
      ]
    };
  }

  const config = ws.readConfig();
  const profile = opts.profile ?? config.profile ?? "standard";
  const harness = ws.readHarness();
  const tasks = effectiveProfileTaskSet(profile, harness);
  const registeredGuides = new Set(harness.guides.map((g) => g.id));
  const registeredSensors = new Set(harness.sensors.map((s) => s.id));

  for (const { stage, taskId } of tasks) {
    const def = taskById(stage, taskId);
    if (!def) {
      findings.push({
        level: "warn",
        code: "orphan_guide_binding",
        message: `effective task ${stage}.${taskId} is not in STAGE_TASKS`,
        suggestion: "Remove the suite key or fix the task id"
      });
      continue;
    }
    const level: CompletenessLevel = def.required ? "error" : "warn";

    for (const guideId of def.guides ?? []) {
      const resolved = resolveHarnessGuideDef(ws, guideId);
      const inHarness = registeredGuides.has(guideId);
      if (!inHarness && !resolved) {
        findings.push({
          level,
          code: "missing_stage_task_guide",
          message: `task ${stage}.${taskId} expects guide "${guideId}" but it is not registered in harness.yaml`,
          suggestion: "Add the guide to harness.guides or pull it via hx project sync-hub"
        });
      } else if (!inHarness && resolved) {
        findings.push({
          level: "warn",
          code: "missing_stage_task_guide",
          message: `task ${stage}.${taskId} expects guide "${guideId}" in harness.yaml (found only in hub-cache/builtin)`,
          suggestion: "Register the guide in harness.yaml (hx project sync-hub / landHubAssets)"
        });
      }
    }

    for (const sensorId of def.sensors ?? []) {
      const inHarness = registeredSensors.has(sensorId);
      const resolved = resolveHarnessSensorDef(ws, sensorId);
      if (!inHarness && !resolved) {
        findings.push({
          level,
          code: "missing_stage_task_guide",
          message: `task ${stage}.${taskId} expects sensor "${sensorId}" but it is not registered in harness.yaml`,
          suggestion: "Add the sensor to harness.sensors or pull via hx project sync-hub"
        });
      }
    }

    if (!hasTaskEntryForTask(ws, stage, taskId)) {
      findings.push({
        level,
        code: "missing_task_entry",
        message: `task ${stage}.${taskId} has no assemblable task entry (guide.workflow / guide.command)`,
        suggestion: "Register a guide.workflow (or optional guide.command override) with matching stage/task"
      });
    }

    const suiteSensors = resolveSuiteSensors(harness, profile, stage, taskId);
    for (const sensorId of suiteSensors) {
      if (!registeredSensors.has(sensorId) && !resolveHarnessSensorDef(ws, sensorId)) {
        findings.push({
          level: "error",
          code: "suite_sensor_missing",
          message: `suite for ${stage}.${taskId} references sensor "${sensorId}" which is not registered`,
          suggestion: "Add the sensor to harness.sensors or fix the suite binding"
        });
      }
    }
  }

  for (const g of harness.guides) {
    if (g.stage && g.task && !taskById(g.stage as DeliveryStage, g.task)) {
      findings.push({
        level: "warn",
        code: "orphan_guide_binding",
        message: `guide "${g.id}" binds to unknown task ${g.stage}.${g.task}`,
        suggestion: "Fix stage/task on the guide or remove the binding"
      });
    }
    if (!guideSourceExists(ws, g.source, g.kind)) {
      findings.push({
        level: "error",
        code: "harness_guide_missing_source",
        message: `guide "${g.id}" source missing: ${g.source}`,
        suggestion: "Restore the asset file or fix the source path"
      });
    }
  }

  if (!opts.skipHubCache) {
    for (const { id, dir } of listHubCachePackages(ws)) {
      const manifest = readCacheManifest(dir);
      if (!manifest) continue;
      if (!manifest.kind.startsWith("guide.") && !manifest.kind.startsWith("sensor.")) continue;
      if (!manifest.stage) continue;
      const registered =
        manifest.kind.startsWith("guide.") ? registeredGuides.has(id) : registeredSensors.has(id);
      if (!registered) {
        findings.push({
          level: "warn",
          code: "hub_cache_unregistered",
          message: `hub-cache package "${id}" (${manifest.kind}, ${manifest.stage}${manifest.task ? `.${manifest.task}` : ""}) is not registered in harness.yaml`,
          suggestion: "Run hx project sync-hub (or landHubAssets) to register, then hx adapter sync"
        });
      }
    }
  }

  if (!opts.skipIdeSkills) {
    const cursorSkills = path.join(ws.root, ".cursor", "skills");
    if (fs.existsSync(cursorSkills)) {
      for (const e of fs.readdirSync(cursorSkills, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith(".")) continue;
        if (!registeredGuides.has(e.name)) {
          findings.push({
            level: "info",
            code: "stale_ide_skill",
            message: `.cursor/skills/${e.name} exists but harness has no guide "${e.name}"`,
            suggestion: "Register the guide in harness.yaml then run hx adapter sync, or remove the stale skill"
          });
        }
      }
    }
  }

  const failLevels: CompletenessLevel[] = opts.strict ? ["error", "warn"] : ["error"];
  const ok = !findings.some((f) => failLevels.includes(f.level));
  return { ok, findings };
}

/** Throw if completeness has error-level findings (or warn when strict). */
export function assertHarnessCompleteness(ws: Workspace, opts: CompletenessOptions = {}): CompletenessReport {
  const report = validateHarnessCompleteness(ws, opts);
  if (!report.ok) {
    const relevant = opts.strict
      ? report.findings.filter((f) => f.level === "error" || f.level === "warn")
      : report.findings.filter((f) => f.level === "error");
    throw new Error(`harness completeness failed:\n${formatCompletenessFindings(relevant)}`);
  }
  return report;
}

/** Scaffold-only check after hx init (no hub cache expected). */
export function validateScaffoldCompleteness(ws: Workspace, opts: CompletenessOptions = {}): CompletenessReport {
  return validateHarnessCompleteness(ws, {
    ...opts,
    skipHubCache: true,
    skipIdeSkills: true
  });
}
