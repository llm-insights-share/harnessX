import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import type { HarnessYaml, MetaYaml, SuiteResult } from "./schemas.js";
import { readMeta, recordGate, writeMeta, activeWaivers } from "./metaStore.js";
import { runSensor, type RunnerOptions } from "./sensorRunner.js";
import { proposalProblems } from "./change.js";
import { resolvePrdSlug } from "./prd.js";
import { workorderProblems } from "./workorder.js";
import { augmentSuiteIds, resolveCompensation } from "./gateCompensation.js";
import { appendRun } from "./telemetry.js";
import { profileDevTasks, profileStages, profileTestTasks, resolveSuiteName } from "./profileResolve.js";
import { STAGE_TASKS, type DeliveryStage, type StageTaskDef, taskById } from "./stages.js";

export interface StageGateCheckResult {
  change: string;
  stage: DeliveryStage;
  task: string;
  suite?: SuiteResult;
  blockers: string[];
  warnings: string[];
  passed: boolean;
}

export interface StageAdvanceResult extends StageGateCheckResult {
  fromTask?: string;
  toTask?: string;
  fromStage?: DeliveryStage;
  toStage?: DeliveryStage;
}

/** Map dev/test task id to workorder gate phase label. */
function workorderPhase(stage: DeliveryStage, taskId: string): string | undefined {
  if (stage === "dev") return taskId;
  if (stage === "test" && taskId === "test-case-design") return "test-design";
  if (stage === "test" && taskId === "test-execution") return "verify";
  return undefined;
}

/** Next task within change delivery. */
export function nextTask(harness: HarnessYaml, meta: MetaYaml): { stage: DeliveryStage; task: string } | null {
  const stages = profileStages(harness, meta.profile);
  const stageIdx = stages.indexOf(meta.stage);
  if (stageIdx < 0) return null;

  const tasksForStage = (stage: DeliveryStage): string[] => {
    if (stage === "dev") return profileDevTasks(harness, meta.profile);
    if (stage === "test") return profileTestTasks(harness, meta.profile);
    return STAGE_TASKS[stage].filter((t) => t.required).map((t) => t.id);
  };

  const currentTasks = tasksForStage(meta.stage);
  const curIdx = currentTasks.indexOf(meta.task);
  if (curIdx >= 0 && curIdx < currentTasks.length - 1) {
    return { stage: meta.stage, task: currentTasks[curIdx + 1] };
  }
  if (stageIdx < stages.length - 1) {
    const nextStage = stages[stageIdx + 1];
    const nextTasks = tasksForStage(nextStage);
    if (nextTasks.length) return { stage: nextStage, task: nextTasks[0] };
  }
  return null;
}

export async function stageGateCheck(
  ws: Workspace,
  change: string,
  stage: DeliveryStage,
  taskId: string,
  runnerOpts: RunnerOptions
): Promise<StageGateCheckResult> {
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (taskId === "design" || taskId === "propose") {
    blockers.push(...proposalProblems(ws, change));
  }
  if (taskId === "plan") {
    const approved = meta.approvals.some((a) => a.gate === "design-to-plan");
    if (!approved) blockers.push("design→plan requires human approval: hx gate approve <change> --gate design-to-plan --approver <name>");
  }
  if (taskId === "apply") {
    const tasksFile = path.join(ws.changeDir(change), "tasks.md");
    if (!fs.existsSync(tasksFile)) blockers.push("tasks.md missing — run hx dev plan first");
  }

  const woPhase = workorderPhase(stage, taskId);
  if (woPhase) blockers.push(...workorderProblems(ws, change, woPhase));

  const suiteName = resolveSuiteName(harness, meta.profile, stage, taskId);
  const compensation = resolveCompensation(ws);
  let suite: SuiteResult | undefined;

  if (stage === "dev" && taskId === "propose") {
    await appendOrgStageSensors(ws, harness, change, runnerOpts, meta.profile, blockers, warnings, suiteName);
  }
  if (stage === "dev" && taskId === "design") {
    await appendOrgStageSensors(ws, harness, change, runnerOpts, meta.profile, blockers, warnings, suiteName, "arch");
  }

  if (suiteName) {
    const waived = activeWaivers(meta).map((w) => w.target);
    suite = await runCompensatedSuite(ws, harness, suiteName, change, { ...runnerOpts, waivedSensors: waived }, compensation, taskId);
    blockers.push(...suite.blockers);
    warnings.push(...suite.warnings);
    if (compensation.requireHeadlessApply && taskId === "apply") {
      warnings.push(`adapter tier ${compensation.tier}: recommend headless apply via hx dev apply --runner "<agent>" for reliable feedback`);
    }
  }

  const passed = blockers.length === 0;
  recordGate(ws, change, { stage, task: taskId, suite: suiteName, passed });
  return { change, stage, task: taskId, suite, blockers, warnings, passed };
}

export async function stageAdvance(ws: Workspace, change: string, runnerOpts: RunnerOptions): Promise<StageAdvanceResult> {
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);

  const next = nextTask(harness, meta);
  if (!next) {
    return {
      change,
      stage: meta.stage,
      task: meta.task,
      blockers: [`change is at terminal task "${meta.stage}/${meta.task}" for profile "${meta.profile}"`],
      warnings: [],
      passed: false
    };
  }

  const check = await stageGateCheck(ws, change, next.stage, next.task, runnerOpts);
  if (!check.passed) return { ...check, fromTask: meta.task, fromStage: meta.stage };

  const updated = readMeta(ws, change);
  updated.stage = next.stage;
  updated.task = next.task;
  updated.stageProgress = {
    ...updated.stageProgress,
    [next.stage]: {
      done: false,
      ...(updated.stageProgress?.[next.stage] ?? {}),
      current: next.task,
      completed: [...(updated.stageProgress?.[next.stage]?.completed ?? []), ...(meta.task && meta.stage === next.stage ? [meta.task] : [])]
    }
  };
  updated.taskHistory.push({ stage: next.stage, task: next.task, at: new Date().toISOString(), gate: "pass" });
  writeMeta(ws, updated);
  return { ...check, fromTask: meta.task, toTask: next.task, fromStage: meta.stage, toStage: next.stage };
}

