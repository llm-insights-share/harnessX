import { Workspace } from "./paths.js";
import { readMeta, setStageTask } from "./metaStore.js";
import { stageGateCheck, type StageGateCheckResult } from "./stageGate.js";
import type { RunnerOptions } from "./sensorRunner.js";
import { traceCheck, type TraceCheckResult } from "./traceability.js";

/**
 * T-301 (FR-008): `hx dev verify` runs the profile's verification suite plus the
 * traceability check.
 */

export interface VerifyResult {
  gate: StageGateCheckResult;
  trace: TraceCheckResult;
  passed: boolean;
  verified: boolean;
}

export async function verifyChange(ws: Workspace, change: string, runnerOpts: RunnerOptions): Promise<VerifyResult> {
  const trace = traceCheck(ws, change);
  const gate = await stageGateCheck(ws, change, "dev", "verify", runnerOpts);
  if (!trace.passed) {
    gate.blockers.push(
      ...trace.uncovered.map(
        (u) => `uncovered scenario "${u.scenario}" (${u.capability}/${u.requirement}) — add a test containing "Scenario: ${u.scenario}" or a waiver`
      )
    );
    gate.passed = false;
  }
  const passed = gate.passed;
  if (passed) setStageTask(ws, change, "dev", "verify");
  return { gate, trace, passed, verified: passed };
}
