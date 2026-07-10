import { Command } from "commander";
import { spawnSync } from "node:child_process";
import {
  Workspace,
  VERSION,
  createWorktree,
  listWorktrees,
  removeWorktree,
  fanOutApply,
  importReviewAnnotations,
  readReviewAnnotations,
  resolveAnnotation,
  pendingFixHints,
  runGuideEvals,
  loadGuideEvalCases,
  scaffoldFromIssue,
  watchChange,
  collectWatchSnapshot,
  applyLoop,
  gitChangedFiles,
  writeTaskPack,
  type RunnerOptions
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = (w: Workspace): RunnerOptions => ({ builtins: builtinSensors, changedFiles: gitChangedFiles(w.root) });

function makeExecutor(runner?: string, w?: Workspace, change?: string) {
  const root = w ?? ws();
  return ({ task, attempt, fixHints }: { task: { id: string; track: string; title: string; requirement: string }; attempt: number; fixHints: string[] }) => {
    if (!runner) {
      console.log(`task ${task.id} [${task.track}] ${task.title} (attempt ${attempt}) — no --runner given`);
      return;
    }
    let taskPack = "";
    if (change) {
      try {
        taskPack = writeTaskPack(root, change, task.id).file;
      } catch {
        /* task pack optional */
      }
    }
    const env = {
      ...process.env,
      HX_TASK_ID: task.id,
      HX_TASK_TRACK: task.track,
      HX_TASK_TITLE: task.title,
      HX_TASK_REQUIREMENT: task.requirement,
      HX_FIX_HINTS: fixHints.join("\n"),
      HX_TASK_PACK: taskPack
    };
    const r = spawnSync(runner, { shell: true, cwd: root.root, stdio: "inherit", env });
    if (r.status !== 0) throw new Error(`runner exited ${r.status}`);
  };
}

export function registerOrchestrationCommands(program: Command): void {
  const runtime = program.command("runtime").description("Worktree runtime for isolated apply (v0.2)");

  runtime
    .command("worktree")
    .argument("<action>", "create | list | remove")
    .argument("[change]", "change id")
    .option("--slot <id>", "worktree slot name")
    .option("--path <path>", "worktree path (for remove)")
    .action((action: string, change: string | undefined, opts: { slot?: string; path?: string }) => {
      const w = ws();
      if (action === "create") {
        if (!change) throw new Error("change id required");
        const rec = createWorktree(w, change, opts.slot);
        console.log(`worktree ${rec.slot}: ${rec.path} (branch ${rec.branch})`);
        return;
      }
      if (action === "list") {
        if (!change) throw new Error("change id required");
        for (const wt of listWorktrees(w, change)) console.log(`${wt.slot}\t${wt.path}\t${wt.branch}`);
        return;
      }
      if (action === "remove") {
        if (!change) throw new Error("change id required");
        const target = opts.path ?? opts.slot;
        if (!target) throw new Error("--slot or --path required");
        removeWorktree(w, change, target);
        console.log("worktree removed");
        return;
      }
      throw new Error(`unknown worktree action: ${action}`);
    });

  const review = program.command("review").description("Diff review annotations → fix_hints (v0.2)");
  review
    .command("import <change> <file>")
    .description("Import JSON or YAML diff line annotations")
    .action((change: string, file: string) => {
      const data = importReviewAnnotations(ws(), change, file);
      console.log(`imported ${data.annotations.length} annotation(s)`);
      for (const h of pendingFixHints(ws(), change)) console.log(`  hint: ${h}`);
    });
  review.command("list <change>").action((change: string) => {
    const data = readReviewAnnotations(ws(), change);
    for (const a of data.annotations) {
      const loc = a.line != null ? `${a.file}:${a.line}` : a.file;
      console.log(`${a.id}\t${a.severity}\t${loc}\t${a.resolved ? "resolved" : "open"}\t${a.comment}`);
    }
  });
  review.command("resolve <change> <id>").action((change: string, id: string) => {
    resolveAnnotation(ws(), change, id);
    console.log(`resolved ${id}`);
  });

  const evalCmd = program.command("eval").description("Guide behavior evals (v0.2)");
  evalCmd
    .command("guides <change>")
    .option("--cases <file>", "custom eval cases JSON")
    .action((change: string, opts: { cases?: string }) => {
      const cases = opts.cases ? loadGuideEvalCases(opts.cases) : undefined;
      const report = runGuideEvals(ws(), change, cases);
      for (const r of report.results) {
        console.log(`${r.id}: ${r.passed ? "PASS" : "FAIL"}`);
        for (const g of r.missingGuides) console.error(`  missing guide: ${g}`);
        for (const c of r.missingContent) console.error(`  missing content: ${c}`);
        for (const f of r.forbiddenFound) console.error(`  forbidden: ${f}`);
      }
      if (!report.passed) process.exit(1);
      console.log("all guide evals passed");
    });

  program
    .command("notify <change>")
    .description("Poll change state and emit notifications (v0.2)")
    .option("--interval <ms>", "poll interval", "30000")
    .option("--webhook <url>", "POST JSON events to URL (or HX_WATCH_WEBHOOK env)")
    .option("--once", "single poll then exit")
    .action(async (change: string, opts: { interval: string; webhook?: string; once?: boolean }) => {
      const snap = collectWatchSnapshot(ws(), change);
      console.log(`watching ${change} (${snap.stage}/${snap.task}, tasks ${snap.tasksDone}/${snap.tasksTotal})`);
      await watchChange(ws(), change, {
        intervalMs: parseInt(opts.interval, 10),
        webhookUrl: opts.webhook ?? process.env.HX_WATCH_WEBHOOK,
        once: opts.once
      });
    });
}

/** Extend apply command with --parallel and --fan-out (called from gates.ts). */
export async function runApplyCommand(
  change: string,
  opts: { runner?: string; maxRetries: string; limit?: string; parallel?: string; fanOut?: string }
): Promise<void> {
  const w = ws();
  const executor = makeExecutor(opts.runner, w, change);
  const runner = runnerOpts(w);

  if (opts.fanOut) {
    const n = parseInt(opts.fanOut, 10);
    console.log(`fan-out: ${n} worktrees for ${change}`);
    const res = await fanOutApply(w, change, {
      runner,
      executor,
      count: n,
      maxRetries: parseInt(opts.maxRetries, 10)
    });
    for (const c of res.candidates) {
      console.log(`  ${c.slot}: score=${c.score} verify=${c.verifyPassed ? "pass" : "fail"} blockers=${c.blockerCount}`);
    }
    if (res.selected) console.log(`selected: ${res.selected.slot} (${res.selected.path})`);
    else {
      console.error("no fan-out candidate selected");
      process.exit(1);
    }
    return;
  }

  const res = await applyLoop(w, change, {
    runner,
    executor,
    maxRetries: parseInt(opts.maxRetries, 10),
    limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
    parallel: opts.parallel ? parseInt(opts.parallel, 10) : 1
  });
  console.log(`completed tasks: ${res.completed.join(", ") || "(none)"}; remaining: ${res.remaining}`);
  if (res.failed) {
    console.error(`task ${res.failed.task.id} failed after self-correction limit; blockers:`);
    for (const b of res.failed.suite.blockers) console.error(`  - ${b}`);
    process.exit(1);
  }
}

export { VERSION };
