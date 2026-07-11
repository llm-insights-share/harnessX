import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { createAssetScaffold } from "./hubScaffold.js";
import { hubEvalLocal } from "./hubEval.js";
import { isGitHubHubRef, resolveHubSource, type GitExec, type ResolveHubSourceOptions } from "./hubSource.js";
import { SKILL_ENTRY } from "./skill.js";
import type { AssetManifest, AssetStatus, DeliveryStage } from "./schemas.js";

export interface ParsedGitHubSkillRef {
  repoUrl: string;
  branch?: string;
  subpath?: string;
}

export interface InstallGuideSkillAssetOptions {
  workspaceRoot: string;
  id?: string;
  version?: string;
  outDir?: string;
  stage?: DeliveryStage;
  task?: string;
  owner?: string;
  status?: AssetStatus;
  skipEval?: boolean;
  /** Local directory or file containing SKILL.md. */
  sourceDir?: string;
  /** GitHub repository / tree / blob URL. */
  githubUrl?: string;
  subpath?: string;
  branch?: string;
  gitExec?: GitExec;
  /** Test hook: use an existing directory instead of cloning. */
  repoDirOverride?: string;
  resolveSourceOpts?: Omit<ResolveHubSourceOptions, "gitExec">;
}

export interface InstallGuideSkillAssetResult {
  dir: string;
  files: string[];
  id: string;
  version: string;
  skillSourceDir: string;
  source: "local" | "github";
  repoUrl?: string;
  eval?: ReturnType<typeof hubEvalLocal>;
}

/** @deprecated Use InstallGuideSkillAssetOptions */
export type InstallSkillFromGitHubOptions = InstallGuideSkillAssetOptions & { url: string };

/** @deprecated Use InstallGuideSkillAssetResult */
export type InstallSkillFromGitHubResult = InstallGuideSkillAssetResult & { repoUrl: string };

/** Parse GitHub repository / tree / blob URLs into clone metadata. */
export function parseGitHubSkillRef(input: string): ParsedGitHubSkillRef {
  const trimmed = input.trim();

  const treeMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)$/i);
  if (treeMatch) {
    const [, org, repo, branch, subpath] = treeMatch;
    return {
      repoUrl: `https://github.com/${org}/${repo}.git`,
      branch,
      subpath: subpath.replace(/\/$/, "") || undefined
    };
  }

  const blobMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.*)$/i);
  if (blobMatch) {
    const [, org, repo, branch, filePath] = blobMatch;
    const normalized = filePath.replace(/\\/g, "/");
    const subpath = /skill\.md$/i.test(normalized) ? path.posix.dirname(normalized) : normalized;
    return {
      repoUrl: `https://github.com/${org}/${repo}.git`,
      branch,
      subpath: !subpath || subpath === "." ? undefined : subpath
    };
  }

  if (isGitHubHubRef(trimmed)) {
    return { repoUrl: trimmed.endsWith(".git") ? trimmed : `${trimmed}.git` };
  }

  const webMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/i);
  if (webMatch) {
    return { repoUrl: `https://github.com/${webMatch[1]}/${webMatch[2]}.git` };
  }

  throw new Error(
    `unsupported GitHub skill URL: ${input}\n` +
      "Supported: git@github.com:org/repo.git, https://github.com/org/repo, https://github.com/org/repo/tree/<branch>/<path>"
  );
}

function slugifyId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "skill";
}

export function defaultSkillId(repoUrl: string, subpath?: string): string {
  if (subpath) return slugifyId(path.posix.basename(subpath));
  const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/i);
  return slugifyId(match?.[1] ?? "skill");
}

function defaultSkillIdFromLocal(sourcePath: string): string {
  const base = path.basename(sourcePath, path.extname(sourcePath));
  return slugifyId(base);
}

/** Locate a directory containing SKILL.md inside a cloned repository. */
export function resolveSkillSourceDir(repoDir: string, subpath?: string): string {
  const candidates: string[] = [];
  if (subpath) candidates.push(path.join(repoDir, subpath));
  candidates.push(repoDir);
  if (!subpath) {
    for (const rel of [".cursor/skills", "skills", "skill"]) {
      candidates.push(path.join(repoDir, rel));
    }
  }

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, SKILL_ENTRY))) return dir;
  }

  throw new Error(
    subpath
      ? `SKILL.md not found under repository path "${subpath}"`
      : "SKILL.md not found at repository root; pass --path <subdir> or use a tree/blob URL"
  );
}

