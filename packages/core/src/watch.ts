import fs from "node:fs";
import { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { readTasks } from "./plan.js";
import { nextTask } from "./stageGate.js";
import { pendingFixHints } from "./reviewAnnotations.js";

/**
 * v0.2 P2: Watch active changes and emit notifications (stdout or webhook).
 */

export type WatchEventKind =
  | "status_change"
  | "gate_blocked"
  | "needs_approval"
  | "tasks_complete"
  | "review_pending"
  | "idle";

export interface WatchEvent {
  at: string;
  change: string;
  kind: WatchEventKind;
  message: string;
  detail?: Record<string, unknown>;
}

export interface WatchSnapshot {
  change: string;
  stage: string;
  task: string;
  profile: string;
  tasksDone: number;
  tasksTotal: number;
  nextTask: string | null;
  pendingReviewHints: number;
}

export function collectWatchSnapshot(ws: Workspace, change: string): WatchSnapshot {
  const meta = readMeta(ws, change);
  const tasks = readTasks(ws, change);
  const harness = ws.readHarness();
  const next = nextTask(harness, meta);
  return {
    change,
    stage: meta.stage,
    task: meta.task,
    profile: meta.profile,
    tasksDone: tasks.filter((t) => t.done).length,
    tasksTotal: tasks.length,
    nextTask: next ? `${next.stage}/${next.task}` : null,
    pendingReviewHints: pendingFixHints(ws, change).length
  };
}

export function detectWatchEvents(ws: Workspace, change: string, prev?: WatchSnapshot): WatchEvent[] {
  const snap = collectWatchSnapshot(ws, change);
  const meta = readMeta(ws, change);
  const events: WatchEvent[] = [];
  const at = new Date().toISOString();

  if (prev && (prev.stage !== snap.stage || prev.task !== snap.task)) {
    events.push({
      at,
      change,
      kind: "status_change",
      message: `${change}: ${prev.stage}/${prev.task} → ${snap.stage}/${snap.task}`,
      detail: { from: `${prev.stage}/${prev.task}`, to: `${snap.stage}/${snap.task}` }
    });
  }

  if (snap.stage === "dev" && snap.task === "plan") {
    const approved = meta.approvals.some((a) => a.gate === "design-to-plan");
    if (!approved) {
      events.push({
        at,
        change,
        kind: "needs_approval",
        message: `${change} needs design-to-plan approval before plan gate`
      });
    }
  }

  if (snap.tasksTotal > 0 && snap.tasksDone === snap.tasksTotal && snap.stage === "dev" && snap.task === "apply") {
    events.push({ at, change, kind: "tasks_complete", message: `${change}: all implementation tasks done` });
  }

  if (snap.pendingReviewHints > 0) {
    events.push({
      at,
      change,
      kind: "review_pending",
      message: `${change}: ${snap.pendingReviewHints} review annotation(s) with fix hints`
    });
  }

  if (!events.length) {
    events.push({ at, change, kind: "idle", message: `${change} at ${snap.stage}/${snap.task}` });
  }

  return events;
}

export interface WatchOptions {
  intervalMs?: number;
  webhook?: string;
  changes?: string[];
}

export async function watchChanges(ws: Workspace, opts: WatchOptions = {}): Promise<void> {
  const interval = opts.intervalMs ?? 5000;
  const targets = opts.changes?.length ? opts.changes : ws.listChanges();
  const prev = new Map<string, WatchSnapshot>();

  const tick = () => {
    for (const change of targets) {
      if (!fs.existsSync(ws.metaFile(change))) continue;
      const snap = collectWatchSnapshot(ws, change);
      const events = detectWatchEvents(ws, change, prev.get(change));
      prev.set(change, snap);
      for (const ev of events) {
        if (ev.kind === "idle") continue;
        const line = JSON.stringify(ev);
        console.log(line);
        if (opts.webhook) {
          fetch(opts.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: line }).catch(() => {});
        }
      }
    }
  };

  tick();
  setInterval(tick, interval);
}

/** Poll a single change and emit watch events. */
export async function watchChange(
  ws: Workspace,
  change: string,
  opts: { intervalMs?: number; webhookUrl?: string; once?: boolean } = {}
): Promise<void> {
  let prev: WatchSnapshot | undefined;
  const tick = () => {
    const snap = collectWatchSnapshot(ws, change);
    const events = detectWatchEvents(ws, change, prev);
    prev = snap;
    for (const ev of events) {
      if (ev.kind === "idle" && !opts.once) continue;
      const line = JSON.stringify(ev);
      console.log(line);
      if (opts.webhookUrl) {
        fetch(opts.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: line }).catch(() => {});
      }
    }
  };
  tick();
  if (opts.once) return;
  await new Promise<void>((resolve) => {
    const id = setInterval(() => {
      tick();
    }, opts.intervalMs ?? 30000);
    process.on("SIGINT", () => {
      clearInterval(id);
      resolve();
    });
  });
}
