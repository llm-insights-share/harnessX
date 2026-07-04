import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { listDeltaFiles, parseDelta } from "./artifactStore.js";

/**
 * T-203 (FR-006): generates tasks.md from delta specs as a dual-track list —
 * a test task and an implementation task per requirement, each annotated with
 * the requirement it covers. Requirements lacking a test task need a waiver.
 */

export interface Task {
  id: string;
  track: "test" | "impl";
  requirement: string;
  capability: string;
  title: string;
  done: boolean;
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
        tasks.push({
          id: `${base}a`,
          track: "test",
          requirement: req.name,
          capability,
          title: `Write failing test(s) for scenarios of "${req.name}"`,
          done: false
        });
        tasks.push({
          id: `${base}b`,
          track: "impl",
          requirement: req.name,
          capability,
          title: `Implement "${req.name}" until its tests pass`,
          done: false
        });
        n++;
      }
    }
  }
  const file = path.join(ws.changeDir(change), "tasks.md");
  fs.writeFileSync(file, serializeTasks(change, tasks), "utf8");
  return { file, tasks };
}

export function serializeTasks(change: string, tasks: Task[]): string {
  const lines = [
    `# Tasks: ${change}`,
    "",
    "> Dual-track plan (FR-006): every requirement has a test task (a) and an impl task (b).",
    "> A requirement without a test task requires a waiver (`hx waiver add`).",
    ""
  ];
  for (const t of tasks) {
    lines.push(`- [${t.done ? "x" : " "}] ${t.id} [${t.track}] (${t.capability} / Requirement: ${t.requirement}) ${t.title}`);
  }
  return lines.join("\n") + "\n";
}

const TASK_RE = /^- \[( |x)\] (\S+) \[(test|impl)\] \(([^/]+) \/ Requirement: (.+?)\) (.*)$/;

export function parseTasks(md: string): Task[] {
  const tasks: Task[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(TASK_RE);
    if (m) tasks.push({ done: m[1] === "x", id: m[2], track: m[3] as Task["track"], capability: m[4].trim(), requirement: m[5].trim(), title: m[6] });
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

/** Requirements whose test track is missing or skipped — need waivers. */
export function missingTestTasks(tasks: Task[]): string[] {
  const reqs = new Set(tasks.filter((t) => t.track === "impl").map((t) => `${t.capability}/${t.requirement}`));
  const tested = new Set(tasks.filter((t) => t.track === "test").map((t) => `${t.capability}/${t.requirement}`));
  return [...reqs].filter((r) => !tested.has(r));
}
