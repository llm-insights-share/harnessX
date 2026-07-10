import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { aggregatePatterns, readFailures, type FailurePattern } from "./failureCatalog.js";
import { readRuns } from "./telemetry.js";
import { backfillMetrics, loadAssetDir, promoteAsset } from "./assets.js";
import { hubPromote, type PromoteOptions } from "./hub.js";
import { hubEvalLocal, type HubEvalResult } from "./hubEval.js";

/**
 * T-501/T-502/T-503 (FR-041/FR-042): the Steering loop.
 * - report: top failure patterns from the catalog
 * - distill: turn a pattern (or harvested review comments) into a *draft*
 *   control asset with a provenance chain, for human review
 * - harvest-pr: cluster human PR review comments into rubric-rule drafts
 * - coverage: controls vs failure-mode matrix + delivery metrics
 */

export interface DistilledAsset {
  dir: string;
  manifestFile: string;
  contentFile: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "pattern";
}

/** Distills a failure pattern into a draft asset (skill or rubric rule) with provenance. */
export function distillPattern(ws: Workspace, pattern: FailurePattern, kind: "guide.skill" | "sensor.rubric" = "guide.skill"): DistilledAsset {
  const id = `distilled-${slugify(pattern.signature.split("::")[1] ?? pattern.sensor)}`;
  const dir = path.join(ws.assetsDir, kind.startsWith("guide") ? "guides" : "rubrics", id);
  ensureDir(dir);

  const manifest = {
    id,
    kind,
    stage: kind === "guide.skill" ? "dev" : "dev",
    task: kind === "guide.skill" ? "apply" : "verify",
    version: "0.1.0",
    origin: "local",
    status: "draft",
    execution: kind === "guide.skill" ? "inferential" : "inferential",
    provenance: [
      { type: "failure-pattern", ref: pattern.signature },
      ...pattern.changes.map((c) => ({ type: "change", ref: c }))
    ],
    metrics: { occurrences: pattern.count }
  };
  const manifestFile = path.join(dir, "asset.yaml");
  writeYaml(manifestFile, manifest);

  let contentFile: string;
  if (kind === "guide.skill") {
    contentFile = path.join(dir, "SKILL.md");
    fs.writeFileSync(
      contentFile,
      [
        `# Skill (draft): avoid "${pattern.sensor}" failures`,
        "",
        `> Distilled from ${pattern.count} occurrences of the same failure pattern. Review before promoting to trial.`,
        "",
        "## Observed failure",
        ...pattern.examples.map((e) => `- ${e}`),
        "",
        "## Guidance",
        `- Before running ${pattern.sensor}, check for the conditions above and fix them proactively.`,
        ""
      ].join("\n")
    );
  } else {
    contentFile = path.join(dir, "rules.yaml");
    writeYaml(contentFile, {
      rules: [
        {
          id: `${id}-r1`,
          status: "draft",
          check: `Does the change avoid the following recurring problem? ${pattern.examples[0] ?? pattern.signature}`,
          severity: "warn"
        }
      ]
    });
  }
  return { dir, manifestFile, contentFile };
}

/* ── PR review harvesting (T-502) ── */

export interface ReviewComment {
  pr: string | number;
  author: string;
  body: string;
}

export interface RubricDraft {
  topic: string;
  check: string;
  provenance: { type: string; ref: string }[];
  supportingComments: string[];
}

const TOPIC_KEYWORDS: [string, RegExp][] = [
  ["error-handling", /\b(error|exception|catch|throw|fail)\w*/i],
  ["naming", /\b(nam(e|ing)|rename|identifier)\b/i],
  ["testing", /\b(test|coverage|assert)\w*/i],
  ["security", /\b(secur|auth|token|secret|inject)\w*/i],
  ["performance", /\b(perf|slow|n\+1|cache|latency)\w*/i],
  ["docs", /\b(doc|comment|readme)\w*/i]
];