async function runCompensatedSuite(
  ws: Workspace,
  harness: HarnessYaml,
  suiteName: string,
  change: string | undefined,
  opts: RunnerOptions,
  compensation: ReturnType<typeof resolveCompensation>,
  taskId: string
): Promise<SuiteResult> {
  const extraIds =
    taskId === "verify" || taskId === "apply"
      ? compensation.extraSensors
      : compensation.extraSensors.filter((id) => ["spec-validate", "typecheck", "lint"].includes(id));
  const ids = augmentSuiteIds(harness, suiteName, extraIds);
  const result: SuiteResult = { suite: suiteName, passed: true, reports: [], blockers: [], warnings: [], fixHints: [] };
  if (!harness.suites[suiteName] && ids.length === 0) {
    return { suite: suiteName, passed: false, reports: [], blockers: [`suite "${suiteName}" is not defined in harness.yaml (fail-closed)`], warnings: [], fixHints: [] };
  }
  for (const id of ids) {
    const def = harness.sensors.find((s) => s.id === id);
    if (!def) {
      result.blockers.push(`sensor "${id}" referenced by suite "${suiteName}" is not registered (fail-closed)`);
      continue;
    }
    const report = await runSensor(ws, def, change, opts);
    result.reports.push(report);
    const waived = opts.waivedSensors?.includes(def.id) ?? false;
    if (report.status === "pass") continue;
    const label = `${def.id}: ${report.summary}`;
    if (waived) result.warnings.push(`${label} (waived)`);
    else if (report.status === "error") result.blockers.push(`${label} [sensor error — fail-closed]`);
    else if (def.on_fail === "warn" && !compensation.escalateWarnToBlock) result.warnings.push(label);
    else result.blockers.push(label);
    if (report.fix_hint) result.fixHints.push(`${def.id}: ${report.fix_hint}`);
  }
  result.passed = result.blockers.length === 0;
  appendRun(ws, { kind: "suite", change, name: suiteName, status: result.passed ? "pass" : "fail", detail: { blockers: result.blockers, tier: compensation.tier } });
  return result;
}

async function appendOrgStageSensors(
  ws: Workspace,
  harness: HarnessYaml,
  change: string,
  opts: RunnerOptions,
  profile: string,
  blockers: string[],
  warnings: string[],
  suiteName: string | undefined,
  mode: "prd" | "arch" = "prd"
): Promise<void> {
  const suiteIds = suiteName ? (harness.suites[suiteName] ?? []) : [];
  const sensors: string[] =
    mode === "prd"
      ? ["prd-complete", "prd-approved"].filter((id) => !suiteIds.includes(id))
      : ["arch-approved"].filter((id) => !suiteIds.includes(id));

  for (const sensorId of sensors) {
    const def = harness.sensors.find((s) => s.id === sensorId);
    if (!def) continue;
    const prdSlug = sensorId === "prd-complete" || sensorId === "prd-approved" ? resolvePrdSlug(ws, change) : undefined;
    const report = await runSensor(ws, def, change, { ...opts, prdSlug });
    const label = `${def.id}: ${report.summary}`;
    const strict = profile === "enterprise" || profile === "strict" || profile === "enterprise-sdlc";
    if (report.status === "pass") continue;
    if (report.status === "error" || (def.on_fail === "block" && strict)) blockers.push(label);
    else warnings.push(label);
  }
}

/** Stage task completion summary. */
export function stageStatus(
  harness: HarnessYaml,
  profile: string,
  stage: DeliveryStage,
  completed: string[] = []
): { task: StageTaskDef; done: boolean }[] {
  const tasks =
    stage === "dev"
      ? profileDevTasks(harness, profile)
          .map((id) => taskById("dev", id))
          .filter((t): t is StageTaskDef => !!t)
      : stage === "test"
        ? profileTestTasks(harness, profile)
            .map((id) => taskById("test", id))
            .filter((t): t is StageTaskDef => !!t)
        : STAGE_TASKS[stage];

  return tasks.map((t) => ({ task: t, done: completed.includes(t.id) }));
}

/** Gate check using meta stage/task when not specified. */
export async function gateCheck(
  ws: Workspace,
  change: string,
  opts: { stage?: DeliveryStage; task?: string },
  runnerOpts: RunnerOptions
): Promise<StageGateCheckResult> {
  const meta = readMeta(ws, change);
  const stage = opts.stage ?? meta.stage;
  const task = opts.task ?? meta.task;
  return stageGateCheck(ws, change, stage, task, runnerOpts);
}

export async function gateAdvance(ws: Workspace, change: string, runnerOpts: RunnerOptions): Promise<StageAdvanceResult> {
  return stageAdvance(ws, change, runnerOpts);
}

/** Run a named sensor suite (diagnostics). */
export async function runHarnessSuite(
  ws: Workspace,
  suiteName: string,
  runnerOpts: RunnerOptions,
  change?: string
): Promise<SuiteResult> {
  const harness = ws.readHarness();
  const compensation = resolveCompensation(ws);
  return runCompensatedSuite(ws, harness, suiteName, change, runnerOpts, compensation, "verify");
}
