import { Command } from "commander";
import fs from "node:fs";
import {
  Workspace,
  gateCheck,
  gateAdvance,
  nextTask,
  stageGateCheck,
  stageAdvance,
  buildContextPack,
  renderContextPack,
  writeTaskPack,
  generateTasks,
  missingTestTasks,
  gitChangedFiles,
  installHooks,
  ciInit,
  verifyMeta,
  recordApproval,
  recordStageApproval,
  scaffoldDesign,
  readMeta,
  scaffoldFromIssue,
  type RunnerOptions,
  type DeliveryStage
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";
import { registerPrdGuidePack } from "./prd.js";
import { registerArchGuidePack } from "./arch.js";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = (w: Workspace): RunnerOptions => ({
  builtins: builtinSensors,
  changedFiles: gitChangedFiles(w.root)
});

function printGate(res: { blockers: string[]; warnings: string[]; passed: boolean; stage?: string; task?: string }) {
  for (const b of res.blockers) console.error(`BLOCKER  ${b}`);
  for (const w of res.warnings) console.warn(`warning  ${w}`);
  const label = res.stage && res.task ? `${res.stage}/${res.task}` : "-";
  console.log(res.passed ? `GATE PASS (${label})` : `GATE BLOCKED (${label})`);
}

export function registerGateCommands(program: Command): void {
  const gate = program.command("gate").description("Quality gates (FR-020, fail-closed)");

  gate
    .command("check <change>")
    .requiredOption("--stage <stage>", "delivery stage: req|arch|dev|test")
    .requiredOption("--task <task>", "task within stage")
    .action(async (change: string, opts: { stage: DeliveryStage; task: string }) => {
      const w = ws();
      const res = await stageGateCheck(w, change, opts.stage, opts.task, runnerOpts(w));
      printGate(res);
      if (!res.passed) process.exit(1);
    });

  gate.command("advance <change>").action(async (change: string) => {
    const w = ws();
    const res = await stageAdvance(w, change, runnerOpts(w));
    printGate(res);
    if (res.toTask) console.log(`advanced: ${res.fromStage}/${res.fromTask} → ${res.toStage}/${res.toTask}`);
    if (!res.passed) process.exit(1);
  });

  gate
    .command("approve [change]")
    .requiredOption("--gate <gate>", "gate being approved (design-to-plan|prd|arch|arch-lld|test-cases)")
    .requiredOption("--approver <name>")
    .option("--prd <slug>", "PRD slug (required when --gate prd)")
    .option("--module <id>", "module id (required when --gate arch-lld)")
    .action((change: string | undefined, opts: { gate: string; approver: string; prd?: string; module?: string }) => {
      const w = ws();
      if (opts.gate === "prd" || opts.gate === "arch" || opts.gate === "arch-lld") {
        if (opts.gate === "arch-lld" && !opts.module) throw new Error("--module required for gate arch-lld");
        const rec =
          opts.gate === "arch-lld"
            ? recordStageApproval(w, opts.gate, opts.approver, opts.prd, opts.module)
            : recordStageApproval(w, opts.gate, opts.approver, opts.prd);
        const target =
          opts.gate === "prd" ? `prd:${opts.prd}` : opts.gate === "arch-lld" ? `arch-lld:${opts.module}` : "arch:hld";
        console.log(`approved gate "${opts.gate}" (${target}) by ${rec.approver} at ${rec.at} (artifact ${rec.artifactHash.slice(0, 12)})`);
        return;
      }
      if (!change) throw new Error("change id required for change-scoped gates");
      const rec = recordApproval(w, change, opts.gate, opts.approver);
      console.log(`approved gate "${rec.gate}" by ${rec.approver} at ${rec.at} (artifact ${rec.artifactHash.slice(0, 12)})`);
    });

  gate.command("hook-check").description("Fast pre-commit/pre-push check for active changes").action(async () => {
    const w = ws();
    if (!fs.existsSync(w.harnessFile)) return;
    let failed = false;
    for (const change of w.listChanges()) {
      const meta = readMeta(w, change);
      if (meta.stage !== "dev" || meta.task !== "apply") continue;
      const res = await stageGateCheck(w, change, "dev", "apply", runnerOpts(w));
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
    const harness = w.readHarness();
    let failed = false;
    for (const change of w.listChanges()) {
      const meta = readMeta(w, change);
      const next = nextTask(harness, meta);
      if (!next) continue;
      const res = await stageGateCheck(w, change, next.stage, next.task, runnerOpts(w));
      console.log(`${change} [${next.stage}/${next.task}]: ${res.passed ? "pass" : "BLOCKED"}`);
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
    .requiredOption("--stage <stage>", "req|arch|dev|test")
    .requiredOption("--task <task>", "task id within stage")
    .option("--out <file>", "write pack to file instead of stdout")
    .action((change: string, opts: { stage: DeliveryStage; task: string; out?: string }) => {
      const pack = buildContextPack(ws(), change, opts.stage, opts.task);
      const text = renderContextPack(pack);
      if (opts.out) {
        fs.writeFileSync(opts.out, text);
        console.log(`wrote ${opts.out} (${pack.sections.length} sections, ${pack.assembledInMs}ms)`);
      } else {
        console.log(text);
      }
    });

  guide
    .command("task-pack <change> <taskId>")
    .option("--out <file>", "write pack to file (default: changes/<id>/tasks/<taskId>-pack.md)")
    .action((change: string, taskId: string, opts: { out?: string }) => {
      const w = ws();
      const res = writeTaskPack(w, change, taskId);
      const dest = opts.out ?? res.file;
      if (opts.out && opts.out !== res.file) {
        fs.copyFileSync(res.file, dest);
      }
      console.log(`wrote ${dest} (${res.pack.sections.length} sections, ${res.pack.assembledInMs}ms)`);
    });

  registerPrdGuidePack(guide);
  registerArchGuidePack(guide);

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
    .option("--parallel <n>", "max concurrent tasks within the same @group (v0.2)", "1")
    .option("--fan-out <n>", "run apply+verify in N isolated worktrees; pick best (v0.2)")
    .action(async (change: string, opts: { runner?: string; maxRetries: string; limit?: string; parallel?: string; fanOut?: string }) => {
      const { runApplyCommand } = await import("./orchestration.js");
      await runApplyCommand(change, opts);
    });

  program
    .command("design <change>")
    .description("Scaffold design.md; requires the propose gate to pass (FR-004)")
    .action(async (change: string) => {
      const w = ws();
      const res = await stageGateCheck(w, change, "dev", "design", runnerOpts(w));
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