/** Clusters review comments by topic keywords and drafts one rubric rule per cluster. */
export function harvestReviews(comments: ReviewComment[], minCluster = 2): RubricDraft[] {
  const clusters = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    for (const [topic, re] of TOPIC_KEYWORDS) {
      if (re.test(c.body)) {
        const arr = clusters.get(topic) ?? [];
        arr.push(c);
        clusters.set(topic, arr);
        break;
      }
    }
  }
  const drafts: RubricDraft[] = [];
  for (const [topic, cs] of clusters) {
    if (cs.length < minCluster) continue;
    drafts.push({
      topic,
      check: `Reviewers repeatedly flag ${topic} issues (${cs.length} comments). Verify the change addresses: ${cs[0].body.slice(0, 120)}`,
      provenance: cs.map((c) => ({ type: "pr-review", ref: `PR#${c.pr} by ${c.author}` })),
      supportingComments: cs.map((c) => c.body.slice(0, 200))
    });
  }
  return drafts;
}

/* ── Coverage + metrics (T-503, FR-042) ── */

export interface CoverageReport {
  patterns: { signature: string; count: number; coveredBy: string[] }[];
  uncoveredPatterns: number;
  metrics: {
    totalSensorRuns: number;
    firstAttemptPassRate: number;
    failuresPerChange: Record<string, number>;
    recurrentPatterns: number;
  };
}

export function coverageReport(ws: Workspace): CoverageReport {
  const harness = ws.readHarness();
  const controlIds = [...harness.sensors.map((s) => s.id), ...harness.guides.map((g) => g.id)];
  const patterns = aggregatePatterns(ws).map((p) => ({
    signature: p.signature,
    count: p.count,
    // a pattern is "covered" when a control other than the failing sensor itself targets it
    coveredBy: controlIds.filter((id) => id !== p.sensor && p.signature.includes(id))
  }));

  const runs = readRuns(ws).filter((r) => r.kind === "sensor");
  const bySensorFirst = new Map<string, boolean>();
  for (const r of runs) {
    const key = `${r.change}:${r.name}`;
    if (!bySensorFirst.has(key)) bySensorFirst.set(key, r.status === "pass");
  }
  const firsts = [...bySensorFirst.values()];
  const failuresPerChange: Record<string, number> = {};
  for (const f of readFailures(ws)) {
    if (f.change) failuresPerChange[f.change] = (failuresPerChange[f.change] ?? 0) + 1;
  }
  return {
    patterns,
    uncoveredPatterns: patterns.filter((p) => p.coveredBy.length === 0 && p.count >= 3).length,
    metrics: {
      totalSensorRuns: runs.length,
      firstAttemptPassRate: firsts.length ? firsts.filter(Boolean).length / firsts.length : 1,
      failuresPerChange,
      recurrentPatterns: patterns.filter((p) => p.count >= 3).length
    }
  };
}

export interface SteerPublishResult {
  dest: string;
  eval: HubEvalResult;
  localStatus: string;
}

/**
 * Steering → promote → Hub eval closed loop:
 * backfill metrics → eval → local trial promotion → hub promote with evidence.
 */
export function steerPublish(ws: Workspace, assetDir: string, hubRoot: string, opts: PromoteOptions): SteerPublishResult {
  const resolved = path.resolve(assetDir);
  const asset = loadAssetDir(resolved, "local");
  if (!asset) throw new Error(`no asset.yaml in ${resolved}`);

  backfillMetrics(ws, asset);
  const evalResult = hubEvalLocal(resolved);
  if (!evalResult.passed && !opts.skipEval) {
    const failed = evalResult.checks.filter((c) => !c.ok).map((c) => c.name).join(", ");
    throw new Error(`hub eval failed before promote: ${failed}`);
  }

  if (asset.manifest.status === "draft") promoteAsset(resolved, "trial");

  const metrics = loadAssetDir(resolved, "local")!.manifest.metrics;
  const evidence =
    opts.evidence ??
    `runs=${metrics["runs"] ?? 0}, failures=${metrics["failures"] ?? 0}, evaluations=${metrics["evaluations"] ?? 0}`;

  const { dest } = hubPromote(ws, hubRoot, resolved, { ...opts, evidence, skipEval: opts.skipEval });
  return { dest, eval: evalResult, localStatus: loadAssetDir(resolved, "local")!.manifest.status };
}
