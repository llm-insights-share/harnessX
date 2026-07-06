import fs from "node:fs";
import path from "node:path";
import type { Finding } from "@harnessx/core/schemas.js";
import type { LayerRules } from "./layerRules.js";
import { sourceRoots } from "./layerRules.js";

const IMPORT_RE = /(?:import\s[^"']*|from\s*|require\()\s*["']([^"']+)["']/g;

export function collectSources(root: string, rules: LayerRules): string[] {
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
  for (const rel of sourceRoots(rules)) visit(path.join(root, rel));
  return out;
}

export function checkArchBoundaries(root: string, rules: LayerRules): Finding[] {
  const findings: Finding[] = [];
  const layerOf = (rel: string) => rules.layers?.find((l) => rel.startsWith(l.path + "/") || rel === l.path);

  for (const file of collectSources(root, rules)) {
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
