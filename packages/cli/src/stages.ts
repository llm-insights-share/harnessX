import { Command } from "commander";
import { Workspace, STAGE_INFO, STAGE_TASKS, stageStatus, readMeta, type DeliveryStage } from "@harnessx/core";
import { registerPrdOnParent } from "./prd.js";

const ws = () => Workspace.locate(process.cwd());

function printStageTasks(stage: DeliveryStage, completed: string[] = []) {
  const w = ws();
  const harness = w.readHarness();
  const profile = w.readConfig().profile;
  const rows =
    stage === "req" || stage === "arch"
      ? STAGE_TASKS[stage].map((t) => ({ task: t, done: completed.includes(t.id) }))
      : stageStatus(harness, profile, stage, completed);
  console.log(`\n${STAGE_INFO[stage].display.zh} (${stage}) — ${STAGE_INFO[stage].output.zh}`);
  console.log("| 任务 | 必选 | 状态 |");
  console.log("| --- | --- | --- |");
  for (const { task, done } of rows) {
    console.log(`| ${task.title.zh} | ${task.required ? "是" : "否"} | ${done ? "完成" : "待办"} |`);
  }
}

export function registerReqCommands(program: Command): void {
  const req = program.command("req").description("Requirements stage (org-level PRD)");
  req.command("status").description("Show req stage task completion").action(() => printStageTasks("req"));
  const prd = req.command("prd").description("PRD authoring");
  registerPrdOnParent(prd);
}

export function registerDevCommands(program: Command): void {
  const dev = program.command("dev").description("Development stage (change delivery)");
  dev
    .command("status <change>")
    .description("Show dev stage task progress")
    .action((change: string) => {
      const w = ws();
      const meta = readMeta(w, change);
      printStageTasks("dev", meta.stageProgress?.dev?.completed ?? []);
      console.log(`\ncurrent: ${meta.stage}/${meta.task}`);
    });
}

export function registerTestCommands(program: Command): void {
  const test = program.command("test").description("Testing stage");
  test
    .command("status <change>")
    .description("Show test stage task progress")
    .action((change: string) => {
      const w = ws();
      const meta = readMeta(w, change);
      printStageTasks("test", meta.stageProgress?.test?.completed ?? []);
    });
}

export function registerStageStatusCommand(program: Command): void {
  const stage = program.command("stage").description("Four-stage delivery status");
  stage
    .command("status [change]")
    .option("--stage <stage>", "req|arch|dev|test")
    .action((change: string | undefined, opts: { stage?: DeliveryStage }) => {
      const w = ws();
      const st = opts.stage ?? (change ? "dev" : "req");
      if (st === "req" || st === "arch") {
        printStageTasks(st);
        return;
      }
      if (!change) throw new Error("change id required for dev/test stage status");
      const meta = readMeta(w, change);
      printStageTasks(st, meta.stageProgress?.[st]?.completed ?? []);
      console.log(`\ncurrent: ${meta.stage}/${meta.task}`);
    });
}
