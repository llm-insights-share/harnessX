import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { loadAssetDir } from "./assets.js";
import { SKILL_ENTRY } from "./skill.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Built-in workspace scaffolds (base / hx-cn). */
export const BUILTIN_SCAFFOLD_DIR = path.resolve(HERE, "../../scaffold");

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

let builtinHarnessCache: HarnessYaml | null = null;

export function builtinHarness(): HarnessYaml {
  if (!builtinHarnessCache) {
    const file = path.join(BUILTIN_SCAFFOLD_DIR, "base", "harness.yaml");
    builtinHarnessCache = HarnessYaml.parse(YAML.parse(fs.readFileSync(file, "utf8")));
  }
  return builtinHarnessCache;
}
function findAssetContentFile(assetDir: string): string {
  for (const name of ["SKILL.md", "template.md", "workflow.md", "COMMAND.md", "constraint.yaml", "rules.yaml"]) {
    if (fs.existsSync(path.join(assetDir, name))) return name;
  }
  for (const e of fs.readdirSync(assetDir, { withFileTypes: true })) {
    if (e.isFile() && /\.(md|yaml|yml)$/.test(e.name) && e.name !== "asset.yaml") return e.name;
  }
  throw new Error(`no content file in asset dir ${assetDir}`);
}

export function guideDefFromHubAsset(ws: Workspace, assetDir: string, manifest: AssetManifest): GuideDef {
  const kind = GUIDE_KINDS.find((k) => k === manifest.kind);
  if (!kind) throw new Error(`asset ${manifest.id} is not a guide kind`);
  const source =
    manifest.kind === "guide.skill"
      ? path.relative(ws.base, assetDir).replace(/\\/g, "/")
      : path.relative(ws.base, path.join(assetDir, findAssetContentFile(assetDir))).replace(/\\/g, "/");
  if (manifest.kind === "guide.skill" && !fs.existsSync(path.join(assetDir, SKILL_ENTRY))) {
    throw new Error(`guide.skill asset ${manifest.id} missing ${SKILL_ENTRY}`);
  }
  return {
    id: manifest.id,
    kind,
    execution: (manifest.execution ?? "inferential") as GuideDef["execution"],
    stage: manifest.stage,
    task: manifest.task,
    source
  };
}

function hubCacheDir(ws: Workspace, id: string): string | null {
  const dir = path.join(ws.base, ".hub-cache", id);
  return fs.existsSync(path.join(dir, "asset.yaml")) ? dir : null;
}

/** Resolves a guide definition from hub cache or builtin harness. */
export function resolveHarnessGuideDef(ws: Workspace, id: string, _opts: ResolveOpts = {}): GuideDef | null {
  const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(ws.harnessFile, "utf8")));
  const existing = harness.guides.find((g) => g.id === id);
  if (existing) return existing;

  const hubDir = hubCacheDir(ws, id);
  if (hubDir) {
    const asset = loadAssetDir(hubDir, "hub");
    if (asset && asset.manifest.kind.startsWith("guide.")) return guideDefFromHubAsset(ws, hubDir, asset.manifest);
  }

  return builtinHarness().guides.find((g) => g.id === id) ?? null;
}

/** Resolves a sensor definition from harness or builtin scaffold. */
export function resolveHarnessSensorDef(ws: Workspace, id: string, _opts: ResolveOpts = {}): SensorDef | null {
  const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(ws.harnessFile, "utf8")));
  const existing = harness.sensors.find((s) => s.id === id);
  if (existing) return existing;

  return builtinHarness().sensors.find((s) => s.id === id) ?? null;
}

/** No-op: imports/bundles removed; kept for call-site compatibility. */
export function expandHarnessImports(raw: HarnessYaml, _ws: Workspace, _hubRoot?: string): HarnessYaml {
  return raw;
}
