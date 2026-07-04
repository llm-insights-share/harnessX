import { Workspace } from "./paths.js";
import { readMeta, setStatus } from "./metaStore.js";
import { gateCheck, type GateCheckResult } from "./gate.js";
import type { RunnerOptions } from "./sensorRunner.js";
import { traceCheck, type TraceCheckResult } from "./traceability.js";

/**
 * T-301 (FR-008): `hx verify` runs the profile's verification suite plus the
 * traceability check. All P0 (blocking) sensors must pass before the change
 * reaches "verified".
 */

export interface VerifyResult {
  gate: GateCheckResult;
  trace: TraceCheckResult;
  passed: boolean;
  verified: boolean;
}

export async function verifyChange(ws: Workspace, change: string, runnerOpts: RunnerOptions): Promise<VerifyResult> {
  const trace = traceCheck(ws, change);
  const gate = await gateCheck(ws, change, "verify", runnerOpts);
  if (!trace.passed) {
    gate.blockers.push(
      ...trace.uncovered.map(
        (u) => `uncovered scenario "${u.scenario}" (${u.capability}/${u.requirement}) — add a test containing "Scenario: ${u.scenario}" or a waiver`
      )
    );
    gate.passed = false;
  }
  const passed = gate.passed;
  if (passed) setStatus(ws, change, "verified");
  return { gate, trace, passed, verified: passed };
}
