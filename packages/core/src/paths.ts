import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";
import { ConfigYaml, HarnessYaml, type MetaYaml, MetaYaml as MetaSchema } from "./schemas.js";
import { expandHarnessImports } from "./harnessCompose.js";
import { resolveHubSource } from "./hubSource.js";
import { hubConfigSource } from "./hubConnection.js";

/** Resolves harnessX layout inside a repository root, honoring compat_mode: openspec. */
export class Workspace {
  constructor(public readonly root: string, public readonly dirName = "harnessX") {}

  static locate(root: string): Workspace {
    for (const dir of ["harnessX", "openspec"]) {
      if (fs.existsSync(path.join(root, dir, "harness.yaml")) || fs.existsSync(path.join(root, dir, "config.yaml"))) {
        return new Workspace(root, dir);
      }
    }
    return new Workspace(root);
  }

  get base() {
    return path.join(this.root, this.dirName);
  }
  get constitutionFile() {
    return path.join(this.base, "constitution.md");
  }
  get configFile() {
    return path.join(this.base, "config.yaml");
  }
  get harnessFile() {
    return path.join(this.base, "harness.yaml");
  }
  get lockFile() {
    return path.join(this.base, "harness.lock");
  }
  get specsDir() {
    return path.join(this.base, "specs");
  }
  get changesDir() {
    return path.join(this.base, "changes");
  }
  get archiveDir() {
    return path.join(this.base, "archive");
  }
  get assetsDir() {
    return path.join(this.base, "assets");
  }
  get bundlesDir() {
    return path.join(this.assetsDir, "bundles");
  }
  get runsDir() {
    return path.join(this.base, "runs");
  }
  get fixturesLock() {
    return path.join(this.base, "fixtures.lock");
  }
  get failureCatalog() {
    return path.join(this.runsDir, "failure-catalog.jsonl");
  }

  changeDir(id: string) {
    return path.join(this.changesDir, id);
  }
  metaFile(id: string) {
    return path.join(this.changeDir(id), "meta.yaml");
  }
  changeRunsDir(id: string) {
    return path.join(this.changeDir(id), "runs");
  }
  traceFile(id: string) {
    return path.join(this.changeDir(id), "traces", "traceability.yaml");
  }
  deltaSpecsDir(id: string) {
    return path.join(this.changeDir(id), "specs");
  }
  requirementsDir(id: string) {
    return path.join(this.changeDir(id), "requirements");
  }
  designDir(id: string) {
    return path.join(this.changeDir(id), "design");
  }
  designOverviewFile(id: string) {
    return path.join(this.designDir(id), "overview.md");
  }
  /** Legacy single-file design; prefer design/overview.md when present. */
  designFile(id: string) {
    return path.join(this.changeDir(id), "design.md");
  }
  deliveryTraceFile(id: string) {
    return path.join(this.changeDir(id), "traces", "delivery-trace.yaml");
  }

  /** Organization-level PRD artifacts (pre-phase). */
  prdDir() {
    return path.join(this.root, "docs", "prd");
  }
  prdFile(slug: string) {
    return path.join(this.prdDir(), `${slug}.md`);
  }

  /** Organization-level architecture artifacts (pre-phase). */
  archDir() {
    return path.join(this.root, "docs", "architecture");
  }
  archOverviewFile() {
    return path.join(this.archDir(), "overview.md");
  }
  archRegistryFile() {
    return path.join(this.archDir(), "registry.yaml");
  }
  archModuleDir(moduleId: string) {
    return path.join(this.archDir(), "modules", moduleId);
  }
  archModuleLld(moduleId: string) {
    return path.join(this.archModuleDir(moduleId), "lld.md");
  }

  workordersDir() {
    return path.join(this.base, "workorders");
  }
  workorderFile(id: string) {
    return path.join(this.workordersDir(), `${id}.yaml`);
  }
  workorderIndexFile() {
    return path.join(this.workordersDir(), "index.yaml");
  }
  changeRequestsDir() {
    return path.join(this.base, "change-requests");
  }
  changeRequestFile(id: string) {
    return path.join(this.changeRequestsDir(), `${id}.yaml`);
  }
  changeRequestIndexFile() {
    return path.join(this.changeRequestsDir(), "index.yaml");
  }
  rolesFile() {
    return path.join(this.base, "roles.yaml");
  }
  testCasesDir(change: string) {
    return path.join(this.changeDir(change), "test-cases");
  }
  bugsDir(change: string) {
    return path.join(this.changeDir(change), "bugs");
  }
  bugFile(change: string, bugId: string) {
    return path.join(this.bugsDir(change), `${bugId}.yaml`);
  }

  readConfig(): ConfigYaml {
    return ConfigYaml.parse(YAML.parse(fs.readFileSync(this.configFile, "utf8")) ?? {});
  }
  readHarness(): HarnessYaml {
    const raw = HarnessYaml.parse(YAML.parse(fs.readFileSync(this.harnessFile, "utf8")) ?? {});
    let hubRoot: string | undefined;
    try {
      const hub = hubConfigSource(this.readConfig().hub);
      hubRoot = hub ? resolveHubSource(this.root, hub) : undefined;
    } catch {
      hubRoot = undefined;
    }
    return expandHarnessImports(raw, this, hubRoot);
  }
  readMetaRaw(id: string): MetaYaml {
    return MetaSchema.parse(YAML.parse(fs.readFileSync(this.metaFile(id), "utf8")));
  }

  listChanges(): string[] {
    if (!fs.existsSync(this.changesDir)) return [];
    return fs
      .readdirSync(this.changesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function writeYaml(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, YAML.stringify(data), "utf8");
}

export function readYaml<T = unknown>(file: string): T {
  return YAML.parse(fs.readFileSync(file, "utf8")) as T;
}
