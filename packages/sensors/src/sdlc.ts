import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";
import {
  listWorkOrders,
  requirementsExtendedProblems,
  testCasesProblems,
  listBugs,
  listChangeRequests,
  isArchLldApproved,
  readMeta
} from "@harnessx/core";

function block(findings: Finding[], ctx: SensorContext, summary: string): SensorReport {
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length ? "Fix each finding, then re-run hx gate check." : undefined
  };
}

export const woReqArchClear = (ctx: SensorContext): SensorReport => {
  const findings: Finding[] = [];
  const pending = listWorkOrders(ctx.ws, { status: "pending" });
  const blocking = pending.filter((w) => ["req-review", "req-change", "arch-review", "arch-change"].includes(w.type));
  for (const w of blocking) {
    findings.push({ severity: "block", message: `work order ${w.id} (${w.type}) is still pending` });
  }
  return block(findings, ctx, blocking.length ? `${blocking.length} req/arch work order(s) pending` : "req/arch work orders clear");
};

/** @deprecated */
export const woPrephaseClear = woReqArchClear;

export const requirementsExtendedComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const problems = requirementsExtendedProblems(ctx.ws, ctx.change);
  const findings = problems.map((message) => ({ severity: "block" as const, message }));
  return block(findings, ctx, problems.length ? `${problems.length} extended requirements issue(s)` : "extended requirements complete");
};

export const testCasesComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const problems = testCasesProblems(ctx.ws, ctx.change);
  const findings = problems.map((message) => ({ severity: "block" as const, message }));
  return block(findings, ctx, problems.length ? `${problems.length} test case issue(s)` : "test cases complete");
};

export const testCasesApproved = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const wos = listWorkOrders(ctx.ws, { type: "test-case-review", change: ctx.change, status: ["approved", "done"] });
  if (!wos.length) {
    return block(
      [{ severity: "block", message: "test-case-review work order not approved — hx test-cases submit" }],
      ctx,
      "test cases not approved"
    );
  }
  return block([], ctx, "test-case-review approved");
};

export const bugsClosed = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const open = listBugs(ctx.ws, ctx.change, ["open", "retest", "reopened"]);
  const findings = open.map((b) => ({ severity: "block" as const, message: `bug ${b.id} is ${b.status}: ${b.title}` }));
  return block(findings, ctx, open.length ? `${open.length} open bug(s)` : "all bugs closed");
};

export const woLldDone = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const pending = listWorkOrders(ctx.ws, { type: "lld-design", change: ctx.change, status: ["draft", "pending", "approved"] });
  const findings = pending.map((w) => ({ severity: "block" as const, message: `lld-design ${w.id} not done (hx wo done ${w.id})` }));
  return block(findings, ctx, pending.length ? `${pending.length} lld-design WO(s) open` : "all lld-design work orders done");
};

export const archLldApproved = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  let meta;
  try {
    meta = readMeta(ctx.ws, ctx.change);
  } catch {
    return block([], ctx, "no meta");
  }
  const modules = meta.archModules ?? [];
  const findings: Finding[] = [];
  for (const m of modules) {
    if (!isArchLldApproved(ctx.ws, m)) {
      findings.push({ severity: "block", message: `module LLD "${m}" not approved — hx approve arch-lld ${m}` });
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} module LLD(s) not approved` : "module LLDs approved");
};

export const changeRequestApplied = (ctx: SensorContext): SensorReport => {
  const findings: Finding[] = [];
  for (const cr of listChangeRequests(ctx.ws)) {
    if (cr.status === "submitted") {
      findings.push({ severity: "block", message: `change request ${cr.id} submitted but not applied` });
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} pending CR(s)` : "change requests applied");
};
