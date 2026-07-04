import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import YAML from "yaml";
import { TraceabilityYaml } from "./schemas.js";
import { listDeltaFiles, parseDelta } from "./artifactStore.js";
import { readMeta, activeWaivers } from "./metaStore.js";
import type { Task } from "./plan.js";

/**
 * T-300 (FR-023): traceability between scenarios and tests/code.
 * Tests declare coverage by containing "Scenario: <name>" in their source
 * (test titles or @scenario tags). `hx trace check` blocks when a scenario has
 * neither a mapped test nor a valid waiver.
 */

export function readTrace(ws: Workspace, change: string): TraceabilityYaml {
  const f = ws.traceFile(change);
  if (!fs.existsSync(f)) return { requirements: {} };
  return TraceabilityYaml.parse(YAML.parse(fs.readFileSync(f, "utf8")) ?? {});
}

export function writeTrace(ws: Workspace, change: string, trace: TraceabilityYaml): void {
  ensureDir(path.dirname(ws.traceFile(change)));
  writeYaml(ws.traceFile(change), trace);
}

/** Scenario names declared in the change's delta specs. */
export function changeScenarios(ws: Workspace, change: string): { capability: string; requirement: string; scenario: string }[] {
  const out: { capability: string; requirement: string; scenario: string }[] = [];
  for (const { capability, file } of listDeltaFiles(ws, change)) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    for (const section of delta.sections) {
      if (section.op === "REMOVED") continue;
      for (const req of section.requirements) {
        for (const s of req.scenarios) out.push({ capability, requirement: req.name, scenario: s.name });
      }
    }
  }
  return out;
}

/** Scans test files for "Scenario: <name>" references. */
export function scanTestsForScenarios(root: string, testDirs = ["tests", "test", "src"]): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        visit(p);
      } else if (/\.(test|spec)\.[jt]sx?$|_test\.py$|test_.*\.py$/.test(entry.name)) {
        const content = fs.readFileSync(p, "utf8");
        for (const m of content.matchAll(/Scenario:\s*([^"'`\n)]+)/g)) {
          const name = m[1].trim();
          const arr = hits.get(name) ?? [];
          arr.push(path.relative(root, p));
          hits.set(name, arr);
        }
      }
    }
  };
  for (const d of testDirs) visit(path.join(root, d));
  return hits;
}

export interface TraceCheckResult {
  covered: number;
  waived: number;
  uncovered: { capability: string; requirement: string; scenario: string }[];
  passed: boolean;
}

/** Rebuilds traceability.yaml from specs + test scan, honoring scenario waivers. */
export function traceCheck(ws: Workspace, change: string): TraceCheckResult {
  const scenarios = changeScenarios(ws, change);
  const testHits = scanTestsForScenarios(ws.root);
  const meta = readMeta(ws, change);
  const waivedTargets = new Set(activeWaivers(meta).map((w) => w.target));

  const trace: TraceabilityYaml = { requirements: {} };
  const uncovered: TraceCheckResult["uncovered"] = [];
  let covered = 0;
  let waived = 0;

  for (const s of scenarios) {
    const key = `${s.capability}/${s.requirement}`;
    trace.requirements[key] ??= { scenarios: {} };
    const tests = testHits.get(s.scenario) ?? [];
    const waiverKey = `scenario:${s.scenario}`;
    if (tests.length > 0) {
      trace.requirements[key].scenarios[s.scenario] = { tests, code: [], status: "covered" };
      covered++;
    } else if (waivedTargets.has(waiverKey)) {
      trace.requirements[key].scenarios[s.scenario] = { tests: [], code: [], status: "waived" };
      waived++;
    } else {
      trace.requirements[key].scenarios[s.scenario] = { tests: [], code: [], status: "partial" };
      uncovered.push(s);
    }
  }
  writeTrace(ws, change, trace);
  return { covered, waived, uncovered, passed: uncovered.length === 0 };
}

/** Called by the apply loop when a task completes (FR-007). */
export function updateTraceForTask(ws: Workspace, change: string, task: Task): void {
  const trace = readTrace(ws, change);
  const key = `${task.capability}/${task.requirement}`;
  trace.requirements[key] ??= { scenarios: {} };
  writeTrace(ws, change, trace);
}
