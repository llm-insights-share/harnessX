import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { AssetManifest } from "./schemas.js";
import { scanAssetDir, hubBundleDir, resolveHubPackage, type HubRef } from "./hub.js";
import { resolveHubPackageDir } from "./hubPackagePaths.js";
import { loadAssetDir } from "./assets.js";

/**
 * Hub asset evaluation — validates packages before promote/consume (v0.3 closed loop).
 */

export interface HubEvalCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface HubEvalResult {
  package: string;
  passed: boolean;
  checks: HubEvalCheck[];
}

export interface HubEvalReport extends HubEvalResult {
  generatedAt: string;
}

function evalDir(dir: string, label: string): HubEvalResult {
  const checks: HubEvalCheck[] = [];
  const manifestFile = path.join(dir, "asset.yaml");
  checks.push({ name: "asset.yaml exists", ok: fs.existsSync(manifestFile) });
  if (!fs.existsSync(manifestFile)) return { package: label, passed: false, checks };

  let manifest: AssetManifest;
  try {
    manifest = AssetManifest.parse(YAML.parse(fs.readFileSync(manifestFile, "utf8")));
    checks.push({ name: "asset.yaml schema", ok: true });
  } catch (e) {
    checks.push({ name: "asset.yaml schema", ok: false, detail: (e as Error).message });
    return { package: label, passed: false, checks };
  }

  const injection = scanAssetDir(dir);
  checks.push({ name: "injection scan", ok: injection.length === 0, detail: injection[0] });

  if (manifest.kind === "guide.skill") {
    checks.push({ name: "SKILL.md present", ok: fs.existsSync(path.join(dir, "SKILL.md")) });
  } else if (manifest.kind === "guide.template") {
    checks.push({ name: "template.md present", ok: fs.existsSync(path.join(dir, "template.md")) });
  } else if (manifest.kind === "sensor.rubric") {
    checks.push({ name: "rules.yaml present", ok: fs.existsSync(path.join(dir, "rules.yaml")) });
  } else if (manifest.kind === "harness.bundle") {
    checks.push({ name: "bundle.yaml present", ok: fs.existsSync(path.join(dir, "bundle.yaml")) });
  } else if (manifest.kind === "harness.blueprint") {
    checks.push({ name: "blueprint.yaml present", ok: fs.existsSync(path.join(dir, "blueprint.yaml")) });
  }

  if (manifest.metrics) {
    const evals = Number(manifest.metrics["evaluations"] ?? 0);
    const runs = Number(manifest.metrics["runs"] ?? 0);
    if (evals > 0 || runs > 0) {
      checks.push({ name: "usage metrics recorded", ok: true, detail: `evaluations=${evals}, runs=${runs}` });
    }
  }

  return { package: label, passed: checks.every((c) => c.ok), checks };
}

export function hubEvalLocal(assetDir: string): HubEvalResult {
  const asset = loadAssetDir(assetDir, "local");
  const label = asset ? `${asset.manifest.id}@${asset.manifest.version}` : assetDir;
  return evalDir(assetDir, label);
}

export function hubEvalPackage(hubRoot: string, ref: HubRef): HubEvalResult {
  const dir = resolveHubPackageDir(hubRoot, ref);
  if (!dir) return { package: `${ref.id}@${ref.version}`, passed: false, checks: [{ name: "asset exists", ok: false, detail: "not found in hub" }] };
  return evalDir(dir, `${ref.id}@${ref.version}`);
}

export function hubEvalBundle(hubRoot: string, ref: HubRef): HubEvalResult {
  const dir = hubBundleDir(hubRoot, ref.id, ref.version);
  return evalDir(dir, `bundle:${ref.id}@${ref.version}`);
}

export function hubEvalBlueprint(hubRoot: string, ref: HubRef): HubEvalResult {
  const resolved = resolveHubPackage(hubRoot, ref);
  const dir = resolved?.kind === "blueprint" ? resolved.dir : path.join(hubRoot, "blueprints", ref.id, ref.version);
  return evalDir(dir, `blueprint:${ref.id}@${ref.version}`);
}

/** Route eval to the correct hub category directory. */
export function hubEvalAsset(hubRoot: string, ref: HubRef): HubEvalResult {
  const resolved = resolveHubPackage(hubRoot, ref);
  if (!resolved) return { package: `${ref.id}@${ref.version}`, passed: false, checks: [{ name: "asset exists", ok: false, detail: "not found in hub" }] };
  switch (resolved.kind) {
    case "bundle":
      return hubEvalBundle(hubRoot, ref);
    case "blueprint":
      return hubEvalBlueprint(hubRoot, ref);
    default:
      return hubEvalPackage(hubRoot, ref);
  }
}

/** Runs eval sets under hub/evals/golden-repos/<name>/checks.yaml if present. */
export function hubEvalGoldenRepo(hubRoot: string, name: string): HubEvalResult {
  const dir = path.join(hubRoot, "evals", "golden-repos", name);
  const checksFile = path.join(dir, "checks.yaml");
  const checks: HubEvalCheck[] = [{ name: "golden repo exists", ok: fs.existsSync(dir) }];
  if (!fs.existsSync(checksFile)) {
    checks.push({ name: "checks.yaml", ok: false, detail: "no checks defined" });
    return { package: `golden:${name}`, passed: false, checks };
  }
  const spec = YAML.parse(fs.readFileSync(checksFile, "utf8")) as { checks?: { name: string; path: string }[] };
  for (const c of spec.checks ?? []) {
    checks.push({ name: c.name, ok: fs.existsSync(path.join(dir, c.path)), detail: c.path });
  }
  return { package: `golden:${name}`, passed: checks.every((c) => c.ok), checks };
}

export function writeHubEvalReport(file: string, result: HubEvalResult): string {
  const report: HubEvalReport = { ...result, generatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf8");
  return file;
}
