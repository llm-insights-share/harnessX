import { Workspace } from "./paths.js";
import { phaseByCommand, type HarnessYaml, type MetaYaml, type PhaseState, type SuiteResult } from "./schemas.js";
import { readMeta, recordGate, setStatus, activeWaivers } from "./metaStore.js";
import { runSuite, type RunnerOptions } from "./sensorRunner.js";
import { proposalProblems } from "./change.js";
import fs from "node:fs";
import path from "node:path";

/**
 * T-200 (FR-020/FR-053): 8-phase gate state machine.
 * A change advances phase-by-phase along its Workflow Profile. `advance` only
 * succeeds when the gate suite for the target phase passes (fail-closed) and
 * phase-specific preconditions (proposal completeness, human approval) hold.
 */

const ORDER: PhaseState[] = ["explore", "proposed", "designed", "specified", "planned", "implementing", "verified", "archived"];

export function profilePhases(harness: HarnessYaml, profile: string): string[] {
  const p = harness.profiles[profile];
  if (!p) throw new Error(`profile "${profile}" not defined in harness.yaml`);
  return p.phases;
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
    const approved = meta.approvals.some((a) => a.gate === "spec");
    if (!approved) blockers.push("spec→plan requires human approval: hx gate approve <change> --gate spec --approver <name> (FR-012)");
  }
  if (phaseCmd === "apply") {
    const tasksFile = path.join(ws.changeDir(change), "tasks.md");
    if (!fs.existsSync(tasksFile)) blockers.push("tasks.md missing — run hx plan first (FR-006)");
  }

  // gate suite
  const suiteName = harness.profiles[meta.profile]?.suites?.[phaseCmd];
  let suite: SuiteResult | undefined;
  if (suiteName) {
    const waived = activeWaivers(meta).map((w) => w.target);
    suite = await runSuite(ws, harness, suiteName, change, { ...runnerOpts, waivedSensors: waived });
    blockers.push(...suite.blockers);
    warnings.push(...suite.warnings);
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
