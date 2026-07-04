import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { AssetManifest, HarnessLock, type AssetStatus } from "./schemas.js";
import { sha256 } from "./telemetry.js";
import { readRuns } from "./telemetry.js";

/**
 * T-600/T-601: control asset model + layered resolution + harness.lock.
 * Assets live in directories containing asset.yaml (manifest) plus content.
 * Resolution order (highest first): change > local > team > hub > builtin.
 * Cross-layer shadowing requires an explicit override with a reason.
 */

export interface LoadedAsset {
  manifest: AssetManifest;
  dir: string;
  layer: AssetLayer;
  contentHash: string;
}

export type AssetLayer = "change" | "local" | "team" | "hub" | "builtin";
const LAYER_ORDER: AssetLayer[] = ["change", "local", "team", "hub", "builtin"];

/** Stable hash of every file in an asset dir except the manifest itself. */
export function assetContentHash(dir: string): string {
  const files: string[] = [];
  const visit = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.name !== "asset.yaml") files.push(p);
    }
  };
  visit(dir);
  return sha256(files.map((f) => `${path.relative(dir, f)}\n${fs.readFileSync(f, "utf8")}`).join("\x00"));
}

export function loadAssetDir(dir: string, layer: AssetLayer): LoadedAsset | null {
  const manifestFile = path.join(dir, "asset.yaml");
  if (!fs.existsSync(manifestFile)) return null;
  const manifest = AssetManifest.parse(YAML.parse(fs.readFileSync(manifestFile, "utf8")));
  return { manifest, dir, layer, contentHash: assetContentHash(dir) };
}

/** Layer roots inside a workspace. team/hub layers may be absent. */
export function layerRoots(ws: Workspace, opts: { changeId?: string; hubCache?: string } = {}): Record<AssetLayer, string[]> {
  return {
    change: opts.changeId ? [path.join(ws.changeDir(opts.changeId), "assets")] : [],
    local: [path.join(ws.assetsDir, "guides"), path.join(ws.assetsDir, "rubrics"), path.join(ws.assetsDir, "sensors")],
    team: [path.join(ws.assetsDir, "team")],
    hub: [opts.hubCache ?? path.join(ws.base, ".hub-cache")],
    builtin: [path.join(ws.bundlesDir)]
  };
}

export function discoverAssets(ws: Workspace, opts: { changeId?: string; hubCache?: string } = {}): LoadedAsset[] {
  const out: LoadedAsset[] = [];
  const roots = layerRoots(ws, opts);
  for (const layer of LAYER_ORDER) {
    for (const root of roots[layer]) {
      if (!fs.existsSync(root)) continue;
      const scan = (dir: string) => {
        const asset = loadAssetDir(dir, layer);
        if (asset) {
          out.push(asset);
          return;
        }
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) scan(path.join(dir, e.name));
        }
      };
      scan(root);
    }
  }
  return out;
}

export interface ResolutionResult {
  resolved: Map<string, LoadedAsset>;
  shadowed: { id: string; winner: AssetLayer; loser: AssetLayer; overrideDeclared: boolean }[];
  problems: string[];
}

/** Resolves each asset id to its highest-precedence layer; undeclared shadowing is a problem. */
export function resolveAssets(ws: Workspace, opts: { changeId?: string; hubCache?: string } = {}): ResolutionResult {
  const harness = ws.readHarness();
  const declaredOverrides = new Map(harness.overrides.map((o) => [o.id, o]));
  const all = discoverAssets(ws, opts);
  const resolved = new Map<string, LoadedAsset>();
  const shadowed: ResolutionResult["shadowed"] = [];
  const problems: string[] = [];

  for (const asset of all) {
    const existing = resolved.get(asset.manifest.id);
    if (!existing) {
      resolved.set(asset.manifest.id, asset);
      continue;
    }
    // `all` is emitted in precedence order, so `existing` wins
    const overrideDeclared = declaredOverrides.has(asset.manifest.id);
    shadowed.push({ id: asset.manifest.id, winner: existing.layer, loser: asset.layer, overrideDeclared });
    if (!overrideDeclared) {
      problems.push(
        `asset "${asset.manifest.id}" in ${existing.layer} shadows ${asset.layer} without a declared override — add an overrides: entry with a reason to harness.yaml`
      );
    }
  }
  return { resolved, shadowed, problems };
}

