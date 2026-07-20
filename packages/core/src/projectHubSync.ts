import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { spawnSync } from "node:child_process";
import { AssetManifest, type SensorDef, SENSOR_KINDS, type HarnessLock } from "./schemas.js";
import { Workspace, writeYaml } from "./paths.js";
import { loadAssetDir, writeLock } from "./assets.js";
import { guideDefFromHubAsset } from "./harnessCompose.js";
import { hubAdd, hubSync, hubSyncApply, type HubSyncApplyResult } from "./hub.js";
import { DEFAULT_PROFILE_STAGES } from "./stages.js";
import { resolveProfileAssets } from "./profileAssets.js";
import { bindTaskSensorToSuites } from "./suiteBind.js";
import { assertHarnessCompleteness } from "./harnessCompleteness.js";

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function findAssetContentFile(assetDir: string): string {
  for (const name of ["SKILL.md", "template.md", "COMMAND.md", "constraint.yaml", "rules.yaml"]) {
    if (fs.existsSync(path.join(assetDir, name))) return name;
  }
  for (const e of fs.readdirSync(assetDir, { withFileTypes: true })) {
    if (e.isFile() && /\.(md|yaml|yml)$/.test(e.name) && e.name !== "asset.yaml") return e.name;
  }
  throw new Error(`no content file in asset dir ${assetDir}`);
}

function sensorDefFromHubAsset(ws: Workspace, assetDir: string, manifest: AssetManifest): SensorDef {
  const kind = SENSOR_KINDS.find((k) => k === manifest.kind);
  if (!kind) throw new Error(`asset ${manifest.id} is not a sensor kind`);
  const runRel = path.relative(ws.base, path.join(assetDir, findAssetContentFile(assetDir))).replace(/\\/g, "/");
  return {
    id: manifest.id,
    kind,
    execution: manifest.execution ?? "computational",
    stage: manifest.stage,
    task: manifest.task,
    trigger: "task",
    run: runRel,
    on_fail: "block",
    max_retries: 0,
    timeout_ms: 120000
  };
}

function upsertDependency(deps: string[], id: string, version: string): void {
  const next = deps.filter((d) => !d.startsWith(`${id}@`));
  next.push(`${id}@${version}`);
  deps.length = 0;
  deps.push(...next);
}

export interface LandHubAssetsOptions {
  /** When set, hubAdd any missing profile-resolved packages before landing. */
  profile?: string;
  /** Restrict landing to these package ids. */
  only?: string[];
  /** Skip harness completeness assert after write (tests / --force). */
  skipCompleteness?: boolean;
}

export interface LandedAsset {
  id: string;
  version: string;
  kind: string;
  localDir: string;
}

/** Copy `.hub-cache` packages into `assets/` and upsert harness guides/sensors/dependencies. */
export function landHubAssets(ws: Workspace, hubRoot: string, opts: LandHubAssetsOptions = {}): { landed: LandedAsset[] } {
  if (opts.profile) {
    const resolution = resolveProfileAssets(hubRoot, opts.profile, ws);
    for (const asset of resolution.assets) {
      if (opts.only?.length && !opts.only.includes(asset.id)) continue;
      const cacheManifest = path.join(ws.base, ".hub-cache", asset.id, "asset.yaml");
      if (!fs.existsSync(cacheManifest)) {
        hubAdd(ws, hubRoot, { id: asset.id, version: asset.version });
      }
    }
  }

  const cacheRoot = path.join(ws.base, ".hub-cache");
  const landed: LandedAsset[] = [];
  if (!fs.existsSync(cacheRoot)) return { landed };

  const harness = ws.readHarness();
  const ids = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  for (const id of ids) {
    if (opts.only?.length && !opts.only.includes(id)) continue;
    const cacheDir = path.join(cacheRoot, id);
    const asset = loadAssetDir(cacheDir, "hub");
    if (!asset) continue;
    const { manifest } = asset;
    if (!manifest.kind.startsWith("guide.") && !manifest.kind.startsWith("sensor.")) continue;

    const localDir = path.join(ws.assetsDir, manifest.kind.startsWith("guide.") ? "guides" : "sensors", id);
    fs.rmSync(localDir, { recursive: true, force: true });
    copyDir(cacheDir, localDir);

    upsertDependency(harness.dependencies, id, manifest.version);

    if (manifest.kind.startsWith("guide.")) {
      const def = guideDefFromHubAsset(ws, localDir, AssetManifest.parse(YAML.parse(fs.readFileSync(path.join(localDir, "asset.yaml"), "utf8"))));
      const idx = harness.guides.findIndex((g) => g.id === id);
      if (idx >= 0) harness.guides[idx] = def;
      else harness.guides.push(def);
    } else {
      const def = sensorDefFromHubAsset(ws, localDir, AssetManifest.parse(YAML.parse(fs.readFileSync(path.join(localDir, "asset.yaml"), "utf8"))));
      const idx = harness.sensors.findIndex((s) => s.id === id);
      if (idx >= 0) harness.sensors[idx] = def;
      else harness.sensors.push(def);
      bindTaskSensorToSuites(harness, def, opts.profile);
    }

    landed.push({ id, version: manifest.version, kind: manifest.kind, localDir });
  }

  if (opts.profile && !harness.profiles[opts.profile] && DEFAULT_PROFILE_STAGES[opts.profile]) {
    const d = DEFAULT_PROFILE_STAGES[opts.profile];
    harness.profiles[opts.profile] = {
      stages: [...d.stages],
      tasks: {
        ...(d.req_tasks?.length ? { req: d.req_tasks.map((id) => ({ id })) } : {}),
        ...(d.arch_tasks?.length ? { arch: d.arch_tasks.map((id) => ({ id })) } : {}),
        ...(d.dev_tasks?.length ? { dev: d.dev_tasks.map((id) => ({ id })) } : {}),
        ...(d.test_tasks?.length ? { test: d.test_tasks.map((id) => ({ id })) } : {})
      },
      suites: {}
    };
  }

  writeYaml(ws.harnessFile, harness);
  if (!opts.skipCompleteness) {
    const profile = opts.profile ?? ws.readConfig().profile;
    assertHarnessCompleteness(ws, { profile });
  }
  return { landed };
}

