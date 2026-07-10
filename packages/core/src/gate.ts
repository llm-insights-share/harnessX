import { Workspace } from "./paths.js";
import { phaseByCommand, type HarnessYaml, type MetaYaml, type PhaseState, type SensorDef, type SuiteResult } from "./schemas.js";
import { readMeta, recordGate, setStatus, activeWaivers } from "./metaStore.js";
import { runSensor, type RunnerOptions } from "./sensorRunner.js";
import { proposalProblems } from "./change.js";
import { resolvePrdSlug } from "./prd.js";
import { workorderProblems } from "./workorder.js";
import { augmentSuiteIds, resolveCompensation } from "./gateCompensation.js";
import { appendRun } from "./telemetry.js";
import { profilePhases as resolveProfilePhases } from "./profileResolve.js";
import fs from "node:fs";
import path from "node:path";

/**
 * T-200 (FR-020/FR-053): gate state machine.
 * Legacy phases mode — see stageGate.ts for delivery_mode: stages.
 */

const ORDER: PhaseState[] = [
  "explore",
  "proposed",
  "designed",
  "specified",
  "planned",
  "test_designed",
  "implementing",
  "verified",
  "archived"
];

export function profilePhases(harness: HarnessYaml, profile: string): string[] {
  return resolveProfilePhases(harness, profile);
}

/** Next phase command for a change according to its profile. */
export function nextPhase(harness: HarnessYaml, meta: MetaYaml): string | null {
  const phases = profilePhases(harness, meta.profile);
  const states = phases.map((cmd) => phaseByCommand(cmd)?.state).filter(Boolean) as PhaseState[];
  const currentIdx = states.findIndex((s) => ORDER.indexOf(s) > ORDER.indexOf(meta.status));
  if (meta.status === "explore") return phases[0] === "explore" ? phases[1] ?? null : phases[0] ?? null;
  if (currentIdx < 0) return null;
  return phases[currentIdx];
}

export interface GateCheckResult {
  change: string;
  phase: string;
  suite?: SuiteResult;
  blockers: string[];
  warnings: string[];
  passed: boolean;
}

/** Runs the gate suite configured for a phase (if any) plus phase preconditions. */
export async function gateCheck(
  ws: Workspace,
  change: string,
  phaseCmd: string,
  runnerOpts: RunnerOptions
): Promise<GateCheckResult> {
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);
  const blockers: string[] = [];
  const warnings: string[] = [];

  // phase preconditions
  if (["design", "spec"].includes(phaseCmd)) {
    blockers.push(...proposalProblems(ws, change));
  }
  if (phaseCmd === "plan") {
    const approved = meta.approvals.some((a) => a.gate === "spec" || a.gate === "design-to-plan");
    if (!approved) blockers.push("design→plan requires human approval: hx gate approve <change> --gate spec|design-to-plan --approver <name> (FR-012)");
  }
  if (phaseCmd === "apply") {
    const tasksFile = path.join(ws.changeDir(change), "tasks.md");
    if (!fs.existsSync(tasksFile)) blockers.push("tasks.md missing — run hx plan first (FR-006)");
  }

  blockers.push(...workorderProblems(ws, change, phaseCmd));

  // Pre-phase PRD check on propose when not already in suite (standard → warn)
  const suiteName = harness.profiles[meta.profile]?.suites?.[phaseCmd];
  const suiteHasPrd = suiteName && (harness.suites[suiteName] ?? []).includes("prd-complete");
  const suiteHasPrdApproved = suiteName && (harness.suites[suiteName] ?? []).includes("prd-approved");
  const suiteHasArchApproved = suiteName && (harness.suites[suiteName] ?? []).includes("arch-approved");
  if (phaseCmd === "propose" && !suiteHasPrd) {
    await appendPrephaseSensor(ws, harness, "prd-complete", change, runnerOpts, meta.profile, blockers, warnings);
  }
  if (phaseCmd === "propose" && !suiteHasPrdApproved && (meta.profile === "enterprise" || meta.profile === "enterprise-sdlc")) {
    await appendPrephaseSensor(ws, harness, "prd-approved", change, runnerOpts, meta.profile, blockers, warnings);
  }
  if (phaseCmd === "design" && !suiteHasArchApproved && (meta.profile === "enterprise" || meta.profile === "enterprise-sdlc")) {
    await appendPrephaseSensor(ws, harness, "arch-approved", change, runnerOpts, meta.profile, blockers, warnings);
  }

  // gate suite (with tier compensation for weaker IDE adapters)
  const compensation = resolveCompensation(ws);
  let suite: SuiteResult | undefined;
  if (suiteName) {
    const waived = activeWaivers(meta).map((w) => w.target);
    suite = await runCompensatedSuite(ws, harness, suiteName, change, { ...runnerOpts, waivedSensors: waived }, compensation, phaseCmd);
    blockers.push(...suite.blockers);
    warnings.push(...suite.warnings);
    if (compensation.requireHeadlessApply && phaseCmd === "apply") {
      warnings.push(`adapter tier ${compensation.tier}: recommend headless apply via hx apply --runner "<agent>" for reliable feedback`);
    }
  }

  const passed = blockers.length === 0;
  recordGate(ws, change, { phase: phaseCmd, suite: suiteName, passed });
  return { change, phase: phaseCmd, suite, blockers, warnings, passed };
}

export interface AdvanceResult extends GateCheckResult {
  from: PhaseState;
  to?: PhaseState;
}

/** Advances the change to the next phase in its profile iff the gate passes. */
export async function gateAdvance(ws: Workspace, change: string, runnerOpts: RunnerOptions): Promise<AdvanceResult> {
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);
  const phaseCmd = nextPhase(harness, meta);
  if (!phaseCmd) {
    return { change, phase: "-", blockers: [`change is already at terminal state "${meta.status}" for profile "${meta.profile}"`], warnings: [], passed: false, from: meta.status };
  }
  const check = await gateCheck(ws, change, phaseCmd, runnerOpts);
  if (!check.passed) return { ...check, from: meta.status };
  const to = phaseByCommand(phaseCmd)!.state;
  setStatus(ws, change, to);
  return { ...check, from: meta.status, to };
}

/** Runs a suite with optional tier-compensation sensor augmentation. */
async function runCompensatedSuite(
  ws: Workspace,
  harness: HarnessYaml,
  suiteName: string,
  change: string | undefined,
  opts: RunnerOptions,
  compensation: ReturnType<typeof resolveCompensation>,
  phaseCmd: string
): Promise<SuiteResult> {
  const extraIds =
    phaseCmd === "verify" || phaseCmd === "apply" ? compensation.extraSensors : compensation.extraSensors.filter((id) => ["spec-validate", "typecheck", "lint"].includes(id));
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

async function appendPrephaseSensor(
  ws: Workspace,
  harness: HarnessYaml,
  sensorId: string,
  change: string,
  opts: RunnerOptions,
  profile: string,
  blockers: string[],
  warnings: string[]
): Promise<void> {
  const def = harness.sensors.find((s) => s.id === sensorId);
  if (!def) return;
  const prdSlug = sensorId === "prd-complete" || sensorId === "prd-approved" ? resolvePrdSlug(ws, change) : undefined;
  const report = await runSensor(ws, def, change, { ...opts, prdSlug });
  const label = `${def.id}: ${report.summary}`;
  const strict = profile === "enterprise" || profile === "strict" || profile === "enterprise-sdlc";
  if (report.status === "pass") return;
  if (report.status === "error" || (def.on_fail === "block" && strict)) blockers.push(label);
  else warnings.push(label);
}

/** Run a named sensor suite (pre-phase or diagnostics). */
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
