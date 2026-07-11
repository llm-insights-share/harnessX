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

export interface InstallSkillFromGitHubOptions {
  workspaceRoot: string;
  url: string;
  id?: string;
  version?: string;
  outDir?: string;
  subpath?: string;
  branch?: string;
  stage?: DeliveryStage;
  task?: string;
  owner?: string;
  status?: AssetStatus;
  gitExec?: GitExec;
  /** Test hook: use an existing directory instead of cloning. */
  repoDirOverride?: string;
  resolveSourceOpts?: Omit<ResolveHubSourceOptions, "gitExec">;
  skipEval?: boolean;
}

export interface InstallSkillFromGitHubResult {
  dir: string;
  files: string[];
  id: string;
  version: string;
  repoUrl: string;
  skillSourceDir: string;
  eval?: ReturnType<typeof hubEvalLocal>;
}

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

function defaultOutDir(workspaceRoot: string, id: string, version: string): string {
  return path.join(workspaceRoot, "packages", "guide", "skill", id, version);
}

function appendGitHubProvenance(
  assetDir: string,
  url: string,
  repoUrl: string,
  subpath: string | undefined,
  skillSourceDir: string
): void {
  const manifestFile = path.join(assetDir, "asset.yaml");
  const manifest = YAML.parse(fs.readFileSync(manifestFile, "utf8")) as AssetManifest;
  const provenance = [...(manifest.provenance ?? [])];
  provenance.push({ type: "github-skill-install", ref: url });
  provenance.push({ type: "github-repo", ref: repoUrl });
  provenance.push({ type: "github-path", ref: subpath ?? path.basename(skillSourceDir) });
  manifest.provenance = provenance;
  fs.writeFileSync(manifestFile, YAML.stringify(manifest), "utf8");
}

/** Clone (or refresh) a GitHub repo and scaffold a guide.skill Hub asset from SKILL.md. */
export function installSkillFromGitHub(opts: InstallSkillFromGitHubOptions): InstallSkillFromGitHubResult {
  const parsed = parseGitHubSkillRef(opts.url);
  const branch = opts.branch ?? parsed.branch;
  const subpath = opts.subpath ?? parsed.subpath;

  const repoDir =
    opts.repoDirOverride ??
    resolveHubSource(opts.workspaceRoot, parsed.repoUrl, {
      updateRemote: true,
      refresh: true,
      branch,
      gitExec: opts.gitExec,
      ...opts.resolveSourceOpts
    });

  const skillSourceDir = resolveSkillSourceDir(repoDir, subpath);
  const id = opts.id ?? defaultSkillId(parsed.repoUrl, subpath);
  const version = opts.version ?? "1.0.0";
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

  appendGitHubProvenance(scaffold.dir, opts.url, parsed.repoUrl, subpath, skillSourceDir);

  const result: InstallSkillFromGitHubResult = {
    dir: scaffold.dir,
    files: scaffold.files,
    id,
    version,
    repoUrl: parsed.repoUrl,
    skillSourceDir
  };

  if (!opts.skipEval) {
    result.eval = hubEvalLocal(scaffold.dir);
    if (!result.eval.passed) {
      const failed = result.eval.checks.filter((c) => !c.ok).map((c) => c.name).join(", ");
      throw new Error(`installed skill failed evaluation: ${failed}`);
    }
  }

  return result;
}
