import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { Workspace, ensureDir, writeYaml } from "./paths.js";

/**
 * T-504/T-505 (FR-024 inferential / NFR-006): Rubric-as-data runner.
 * Rules are structured YAML entries with a lifecycle (draft/trial/enforced/
 * deprecated). The runner evaluates each active rule via a pluggable Judge:
 *  - heuristic judge (default, offline & deterministic): regex/keyword checks
 *  - command judge (`judge: cmd:<command>`): e.g. a local LLM; receives JSON
 *    {rule, content} on stdin and must print {violation: bool, note?}
 * A redaction middleware masks secret-looking strings before content reaches
 * any judge (NFR-006), and budget_tokens caps how much content is sent.
 */

export interface RubricRule {
  id: string;
  status: "draft" | "trial" | "enforced" | "deprecated";
  check: string;
  pattern?: string;
  severity: "block" | "warn" | "info";
  falsePositives?: number;
  evaluations?: number;
}

export interface RubricFile {
  rules: RubricRule[];
}

export function readRubric(file: string): RubricFile {
  const parsed = YAML.parse(fs.readFileSync(file, "utf8")) as RubricFile;
  return { rules: parsed?.rules ?? [] };
}

/* ── redaction middleware (NFR-006) ── */

const SECRET_PATTERNS = [
  /(api[_-]?key|secret|token|password|passwd|authorization)\s*[:=]\s*['"]?[A-Za-z0-9+/_\-.]{8,}['"]?/gi,
  /\b(sk|ghp|gho|xox[bap])-[A-Za-z0-9-]{10,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g
];

export function redact(content: string): string {
  let out = content;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

/** budget_tokens → rough char budget (4 chars/token). */
export function applyBudget(content: string, budgetTokens?: number): string {
  if (!budgetTokens) return content;
  const maxChars = budgetTokens * 4;
  return content.length <= maxChars ? content : content.slice(0, maxChars) + "\n[TRUNCATED by budget_tokens]";
}

/* ── judges ── */

export interface JudgeVerdict {
  violation: boolean;
  note?: string;
}

export type Judge = (rule: RubricRule, content: string) => JudgeVerdict;

/** Deterministic offline judge: a rule with `pattern` violates when the regex matches. */
export const heuristicJudge: Judge = (rule, content) => {
  if (!rule.pattern) return { violation: false, note: "no pattern; heuristic judge cannot evaluate — needs LLM judge or pattern" };
  const re = new RegExp(rule.pattern, "im");
  const m = content.match(re);
  return m ? { violation: true, note: `matched: ${m[0].slice(0, 80)}` } : { violation: false };
};

export function commandJudge(command: string): Judge {
  return (rule, content) => {
    const res = spawnSync(command, {
      shell: true,
      input: JSON.stringify({ rule: { id: rule.id, check: rule.check }, content }),
      encoding: "utf8",
      timeout: 60000
    });
    if (res.status !== 0) throw new Error(`judge command failed (exit ${res.status}) — fail-closed`);
    const line = res.stdout.trim().split("\n").findLast((l) => l.startsWith("{"));
    if (!line) throw new Error("judge produced no JSON verdict — fail-closed");
    return JSON.parse(line) as JudgeVerdict;
  };
}

export interface RubricFinding {
  rule: string;
  severity: RubricRule["severity"];
  message: string;
  status: RubricRule["status"];
}

export function runRubric(
  rubric: RubricFile,
  content: string,
  opts: { judge?: Judge; budgetTokens?: number } = {}
): RubricFinding[] {
  const judge = opts.judge ?? heuristicJudge;
  const prepared = applyBudget(redact(content), opts.budgetTokens);
  const findings: RubricFinding[] = [];
  for (const rule of rubric.rules) {
    if (rule.status === "deprecated" || rule.status === "draft") continue;
    const verdict = judge(rule, prepared);
    if (verdict.violation) {
      findings.push({
        rule: rule.id,
        // trial rules never block — they observe until promoted (rubric lifecycle)
        severity: rule.status === "trial" ? "info" : rule.severity,
        message: `${rule.check}${verdict.note ? ` (${verdict.note})` : ""}`,
        status: rule.status
      });
    }
  }
  return findings;
}

/* ── natural-language entry (T-505) ── */

/** `hx rubric add "colloquial check"` → draft rule; a human refines pattern/severity, then promotes to trial. */
export function addRubricRule(ws: Workspace, text: string, opts: { pattern?: string; severity?: RubricRule["severity"] } = {}): { file: string; rule: RubricRule } {
  const dir = path.join(ws.assetsDir, "rubrics", "team-review");
  ensureDir(dir);
  const file = path.join(dir, "rules.yaml");
  const rubric: RubricFile = fs.existsSync(file) ? readRubric(file) : { rules: [] };
  const rule: RubricRule = {
    id: `rule-${String(rubric.rules.length + 1).padStart(3, "0")}`,
    status: "draft",
    check: text.trim(),
    pattern: opts.pattern,
    severity: opts.severity ?? "warn",
    falsePositives: 0,
    evaluations: 0
  };
  rubric.rules.push(rule);
  writeYaml(file, rubric);
  return { file, rule };
}

/** false-positive statistics hook: reviewers mark misfires; high FP rate → candidate for retirement. */
export function recordRubricFeedback(file: string, ruleId: string, falsePositive: boolean): RubricRule {
  const rubric = readRubric(file);
  const rule = rubric.rules.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`rule ${ruleId} not found in ${file}`);
  rule.evaluations = (rule.evaluations ?? 0) + 1;
  if (falsePositive) rule.falsePositives = (rule.falsePositives ?? 0) + 1;
  writeYaml(file, rubric);
  return rule;
}
