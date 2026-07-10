import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace } from "./paths.js";
import {
  HarnessYaml,
  GuideDef,
  SensorDef,
  type AssetManifest,
  GUIDE_KINDS,
  SENSOR_KINDS
} from "./schemas.js";
import { BUILTIN_BUNDLES_DIR } from "./init.js";
import { hubBundleDir, type HubRef } from "./hub.js";
import { loadAssetDir } from "./assets.js";

export interface ResolveOpts {
  hubRoot?: string;
  stageHint?: string;
  taskHint?: string;
}

export function parseImportRef(ref: string): { id: string; version?: string } {
  const at = ref.lastIndexOf("@");
  if (at > 0) return { id: ref.slice(0, at), version: ref.slice(at + 1) };
  return { id: ref };
}

function readBundleFragment(bundleDir: string): Partial<HarnessYaml> | null {
  const manifest = path.join(bundleDir, "bundle.yaml");
  if (!fs.existsSync(manifest)) return null;
  return YAML.parse(fs.readFileSync(manifest, "utf8")) as Partial<HarnessYaml>;
}

function resolveBundleDir(ws: Workspace, id: string, version?: string, hubRoot?: string): string | null {
  const local = path.join(ws.bundlesDir, id);
  if (fs.existsSync(path.join(local, "bundle.yaml"))) return local;
  const builtin = path.join(BUILTIN_BUNDLES_DIR, id);
  if (fs.existsSync(path.join(builtin, "bundle.yaml"))) return builtin;
  if (hubRoot && version) {
    const hub = hubBundleDir(hubRoot, id, version);
    if (fs.existsSync(path.join(hub, "bundle.yaml"))) return hub;
  }
  return null;
}

let builtinHarnessCache: HarnessYaml | null = null;

function builtinHarness(): HarnessYaml {
  if (!builtinHarnessCache) {
    const file = path.join(BUILTIN_BUNDLES_DIR, "base", "harness.yaml");
    builtinHarnessCache = HarnessYaml.parse(YAML.parse(fs.readFileSync(file, "utf8")));
  }
  return builtinHarnessCache;
}

function findAssetContentFile(assetDir: string): string {
  for (const name of ["SKILL.md", "template.md", "COMMAND.md", "constraint.yaml"]) {
    if (fs.existsSync(path.join(assetDir, name))) return name;
  }
  for (const e of fs.readdirSync(assetDir, { withFileTypes: true })) {
    if (e.isFile() && /\.(md|yaml|yml)$/.test(e.name) && e.name !== "asset.yaml") return e.name;
  }
  throw new Error(`no content file in asset dir ${assetDir}`);
}

export function guideDefFromHubAsset(ws: Workspace, assetDir: string, manifest: AssetManifest): GuideDef {
  const content = findAssetContentFile(assetDir);
  const rel = path.relative(ws.base, path.join(assetDir, content)).replace(/\\/g, "/");
  const kind = GUIDE_KINDS.find((k) => k === manifest.kind);
  if (!kind) throw new Error(`asset ${manifest.id} is not a guide kind`);
  return {
    id: manifest.id,
    kind,
    execution: manifest.execution ?? "inferential",
    stage: manifest.stage,
    task: manifest.task,
    source: rel
  };
}

function hubCacheDir(ws: Workspace, id: string): string | null {
  const dir = path.join(ws.base, ".hub-cache", id);
  return fs.existsSync(path.join(dir, "asset.yaml")) ? dir : null;
}

/** Resolves a guide definition from hub cache, bundles, or builtin harness. */
export function resolveHarnessGuideDef(ws: Workspace, id: string, opts: ResolveOpts = {}): GuideDef | null {
  const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(ws.harnessFile, "utf8")));
  const existing = harness.guides.find((g) => g.id === id);
  if (existing) return existing;

  const hubDir = hubCacheDir(ws, id);
  if (hubDir) {
    const asset = loadAssetDir(hubDir, "hub");
    if (asset && asset.manifest.kind.startsWith("guide.")) return guideDefFromHubAsset(ws, hubDir, asset.manifest);
  }

  for (const bundleId of fs.existsSync(ws.bundlesDir) ? fs.readdirSync(ws.bundlesDir) : []) {
    const frag = readBundleFragment(path.join(ws.bundlesDir, bundleId));
    const hit = frag?.guides?.find((g) => g.id === id);
    if (hit) return hit;
  }
  const builtinFrag = readBundleFragment(path.join(BUILTIN_BUNDLES_DIR, "api-service"));
  const fromBuiltinBundle = builtinFrag?.guides?.find((g) => g.id === id);
  if (fromBuiltinBundle) return fromBuiltinBundle;

  return builtinHarness().guides.find((g) => g.id === id) ?? null;
}

/** Resolves a sensor definition from bundles or builtin harness. */
export function resolveHarnessSensorDef(ws: Workspace, id: string, _opts: ResolveOpts = {}): SensorDef | null {
  const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(ws.harnessFile, "utf8")));
  const existing = harness.sensors.find((s) => s.id === id);
  if (existing) return existing;

  for (const bundleId of fs.existsSync(ws.bundlesDir) ? fs.readdirSync(ws.bundlesDir) : []) {
    const frag = readBundleFragment(path.join(ws.bundlesDir, bundleId));
    const hit = frag?.sensors?.find((s) => s.id === id);
    if (hit) return hit;
  }

  return builtinHarness().sensors.find((s) => s.id === id) ?? null;
}

function mergeFragment(target: HarnessYaml, fragment: Partial<HarnessYaml>): void {
  const guideIds = new Set(target.guides.map((g) => g.id));
  const sensorIds = new Set(target.sensors.map((s) => s.id));
  for (const g of fragment.guides ?? []) {
    if (!guideIds.has(g.id)) {
      target.guides.push(g);
      guideIds.add(g.id);
    }
  }
  for (const s of fragment.sensors ?? []) {
    if (!sensorIds.has(s.id)) {
      target.sensors.push(s);
      sensorIds.add(s.id);
    }
  }
  for (const [name, sensors] of Object.entries(fragment.suites ?? {})) {
    if (!target.suites[name]) target.suites[name] = sensors as string[];
  }
}

/** Expands `imports:` entries into guides/sensors/suites at read time (project file stays minimal). */
export function expandHarnessImports(raw: HarnessYaml, ws: Workspace, hubRoot?: string): HarnessYaml {
  if (!raw.imports?.length) return raw;
  const merged = HarnessYaml.parse(raw);
  const visited = new Set<string>();

  const walk = (ref: string) => {
    if (visited.has(ref)) return;
    visited.add(ref);
    const { id, version } = parseImportRef(ref);
    const bundleDir = resolveBundleDir(ws, id, version, hubRoot);
    if (!bundleDir) return;
    const fragment = readBundleFragment(bundleDir);
    if (!fragment) return;
    mergeFragment(merged, fragment);
    for (const nested of (fragment as { imports?: string[] }).imports ?? []) walk(nested);
  };

  for (const imp of raw.imports) walk(imp);
  return merged;
}

export function loadBundleFragmentForRef(ws: Workspace, ref: HubRef, hubRoot?: string): Partial<HarnessYaml> | null {
  const dir = resolveBundleDir(ws, ref.id, ref.version, hubRoot);
  return dir ? readBundleFragment(dir) : null;
}
