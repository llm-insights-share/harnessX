import { Command } from "commander";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  Workspace,
  gateCheck,
  gateAdvance,
  nextPhase,
  buildContextPack,
  renderContextPack,
  generateTasks,
  missingTestTasks,
  applyLoop,
  gitChangedFiles,
  installHooks,
  ciInit,
  verifyMeta,
  recordApproval,
  scaffoldDesign,
  readMeta,
  type RunnerOptions
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = (w: Workspace): RunnerOptions => ({
  builtins: builtinSensors,
  changedFiles: gitChangedFiles(w.root)
});

function printGate(res: { blockers: string[]; warnings: string[]; passed: boolean; phase: string }) {
  for (const b of res.blockers) console.error(`BLOCKER  ${b}`);
  for (const w of res.warnings) console.warn(`warning  ${w}`);
  console.log(res.passed ? `GATE PASS (${res.phase})` : `GATE BLOCKED (${res.phase})`);
}

export function registerGateCommands(program: Command): void {
  const gate = program.command("gate").description("Quality gates (FR-020, fail-closed)");

  gate
    .command("check <change>")
    .option("--phase <cmd>", "phase to check (defaults to next phase)")
    .action(async (change: string, opts: { phase?: string }) => {
      const w = ws();
      const meta = readMeta(w, change);
      const phase = opts.phase ?? nextPhase(w.readHarness(), meta) ?? "verify";
      const res = await gateCheck(w, change, phase, runnerOpts(w));
      printGate(res);
      if (!res.passed) process.exit(1);
    });

  gate.command("advance <change>").action(async (change: string) => {
    const w = ws();
    const res = await gateAdvance(w, change, runnerOpts(w));
    printGate(res);
    if (res.to) console.log(`advanced: ${res.from} → ${res.to}`);
    if (!res.passed) process.exit(1);
  });

  gate
    .command("approve <change>")
    .requiredOption("--gate <gate>", "gate being approved (e.g. spec)")
    .requiredOption("--approver <name>")
    .action((change: string, opts: { gate: string; approver: string }) => {
      const rec = recordApproval(ws(), change, opts.gate, opts.approver);
      console.log(`approved gate "${rec.gate}" by ${rec.approver} at ${rec.at} (artifact ${rec.artifactHash.slice(0, 12)})`);
    });

  gate.command("hook-check").description("Fast pre-commit/pre-push check for active changes").action(async () => {
    const w = ws();
    if (!fs.existsSync(w.harnessFile)) return; // repo without harness — no-op
    let failed = false;
    for (const change of w.listChanges()) {
      const meta = readMeta(w, change);
      if (meta.status !== "implementing") continue;
      const res = await gateCheck(w, change, "apply", runnerOpts(w));
      if (!res.passed) {
        printGate(res);
        failed = true;
      }
    }
    if (failed) process.exit(1);
    console.log("[hx] gate hook-check ok");
  });

  gate.command("replay").description("CI replay: re-run gates for all active changes (FR-051)").action(async () => {
    const w = ws();
    let failed = false;
    for (const change of w.listChanges()) {
      const meta = readMeta(w, change);
      const phase = nextPhase(w.readHarness(), meta);
      if (!phase) continue;
      const res = await gateCheck(w, change, phase, runnerOpts(w));
      console.log(`${change} [${phase}]: ${res.passed ? "pass" : "BLOCKED"}`);
      if (!res.passed) {
        printGate(res);
        failed = true;
      }
    }
    if (failed) process.exit(1);
  });

  const guide = program.command("guide").description("Guide engine (FR-030)");
  guide
    .command("pack <change>")
    .requiredOption("--phase <cmd>")
    .option("--out <file>", "write pack to file instead of stdout")
    .action((change: string, opts: { phase: string; out?: string }) => {
      const pack = buildContextPack(ws(), change, opts.phase);
      const text = renderContextPack(pack);
      if (opts.out) {
        fs.writeFileSync(opts.out, text);
        console.log(`wrote ${opts.out} (${pack.sections.length} sections, ${pack.assembledInMs}ms)`);
      } else {
        console.log(text);
      }
    });

  program
    .command("plan <change>")
    .description("Generate dual-track tasks.md from delta specs (FR-006)")
    .action((change: string) => {
      const res = generateTasks(ws(), change);
      console.log(`wrote ${res.file} (${res.tasks.length} tasks)`);
      const missing = missingTestTasks(res.tasks);
      for (const m of missing) console.warn(`warning: requirement without test task (needs waiver): ${m}`);
    });

  program
    .command("apply <change>")
    .description("Drive implementation task-by-task with fast-suite self-correction (FR-007)")
    .option("--runner <cmd>", "command executed per task; receives HX_TASK_* env vars")
    .option("--max-retries <n>", "self-correction attempts per task", "3")
    .option("--limit <n>", "process at most N tasks")
    .action(async (change: string, opts: { runner?: string; maxRetries: string; limit?: string }) => {
      const w = ws();
      const res = await applyLoop(w, change, {
        runner: runnerOpts(w),
        maxRetries: parseInt(opts.maxRetries, 10),
        limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
        executor: ({ task, attempt, fixHints }) => {
          if (!opts.runner) {
            console.log(`task ${task.id} [${task.track}] ${task.title} (attempt ${attempt}) — no --runner given, marking for manual work`);
            return;
          }
          const env = {
            ...process.env,
            HX_TASK_ID: task.id,
            HX_TASK_TRACK: task.track,
            HX_TASK_TITLE: task.title,
            HX_TASK_REQUIREMENT: task.requirement,
            HX_FIX_HINTS: fixHints.join("\n")
          };
          const r = spawnSync(opts.runner!, { shell: true, cwd: w.root, stdio: "inherit", env });
          if (r.status !== 0) throw new Error(`runner exited ${r.status}`);
        }
      });
      console.log(`completed tasks: ${res.completed.join(", ") || "(none)"}; remaining: ${res.remaining}`);
      if (res.failed) {
        console.error(`task ${res.failed.task.id} failed after self-correction limit; blockers:`);
        for (const b of res.failed.suite.blockers) console.error(`  - ${b}`);
        process.exit(1);
      }
    });

  program
    .command("design <change>")
    .description("Scaffold design.md; requires the propose gate to pass (FR-004)")
    .action(async (change: string) => {
      const w = ws();
      const res = await gateCheck(w, change, "design", runnerOpts(w));
      if (!res.passed) {
        printGate(res);
        process.exit(1);
      }
      console.log(`wrote ${scaffoldDesign(w, change)}`);
    });

  program
    .command("hooks")
    .argument("<action>", "install")
    .description("Install git hooks for local enforcement (FR-051 L2)")
    .action((action: string) => {
      if (action !== "install") throw new Error(`unknown hooks action: ${action}`);
      for (const f of installHooks(ws().root)) console.log(`installed ${f}`);
    });

  program
    .command("ci")
    .argument("<action>", "init")
    .description("Generate CI replay workflow + branch protection docs (FR-051 L3)")
    .action((action: string) => {
      if (action !== "init") throw new Error(`unknown ci action: ${action}`);
      for (const f of ciInit(ws().root)) console.log(`wrote ${f}`);
    });

  const meta = program.command("meta").description("meta.yaml integrity (FR-050)");
  meta
    .command("verify [change]")
    .option("--all", "verify every active change")
    .action((change: string | undefined, opts: { all?: boolean }) => {
      const w = ws();
      const targets = opts.all || !change ? w.listChanges() : [change];
      let failed = false;
      for (const c of targets) {
        const res = verifyMeta(w, c);
        console.log(`${c}: ${res.ok ? "ok" : "TAMPERED"}`);
        for (const p of res.problems) console.error(`  - ${p}`);
        if (!res.ok) failed = true;
      }
      if (failed) process.exit(1);
    });
}
