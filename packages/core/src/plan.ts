import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { listDeltaFiles, parseDelta } from "./artifactStore.js";
import { inferCodeHints } from "./designLayout.js";
import { archModuleLldRel } from "./archLayout.js";
import { resolveModuleByCapability, readArchRegistry } from "./archRegistry.js";
import { syncDeliveryTraceFromTasks } from "./deliveryTrace.js";
import { readMeta } from "./metaStore.js";
import { spawnLldDesignWorkOrders, listWorkOrders } from "./workorder.js";

/**
 * T-203 (FR-006): generates tasks.md from delta specs as a dual-track list —
 * a test task and an implementation task per requirement, each annotated with
 * the requirement it covers. Enterprise handoff adds @design= and @files= refs.
 */

export interface Task {
  id: string;
  track: "test" | "impl";
  requirement: string;
  capability: string;
  title: string;
  done: boolean;
  /** v0.2: tasks sharing a group may run concurrently (hx apply --parallel). */
  parallelGroup?: string;
  /** v0.2: task ids that must complete before this one starts. */
  dependsOn?: string[];
  /** LLD file relative to change dir for apply handoff. */
  designRef?: string;
  /** Comma-separated target file paths for apply handoff. */
  filesHint?: string;
}

function pickDesignRef(ws: Workspace, change: string, capability: string, requirement: string): string | undefined {
  try {
    const registry = readArchRegistry(ws);
    const mod = resolveModuleByCapability(registry, capability);
    if (mod && fs.existsSync(path.join(ws.root, "docs", "architecture", mod.lld))) {
      return archModuleLldRel(ws, mod.id);
    }
  } catch {
    /* no arch registry */
  }
  const designDir = ws.designDir(change);
  if (!fs.existsSync(designDir)) return undefined;
  const slug = requirement
    .toLowerCase()
    .replace(/requirement:\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const candidates = [
    path.join("design", "ui", "components", `${slug}.md`),
    path.join("design", "api", `${slug}.yaml`),
    path.join("design", "data", `${slug}.sql`)
  ];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(ws.changeDir(change), rel))) return rel;
  }
  if (fs.existsSync(ws.designOverviewFile(change))) return "design/overview.md";
  if (fs.existsSync(ws.designFile(change))) return "design.md";
  return undefined;
}

export function generateTasks(ws: Workspace, change: string): { file: string; tasks: Task[] } {
  const tasks: Task[] = [];
  let n = 1;
  for (const { capability, file } of listDeltaFiles(ws, change)) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    for (const section of delta.sections) {
      if (section.op === "REMOVED") continue;
      for (const req of section.requirements) {
        const base = String(n).padStart(2, "0");
        const designRef = pickDesignRef(ws, change, capability, req.name);
        const testHints = inferCodeHints(ws, capability, req.name, "test").join(",");
        const implHints = inferCodeHints(ws, capability, req.name, "impl").join(",");
        tasks.push({
          id: `${base}a`,
          track: "test",
          requirement: req.name,
          capability,
          title: `Write failing test(s) for scenarios of "${req.name}"`,
          done: false,
          designRef,
          filesHint: testHints
        });
        tasks.push({
          id: `${base}b`,
          track: "impl",
          requirement: req.name,
          capability,
          title: `Implement "${req.name}" until its tests pass`,
          done: false,
          designRef,
          filesHint: implHints,
          dependsOn: [`${base}a`]
        });
        n++;
      }
    }
  }
  const out = path.join(ws.changeDir(change), "tasks.md");
  fs.writeFileSync(out, serializeTasks(change, tasks), "utf8");
  syncDeliveryTraceFromTasks(ws, change, tasks);

  try {
    const meta = readMeta(ws, change);
    if (meta.profile === "enterprise-sdlc" && meta.archModules?.length) {
      const existing = listWorkOrders(ws, { type: "lld-design", change });
      if (existing.length === 0) {
        spawnLldDesignWorkOrders(ws, change, meta.archModules, "hx-plan");
      }
    }
  } catch {
    /* ignore if meta unreadable */
  }

  return { file: out, tasks };
}

