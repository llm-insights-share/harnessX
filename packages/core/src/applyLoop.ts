import { Workspace } from "./paths.js";
import { readMeta, setStatus } from "./metaStore.js";
import { readTasks, markTaskDone, type Task } from "./plan.js";
import { runSuite, type RunnerOptions } from "./sensorRunner.js";
import { appendRun } from "./telemetry.js";
import { updateTraceForTask } from "./traceability.js";
import type { SuiteResult } from "./schemas.js";

/**
 * T-204 (FR-007): the apply loop drives implementation task-by-task.
 * After each task, the profile's fast suite runs; on failure the executor is
 * re-invoked with the suite's fix hints (self-correction), up to maxRetries.
 * Completed tasks are checked off and traceability is updated.
 */

export interface TaskExecution {
  task: Task;
  attempt: number;
  fixHints: string[];
}

export type TaskExecutor = (exec: TaskExecution) => Promise<void> | void;

export interface ApplyOptions {
  runner: RunnerOptions;
  executor: TaskExecutor;
  maxRetries?: number;
  /** stop after this many tasks (for interactive runs) */
  limit?: number;
}

export interface ApplyResult {
  completed: string[];
  failed?: { task: Task; suite: SuiteResult };
  remaining: number;
}

export async function applyLoop(ws: Workspace, change: string, opts: ApplyOptions): Promise<ApplyResult> {
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);
  const suiteName = harness.profiles[meta.profile]?.suites?.["apply"];
  const maxRetries = opts.maxRetries ?? 3;
  const completed: string[] = [];

  if (meta.status !== "implementing") setStatus(ws, change, "implementing");

  let pending = readTasks(ws, change).filter((t) => !t.done);
  let processed = 0;
  while (pending.length > 0 && (!opts.limit || processed < opts.limit)) {
    const task = pending[0];
    let fixHints: string[] = [];
    let suite: SuiteResult | undefined;
    let ok = !suiteName; // no suite configured → executor result is accepted

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      await opts.executor({ task, attempt, fixHints });
      if (!suiteName) {
        ok = true;
        break;
      }
      suite = await runSuite(ws, harness, suiteName, change, opts.runner);
      if (suite.passed) {
        ok = true;
        break;
      }
      fixHints = [...suite.blockers, ...suite.fixHints];
      appendRun(ws, { kind: "apply", change, name: `task:${task.id}`, status: "fail", detail: { attempt, blockers: suite.blockers } });
    }

    if (!ok) {
      appendRun(ws, { kind: "apply", change, name: `task:${task.id}`, status: "error", detail: { reason: "self-correction limit reached" } });
      return { completed, failed: { task, suite: suite! }, remaining: pending.length };
    }

    markTaskDone(ws, change, task.id);
    updateTraceForTask(ws, change, task);
    appendRun(ws, { kind: "apply", change, name: `task:${task.id}`, status: "pass" });
    completed.push(task.id);
    processed++;
    pending = readTasks(ws, change).filter((t) => !t.done);
  }

  return { completed, remaining: pending.length };
}
