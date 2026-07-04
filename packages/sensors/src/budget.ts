import fs from "node:fs";
import path from "node:path";
import { loadLayerRules } from "./archBoundary.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

/**
 * T-402: sensor.budget — quantified architecture fitness checks.
 * Enforces maxFileLines and maxBundleKB (total src size) budgets declared in
 * the constraint asset; pairs with the performance-budget skill.
 */

export const budget = (ctx: SensorContext): SensorReport => {
  const rules = loadLayerRules(ctx.ws.base);
  const budgets = rules?.budgets ?? {};
  const findings: Finding[] = [];
  const srcDir = path.join(ctx.ws.root, "src");
  let totalBytes = 0;

  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.[jt]sx?$/.test(e.name)) {
        const content = fs.readFileSync(p, "utf8");
        totalBytes += Buffer.byteLength(content);
        const lines = content.split("\n").length;
        if (budgets.maxFileLines && lines > budgets.maxFileLines) {
          findings.push({
            file: path.relative(ctx.ws.root, p),
            severity: "warn",
            rule: "budget:maxFileLines",
            message: `${path.relative(ctx.ws.root, p)} has ${lines} lines (budget ${budgets.maxFileLines})`,
            fix_hint: "Split the module along responsibility boundaries"
          });
        }
      }
    }
  };
  visit(srcDir);

  if (budgets.maxBundleKB && totalBytes / 1024 > budgets.maxBundleKB) {
    findings.push({
      severity: "warn",
      rule: "budget:maxBundleKB",
      message: `src totals ${(totalBytes / 1024).toFixed(1)}KB (budget ${budgets.maxBundleKB}KB)`
    });
  }
  return {
    sensor: ctx.def.id,
    status: findings.length ? "fail" : "pass",
    summary: findings.length ? `${findings.length} budget violation(s)` : "within budgets",
    findings
  };
};
