import fs from "node:fs";
import path from "node:path";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";
import { checkArchBoundaries, collectSources } from "./archScan.js";
import { resolveLayerRules } from "./layerRules.js";

export { checkArchBoundaries, collectSources } from "./archScan.js";
export { loadLayerRules, loadLayerRulesFromFile, resolveLayerRules, constraintSources, sourceRoots } from "./layerRules.js";
export type { LayerRules, ResolvedLayerRules } from "./layerRules.js";

export const archBoundary = (ctx: SensorContext): SensorReport => {
  const resolved = resolveLayerRules(ctx.ws);
  if (!resolved) {
    return {
      sensor: ctx.def.id,
      status: "error",
      summary: "layering rules not found (guide.constraint asset missing) — fail-closed",
      findings: [
        {
          severity: "block",
          message: "register a guide.constraint in harness.yaml (e.g. layering-rules from your topology bundle)"
        }
      ]
    };
  }

  const findings = checkArchBoundaries(ctx.ws.root, resolved.rules);
  return {
    sensor: ctx.def.id,
    status: findings.length ? "fail" : "pass",
    summary: findings.length ? `${findings.length} architecture violation(s)` : "architecture boundaries respected",
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: findings.length
      ? "Move each offending import to respect the layering declared in the active topology bundle."
      : undefined
  };
};
