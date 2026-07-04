import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import type { GuideDef } from "./schemas.js";

/**
 * T-403 (FR-034): constitution precedence chain + `hx harness lint`.
 * Precedence when directives conflict: constitution > profile-level guides >
 * bundle guides > individual assets. The linter statically detects guide pairs
 * whose scopes overlap and whose directives contradict (one mandates what the
 * other forbids), so conflicts are resolved by humans instead of confusing agents.
 */

export type GuideLayer = "constitution" | "profile" | "bundle" | "asset";

export interface ResolvedGuide {
  id: string;
  layer: GuideLayer;
  source: string;
  priority: number;
  content: string;
}

const LAYER_RANK: Record<GuideLayer, number> = { constitution: 3, profile: 2, bundle: 1, asset: 0 };

export function guideLayer(g: GuideDef): GuideLayer {
  if (g.source.includes("bundles/")) return "bundle";
  if ((g.priority ?? 0) >= 100) return "profile";
  return "asset";
}

/** Returns guides ordered by decreasing precedence; constitution always first. */
export function resolveGuides(ws: Workspace): ResolvedGuide[] {
  const out: ResolvedGuide[] = [];
  if (fs.existsSync(ws.constitutionFile)) {
    out.push({
      id: "constitution",
      layer: "constitution",
      source: ws.constitutionFile,
      priority: Infinity,
      content: fs.readFileSync(ws.constitutionFile, "utf8")
    });
  }
  const harness = ws.readHarness();
  for (const g of harness.guides) {
    const file = path.join(ws.base, g.source);
    out.push({
      id: g.id,
      layer: guideLayer(g),
      source: file,
      priority: g.priority ?? 0,
      content: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
    });
  }
  return out.sort((a, b) => LAYER_RANK[b.layer] - LAYER_RANK[a.layer] || b.priority - a.priority);
}

/* ── directive extraction & contradiction heuristics ── */

interface Directive {
  guideId: string;
  layer: GuideLayer;
  text: string;
  negated: boolean;
  tokens: Set<string>;
}

const NEG_RE = /\b(never|must not|do not|don't|forbidden|disallow(?:ed)?|avoid)\b/i;
const POS_RE = /\b(always|must|shall|required?|ensure)\b/i;
const STOP = new Set(["the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "with", "is", "are", "be", "it", "this", "that", "your", "every", "each", "all", "any", "when", "use"]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(NEG_RE, " ")
      .replace(POS_RE, " ")
      .split(/[^a-z0-9-]+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
  );
}

export function extractDirectives(guideId: string, layer: GuideLayer, content: string): Directive[] {
  const out: Directive[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.replace(/^[-*\d.\s]+/, "").trim();
    if (line.length < 8 || line.startsWith("#") || line.startsWith("<!--")) continue;
    const negated = NEG_RE.test(line);
    const positive = POS_RE.test(line);
    if (!negated && !positive) continue;
    out.push({ guideId, layer, text: line, negated, tokens: tokenize(line) });
  }
  return out;
}

export interface GuideConflict {
  a: { guideId: string; layer: GuideLayer; text: string };
  b: { guideId: string; layer: GuideLayer; text: string };
  overlap: string[];
  resolution: string;
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: string[] } {
  const shared = [...a].filter((t) => b.has(t));
  const union = new Set([...a, ...b]).size;
  return { score: union === 0 ? 0 : shared.length / union, shared };
}

/** Flags directive pairs from different guides with high topical overlap but opposite polarity. */
export function lintHarness(ws: Workspace, minOverlap = 0.4): GuideConflict[] {
  const directives = resolveGuides(ws).flatMap((g) => extractDirectives(g.id, g.layer, g.content));
  const conflicts: GuideConflict[] = [];
  for (let i = 0; i < directives.length; i++) {
    for (let j = i + 1; j < directives.length; j++) {
      const d1 = directives[i];
      const d2 = directives[j];
      if (d1.guideId === d2.guideId) continue;
      if (d1.negated === d2.negated) continue;
      const { score, shared } = jaccard(d1.tokens, d2.tokens);
      if (score >= minOverlap && shared.length >= 2) {
        const winner = LAYER_RANK[d1.layer] >= LAYER_RANK[d2.layer] ? d1 : d2;
        conflicts.push({
          a: { guideId: d1.guideId, layer: d1.layer, text: d1.text },
          b: { guideId: d2.guideId, layer: d2.layer, text: d2.text },
          overlap: shared,
          resolution: `precedence chain resolves to ${winner.layer} guide "${winner.guideId}" — but remove or reword the losing directive to avoid confusing agents`
        });
      }
    }
  }
  return conflicts;
}

/** Reads `core-domains:` from the constitution (used by profile recommendation, FR-013). */
export function constitutionCoreDomains(ws: Workspace): string[] {
  if (!fs.existsSync(ws.constitutionFile)) return [];
  const m = fs.readFileSync(ws.constitutionFile, "utf8").match(/core-domains:\s*\[([^\]]*)\]/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
