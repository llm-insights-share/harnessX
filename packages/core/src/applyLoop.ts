import { Workspace } from "./paths.js";
import { readMeta, setStageTask } from "./metaStore.js";
import { resolveSuiteName } from "./profileResolve.js";
import { readTasks, markTaskDone, nextTaskBatch, type Task } from "./plan.js";
import { runSuite, type RunnerOptions } from "./sensorRunner.js";
import { appendRun } from "./telemetry.js";
import { updateTraceForTask } from "./traceability.js";
import { pendingFixHints } from "./reviewAnnotations.js";
import type { SuiteResult } from "./schemas.js";

/**
 * T-204 (FR-007): the apply loop drives implementation task-by-task.
 * v0.2: supports parallel groups (@group=) and review annotation fix_hints.
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
  /** v0.2: max concurrent tasks within the same @group (default 1 = serial) */
  parallel?: number;
}

export interface ApplyResult {
  completed: string[];
  failed?: { task: Task; suite: SuiteResult };
  remaining: number;
}

async function runOneTask(
  ws: Workspace,
  change: string,
  task: Task,
  suiteName: string | undefined,
  maxRetries: number,
  baseFixHints: string[],
  opts: ApplyOptions
): Promise<{ ok: boolean; suite?: SuiteResult }> {
  const harness = ws.readHarness();
  let fixHints = [...baseFixHints];
  let suite: SuiteResult | undefined;
  let ok = !suiteName;

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
    fixHints = [...baseFixHints, ...suite.blockers, ...suite.fixHints];
    appendRun(ws, { kind: "apply", change, name: `task:${task.id}`, status: "fail", detail: { attempt, blockers: suite.blockers } });
  }

  if (!ok) {
    appendRun(ws, { kind: "apply", change, name: `task:${task.id}`, status: "error", detail: { reason: "self-correction limit reached" } });
    return { ok: false, suite };
  }

  markTaskDone(ws, change, task.id);
  updateTraceForTask(ws, change, task);
  appendRun(ws, { kind: "apply", change, name: `task:${task.id}`, status: "pass" });
  return { ok: true, suite };
}

export async function applyLoop(ws: Workspace, change: string, opts: ApplyOptions): Promise<ApplyResult> {
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);
  const suiteName = resolveSuiteName(harness, meta.profile, "dev", "apply");
  const maxRetries = opts.maxRetries ?? 3;
  const parallel = opts.parallel ?? 1;
  const completed: string[] = [];
  const reviewHints = pendingFixHints(ws, change);

  if (meta.stage !== "dev" || meta.task !== "apply") setStageTask(ws, change, "dev", "apply");

  let allTasks = readTasks(ws, change);
  let processed = 0;

  while (allTasks.some((t) => !t.done) && (!opts.limit || processed < opts.limit)) {
    const batch = nextTaskBatch(allTasks, completed, parallel);
    if (!batch.length) break;

    const limited = opts.limit ? batch.slice(0, Math.max(0, opts.limit - processed)) : batch;
    let failed: { task: Task; suite: SuiteResult } | undefined;

    if (limited.length === 1) {
      const task = limited[0]!;
      const res = await runOneTask(ws, change, task, suiteName, maxRetries, reviewHints, opts);
      if (!res.ok) failed = { task, suite: res.suite! };
      else {
        completed.push(task.id);
        processed++;
      }
    } else {
      const results = await Promise.all(
        limited.map(async (task) => {
          const res = await runOneTask(ws, change, task, suiteName, maxRetries, reviewHints, opts);
          return { task, ...res };
        })
      );
      for (const r of results) {
        if (!r.ok) {
          failed = { task: r.task, suite: r.suite! };
          break;
        }
        completed.push(r.task.id);
        processed++;
      }
    }

    if (failed) {
      const remaining = readTasks(ws, change).filter((t) => !t.done).length;
      return { completed, failed, remaining };
    }

    allTasks = readTasks(ws, change);
  }

  const remaining = allTasks.filter((t) => !t.done).length;
  return { completed, remaining };
}
