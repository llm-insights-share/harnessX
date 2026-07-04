import fs from "node:fs";
import path from "node:path";
import { readRubric, runRubric, commandJudge, listDeltaFiles, type Judge } from "@harnessx/core";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

/**
 * T-504: sensor.rubric executor (builtin: rubric).
 * Loads every rules.yaml under assets/rubrics/, gathers the change's artifacts
 * (redacted + budget-capped by the core runner), and evaluates rule-by-rule.
 * `HX_JUDGE_CMD` selects a local/remote LLM judge; default is the offline
 * heuristic judge so the sensor stays deterministic in CI.
 */

function collectRubricFiles(base: string): string[] {
  const dir = path.join(base, "assets", "rubrics");
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name, "rules.yaml");
    if (e.isDirectory() && fs.existsSync(f)) out.push(f);
  }
  return out;
}

function changeContent(ctx: SensorContext): string {
  if (!ctx.change) return "";
  const parts: string[] = [];
  const proposal = path.join(ctx.ws.changeDir(ctx.change), "proposal.md");
  if (fs.existsSync(proposal)) parts.push(fs.readFileSync(proposal, "utf8"));
  for (const { file } of listDeltaFiles(ctx.ws, ctx.change)) parts.push(fs.readFileSync(file, "utf8"));
  return parts.join("\n\n");
}

export const rubricSensor = (ctx: SensorContext): SensorReport => {
  const files = collectRubricFiles(ctx.ws.base);
  const judge: Judge | undefined = process.env.HX_JUDGE_CMD ? commandJudge(process.env.HX_JUDGE_CMD) : undefined;
  const content = changeContent(ctx);
  const findings: SensorReport["findings"] = [];
  let evaluated = 0;

  for (const file of files) {
    const rubric = readRubric(file);
    evaluated += rubric.rules.filter((r) => r.status === "trial" || r.status === "enforced").length;
    for (const f of runRubric(rubric, content, { judge, budgetTokens: ctx.def.budget_tokens })) {
      findings.push({
        severity: f.severity === "block" ? "block" : f.severity === "warn" ? "warn" : "info",
        rule: f.rule,
        message: `[${f.status}] ${f.message}`,
        fix_hint: "Address the rubric concern or record reviewer feedback: hx rubric feedback"
      });
    }
  }
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary: `${evaluated} active rule(s) evaluated, ${findings.length} finding(s)`,
    findings
  };
};
