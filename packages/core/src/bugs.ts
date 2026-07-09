import fs from "node:fs";
import { Workspace, ensureDir, readYaml, writeYaml } from "./paths.js";
import { BugYaml, BUG_STATUSES } from "./schemas.js";
import { createWorkOrder } from "./workorder.js";

export function readBug(ws: Workspace, change: string, bugId: string): BugYaml {
  const file = ws.bugFile(change, bugId);
  if (!fs.existsSync(file)) throw new Error(`bug "${bugId}" not found in change "${change}"`);
  return BugYaml.parse(readYaml(file));
}

function nextBugId(ws: Workspace, change: string): string {
  ensureDir(ws.bugsDir(change));
  const existing = fs.readdirSync(ws.bugsDir(change)).filter((f) => f.startsWith("BUG-") && f.endsWith(".yaml"));
  const nums = existing.map((f) => parseInt(f.replace("BUG-", "").replace(".yaml", ""), 10)).filter((n) => !Number.isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `BUG-${String(next).padStart(3, "0")}`;
}

export interface CreateBugOpts {
  title: string;
  severity?: BugYaml["severity"];
  scenario?: string;
  steps?: string;
  expected?: string;
  actual?: string;
  createdBy: string;
}

export function createBug(ws: Workspace, change: string, opts: CreateBugOpts): { bug: BugYaml; workorderId: string } {
  ensureDir(ws.bugsDir(change));
  const id = nextBugId(ws, change);
  const bug = BugYaml.parse({
    id,
    title: opts.title,
    severity: opts.severity ?? "major",
    status: "open",
    scenario: opts.scenario,
    steps: opts.steps,
    expected: opts.expected,
    actual: opts.actual,
    workorders: [],
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString()
  });
  const wo = createWorkOrder(ws, {
    type: "bug-fix",
    title: `Fix bug ${id}: ${opts.title}`,
    scope: "change",
    ref: { change, bug: id },
    assigneeRole: "developer",
    createdBy: opts.createdBy
  });
  bug.workorders.push(wo.id);
  writeYaml(ws.bugFile(change, id), bug);
  return { bug, workorderId: wo.id };
}

export function listBugs(ws: Workspace, change: string, statuses?: BugYaml["status"][]): BugYaml[] {
  const dir = ws.bugsDir(change);
  if (!fs.existsSync(dir)) return [];
  const bugs: BugYaml[] = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".yaml"))) {
    const bug = readBug(ws, change, f.replace(/\.yaml$/, ""));
    if (!statuses || statuses.includes(bug.status)) bugs.push(bug);
  }
  return bugs.sort((a, b) => a.id.localeCompare(b.id));
}

export function markBugFixed(ws: Workspace, change: string, bugId: string, commit: string, by: string): { bug: BugYaml; retestWoId: string } {
  const bug = readBug(ws, change, bugId);
  bug.status = "fixed";
  bug.fixCommit = commit;
  const wo = createWorkOrder(ws, {
    type: "retest",
    title: `Retest bug ${bugId}`,
    scope: "change",
    ref: { change, bug: bugId },
    assigneeRole: "tester",
    createdBy: by
  });
  bug.workorders.push(wo.id);
  bug.status = "retest";
  writeYaml(ws.bugFile(change, bugId), bug);
  return { bug, retestWoId: wo.id };
}

export function closeBug(ws: Workspace, change: string, bugId: string, by: string): BugYaml {
  const bug = readBug(ws, change, bugId);
  bug.status = "closed";
  writeYaml(ws.bugFile(change, bugId), bug);
  return bug;
}

export function reopenBug(ws: Workspace, change: string, bugId: string, by: string): BugYaml {
  const bug = readBug(ws, change, bugId);
  bug.status = "reopened";
  writeYaml(ws.bugFile(change, bugId), bug);
  return bug;
}

export type BugStatus = (typeof BUG_STATUSES)[number];
