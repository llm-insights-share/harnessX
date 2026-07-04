import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

/**
 * T-401: arch-boundary sensor (sensor.arch), paired with a guide.constraint
 * asset (layering.yaml). Scans import statements and flags edges that violate
 * the declared layer rules or explicit forbidden pairs.
 */

interface LayerRules {
  layers?: { name: string; path: string; mayImport: string[] }[];
  forbidden?: { from: string; to: string; hint?: string }[];
  budgets?: Record<string, number>;
}

export function loadLayerRules(base: string, source = "assets/bundles/api-service/constraints/layering.yaml"): LayerRules | null {
  const f = path.join(base, source);
  if (!fs.existsSync(f)) return null;
  return YAML.parse(fs.readFileSync(f, "utf8")) as LayerRules;
}

const IMPORT_RE = /(?:import\s[^"']*|from\s*|require\()\s*["']([^"']+)["']/g;

function collectSources(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.[jt]sx?$/.test(e.name)) out.push(p);
    }
  };
  visit(path.join(root, "src"));
  return out;
}

export function checkArchBoundaries(root: string, rules: LayerRules): Finding[] {
  const findings: Finding[] = [];
  const layerOf = (rel: string) => rules.layers?.find((l) => rel.startsWith(l.path + "/") || rel === l.path);

  for (const file of collectSources(root)) {
    const rel = path.relative(root, file);
    const content = fs.readFileSync(file, "utf8");
    for (const m of content.matchAll(IMPORT_RE)) {
      if (!m[1].startsWith(".")) continue;
      const target = path.relative(root, path.resolve(path.dirname(file), m[1]));
      const targetNorm = target.replace(/\.[jt]sx?$/, "");

      for (const rule of rules.forbidden ?? []) {
        if (rel.startsWith(rule.from + "/") && (targetNorm + "/").startsWith(rule.to + "/")) {
          findings.push({
            file: rel,
            severity: "block",
            rule: `forbidden:${rule.from}->${rule.to}`,
            message: `${rel} imports ${targetNorm} — forbidden dependency ${rule.from} → ${rule.to}`,
            fix_hint: rule.hint ?? "Invert the dependency or move shared code to a lower layer"
          });
        }
      }
      const fromLayer = layerOf(rel);
      const toLayer = layerOf(targetNorm + ".ts") ?? layerOf(targetNorm);
      if (fromLayer && toLayer && fromLayer.name !== toLayer.name && !fromLayer.mayImport.includes(toLayer.name)) {
        findings.push({
          file: rel,
          severity: "block",
          rule: `layer:${fromLayer.name}->${toLayer.name}`,
          message: `layer "${fromLayer.name}" may not import layer "${toLayer.name}" (${rel} → ${targetNorm})`,
          fix_hint: `Allowed imports from ${fromLayer.name}: ${fromLayer.mayImport.join(", ") || "(none)"}`
        });
      }
    }
  }
  return findings;
}

export const archBoundary = (ctx: SensorContext): SensorReport => {
  const rules = loadLayerRules(ctx.ws.base);
  if (!rules) {
    return {
      sensor: ctx.def.id,
      status: "error",
      summary: "layering rules not found (guide.constraint asset missing) — fail-closed",
      findings: [{ severity: "block", message: "expected assets/bundles/api-service/constraints/layering.yaml" }]
    };
  }
  const findings = checkArchBoundaries(ctx.ws.root, rules);
  return {
    sensor: ctx.def.id,
    status: findings.length ? "fail" : "pass",
    summary: findings.length ? `${findings.length} architecture violation(s)` : "architecture boundaries respected",
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: findings.length
      ? "Move each offending import to respect the layering (routes → services → repositories → shared)."
      : undefined
  };
};