/* ── lifecycle (T-600) ── */

const TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  draft: ["trial", "deprecated"],
  trial: ["enforced", "deprecated", "draft"],
  enforced: ["deprecated"],
  deprecated: []
};

export interface PromotionCheck {
  allowed: boolean;
  reasons: string[];
}

/** trial→enforced is data-driven: needs enough evaluations and low false-positive rate. */
export function checkPromotion(manifest: AssetManifest, to: AssetStatus): PromotionCheck {
  const reasons: string[] = [];
  if (!TRANSITIONS[manifest.status].includes(to)) {
    return { allowed: false, reasons: [`illegal transition ${manifest.status} → ${to}`] };
  }
  if (manifest.status === "trial" && to === "enforced") {
    const evals = Number(manifest.metrics["evaluations"] ?? 0);
    const fps = Number(manifest.metrics["falsePositives"] ?? 0);
    if (evals < 5) reasons.push(`needs >=5 recorded evaluations (has ${evals})`);
    else if (fps / evals > 0.2) reasons.push(`false-positive rate ${((fps / evals) * 100).toFixed(0)}% exceeds 20%`);
  }
  return { allowed: reasons.length === 0, reasons };
}

export function promoteAsset(dir: string, to: AssetStatus): AssetManifest {
  const asset = loadAssetDir(dir, "local");
  if (!asset) throw new Error(`no asset.yaml in ${dir}`);
  const check = checkPromotion(asset.manifest, to);
  if (!check.allowed) throw new Error(`promotion blocked: ${check.reasons.join("; ")}`);
  asset.manifest.status = to;
  writeYaml(path.join(dir, "asset.yaml"), asset.manifest);
  return asset.manifest;
}

/** Backfills usage metrics from telemetry (T-600 metrics 自动回填). */
export function backfillMetrics(ws: Workspace, asset: LoadedAsset): AssetManifest {
  const runs = readRuns(ws).filter((r) => r.name === asset.manifest.id);
  asset.manifest.metrics["runs"] = runs.length;
  asset.manifest.metrics["failures"] = runs.filter((r) => r.status === "fail" || r.status === "error").length;
  writeYaml(path.join(asset.dir, "asset.yaml"), asset.manifest);
  return asset.manifest;
}

/* ── harness.lock (T-601) ── */

export function writeLock(ws: Workspace, opts: { changeId?: string; hubCache?: string } = {}): HarnessLock {
  const { resolved } = resolveAssets(ws, opts);
  const lock: HarnessLock = { version: 1, assets: {} };
  for (const [id, asset] of [...resolved.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lock.assets[id] = {
      version: asset.manifest.version,
      source: `${asset.layer}:${path.relative(ws.root, asset.dir)}`,
      hash: asset.contentHash
    };
  }
  writeYaml(ws.lockFile, lock);
  return lock;
}

export interface LockVerifyResult {
  ok: boolean;
  problems: string[];
}

/** NFR-009: verifies resolved asset content still matches the locked hashes. */
export function verifyLock(ws: Workspace, opts: { changeId?: string; hubCache?: string } = {}): LockVerifyResult {
  if (!fs.existsSync(ws.lockFile)) return { ok: false, problems: ["harness.lock missing — run hx lock write"] };
  const lock = HarnessLock.parse(YAML.parse(fs.readFileSync(ws.lockFile, "utf8")));
  const { resolved } = resolveAssets(ws, opts);
  const problems: string[] = [];
  for (const [id, entry] of Object.entries(lock.assets)) {
    const asset = resolved.get(id);
    if (!asset) {
      problems.push(`locked asset "${id}" is no longer resolvable`);
      continue;
    }
    if (asset.contentHash !== entry.hash)
      problems.push(`asset "${id}" content changed since lock (supply-chain check) — review and re-lock`);
    if (asset.manifest.version !== entry.version)
      problems.push(`asset "${id}" version ${asset.manifest.version} != locked ${entry.version}`);
  }
  for (const id of resolved.keys()) {
    if (!lock.assets[id]) problems.push(`asset "${id}" is not in harness.lock — run hx lock write after review`);
  }
  return { ok: problems.length === 0, problems };
}