export interface SyncProjectFromHubOptions {
  force?: boolean;
  only?: string[];
  /** Install all `available` hub packages (not only profile-matched). */
  installAvailable?: boolean;
  profile?: string;
  /** When false, skip hubSyncApply (land + lock only). Default true. */
  apply?: boolean;
  dryRun?: boolean;
}

export interface SyncProjectFromHubResult {
  syncResults: HubSyncApplyResult[];
  installedAvailable: string[];
  landed: LandedAsset[];
  lock: HarnessLock | null;
  gitAddPaths: string[];
  nextSteps: string[];
}

const GIT_ADD_PATHS = [
  "harnessX/assets",
  "harnessX/harness.yaml",
  "harnessX/harness.lock",
  "harnessX/.hub-cache"
];

/** Owner pipeline: sync hub cache → land assets/harness → write lock. */
export function syncProjectFromHub(ws: Workspace, hubRoot: string, opts: SyncProjectFromHubOptions = {}): SyncProjectFromHubResult {
  const config = ws.readConfig();
  const profile = opts.profile ?? config.profile;
  const apply = opts.apply !== false;
  const installedAvailable: string[] = [];
  let syncResults: HubSyncApplyResult[] = [];

  if (opts.dryRun) {
    const preview = hubSync(ws, hubRoot);
    return {
      syncResults: preview.map((e) => ({
        id: e.id,
        action: "skipped",
        detail: e.state,
        toVersion: e.latest
      })),
      installedAvailable: [],
      landed: [],
      lock: null,
      gitAddPaths: GIT_ADD_PATHS,
      nextSteps: [
        "Re-run without --dry-run to apply",
        `Then: git add ${GIT_ADD_PATHS.join(" ")} && git commit && git push`
      ]
    };
  }

  if (apply) {
    syncResults = hubSyncApply(ws, hubRoot, { force: opts.force, only: opts.only });
  }

  const profileIds = new Set(resolveProfileAssets(hubRoot, profile, ws).assets.map((a) => a.id));
  for (const entry of hubSync(ws, hubRoot)) {
    if (entry.state !== "available") continue;
    if (opts.only?.length && !opts.only.includes(entry.id)) continue;
    const shouldInstall = opts.installAvailable || profileIds.has(entry.id);
    if (!shouldInstall) continue;
    hubAdd(ws, hubRoot, { id: entry.id, version: entry.latest });
    installedAvailable.push(`${entry.id}@${entry.latest}`);
  }

  const { landed } = landHubAssets(ws, hubRoot, {
    profile,
    only: opts.only,
    skipCompleteness: opts.force === true
  });
  const lock = writeLock(ws);

  return {
    syncResults,
    installedAvailable,
    landed,
    lock,
    gitAddPaths: GIT_ADD_PATHS,
    nextSteps: [
      `git add ${GIT_ADD_PATHS.join(" ")}`,
      'git commit -m "chore: sync hub assets into project"',
      "git push",
      "Notify teammates: hx project pull-assets && hx adapter sync"
    ]
  };
}

export interface CommitProjectHubPathsOptions {
  message?: string;
  push?: boolean;
  remote?: string;
  branch?: string;
}

/** Stage allowlisted harness paths; refuse if other dirty files exist outside allowlist when committing. */
export function commitProjectHubPaths(root: string, opts: CommitProjectHubPathsOptions = {}): { committed: boolean; pushed: boolean } {
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if ((status.status ?? 1) !== 0) throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  const lines = status.stdout.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const allow = (rel: string) =>
    GIT_ADD_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`)) ||
    rel === "harnessX/harness.yaml" ||
    rel === "harnessX/harness.lock";

  const dirtyOutside: string[] = [];
  for (const line of lines) {
    const rel = line.slice(3).trim().replace(/^"/, "").replace(/"$/, "");
    if (!allow(rel) && !rel.startsWith("harnessX/.hub-cache/") && !rel.startsWith("harnessX/assets/")) {
      dirtyOutside.push(rel);
    }
  }
  if (dirtyOutside.length) {
    throw new Error(
      `refusing auto-commit: dirty paths outside hub allowlist:\n  ${dirtyOutside.slice(0, 10).join("\n  ")}` +
        (dirtyOutside.length > 10 ? `\n  … +${dirtyOutside.length - 10} more` : "")
    );
  }

  for (const p of GIT_ADD_PATHS) {
    spawnSync("git", ["add", "-A", "--", p], { cwd: root, encoding: "utf8" });
  }

  const staged = spawnSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" });
  if (!(staged.stdout ?? "").trim()) {
    return { committed: false, pushed: false };
  }

  const message = opts.message ?? "chore: sync hub assets into project";
  const commit = spawnSync("git", ["commit", "-m", message], { cwd: root, encoding: "utf8" });
  if ((commit.status ?? 1) !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);

  let pushed = false;
  if (opts.push) {
    const remote = opts.remote ?? "origin";
    const branch =
      opts.branch ??
      (() => {
        const b = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" });
        return (b.stdout ?? "").trim() || "main";
      })();
    const push = spawnSync("git", ["push", remote, `HEAD:${branch}`], { cwd: root, encoding: "utf8" });
    if ((push.status ?? 1) !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);
    pushed = true;
  }
  return { committed: true, pushed };
}
