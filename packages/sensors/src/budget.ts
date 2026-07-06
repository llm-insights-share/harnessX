import fs from "node:fs";
import path from "node:path";
import { resolveLayerRules, sourceRoots } from "./layerRules.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

/**
 * T-402: sensor.budget — quantified architecture fitness checks.
 * Enforces budgets declared in the guide.constraint asset; pairs with performance-budget skill.
 */

export const budget = (ctx: SensorContext): SensorReport => {
  const resolved = resolveLayerRules(ctx.ws);
  const budgets = resolved?.rules.budgets ?? {};
  const roots = resolved ? sourceRoots(resolved.rules) : ["src"];
  const findings: Finding[] = [];
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
  for (const rel of roots) visit(path.join(ctx.ws.root, rel));

  if (budgets.maxBundleKB && totalBytes / 1024 > budgets.maxBundleKB) {
    findings.push({
      severity: "warn",
      rule: "budget:maxBundleKB",
      message: `source totals ${(totalBytes / 1024).toFixed(1)}KB (budget ${budgets.maxBundleKB}KB)`
    });
  }

  if (!resolved) {
    return {
      sensor: ctx.def.id,
      status: "error",
      summary: "budget rules not found (guide.constraint missing) — fail-closed",
      findings: [{ severity: "block", message: "register a guide.constraint with budgets in harness.yaml" }]
    };
  }

  return {
    sensor: ctx.def.id,
    status: findings.length ? "fail" : "pass",
    summary: findings.length ? `${findings.length} budget violation(s)` : "within budgets",
    findings
  };
};
