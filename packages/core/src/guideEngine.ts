import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import type { GuideDef } from "./schemas.js";

/**
 * T-202 (FR-030/NFR-002): assembles the per-phase Context Pack an agent
 * receives before working. Includes persona + permission declaration, the
 * constitution, phase-relevant guides and change artifacts; excludes
 * artifacts from other changes and later-phase noise.
 */

const PHASE_ARTIFACTS: Record<string, string[]> = {
  explore: ["explore.md"],
  propose: ["proposal.md"],
  design: ["proposal.md", "design.md"],
  spec: ["proposal.md", "design.md"],
  plan: ["design.md", "tasks.md"],
  apply: ["design.md", "tasks.md"],
  verify: ["tasks.md"],
  archive: []
};

const PHASE_PERMISSIONS: Record<string, string> = {
  explore: "READ-ONLY. You may read any file; you must not modify code or specs.",
  propose: "You may edit only changes/<id>/proposal.md and changes/<id>/specs/**.",
  design: "You may edit only changes/<id>/design.md and changes/<id>/specs/**.",
  spec: "You may edit only changes/<id>/specs/**.",
  plan: "You may edit only changes/<id>/tasks.md.",
  apply: "You may edit source code and tests for unchecked tasks in tasks.md. Never edit meta.yaml, fixtures, or approved test assertions.",
  verify: "You may fix code to satisfy sensors. Never weaken tests or specs to make sensors pass.",
  archive: "No edits. Archival is performed by the hx CLI."
};

export interface ContextPack {
  phase: string;
  change: string;
  persona: string;
  permissions: string;
  sections: { title: string; source: string; content: string }[];
  assembledInMs: number;
}

export function buildContextPack(ws: Workspace, change: string, phaseCmd: string): ContextPack {
  const t0 = Date.now();
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);
  const sections: ContextPack["sections"] = [];

  const push = (title: string, file: string) => {
    if (fs.existsSync(file)) sections.push({ title, source: file, content: fs.readFileSync(file, "utf8") });
  };

  // 1. constitution — always first, highest priority (FR-034)
  push("Constitution (highest priority)", ws.constitutionFile);

  // 2. phase-relevant guides, sorted by priority
  const guides = harness.guides
    .filter((g) => g.phase.length === 0 || g.phase.includes(phaseCmd))
    .sort((a: GuideDef, b: GuideDef) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const g of guides) push(`Guide: ${g.id} (${g.kind})`, path.join(ws.base, g.source));

  // 3. change artifacts for this phase only (exclusion rule: no other changes, no later-phase artifacts)
  for (const artifact of PHASE_ARTIFACTS[phaseCmd] ?? []) {
    push(`Artifact: ${artifact}`, path.join(ws.changeDir(change), artifact));
  }
  // delta specs are relevant from spec phase onward
  if (["spec", "plan", "apply", "verify"].includes(phaseCmd)) {
    const dir = ws.deltaSpecsDir(change);
    if (fs.existsSync(dir)) {
      for (const cap of fs.readdirSync(dir)) {
        push(`Delta spec: ${cap}`, path.join(dir, cap, "spec.md"));
      }
    }
  }

  return {
    phase: phaseCmd,
    change,
    persona: `You are the ${phaseCmd} agent for change "${change}" (profile: ${meta.profile}, domains: ${meta.touchedDomains.join(", ")}).`,
    permissions: PHASE_PERMISSIONS[phaseCmd] ?? "No special permissions.",
    sections,
    assembledInMs: Date.now() - t0
  };
}

export function renderContextPack(pack: ContextPack): string {
  const parts = [
    `# Context Pack — ${pack.phase} / ${pack.change}`,
    "",
    `## Persona`,
    pack.persona,
    "",
    "## Permissions",
    pack.permissions
  ];
  for (const s of pack.sections) {
    parts.push("", `## ${s.title}`, `<!-- source: ${s.source} -->`, s.content.trim());
  }
  return parts.join("\n") + "\n";
}
