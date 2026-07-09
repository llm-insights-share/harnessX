import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { HarnessYaml } from "./schemas.js";
import { hubAdd, hubBundleDir, resolveHubPackage, type HubRef } from "./hub.js";
import { applyHubBlueprint } from "./blueprint.js";
import { writeLock } from "./assets.js";
import { isGitHubHubRef, resolveHubSource } from "./hubSource.js";
import { scaffoldRoles } from "./roles.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Built-in bundle sources shipped with the harnessx package. */
export const BUILTIN_BUNDLES_DIR = path.resolve(HERE, "../../bundles");

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
  /** Built-in scaffold: `base` (English) or `hx-cn` (Chinese). */
  locale?: string;
}

const NEXT_STEPS_EN = [
  "1. Edit harnessX/constitution.md — write your project principles and core domains",
  "2. Create your first change:  hx change create <name> --domains <d1,d2>",
  "3. Draft the proposal:        hx propose <name> --title \"...\"",
  "4. Validate as you go:        hx gate check <name>",
  "5. Install enforcement:       hx hooks install && hx ci init"
];

const NEXT_STEPS_ZH = [
  "1. 编辑 harnessX/constitution.md — 填写项目原则与核心域",
  "2. 创建首个 change：           hx change create <name> --domains <d1,d2>",
  "3. 起草提案：                  hx propose <name> --title \"...\"",
  "4. 随时校验：                  hx gate check <name>",
  "5. 安装强制机制：              hx hooks install && hx ci init"
];

function resolveScaffoldDir(bundlesDir: string, locale?: string): string {
  if (locale === "hx-cn") {
    const cn = path.join(bundlesDir, "hx-cn");
    if (!fs.existsSync(cn)) throw new Error(`unknown locale scaffold: ${locale}`);
    return cn;
  }
  return path.join(bundlesDir, "base");
}

export interface InitResult {
  ws: Workspace;
  created: string[];
  nextSteps: string[];
}

export interface InitFromHubOptions extends InitOptions {
  hubRef: string;
  hubRoot: string;
  adapter?: string;
}

function parseHubRef(ref: string): HubRef {
  const [id, version] = ref.split("@");
  if (!id || !version) throw new Error(`use <id>@<version> for --from-hub`);
  return { id, version };
}

const NEXT_STEPS_FROM_HUB_EN = [
  "1. Edit harnessX/constitution.md — write your project principles",
  "2. Sync adapters:             hx adapter sync",
  "3. Create your first change:  hx change create <name> --domains <d1,d2>",
  "4. Draft the proposal:        hx propose <name> --title \"...\"",
  "5. Install enforcement:       hx hooks install && hx ci init"
];

/** `hx init --from-hub`: scaffold from a hub bundle or blueprint package. */
export function initFromHub(root: string, opts: InitFromHubOptions): InitResult {
  const hubRoot = resolveHubSource(root, opts.hubRoot, { updateRemote: true });
  const ref = parseHubRef(opts.hubRef);
  const resolved = resolveHubPackage(hubRoot, ref);
  if (!resolved) throw new Error(`hub package ${opts.hubRef} not found in ${hubRoot}`);

  const res = initWorkspace(root, { locale: opts.locale, bundlesDir: opts.bundlesDir });

  const config = res.ws.readConfig();
  const hubConfig = isGitHubHubRef(opts.hubRoot) ? opts.hubRoot : path.resolve(opts.hubRoot);
  writeYaml(res.ws.configFile, { ...config, hub: hubConfig, ...(opts.adapter ? { adapter: { target: opts.adapter } } : {}) });

  if (resolved.kind === "bundle") {
    applyBundle(res.ws, ref.id, resolved.dir);
    res.created.push(`hub bundle ${ref.id}@${ref.version}`);
  } else if (resolved.kind === "blueprint") {
    const applied = applyHubBlueprint(res.ws, hubRoot, ref);
    res.created.push(...applied);
  } else {
    hubAdd(res.ws, hubRoot, ref);
    res.created.push(`hub package ${ref.id}@${ref.version}`);
    const harness = res.ws.readHarness();
    if (!harness.dependencies.includes(`${ref.id}@${ref.version}`)) {
      harness.dependencies.push(`${ref.id}@${ref.version}`);
      fs.writeFileSync(res.ws.harnessFile, YAML.stringify(HarnessYaml.parse(harness)), "utf8");
    }
  }

  writeLock(res.ws);
  res.nextSteps = opts.locale === "hx-cn" ? NEXT_STEPS_ZH : NEXT_STEPS_FROM_HUB_EN;
  return res;
}

/** `hx init` (FR-034/NFR-007): creates harnessX/, seeds constitution, registry, assets. */
export function initWorkspace(root: string, opts: InitOptions = {}): InitResult {
  const bundlesDir = opts.bundlesDir ?? BUILTIN_BUNDLES_DIR;
  const ws = new Workspace(root);
  if (fs.existsSync(ws.harnessFile)) throw new Error(`harnessX already initialized at ${ws.base}`);

  const baseDir = resolveScaffoldDir(bundlesDir, opts.locale);
  ensureDir(ws.base);
  for (const f of ["constitution.md", "config.yaml", "harness.yaml"]) {
    fs.copyFileSync(path.join(baseDir, f), path.join(ws.base, f));
  }
  const blueprintSrc = path.join(baseDir, "blueprint.yaml");
  if (fs.existsSync(blueprintSrc)) fs.copyFileSync(blueprintSrc, path.join(ws.base, "blueprint.yaml"));
  copyDir(path.join(baseDir, "assets"), ws.assetsDir);
  for (const dir of [ws.specsDir, ws.changesDir, ws.archiveDir, ws.runsDir, ws.bundlesDir, ws.workordersDir(), ws.changeRequestsDir()]) ensureDir(dir);
  scaffoldRoles(ws);

  const created = ["constitution.md", "config.yaml", "harness.yaml", "roles.yaml", "workorders/", "change-requests/", "assets/", "specs/", "changes/", "archive/", "runs/"];

  if (opts.bundle) {
    applyBundle(ws, opts.bundle, bundlesDir);
    created.push(`assets/bundles/${opts.bundle}/`);
  }

  const nextSteps = opts.locale === "hx-cn" ? NEXT_STEPS_ZH : NEXT_STEPS_EN;
  return { ws, created, nextSteps };
}

/** Merges a topology bundle (FR-031): copies assets and appends guides/sensors/suites to harness.yaml. */
export function applyBundle(ws: Workspace, bundleId: string, bundlesDir = BUILTIN_BUNDLES_DIR): void {
  const bundleDir = fs.existsSync(path.join(bundlesDir, "bundle.yaml")) ? bundlesDir : path.join(bundlesDir, bundleId);
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
