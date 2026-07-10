import fs from "node:fs";
import path from "node:path";
import { listAssetContentFiles } from "./hub.js";

export const SKILL_ENTRY = "SKILL.md";

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".yaml", ".yml", ".json", ".mjs", ".js", ".ts", ".sh"]);

export interface SkillFile {
  rel: string;
  content: string;
}

export interface SkillPackage {
  rootRel: string;
  entryRel: string;
  entryContent: string;
  files: SkillFile[];
}

function isSkillEntryName(name: string): boolean {
  return name.toLowerCase() === SKILL_ENTRY.toLowerCase();
}

/** Resolves the skill package root directory from a harness guide source path. */
export function resolveSkillRoot(wsBase: string, source: string): string {
  const abs = path.resolve(wsBase, source);
  if (!fs.existsSync(abs)) throw new Error(`skill source not found: ${source}`);

  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    if (!fs.existsSync(path.join(abs, SKILL_ENTRY))) {
      throw new Error(`skill directory missing ${SKILL_ENTRY}: ${source}`);
    }
    return abs;
  }

  if (stat.isFile() && isSkillEntryName(path.basename(abs))) {
    return path.dirname(abs);
  }

  throw new Error(`skill source must be a directory or ${SKILL_ENTRY} file: ${source}`);
}

/** Lists relative content file paths inside a skill package root. */
export function listSkillContentFiles(skillRoot: string): string[] {
  return listAssetContentFiles(skillRoot);
}

function readSkillFile(skillRoot: string, rel: string): string {
  const abs = path.join(skillRoot, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return "";
  return fs.readFileSync(abs, "utf8");
}

/** Loads a skill package from a harness guide source (directory or SKILL.md path). */
export function loadSkillPackage(wsBase: string, source: string): SkillPackage {
  const skillRoot = resolveSkillRoot(wsBase, source);
  const rootRel = path.relative(wsBase, skillRoot).replace(/\\/g, "/");
  const entryRel = SKILL_ENTRY;
  const entryPath = path.join(skillRoot, entryRel);
  const entryContent = fs.readFileSync(entryPath, "utf8");
  const files = listSkillContentFiles(skillRoot).map((rel) => ({
    rel,
    content: readSkillFile(skillRoot, rel)
  }));

  return { rootRel, entryRel, entryContent, files };
}

/** Inline appendix for targets that flatten skills into a single rules document. */
export function formatSkillResourceAppendix(id: string, pkg: Pick<SkillPackage, "files" | "entryRel">): string {
  const extras = pkg.files.filter((f) => f.rel.replace(/\\/g, "/") !== pkg.entryRel);
  if (!extras.length) return "";
  const parts = extras
    .filter((f) => TEXT_EXTENSIONS.has(path.extname(f.rel).toLowerCase()))
    .map((f) => `### ${f.rel}\n\n${f.content.trimEnd()}\n`);
  if (!parts.length) return "";
  return [`## Skill resources: ${id}`, "", ...parts].join("\n");
}
