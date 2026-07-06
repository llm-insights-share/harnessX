import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace, ensureDir } from "./paths.js";
import { HarnessYaml } from "./schemas.js";
import { harnessxPackageRoot } from "./packageRoot.js";

/** Built-in bundle sources shipped with the harnessx package. */
export const BUILTIN_BUNDLES_DIR = path.join(harnessxPackageRoot(), "packages", "bundles");

function copyDir(src: string, dest: string) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export interface InitOptions {
  bundle?: string;
  bundlesDir?: string;
}

export interface InitResult {
  ws: Workspace;
  created: string[];
  nextSteps: string[];
}

/** `hx init` (FR-034/NFR-007): creates harnessX/, seeds constitution, registry, assets. */
export function initWorkspace(root: string, opts: InitOptions = {}): InitResult {
  const bundlesDir = opts.bundlesDir ?? BUILTIN_BUNDLES_DIR;
  const ws = new Workspace(root);
  if (fs.existsSync(ws.harnessFile)) throw new Error(`harnessX already initialized at ${ws.base}`);

  const baseDir = path.join(bundlesDir, "base");
  ensureDir(ws.base);
  for (const f of ["constitution.md", "config.yaml", "harness.yaml"]) {
    fs.copyFileSync(path.join(baseDir, f), path.join(ws.base, f));
  }
  copyDir(path.join(baseDir, "assets"), ws.assetsDir);
  for (const dir of [ws.specsDir, ws.changesDir, ws.archiveDir, ws.runsDir, ws.bundlesDir]) ensureDir(dir);

  const created = ["constitution.md", "config.yaml", "harness.yaml", "assets/", "specs/", "changes/", "archive/", "runs/"];

  if (opts.bundle) {
    applyBundle(ws, opts.bundle, bundlesDir);
    created.push(`assets/bundles/${opts.bundle}/`);
  }

  const nextSteps = [
    "1. Edit harnessX/constitution.md — write your project principles and core domains",
    "2. Create your first change:  hx change create <name> --domains <d1,d2>",
    "3. Draft the proposal:        hx propose <name> --title \"...\"",
    "4. Validate as you go:        hx gate check <name>",
    "5. Install enforcement:       hx hooks install && hx ci init"
  ];
  return { ws, created, nextSteps };
}

/** Merges a topology bundle (FR-031): copies assets and appends guides/sensors/suites to harness.yaml. */
export function applyBundle(ws: Workspace, bundleId: string, bundlesDir = BUILTIN_BUNDLES_DIR): void {
  const bundleDir = path.join(bundlesDir, bundleId);
  const manifestFile = path.join(bundleDir, "bundle.yaml");
  if (!fs.existsSync(manifestFile)) throw new Error(`unknown bundle: ${bundleId}`);
  const fragment = YAML.parse(fs.readFileSync(manifestFile, "utf8"));

  const destAssets = path.join(ws.bundlesDir, bundleId);
  if (fs.existsSync(path.join(bundleDir, "assets"))) copyDir(path.join(bundleDir, "assets"), destAssets);

  const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(ws.harnessFile, "utf8")));
  const existingGuideIds = new Set(harness.guides.map((g) => g.id));
  const existingSensorIds = new Set(harness.sensors.map((s) => s.id));
  for (const g of fragment.guides ?? []) if (!existingGuideIds.has(g.id)) harness.guides.push(g);
  for (const s of fragment.sensors ?? []) if (!existingSensorIds.has(s.id)) harness.sensors.push(s);
  for (const [name, sensors] of Object.entries(fragment.suites ?? {})) {
    harness.suites[name] = sensors as string[];
  }
  fs.writeFileSync(ws.harnessFile, YAML.stringify(HarnessYaml.parse(harness)), "utf8");
}

export function listBundles(bundlesDir = BUILTIN_BUNDLES_DIR): { id: string; description: string }[] {
  return fs
    .readdirSync(bundlesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(bundlesDir, d.name, "bundle.yaml")))
    .map((d) => {
      const y = YAML.parse(fs.readFileSync(path.join(bundlesDir, d.name, "bundle.yaml"), "utf8"));
      return { id: d.name, description: y.description ?? "" };
    });
}
