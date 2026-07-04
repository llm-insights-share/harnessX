import { Workspace } from "./paths.js";
import { constitutionCoreDomains } from "./harnessLint.js";
import { readMeta, writeMeta } from "./metaStore.js";

/**
 * T-405 (FR-013): scale-adaptive profile recommendation.
 * Heuristic score from touched-domain count, estimated diff size and whether a
 * core domain (declared in the constitution) is touched. Human downgrades are
 * recorded with a reason in meta.yaml.
 */

export interface RecommendInput {
  domains: string[];
  estimatedDiffLines?: number;
}

export interface Recommendation {
  recommended: "lite" | "standard" | "strict";
  score: number;
  reasons: string[];
}

export function recommendProfile(ws: Workspace, input: RecommendInput): Recommendation {
  const reasons: string[] = [];
  let score = 0;

  if (input.domains.length >= 3) {
    score += 2;
    reasons.push(`touches ${input.domains.length} domains (+2)`);
  } else if (input.domains.length === 2) {
    score += 1;
    reasons.push("touches 2 domains (+1)");
  }

  const diff = input.estimatedDiffLines ?? 0;
  if (diff > 800) {
    score += 2;
    reasons.push(`estimated diff ${diff} lines (+2)`);
  } else if (diff > 200) {
    score += 1;
    reasons.push(`estimated diff ${diff} lines (+1)`);
  }

  const core = constitutionCoreDomains(ws);
  const touchedCore = input.domains.filter((d) => core.includes(d));
  if (touchedCore.length > 0) {
    score += 3;
    reasons.push(`touches core domain(s) ${touchedCore.join(", ")} (+3)`);
  }

  const recommended = score >= 3 ? "strict" : score >= 1 ? "standard" : "lite";
  return { recommended, score, reasons };
}

/** Records the recommendation and the chosen profile; downgrades require a reason. */
export function applyProfileChoice(
  ws: Workspace,
  change: string,
  rec: Recommendation,
  chosen: string,
  overrideReason?: string
): void {
  const rank = { lite: 0, standard: 1, strict: 2 } as Record<string, number>;
  const isDowngrade = (rank[chosen] ?? 0) < rank[rec.recommended];
  if (isDowngrade && !overrideReason) {
    throw new Error(
      `profile "${chosen}" is below the recommended "${rec.recommended}" — provide --override-reason (recorded in meta.yaml, FR-013)`
    );
  }
  const meta = readMeta(ws, change);
  meta.profile = chosen;
  meta.profileRecommendation = { recommended: rec.recommended, chosen, overrideReason };
  writeMeta(ws, meta);
}