export function serializeTasks(change: string, tasks: Task[]): string {
  const lines = [
    `# Tasks: ${change}`,
    "",
    "> Dual-track plan (FR-006): every requirement has a test task (a) and an impl task (b).",
    "> Handoff: @design= LLD path, @files= target paths. Run `hx guide task-pack <change> <taskId>` during apply.",
    "> A requirement without a test task requires a waiver (`hx waiver add`).",
    ""
  ];
  for (const t of tasks) {
    let line = `- [${t.done ? "x" : " "}] ${t.id} [${t.track}] (${t.capability} / Requirement: ${t.requirement}) ${t.title}`;
    if (t.designRef) line += ` @design=${t.designRef}`;
    if (t.filesHint) line += ` @files=${t.filesHint}`;
    if (t.parallelGroup) line += ` @group=${t.parallelGroup}`;
    if (t.dependsOn?.length) line += ` @depends=${t.dependsOn.join(",")}`;
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}

const TASK_RE =
  /^- \[( |x)\] (\S+) \[(test|impl)\] \(([^/]+) \/ Requirement: (.+?)\) (.+?)(?: @design=([^\s]+))?(?: @files=([^\s]+))?(?: @group=(\S+))?(?: @depends=([\d\w,]+))?$/;

export function parseTasks(md: string): Task[] {
  const tasks: Task[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(TASK_RE);
    if (m)
      tasks.push({
        done: m[1] === "x",
        id: m[2],
        track: m[3] as Task["track"],
        capability: m[4].trim(),
        requirement: m[5].trim(),
        title: m[6].trim(),
        designRef: m[7],
        filesHint: m[8],
        parallelGroup: m[9],
        dependsOn: m[10] ? m[10].split(",").map((s) => s.trim()).filter(Boolean) : undefined
      });
  }
  return tasks;
}

export function readTasks(ws: Workspace, change: string): Task[] {
  const file = path.join(ws.changeDir(change), "tasks.md");
  if (!fs.existsSync(file)) return [];
  return parseTasks(fs.readFileSync(file, "utf8"));
}

export function markTaskDone(ws: Workspace, change: string, taskId: string): Task[] {
  const file = path.join(ws.changeDir(change), "tasks.md");
  const tasks = readTasks(ws, change).map((t) => (t.id === taskId ? { ...t, done: true } : t));
  fs.writeFileSync(file, serializeTasks(change, tasks), "utf8");
  return tasks;
}

/** v0.2: next batch of tasks ready to run (respects dependsOn and parallel groups). */
export function nextTaskBatch(tasks: Task[], completed: string[], parallel = 1): Task[] {
  const pending = tasks.filter((t) => !t.done && !completed.includes(t.id));
  const ready = pending.filter((t) => (t.dependsOn ?? []).every((d) => completed.includes(d) || tasks.find((x) => x.id === d)?.done));
  if (!ready.length) return [];

  const ungrouped = ready.filter((t) => !t.parallelGroup);
  if (ungrouped.length) return [ungrouped[0]!];

  const firstGroup = ready.find((t) => t.parallelGroup)?.parallelGroup;
  if (!firstGroup) return [ready[0]!];
  return ready.filter((t) => t.parallelGroup === firstGroup).slice(0, Math.max(1, parallel));
}

/** Requirements whose test track is missing or skipped — need waivers. */
export function missingTestTasks(tasks: Task[]): string[] {
  const reqs = new Set(tasks.filter((t) => t.track === "impl").map((t) => `${t.capability}/${t.requirement}`));
  const tested = new Set(tasks.filter((t) => t.track === "test").map((t) => `${t.capability}/${t.requirement}`));
  return [...reqs].filter((r) => !tested.has(r));
}

export function findTask(ws: Workspace, change: string, taskId: string): Task | undefined {
  return readTasks(ws, change).find((t) => t.id === taskId);
}
