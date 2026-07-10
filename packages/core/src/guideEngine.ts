import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { listDeltaFiles } from "./artifactStore.js";
import { resolveDesignOverview } from "./designLayout.js";
import { readDeliveryTrace } from "./deliveryTrace.js";
import { findTask, type Task } from "./plan.js";
import { resolvePrdSlug } from "./prd.js";
import { resolveModulesForChange } from "./arch.js";
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
  design: ["proposal.md"],
  spec: ["proposal.md"],
  plan: ["tasks.md"],
  "test-design": ["tasks.md"],
  apply: ["tasks.md"],
  verify: ["tasks.md"],
  archive: []
};

const PHASE_PERMISSIONS: Record<string, string> = {
  explore: "READ-ONLY. You may read any file; you must not modify code or specs.",
  prd: "You may edit docs/prd/** only. Do not create change artifacts or code.",
  arch: "You may edit docs/architecture/overview.md, registry.yaml, and adr/**. No change artifacts or code.",
  "arch-lld": "You may edit docs/architecture/modules/<module>/** for the target module only.",
  propose: "You may edit changes/<id>/proposal.md, requirements/**, and changes/<id>/specs/**.",
  design: "You may edit changes/<id>/design/**, design.md, and changes/<id>/specs/**.",
  spec: "You may edit only changes/<id>/specs/**.",
  plan: "You may edit only changes/<id>/tasks.md and traces/delivery-trace.yaml.",
  "test-design": "You may edit changes/<id>/test-cases/** and tasks.md test-track items only.",
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

function pushArtifact(sections: ContextPack["sections"], title: string, file: string) {
  if (fs.existsSync(file)) sections.push({ title, source: file, content: fs.readFileSync(file, "utf8") });
}

function pushRequirements(ws: Workspace, change: string, sections: ContextPack["sections"]) {
  const dir = ws.requirementsDir(change);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, name);
    if (fs.statSync(f).isFile()) pushArtifact(sections, `Requirements: ${name}`, f);
  }
}

function pushDesignArtifacts(ws: Workspace, change: string, sections: ContextPack["sections"]) {
  const overview = resolveDesignOverview(ws, change);
  if (overview) pushArtifact(sections, "Design: overview (HLD)", overview);
  const designDir = ws.designDir(change);
  if (!fs.existsSync(designDir)) return;
  const visit = (dir: string, prefix: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) visit(abs, rel);
      else if (e.name !== "overview.md") pushArtifact(sections, `Design LLD: ${rel}`, abs);
    }
  };
  visit(designDir, "");
}

/** Inject org-level PRD and architecture into change phase context packs. */
function pushOrgPrephaseContext(ws: Workspace, change: string, phaseCmd: string, sections: ContextPack["sections"]) {
  if (!["propose", "design", "spec", "plan", "apply", "verify", "test-design"].includes(phaseCmd)) return;

  const slug = resolvePrdSlug(ws, change);
  if (slug && fs.existsSync(ws.prdFile(slug))) {
    pushArtifact(sections, `Org PRD: ${slug}`, ws.prdFile(slug));
  }

  if (!["design", "spec", "plan", "apply", "verify"].includes(phaseCmd)) return;

  if (fs.existsSync(ws.archOverviewFile())) {
    pushArtifact(sections, "Org architecture HLD", ws.archOverviewFile());
  }
  if (fs.existsSync(ws.archRegistryFile())) {
    pushArtifact(sections, "Org module registry", ws.archRegistryFile());
  }
  try {
    for (const mod of resolveModulesForChange(ws, change)) {
      const lld = ws.archModuleLld(mod.id);
      if (fs.existsSync(lld)) pushArtifact(sections, `Org module LLD: ${mod.id}`, lld);
    }
  } catch {
    /* change meta may be incomplete during early scaffolding */
  }
}

