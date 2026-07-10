import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  Workspace,
  initWorkspace,
  createChange,
  scaffoldProposal,
  parseTasks,
  serializeTasks,
  nextTaskBatch,
  importReviewAnnotations,
  pendingFixHints,
  resolveAnnotation,
  runGuideEvals,
  parseIssueUrl,
  slugFromTitle,
  fetchGitHubIssue,
  collectWatchSnapshot,
  detectWatchEvents,
  createWorktree,
  listWorktrees,
  removeWorktree,
  VERSION,
  type Task
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m7-"));

function gitInit(dir: string) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
}

describe("v0.2 version", () => {
  it("exports 0.6.0", () => {
    expect(VERSION).toBe("0.6.0");
  });
});

describe("v0.2 parallel task scheduling", () => {
  it("parses @group and @depends metadata", () => {
    const md = `- [ ] 01a [test] (auth / Requirement: X) Write test @group=g1
- [ ] 02a [test] (auth / Requirement: Y) Write test @group=g1 @depends=01a
- [ ] 01b [impl] (auth / Requirement: X) Implement @depends=01a`;
    const tasks = parseTasks(md);
    expect(tasks[0]?.parallelGroup).toBe("g1");
    expect(tasks[1]?.dependsOn).toEqual(["01a"]);
    expect(serializeTasks("c", tasks)).toContain("@group=g1");
  });

  it("nextTaskBatch respects depends and groups", () => {
    const tasks: Task[] = [
      { id: "01a", track: "test", requirement: "X", capability: "auth", title: "t1", done: false, parallelGroup: "g1" },
      { id: "02a", track: "test", requirement: "Y", capability: "auth", title: "t2", done: false, parallelGroup: "g1" },
      { id: "01b", track: "impl", requirement: "X", capability: "auth", title: "t3", done: false, dependsOn: ["01a"] }
    ];
    expect(nextTaskBatch(tasks, [], 2).map((t) => t.id)).toEqual(["01a", "02a"]);
    expect(nextTaskBatch(tasks, ["01a", "02a"], 2).map((t) => t.id)).toEqual(["01b"]);
  });
});

describe("v0.2 review annotations", () => {
  it("imports JSON and formats fix hints", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    const src = path.join(ws.root, "review.json");
    fs.writeFileSync(
      src,
      JSON.stringify([{ file: "src/a.ts", line: 10, severity: "critical", comment: "fix expiry check" }])
    );
    importReviewAnnotations(ws, "c1", "review.json");
    const hints = pendingFixHints(ws, "c1");
    expect(hints[0]).toContain("CRITICAL");
    expect(hints[0]).toContain("fix expiry check");
    resolveAnnotation(ws, "c1", "import-1");
    expect(pendingFixHints(ws, "c1")).toHaveLength(0);
  });
});

describe("v0.2 guide evals", () => {
  it("passes default evals on initialized workspace", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    scaffoldProposal(ws, "c1", "Test");
    const report = runGuideEvals(ws, "c1");
    expect(report.passed).toBe(true);
  });
});

describe("v0.2 issue scaffold helpers", () => {
  it("parses GitHub issue URLs and slugs titles", () => {
    expect(parseIssueUrl("https://github.com/org/repo/issues/42")).toEqual({ owner: "org", repo: "repo", number: 42 });
    expect(slugFromTitle("Fix Login Bug!")).toBe("fix-login-bug");
  });

  it("fetches a public issue from GitHub API", async () => {
    const mockIssue = {
      number: 1,
      title: "Test issue",
      body: "body",
      html_url: "https://github.com/octocat/Hello-World/issues/1",
      labels: [{ name: "bug" }]
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => mockIssue })
    );
    const issue = await fetchGitHubIssue("https://github.com/octocat/Hello-World/issues/1");
    expect(issue.number).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("v0.2 watch", () => {
  it("detects needs_approval and tasks_complete events", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    scaffoldProposal(ws, "c1", "T");
    const snap = collectWatchSnapshot(ws, "c1");
    expect(snap.change).toBe("c1");
    const events = detectWatchEvents(ws, "c1");
    expect(events.some((e) => e.kind === "idle" || e.kind === "needs_approval")).toBe(true);
  });
});

describe("v0.2 runtime worktrees", () => {
  it("creates and removes a git worktree", () => {
    const root = tmp();
    gitInit(root);
    const ws = initWorkspace(root).ws;
    createChange(ws, "c1", ["auth"]);
    const wt = createWorktree(ws, "c1", "test-1");
    expect(fs.existsSync(wt.path)).toBe(true);
    expect(listWorktrees(ws, "c1")).toHaveLength(1);
    removeWorktree(ws, "c1", "test-1");
    expect(listWorktrees(ws, "c1")).toHaveLength(0);
  });
});