/** Locate SKILL.md from a local directory or file path. */
export function resolveLocalSkillSourceDir(sourcePath: string): string {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) throw new Error(`source path not found: ${resolved}`);

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    const dir = path.dirname(resolved);
    if (!/skill\.md$/i.test(resolved)) {
      throw new Error(`source file must be SKILL.md: ${resolved}`);
    }
    return dir;
  }

  if (fs.existsSync(path.join(resolved, SKILL_ENTRY))) return resolved;
  return resolveSkillSourceDir(resolved);
}

function defaultOutDir(workspaceRoot: string, id: string, version: string): string {
  return path.join(workspaceRoot, "packages", "guide", "skill", id, version);
}

function appendProvenance(
  assetDir: string,
  entries: { type: string; ref: string }[]
): void {
  const manifestFile = path.join(assetDir, "asset.yaml");
  const manifest = YAML.parse(fs.readFileSync(manifestFile, "utf8")) as AssetManifest;
  manifest.provenance = [...(manifest.provenance ?? []), ...entries];
  fs.writeFileSync(manifestFile, YAML.stringify(manifest), "utf8");
}

function runEvalUnlessSkipped(
  assetDir: string,
  skipEval?: boolean
): ReturnType<typeof hubEvalLocal> | undefined {
  if (skipEval) return undefined;
  const evalResult = hubEvalLocal(assetDir);
  if (!evalResult.passed) {
    const failed = evalResult.checks.filter((c) => !c.ok).map((c) => c.name).join(", ");
    throw new Error(`skill asset failed evaluation: ${failed}`);
  }
  return evalResult;
}

/** Scaffold a guide.skill Hub asset from a local directory or a GitHub repository. */
export function installGuideSkillAsset(opts: InstallGuideSkillAssetOptions): InstallGuideSkillAssetResult {
  const hasLocal = !!opts.sourceDir;
  const hasGitHub = !!opts.githubUrl;
  if (hasLocal === hasGitHub) {
    throw new Error("provide exactly one of sourceDir or githubUrl");
  }

  const version = opts.version ?? "1.0.0";
  let skillSourceDir: string;
  let id: string;
  let provenance: { type: string; ref: string }[];
  let source: "local" | "github";
  let repoUrl: string | undefined;

  if (hasLocal) {
    const sourcePath = path.resolve(opts.sourceDir!);
    skillSourceDir = resolveLocalSkillSourceDir(sourcePath);
    id = opts.id ?? defaultSkillIdFromLocal(skillSourceDir);
    provenance = [{ type: "local-skill-source", ref: sourcePath }];
    source = "local";
  } else {
    const parsed = parseGitHubSkillRef(opts.githubUrl!);
    const branch = opts.branch ?? parsed.branch;
    const subpath = opts.subpath ?? parsed.subpath;
    repoUrl = parsed.repoUrl;

    const repoDir =
      opts.repoDirOverride ??
      resolveHubSource(opts.workspaceRoot, parsed.repoUrl, {
        updateRemote: true,
        refresh: true,
        branch,
        gitExec: opts.gitExec,
        ...opts.resolveSourceOpts
      });

    skillSourceDir = resolveSkillSourceDir(repoDir, subpath);
    id = opts.id ?? defaultSkillId(parsed.repoUrl, subpath);
    provenance = [
      { type: "github-skill-install", ref: opts.githubUrl! },
      { type: "github-repo", ref: parsed.repoUrl },
      { type: "github-path", ref: subpath ?? path.basename(skillSourceDir) }
    ];
    source = "github";
  }

  const outDir = path.resolve(opts.outDir ?? defaultOutDir(opts.workspaceRoot, id, version));
  const scaffold = createAssetScaffold({
    rootDir: outDir,
    id,
    kind: "guide.skill",
    version,
    status: opts.status ?? "draft",
    stage: opts.stage ?? "dev",
    task: opts.task,
    owner: opts.owner,
    sourceDir: skillSourceDir
  });

  appendProvenance(scaffold.dir, provenance);

  const result: InstallGuideSkillAssetResult = {
    dir: scaffold.dir,
    files: scaffold.files,
    id,
    version,
    skillSourceDir,
    source,
    repoUrl
  };

  result.eval = runEvalUnlessSkipped(scaffold.dir, opts.skipEval);
  return result;
}

/** @deprecated Use installGuideSkillAsset with githubUrl instead. */
export function installSkillFromGitHub(opts: InstallSkillFromGitHubOptions): InstallSkillFromGitHubResult {
  const result = installGuideSkillAsset({ ...opts, githubUrl: opts.url });
  return { ...result, repoUrl: result.repoUrl! };
}