export function buildContextPack(ws: Workspace, change: string, phaseCmd: string): ContextPack {
  const t0 = Date.now();
  const harness = ws.readHarness();
  const meta = readMeta(ws, change);
  const sections: ContextPack["sections"] = [];

  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);

  const guides = harness.guides
    .filter((g) => g.phase.length === 0 || g.phase.includes(phaseCmd))
    .sort((a: GuideDef, b: GuideDef) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const g of guides) pushArtifact(sections, `Guide: ${g.id} (${g.kind})`, path.join(ws.base, g.source));

  for (const artifact of PHASE_ARTIFACTS[phaseCmd] ?? []) {
    pushArtifact(sections, `Artifact: ${artifact}`, path.join(ws.changeDir(change), artifact));
  }

  if (["propose", "design", "spec"].includes(phaseCmd)) pushRequirements(ws, change, sections);
  pushOrgPrephaseContext(ws, change, phaseCmd, sections);
  if (["design", "spec", "plan", "apply", "verify"].includes(phaseCmd)) pushDesignArtifacts(ws, change, sections);

  const traceFile = ws.deliveryTraceFile(change);
  if (fs.existsSync(traceFile) && ["plan", "apply", "verify"].includes(phaseCmd)) {
    pushArtifact(sections, "Delivery trace", traceFile);
  }

  if (["spec", "plan", "apply", "verify", "test-design"].includes(phaseCmd)) {
    const dir = ws.deltaSpecsDir(change);
    if (fs.existsSync(dir)) {
      for (const cap of fs.readdirSync(dir)) {
        pushArtifact(sections, `Delta spec: ${cap}`, path.join(dir, cap, "spec.md"));
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

/** Task-scoped pack for apply handoff: requirement slice + LLD + code hints only. */
export function buildTaskPack(ws: Workspace, change: string, task: Task): ContextPack {
  const t0 = Date.now();
  const meta = readMeta(ws, change);
  const sections: ContextPack["sections"] = [];

  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);

  const harness = ws.readHarness();
  for (const g of harness.guides.filter((x) => x.kind === "guide.skill" && x.phase.includes("apply"))) {
    pushArtifact(sections, `Guide: ${g.id}`, path.join(ws.base, g.source));
  }

  pushArtifact(sections, "Task", path.join(ws.changeDir(change), "tasks.md"));

  for (const { capability, file } of listDeltaFiles(ws, change)) {
    if (capability !== task.capability) continue;
    const spec = fs.readFileSync(file, "utf8");
    const reqBlock = spec.split(/### Requirement:/).find((b) => b.includes(task.requirement));
    if (reqBlock) {
      sections.push({
        title: `Requirement: ${task.requirement}`,
        source: file,
        content: `### Requirement:${reqBlock}`.trim()
      });
      break;
    }
  }

  if (task.designRef) {
    const designPath = path.join(ws.changeDir(change), task.designRef);
    pushArtifact(sections, `LLD: ${task.designRef}`, designPath);
  } else {
    const overview = resolveDesignOverview(ws, change);
    if (overview) pushArtifact(sections, "Design overview (fallback)", overview);
  }

  const trace = readDeliveryTrace(ws, change);
  const entry = trace.requirements[`${task.capability}/${task.requirement}`];
  if (entry) {
    sections.push({
      title: "Delivery trace entry",
      source: ws.deliveryTraceFile(change),
      content: JSON.stringify(entry, null, 2)
    });
  }

  if (task.filesHint) {
    sections.push({
      title: "Code targets",
      source: "tasks.md",
      content: task.filesHint.split(",").map((f) => `- ${f.trim()}`).join("\n")
    });
  }

  return {
    phase: "apply",
    change,
    persona: `You are implementing task ${task.id} [${task.track}] for "${task.requirement}" (${task.capability}).`,
    permissions: PHASE_PERMISSIONS.apply,
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

function guidesForPhase(ws: Workspace, phaseCmd: string): GuideDef[] {
  const harness = ws.readHarness();
  return harness.guides
    .filter((g) => g.phase.length === 0 || g.phase.includes(phaseCmd))
    .sort((a: GuideDef, b: GuideDef) => (b.priority ?? 0) - (a.priority ?? 0));
}

function pushGuides(ws: Workspace, phaseCmd: string, sections: ContextPack["sections"]) {
  for (const g of guidesForPhase(ws, phaseCmd)) {
    pushArtifact(sections, `Guide: ${g.id} (${g.kind})`, path.join(ws.base, g.source));
  }
}

/** Pre-phase context pack for organization PRD authoring. */
export function buildPrdPack(ws: Workspace, slug: string): ContextPack {
  const t0 = Date.now();
  const sections: ContextPack["sections"] = [];
  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);
  pushGuides(ws, "prd", sections);
  pushArtifact(sections, "PRD document", ws.prdFile(slug));
  return {
    phase: "prd",
    change: slug,
    persona: `You are the PRD authoring agent for "${slug}".`,
    permissions: PHASE_PERMISSIONS.prd,
    sections,
    assembledInMs: Date.now() - t0
  };
}

/** Pre-phase context pack for global HLD or a specific module LLD. */
export function buildArchPack(ws: Workspace, moduleId?: string): ContextPack {
  const t0 = Date.now();
  const sections: ContextPack["sections"] = [];
  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);
  if (moduleId) {
    pushGuides(ws, "arch-lld", sections);
    pushArtifact(sections, "Global HLD", ws.archOverviewFile());
    pushArtifact(sections, "Module registry", ws.archRegistryFile());
    pushArtifact(sections, `Module LLD: ${moduleId}`, ws.archModuleLld(moduleId));
    return {
      phase: "arch-lld",
      change: moduleId,
      persona: `You are the module LLD agent for "${moduleId}".`,
      permissions: PHASE_PERMISSIONS["arch-lld"],
      sections,
      assembledInMs: Date.now() - t0
    };
  }
  pushGuides(ws, "arch", sections);
  pushArtifact(sections, "Global HLD", ws.archOverviewFile());
  pushArtifact(sections, "Module registry", ws.archRegistryFile());
  return {
    phase: "arch",
    change: "-",
    persona: "You are the global architecture (HLD) agent.",
    permissions: PHASE_PERMISSIONS.arch,
    sections,
    assembledInMs: Date.now() - t0
  };
}

export function writeTaskPack(ws: Workspace, change: string, taskId: string): { file: string; pack: ContextPack } {
  const task = findTask(ws, change, taskId);
  if (!task) throw new Error(`task "${taskId}" not found in ${change}`);
  const pack = buildTaskPack(ws, change, task);
  const file = path.join(ws.changeDir(change), "tasks", `${taskId}-pack.md`);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, renderContextPack(pack));
  return { file, pack };
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}
