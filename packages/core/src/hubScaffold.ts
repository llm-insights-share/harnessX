import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeYaml } from "./paths.js";
import { AssetManifest, type AssetKind, type AssetStatus } from "./schemas.js";

export interface CreateAssetOptions {
  rootDir: string;
  id: string;
  kind: AssetKind;
  version?: string;
  status?: AssetStatus;
  phase?: string[];
  owner?: string;
  sourceDir?: string;
}

export interface CreateAssetResult {
  dir: string;
  files: string[];
}

function readTemplateFromSource(sourceDir: string, names: string[]): string | undefined {
  for (const name of names) {
    const file = path.join(sourceDir, name);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return fs.readFileSync(file, "utf8");
    }
  }
  return undefined;
}

function templateFiles(kind: AssetKind, sourceDir?: string, sourceFile?: string): Record<string, string> {
  const fromSourceFile = sourceFile ? fs.readFileSync(sourceFile, "utf8") : undefined;
  if (kind === "guide.skill") {
    const fromSource = fromSourceFile ?? (sourceDir ? readTemplateFromSource(sourceDir, ["SKILL.md", "skill.md"]) : undefined);
    return { "SKILL.md": fromSource ?? "# Skill\n\nDescribe guidance.\n" };
  }
  if (kind === "guide.template") {
    const fromSource = fromSourceFile ?? (sourceDir ? readTemplateFromSource(sourceDir, ["template.md", "TEMPLATE.md"]) : undefined);
    return { "template.md": fromSource ?? "# Template\n\n{{content}}\n" };
  }
  if (kind === "sensor.rubric") {
    const fromSource = fromSourceFile ?? (sourceDir ? readTemplateFromSource(sourceDir, ["rules.yaml", "rubric.yaml"]) : undefined);
    return { "rules.yaml": fromSource ?? "rules: []\n" };
  }
  if (kind === "harness.bundle") {
    const fromSource = fromSourceFile ?? (sourceDir ? readTemplateFromSource(sourceDir, ["bundle.yaml"]) : undefined);
    return { "bundle.yaml": fromSource ?? "description: bundle\nguides: []\nsensors: []\n", "assets/.keep": "" };
  }
  if (kind === "harness.blueprint") {
    const fromSource = fromSourceFile ?? (sourceDir ? readTemplateFromSource(sourceDir, ["blueprint.yaml"]) : undefined);
    return { "blueprint.yaml": fromSource ?? "name: blueprint\nhub_deps: []\n" };
  }
  return { "README.md": "# Asset\n" };
}

function copyDirRecursive(src: string, dest: string, files: string[], relPrefix: string): void {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const relPath = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      ensureDir(destPath);
      copyDirRecursive(srcPath, destPath, files, relPath);
      continue;
    }
    if (!entry.isFile() || fs.existsSync(destPath)) continue;
    fs.copyFileSync(srcPath, destPath);
    files.push(relPath.replaceAll(path.sep, "/"));
  }
}

function executionForKind(kind: AssetKind): "inferential" | "computational" | undefined {
  if (kind.startsWith("guide.")) return kind === "guide.template" || kind === "guide.constraint" ? "computational" : "inferential";
  if (kind.startsWith("sensor.")) return "computational";
  return undefined;
}

/** Creates a local asset directory with asset.yaml and skeleton files. */
export function createAssetScaffold(opts: CreateAssetOptions): CreateAssetResult {
  const dir = path.resolve(opts.rootDir);
  ensureDir(dir);
  const files: string[] = [];
  const sourcePath = opts.sourceDir ? path.resolve(opts.sourceDir) : undefined;
  let sourceDir: string | undefined;
  let sourceFile: string | undefined;
  if (sourcePath) {
    if (!fs.existsSync(sourcePath)) throw new Error(`source path not found: ${sourcePath}`);
    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) sourceDir = sourcePath;
    else if (stat.isFile()) {
      sourceFile = sourcePath;
      sourceDir = path.dirname(sourcePath);
    } else throw new Error(`source path must be a directory or file: ${sourcePath}`);
  }

  const manifest: AssetManifest = AssetManifest.parse({
    id: opts.id,
    kind: opts.kind,
    version: opts.version ?? "0.1.0",
    status: opts.status ?? "draft",
    origin: "local",
    phase: opts.phase ?? [],
    owner: opts.owner,
    execution: executionForKind(opts.kind),
    provenance: [],
    metrics: {}
  });
  writeYaml(path.join(dir, "asset.yaml"), manifest);
  files.push("asset.yaml");

  const templates = templateFiles(opts.kind, sourceDir, sourceFile);
  for (const [rel, content] of Object.entries(templates)) {
    const abs = path.join(dir, rel);
    ensureDir(path.dirname(abs));
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, content, "utf8");
      files.push(rel);
    }
  }

  if (opts.kind === "harness.bundle" && sourceDir) {
    const sourceAssets = path.join(sourceDir, "assets");
    const targetAssets = path.join(dir, "assets");
    if (fs.existsSync(sourceAssets) && fs.statSync(sourceAssets).isDirectory()) {
      ensureDir(targetAssets);
      copyDirRecursive(sourceAssets, targetAssets, files, "assets");
    }
  }
  return { dir, files };
}
