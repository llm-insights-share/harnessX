import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { initMeta, readMeta } from "./metaStore.js";
import type { MetaYaml } from "./schemas.js";

export interface OverlapWarning {
  otherChange: string;
  domains: string[];
}

/** FR-011: creating a change requires declared domains; overlaps with active changes are warned. */
export function detectOverlaps(ws: Workspace, domains: string[], exclude?: string): OverlapWarning[] {
  const warnings: OverlapWarning[] = [];
  for (const other of ws.listChanges()) {
    if (other === exclude) continue;
    let meta: MetaYaml;
    try {
      meta = readMeta(ws, other);
    } catch {
      continue;
    }
    const shared = meta.touchedDomains.filter((d) => domains.includes(d));
    if (shared.length > 0) warnings.push({ otherChange: other, domains: shared });
  }
  return warnings;
}

export interface CreateChangeResult {
  meta: MetaYaml;
  warnings: OverlapWarning[];
}

export function createChange(ws: Workspace, id: string, domains: string[], profile?: string): CreateChangeResult {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`invalid change id "${id}" (use kebab-case)`);
  if (fs.existsSync(ws.changeDir(id))) throw new Error(`change "${id}" already exists`);
  if (domains.length === 0) throw new Error("declare touched domains with --domains (FR-011)");

  const warnings = detectOverlaps(ws, domains);
  const config = ws.readConfig();
  const meta = initMeta(ws, id, profile ?? config.profile, domains);
  for (const sub of ["specs", "traces", "runs"]) ensureDir(path.join(ws.changeDir(id), sub));
  return { meta, warnings };
}

function readTemplate(ws: Workspace, source: string): string {
  const f = path.join(ws.base, source);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
}

function isZhCn(ws: Workspace): boolean {
  try {
    return ws.readConfig().locale === "zh-CN";
  } catch {
    return false;
  }
}

/** FR-003: scaffold proposal.md from the guide.template asset + an initial delta spec draft. */
export function scaffoldProposal(ws: Workspace, change: string, title: string): { proposalFile: string; deltaFile: string } {
  const meta = readMeta(ws, change);
  const harness = ws.readHarness();
  const tpl = harness.guides.find((g) => g.id === "proposal-template");
  const zh = isZhCn(ws);
  const fallback = zh
    ? "# Proposal: {{title}}\n\n## Why\n\n## What Changes\n\n## Impact\n"
    : "# Proposal: {{title}}\n\n## Why\n\n## What Changes\n\n## Impact\n";
  const raw = tpl ? readTemplate(ws, tpl.source) : fallback;
  const proposalFile = path.join(ws.changeDir(change), "proposal.md");
  fs.writeFileSync(proposalFile, raw.replaceAll("{{title}}", title), "utf8");

  const capability = meta.touchedDomains[0] ?? "core";
  const deltaFile = path.join(ws.deltaSpecsDir(change), capability, "spec.md");
  if (!fs.existsSync(deltaFile)) {
    ensureDir(path.dirname(deltaFile));
    const deltaLines = zh
      ? [
          `# Delta for ${capability}`,
          "",
          "## ADDED Requirements",
          "",
          `### Requirement: ${title}`,
          `WHEN <触发条件>, THE SYSTEM SHALL <可度量响应>`,
          "",
          "#### Scenario: happy path",
          "- GIVEN ...",
          "- WHEN ...",
          "- THEN ...",
          ""
        ]
      : [
          `# Delta for ${capability}`,
          "",
          "## ADDED Requirements",
          "",
          `### Requirement: ${title}`,
          `WHEN <trigger>, THE SYSTEM SHALL <measurable response>`,
          "",
          "#### Scenario: happy path",
          "- GIVEN ...",
          "- WHEN ...",
          "- THEN ...",
          ""
        ];
    fs.writeFileSync(deltaFile, deltaLines.join("\n"), "utf8");
  }
  return { proposalFile, deltaFile };
}

/** FR-002: read-only exploration notes. Callers must not modify code during explore. */
export function scaffoldExplore(ws: Workspace, change: string, topic: string): string {
  const f = path.join(ws.changeDir(change), "explore.md");
  const zh = isZhCn(ws);
  const body = zh
    ? `# Exploration: ${topic}\n\n> 只读阶段（FR-002）：在此记录发现；禁止修改代码。\n\n## Questions\n\n## Findings\n\n## Recommendation\n`
    : `# Exploration: ${topic}\n\n> Read-only phase (FR-002): record findings here; do not modify code.\n\n## Questions\n\n## Findings\n\n## Recommendation\n`;
  fs.writeFileSync(f, body, "utf8");
  return f;
}

/** FR-004: design doc with ADR entries and architecture constraints. */
export function scaffoldDesign(ws: Workspace, change: string): string {
  const f = path.join(ws.changeDir(change), "design.md");
  const harness = ws.readHarness();
  const tpl = harness.guides.find((g) => g.id === "design-template");
  if (tpl) {
    const raw = readTemplate(ws, tpl.source);
    if (raw) {
      fs.writeFileSync(f, raw.replaceAll("{{change}}", change), "utf8");
      return f;
    }
  }
  const zh = isZhCn(ws);
  const lines = zh
    ? [
        `# Design: ${change}`,
        "",
        "## Context",
        "",
        "## Decisions (ADR)",
        "",
        "### ADR-1: <决策标题>",
        "- Status: proposed",
        "- Decision: ",
        "- Consequences: ",
        "",
        "## Architecture Constraints",
        "",
        "- <arch-boundary 等传感器应检查的约束>",
        ""
      ]
    : [
        `# Design: ${change}`,
        "",
        "## Context",
        "",
        "## Decisions (ADR)",
        "",
        "### ADR-1: <decision title>",
        "- Status: proposed",
        "- Decision: ",
        "- Consequences: ",
        "",
        "## Architecture Constraints",
        "",
        "- <constraint that arch-boundary sensors should enforce>",
        ""
      ];
  fs.writeFileSync(f, lines.join("\n"), "utf8");
  return f;
}

export function proposalExists(ws: Workspace, change: string): boolean {
  return fs.existsSync(path.join(ws.changeDir(change), "proposal.md"));
}

/** Proposal completeness check used by the propose gate (T-209). */
export function proposalProblems(ws: Workspace, change: string): string[] {
  const f = path.join(ws.changeDir(change), "proposal.md");
  if (!fs.existsSync(f)) return ["proposal.md missing — run: hx propose"];
  const text = fs.readFileSync(f, "utf8");
  const problems: string[] = [];
  for (const section of ["## Why", "## What Changes", "## Impact"]) {
    if (!text.includes(section)) problems.push(`proposal.md missing section "${section}"`);
  }
  if (/\{\{title\}\}/.test(text)) problems.push("proposal.md still contains unfilled {{title}} placeholder");
  return problems;
}
