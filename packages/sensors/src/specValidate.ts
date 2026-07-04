import fs from "node:fs";
import { listDeltaFiles, parseDelta } from "@harnessx/core/artifactStore.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

/**
 * FR-022: validates OpenSpec-compatible delta files.
 * - structural: at least one delta section; every Requirement has >=1 Scenario
 * - EARS (five patterns): requirement text must contain SHALL, and conditional
 *   keywords must come with both trigger and response parts
 * - testability heuristics: flags vague, unmeasurable wording
 */

const VAGUE_WORDS = /\b(quickly|user-friendly|appropriately|as needed|robust|seamless|etc\.?)\b/i;

export function checkEars(text: string): string[] {
  const problems: string[] = [];
  const t = text.replace(/\s+/g, " ").trim();
  if (t === "" || /^WHEN <trigger>/.test(t)) {
    problems.push("requirement text is empty or an unfilled placeholder");
    return problems;
  }
  if (!/\bSHALL\b/.test(t)) {
    problems.push("missing SHALL — use an EARS pattern (ubiquitous / WHEN / WHILE / WHERE / IF...THEN)");
    return problems;
  }
  const kw = t.match(/^\s*(WHEN|WHILE|WHERE|IF)\b/i)?.[1]?.toUpperCase();
  if (kw) {
    const [trigger] = t.split(/\bTHE SYSTEM\b|\bTHEN\b/i);
    if (!trigger || trigger.replace(/^(WHEN|WHILE|WHERE|IF)/i, "").trim().length < 3)
      problems.push(`${kw} clause has no trigger/condition content`);
    if (kw === "IF" && !/\bTHEN\b/i.test(t)) problems.push("IF pattern requires THEN before the SHALL response");
  }
  const response = t.split(/\bSHALL\b/i)[1]?.trim() ?? "";
  if (response.length < 3) problems.push("SHALL has no response content");
  const vague = t.match(VAGUE_WORDS);
  if (vague) problems.push(`unmeasurable wording "${vague[0]}" — quantify the behaviour`);
  return problems;
}

export const specValidate = (ctx: SensorContext): SensorReport => {
  const findings: Finding[] = [];
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "spec-validate requires a change id", findings: [] };

  const deltas = listDeltaFiles(ctx.ws, ctx.change);
  if (deltas.length === 0) {
    findings.push({ severity: "block", message: "no delta specs found under changes/<id>/specs/<capability>/spec.md" });
  }
  for (const { capability, file } of deltas) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    if (delta.sections.length === 0) {
      findings.push({
        file,
        severity: "block",
        rule: "delta-format",
        message: `${capability}: no "## ADDED|MODIFIED|REMOVED Requirements" section found`,
        fix_hint: "Wrap requirements in a delta section heading, e.g. `## ADDED Requirements`"
      });
      continue;
    }
    for (const section of delta.sections) {
      for (const req of section.requirements) {
        if (section.op !== "REMOVED" && req.scenarios.length === 0) {
          findings.push({
            file,
            severity: "block",
            rule: "scenario-required",
            message: `${capability} / "${req.name}": requirement has no Scenario`,
            fix_hint: "Add at least one `#### Scenario:` block with GIVEN/WHEN/THEN bullets"
          });
        }
        if (section.op !== "REMOVED") {
          for (const p of checkEars(req.text)) {
            findings.push({
              file,
              severity: "block",
              rule: "ears",
              message: `${capability} / "${req.name}": ${p}`,
              fix_hint: "Rewrite as EARS, e.g. `WHEN <trigger>, THE SYSTEM SHALL <measurable response>`"
            });
          }
        }
      }
      if (section.requirements.length === 0) {
        findings.push({
          file,
          severity: "warn",
          rule: "empty-section",
          message: `${capability}: empty ${section.op} section`
        });
      }
    }
  }
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary: blockers.length
      ? `${blockers.length} spec problem(s) across ${deltas.length} delta file(s)`
      : `all ${deltas.length} delta file(s) valid`,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length
      ? "Open each file listed in findings, apply the fix_hint, then re-run: hx gate check"
      : undefined,
    fix_command: blockers.length ? `hx fix --change ${ctx.change} --sensor ${ctx.def.id}` : undefined
  };
};
