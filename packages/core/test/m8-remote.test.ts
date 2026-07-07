import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  Workspace,
  initWorkspace,
  createChange,
  scaffoldProposal,
  readMeta,
  recordApproval,
  setStatus,
  remotePull,
  remotePush,
  isGitRepo
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-remote-"));

function git(root: string, cmd: string) {
  execSync(cmd, { cwd: root, stdio: "pipe" });
}

function initGitWithRemote(ws: Workspace): { bare: string } {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "hx-remote-bare-"));
  git(bare, "git init --bare -q");
  git(ws.root, "git init -q");
  git(ws.root, 'git config user.email "test@example.com"');
  git(ws.root, 'git config user.name "Test"');
  git(ws.root, `git remote add origin ${bare}`);
  git(ws.root, "git add -A");
  git(ws.root, 'git commit -m "init harness"');
  git(ws.root, "git branch -M main");
  git(ws.root, "git push -u origin main");
  return { bare };
}

function setupChange(ws: Workspace, id = "feat-a") {
  createChange(ws, id, ["auth"]);
  scaffoldProposal(ws, id, "Feature");
  const p = path.join(ws.changeDir(id), "proposal.md");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("{{title}}", "Feature"));
}

describe("hx remote pull/push", () => {
  it("isGitRepo detects repositories", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    expect(isGitRepo(ws)).toBe(false);
    git(root, "git init -q");
    expect(isGitRepo(ws)).toBe(true);
  });

  it("remotePush stages change workspace, commits, and pushes", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    initGitWithRemote(ws);
    setupChange(ws, "sync-me");

    setStatus(ws, "sync-me", "specified");
    recordApproval(ws, "sync-me", "spec", "alice");

    const res = remotePush(ws, { change: "sync-me", message: "harness: approve sync-me" });
    expect(res.staged).toEqual([`${ws.dirName}/changes/sync-me`]);
    expect(res.committed).toBe(true);
    expect(res.pushed).toBe(true);
    expect(res.metaVerify.every((m) => m.ok)).toBe(true);

    const logLine = execSync("git log -1 --oneline", { cwd: root, encoding: "utf8" });
    expect(logLine).toContain("harness: approve sync-me");
  });

  it("remotePush rejects tampered meta.yaml", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    initGitWithRemote(ws);
    setupChange(ws, "bad-meta");

    const metaFile = ws.metaFile("bad-meta");
    fs.writeFileSync(metaFile, fs.readFileSync(metaFile, "utf8").replace("status: proposed", "status: verified"));

    expect(() => remotePush(ws, { change: "bad-meta" })).toThrow(/meta verify failed/);
  });

  it("remotePull integrates remote updates and verifies meta", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    const { bare } = initGitWithRemote(ws);
    setupChange(ws, "team-change");
    remotePush(ws, { change: "team-change", message: "harness: initial" });

    const cloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hx-remote-clone-"));
    git(cloneRoot, `git clone -b main ${bare} .`);
    git(cloneRoot, 'git config user.email "peer@example.com"');
    git(cloneRoot, 'git config user.name "Peer"');

    const cloneWs = Workspace.locate(cloneRoot);
    setStatus(cloneWs, "team-change", "designed");
    remotePush(cloneWs, { change: "team-change", message: "harness: advance to designed" });

    const pullRes = remotePull(ws, { change: "team-change" });
    expect(pullRes.pulled).toBe(true);
    expect(readMeta(ws, "team-change").status).toBe("designed");
    expect(pullRes.metaVerify.find((m) => m.change === "team-change")?.ok).toBe(true);
    expect(pullRes.rebaseChecks.find((r) => r.change === "team-change")?.report.clean).toBe(true);
  });

  it("remotePush --stageOnly stages without committing", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    initGitWithRemote(ws);
    setupChange(ws, "stage-only");
    setStatus(ws, "stage-only", "planned");

    const res = remotePush(ws, { change: "stage-only", stageOnly: true });
    expect(res.staged.length).toBe(1);
    expect(res.committed).toBe(false);
    expect(res.pushed).toBe(false);

    const status = execSync("git status --porcelain", { cwd: root, encoding: "utf8" });
    expect(status).toContain("harnessX/changes/stage-only");
    const log = execSync("git log --oneline", { cwd: root, encoding: "utf8" });
    expect(log.trim().split("\n").length).toBe(1);
  });
});
