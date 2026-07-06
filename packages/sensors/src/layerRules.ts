import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Workspace } from "@harnessx/core/paths.js";

export interface LayerRules {
  layers?: { name: string; path: string; mayImport: string[] }[];
  forbidden?: { from: string; to: string; hint?: string }[];
  budgets?: Record<string, number>;
  /** Source roots scanned by arch-boundary / budget (default: ["src"]). */
  sourceRoots?: string[];
}

export interface ResolvedLayerRules {
  rules: LayerRules;
  source: string;
}

/** Loads a constraint YAML from a path relative to harnessX/. */
export function loadLayerRulesFromFile(base: string, source: string): LayerRules | null {
  const f = path.join(base, source);
  if (!fs.existsSync(f)) return null;
  return YAML.parse(fs.readFileSync(f, "utf8")) as LayerRules;
}

/** Resolves guide.constraint sources registered in harness.yaml (any topology bundle). */
export function constraintSources(ws: Workspace): string[] {
  return ws
    .readHarness()
    .guides.filter((g) => g.kind === "guide.constraint")
    .map((g) => g.source);
}

/**
 * Loads layering rules from the active harness registry, then falls back to
 * any assets/bundles/.../constraints/layering.yaml on disk.
 */
export function resolveLayerRules(ws: Workspace): ResolvedLayerRules | null {
  for (const source of constraintSources(ws)) {
    const rules = loadLayerRulesFromFile(ws.base, source);
    if (rules) return { rules, source };
  }

  const bundlesDir = path.join(ws.bundlesDir);
  if (fs.existsSync(bundlesDir)) {
    for (const entry of fs.readdirSync(bundlesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const source = path.join("assets", "bundles", entry.name, "constraints", "layering.yaml");
      const rules = loadLayerRulesFromFile(ws.base, source);
      if (rules) return { rules, source };
    }
  }

  return null;
}

/** @deprecated Use resolveLayerRules(ws). Kept for tests that pass harnessX base only. */
export function loadLayerRules(base: string, source?: string): LayerRules | null {
  if (source) return loadLayerRulesFromFile(base, source);
  const bundlesDir = path.join(base, "assets", "bundles");
  if (!fs.existsSync(bundlesDir)) return null;
  for (const entry of fs.readdirSync(bundlesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = path.join("assets", "bundles", entry.name, "constraints", "layering.yaml");
    const rules = loadLayerRulesFromFile(base, rel);
    if (rules) return rules;
  }
  return null;
}

export function sourceRoots(rules: LayerRules): string[] {
  const roots = rules.sourceRoots?.filter(Boolean);
  return roots?.length ? roots : ["src"];
}
