import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Workspace } from "./paths.js";
import { verifyMeta } from "./metaStore.js";
import { rebaseCheck, type RebaseReport } from "./rebase.js";

/**
 * Harness-aware git pull/push helpers for multi-developer collaboration.
 * Pull: fetch + integrate, then meta verify and concurrent-change rebase checks.
 * Push: preflight meta verify, stage change workspace paths, commit, push.
 */

export interface RemotePullOptions {
  remote?: string;
  branch?: string;
  /** Use `git pull --rebase` (default true). */
  rebase?: boolean;
  /** Limit post-pull rebase checks to one change. */
  change?: string;
}

export interface MetaVerifySummary {
  change: string;
  ok: boolean;
  problems: string[];
}

export interface RemotePullResult {
  remote: string;
  branch: string;
  pulled: boolean;
  output: string;
  metaVerify: MetaVerifySummary[];
  rebaseChecks: { change: string; report: RebaseReport }[];
}

export interface RemotePushOptions {
  remote?: string;
  branch?: string;
  /** Stage and push only this change workspace (default: all active changes with local edits). */
  change?: string;
  message?: string;
  /** Stage harness change paths but do not commit or push. */
  stageOnly?: boolean;
}

export interface RemotePushResult {
  remote: string;
  branch: string;
  staged: string[];
  committed: boolean;
  commitHash?: string;
  pushed: boolean;
  output: string;
  metaVerify: MetaVerifySummary[];
}

function git(ws: Workspace, args: string[], allowFail = false): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: ws.root, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(" ")} failed: ${out}`);
  return { ok: r.status === 0, out };
}

export function isGitRepo(ws: Workspace): boolean {
  return spawnSync("git", ["rev-parse", "--git-dir"], { cwd: ws.root, encoding: "utf8" }).status === 0;
}

function requireGitRepo(ws: Workspace): void {
  if (!isGitRepo(ws)) throw new Error("not a git repository — remote pull/push require git");
}

function currentBranch(ws: Workspace): string {
  const { out } = git(ws, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (out === "HEAD") throw new Error("detached HEAD — checkout a branch before remote pull/push");
  return out;
}

function resolveRemote(ws: Workspace, remote?: string): string {
  const name = remote ?? "origin";
  const { ok } = git(ws, ["remote", "get-url", name], true);
  if (!ok) throw new Error(`git remote "${name}" not configured`);
  return name;
}

function resolveBranch(ws: Workspace, branch?: string): string {
  return branch ?? currentBranch(ws);
}

function rel(ws: Workspace, abs: string): string {
  return path.relative(ws.root, abs).split(path.sep).join("/");
}

function changeRelPaths(ws: Workspace, change?: string): string[] {
  if (change) {
    const dir = ws.changeDir(change);
    if (!fs.existsSync(dir)) throw new Error(`change "${change}" not found`);
    return [rel(ws, dir)];
  }
  return ws.listChanges().map((id) => rel(ws, ws.changeDir(id)));
}

function pathsWithLocalEdits(ws: Workspace, relPaths: string[]): string[] {
  const { out } = git(ws, ["status", "--porcelain", "--", ...relPaths], true);
  if (!out) return [];
  const touched = new Set<string>();
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const file = line.slice(3).trim();
    const top = relPaths.find((p) => file === p || file.startsWith(`${p}/`));
    if (top) touched.add(top);
  }
  return [...touched].sort();
}

function targetsForPush(ws: Workspace, change?: string): string[] {
  const candidates = changeRelPaths(ws, change);
  const edited = pathsWithLocalEdits(ws, candidates);
  if (edited.length) return edited;
  if (change) return candidates;
  return candidates.filter((p) => pathsWithLocalEdits(ws, [p]).length > 0);
}

function verifyChanges(ws: Workspace, changes: string[]): MetaVerifySummary[] {
  const ids = changes.length ? changes : ws.listChanges();
  return ids.map((id) => {
    const res = verifyMeta(ws, id);
    return { change: id, ok: res.ok, problems: res.problems };
  });
}

function rebaseChecksFor(ws: Workspace, change?: string): { change: string; report: RebaseReport }[] {
  const ids = change ? [change] : ws.listChanges();
  return ids.map((id) => ({ change: id, report: rebaseCheck(ws, id) }));
}

function assertMetaVerifyOk(summaries: MetaVerifySummary[]): void {
  const bad = summaries.filter((s) => !s.ok);
  if (!bad.length) return;
  const lines = bad.flatMap((s) => s.problems.map((p) => `${s.change}: ${p}`));
  throw new Error(`meta verify failed before push:\n${lines.map((l) => `  - ${l}`).join("\n")}`);
}

export function remotePull(ws: Workspace, opts: RemotePullOptions = {}): RemotePullResult {
  requireGitRepo(ws);
  const remote = resolveRemote(ws, opts.remote);
  const branch = resolveBranch(ws, opts.branch);
  const rebase = opts.rebase !== false;

  const args = ["pull", ...(rebase ? ["--rebase"] : []), remote, branch];
  const { out } = git(ws, args);

  const metaVerify = verifyChanges(ws, opts.change ? [opts.change] : []);
  const rebaseChecks = rebaseChecksFor(ws, opts.change);

  return {
    remote,
    branch,
    pulled: true,
    output: out,
    metaVerify,
    rebaseChecks
  };
}

export function remotePush(ws: Workspace, opts: RemotePushOptions = {}): RemotePushResult {
  requireGitRepo(ws);
  const remote = resolveRemote(ws, opts.remote);
  const branch = resolveBranch(ws, opts.branch);

  const stageTargets = targetsForPush(ws, opts.change);
  if (!stageTargets.length) {
    throw new Error(
      opts.change
        ? `no local edits under harness change "${opts.change}" — nothing to stage`
        : "no local edits under active change workspaces — nothing to stage"
    );
  }

  const verifyIds = opts.change
    ? [opts.change]
    : stageTargets.map((p) => path.basename(p));
  const metaVerify = verifyChanges(ws, verifyIds);
  assertMetaVerifyOk(metaVerify);

  for (const target of stageTargets) git(ws, ["add", "--", target]);

  if (opts.stageOnly) {
    return {
      remote,
      branch,
      staged: stageTargets,
      committed: false,
      pushed: false,
      output: "staged only",
      metaVerify
    };
  }

  const staged = git(ws, ["diff", "--cached", "--name-only"], true).out;
  if (!staged) throw new Error("nothing staged after git add — aborting push");

  const defaultMsg = opts.change ? `harness: sync ${opts.change} state` : `harness: sync change workspace state`;
  git(ws, ["commit", "-m", opts.message ?? defaultMsg]);
  const commitHash = git(ws, ["rev-parse", "--short", "HEAD"]).out;

  const { out } = git(ws, ["push", remote, branch]);
  return {
    remote,
    branch,
    staged: stageTargets,
    committed: true,
    commitHash,
    pushed: true,
    output: out,
    metaVerify
  };
}
