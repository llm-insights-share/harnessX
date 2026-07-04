import { traceCheck, verifyFixtures, checkApprovedTests } from "@harnessx/core";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

/** sensor.script spec-trace (FR-023): every scenario maps to a test or waiver. */
export const specTrace = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "spec-trace requires a change", findings: [] };
  const res = traceCheck(ctx.ws, ctx.change);
  return {
    sensor: ctx.def.id,
    status: res.passed ? "pass" : "fail",
    summary: res.passed
      ? `${res.covered} covered, ${res.waived} waived`
      : `${res.uncovered.length} scenario(s) without tests or waivers`,
    findings: res.uncovered.map((u) => ({
      severity: "block" as const,
      rule: "traceability",
      message: `uncovered scenario "${u.scenario}" (${u.capability}/${u.requirement})`,
      fix_hint: `Add a test whose title contains "Scenario: ${u.scenario}", or waive it: hx waiver add ${ctx.change} --target "scenario:${u.scenario}" ...`
    })),
    agent_instruction: res.passed ? undefined : "Write the missing tests before continuing; do not delete scenarios to make this pass."
  };
};

/** sensor.fixture fixture-hash (FR-025): approved fixtures must match their locked hashes. */
export const fixtureHash = (ctx: SensorContext): SensorReport => {
  const violations = verifyFixtures(ctx.ws, ctx.changedFiles?.length ? undefined : undefined);
  return {
    sensor: ctx.def.id,
    status: violations.length ? "fail" : "pass",
    summary: violations.length ? `${violations.length} approved fixture(s) drifted` : "all approved fixtures intact",
    findings: violations.map((v) => ({
      severity: "block" as const,
      rule: "fixture-guard",
      file: v.file,
      message: `approved fixture ${v.problem}: ${v.file}`,
      fix_hint: "Restore the fixture, or have a human re-approve it: hx fixture approve <file> --by <name>"
    }))
  };
};

/** approved-tests (FR-026): approved test files must not be modified without waiver. */
export const approvedTests = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "pass", summary: "no change context", findings: [] };
  const violations = checkApprovedTests(ctx.ws, ctx.change);
  return {
    sensor: ctx.def.id,
    status: violations.length ? "fail" : "pass",
    summary: violations.length ? `${violations.length} approved test file(s) modified` : "approved tests intact",
    findings: violations.map((v) => ({
      severity: "block" as const,
      rule: "test-first",
      file: v.file,
      message: `approved test ${v.problem}: ${v.file} — assertions were approved by a human (FR-026)`,
      fix_hint: `Revert the test, or request a waiver: hx waiver add ${ctx.change} --target "tests:${v.file}" ...`
    }))
  };
};
