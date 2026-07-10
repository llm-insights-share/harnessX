import fs from "node:fs";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import { resolvePrdSlug, isStageApproved } from "@harnessx/core";
import type { SensorContext } from "./types.js";
import { hasPlaceholderContent, isPlaceholderTableRow } from "./placeholder.js";

function block(findings: Finding[], ctx: SensorContext, summary: string): SensorReport {
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length ? "Fix each finding, then re-run hx prd check." : undefined
  };
}

function hasSection(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** prd-complete: organization PRD at docs/prd/<slug>.md */
export const prdComplete = (ctx: SensorContext): SensorReport => {
  const slug = ctx.prdSlug ?? (ctx.change ? resolvePrdSlug(ctx.ws, ctx.change) : undefined);
  if (!slug) {
    return block(
      [{ severity: "block", message: "PRD slug unknown — pass prdSlug or link via meta.prdRef / docs/prd/<change>.md" }],
      ctx,
      "PRD not linked"
    );
  }
  const file = ctx.ws.prdFile(slug);
  const findings: Finding[] = [];
  if (!fs.existsSync(file)) {
    findings.push({ severity: "block", message: `PRD missing — run: hx prd init ${slug} --title "..."` });
    return block(findings, ctx, "PRD file missing");
  }
  const text = fs.readFileSync(file, "utf8");
  if (!hasSection(text, [/##\s*(用户故事|User Stories)/i])) {
    findings.push({ severity: "block", message: "missing User Stories section" });
  }
  if (!hasSection(text, [/##\s*(验收标准|Acceptance Criteria)/i])) {
    findings.push({ severity: "block", message: "missing Acceptance Criteria section" });
  }
  if (!hasSection(text, [/###\s*In Scope|##\s*范围|In Scope/i])) {
    findings.push({ severity: "block", message: "missing In Scope section" });
  }
  if (!hasSection(text, [/Out of Scope|Out of Scope/i])) {
    findings.push({ severity: "block", message: "missing Out of Scope section" });
  }
  if (!hasSection(text, [/非功能|Non-Functional|NFR/i])) {
    findings.push({ severity: "block", message: "missing NFR section" });
  }
  if (!hasSection(text, [/评审结论|Review Conclusion/i])) {
    findings.push({ severity: "block", message: "missing Review Conclusion section" });
  }
  if (!/\bAC-\d+/i.test(text) && !/Given|When|Then|GIVEN|WHEN|THEN/.test(text)) {
    findings.push({ severity: "block", message: "no acceptance criteria (AC-xxx or GWT) found" });
  }
  if (!/\bUS-\d+/i.test(text) && !/\|\s*US-/i.test(text)) {
    findings.push({ severity: "warn", message: "no user story IDs (US-xxx) found" });
  }
  if (/##\s*风险/.test(text) && !/\bR-\d+/.test(text)) {
    findings.push({ severity: "warn", message: "risk section present but no R-xxx entries" });
  }
  if (hasPlaceholderContent(text)) {
    findings.push({ severity: "block", message: "PRD still contains template placeholders — replace TODO/TBD/empty table rows" });
  }
  for (const line of text.split("\n")) {
    if (isPlaceholderTableRow(line) && /\bUS-\d+|\bAC-\d+/i.test(line) === false) {
      findings.push({ severity: "warn", message: `placeholder table row: ${line.trim().slice(0, 60)}` });
      break;
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} PRD issue(s)` : "PRD complete");
};

/** prd-approved: human sign-off recorded for linked PRD slug */
export const prdApproved = (ctx: SensorContext): SensorReport => {
  const slug = ctx.prdSlug ?? (ctx.change ? resolvePrdSlug(ctx.ws, ctx.change) : undefined);
  if (!slug) {
    return block([{ severity: "block", message: "PRD slug unknown for approval check" }], ctx, "PRD not linked");
  }
  if (!isStageApproved(ctx.ws, "req", slug)) {
    return block(
      [
        {
          severity: "block",
          message: `PRD "${slug}" not approved — run: hx gate approve --gate prd --prd ${slug} --approver <name>`
        }
      ],
      ctx,
      "PRD not approved"
    );
  }
  return block([], ctx, `PRD "${slug}" approved`);
};
