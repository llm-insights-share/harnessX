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
import type { DeliveryStage } from "./stages.js";
import { loadSkillPackage } from "./skill.js";

/**
 * T-202 (FR-030/NFR-002): assembles the per-task Context Pack an agent
 * receives before working.
 */

const TASK_ARTIFACTS: Record<string, string[]> = {
  "req.requirements-research": ["explore.md"],
  "dev.propose": ["proposal.md"],
  "dev.design": ["proposal.md"],
  "dev.plan": ["tasks.md"],
  "test.test-case-design": ["tasks.md"],
  "dev.apply": ["tasks.md"],
  "dev.verify": ["tasks.md"],
  "dev.archive": []
};

const TASK_PERMISSIONS: Record<string, string> = {
  "req.requirements-research": "READ-ONLY. You may read any file; you must not modify code or specs.",
  "req.prd-writing": "You may edit docs/prd/** only. Do not create change artifacts or code.",
  "arch.subsystem-division": "You may edit docs/architecture/overview.md, registry.yaml, and adr/**. No change artifacts or code.",
  "arch.internal-interface": "You may edit docs/architecture/modules/<module>/** for the target module only.",
  "dev.propose": "You may edit changes/<id>/proposal.md, requirements/**, and changes/<id>/specs/**.",
  "dev.design": "You may edit changes/<id>/design/**, design.md, and changes/<id>/specs/**.",
  "dev.plan": "You may edit only changes/<id>/tasks.md and traces/delivery-trace.yaml.",
  "test.test-case-design": "You may edit changes/<id>/test-cases/** and tasks.md test-track items only.",
  "dev.apply": "You may edit source code and tests for unchecked tasks in tasks.md. Never edit meta.yaml, fixtures, or approved test assertions.",
  "dev.verify": "You may fix code to satisfy sensors. Never weaken tests or specs to make sensors pass.",
  "dev.archive": "No edits. Archival is performed by the hx CLI."
};

export interface ContextPack {
  stage: DeliveryStage;
  task: string;
  change: string;
  persona: string;
  permissions: string;
  sections: { title: string; source: string; content: string }[];
  assembledInMs: number;
}

function taskKey(stage: DeliveryStage, task: string): string {
  return `${stage}.${task}`;
}

function pushArtifact(sections: ContextPack["sections"], title: string, file: string) {
  if (fs.existsSync(file)) sections.push({ title, source: file, content: fs.readFileSync(file, "utf8") });
}

function pushSkillArtifacts(ws: Workspace, sections: ContextPack["sections"], g: GuideDef) {
  try {
    const pkg = loadSkillPackage(ws.base, g.source);
    const skillRoot = path.join(ws.base, pkg.rootRel);
    for (const f of pkg.files) {
      const rel = f.rel.replace(/\\/g, "/");
      const abs = path.join(skillRoot, f.rel);
      const title = rel === pkg.entryRel ? `Guide: ${g.id} (${g.kind})` : `Guide resource: ${g.id}/${rel}`;
      sections.push({ title, source: abs, content: f.content });
    }
  } catch {
    pushArtifact(sections, `Guide: ${g.id} (${g.kind})`, path.join(ws.base, g.source));
  }
}

function pushGuideArtifacts(ws: Workspace, sections: ContextPack["sections"], g: GuideDef) {
  if (g.kind === "guide.skill") pushSkillArtifacts(ws, sections, g);
  else pushArtifact(sections, `Guide: ${g.id} (${g.kind})`, path.join(ws.base, g.source));
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

function pushOrgContext(ws: Workspace, change: string, stage: DeliveryStage, task: string, sections: ContextPack["sections"]) {
  if (stage === "dev" && task === "propose") {
    const slug = resolvePrdSlug(ws, change);
    if (slug && fs.existsSync(ws.prdFile(slug))) pushArtifact(sections, `Org PRD: ${slug}`, ws.prdFile(slug));
  }
  if (stage === "dev" && ["design", "plan", "apply", "verify"].includes(task)) {
    if (fs.existsSync(ws.archOverviewFile())) pushArtifact(sections, "Org architecture HLD", ws.archOverviewFile());
    if (fs.existsSync(ws.archRegistryFile())) pushArtifact(sections, "Org module registry", ws.archRegistryFile());
    try {
      for (const mod of resolveModulesForChange(ws, change)) {
        const lld = ws.archModuleLld(mod.id);
        if (fs.existsSync(lld)) pushArtifact(sections, `Org module LLD: ${mod.id}`, lld);
      }
    } catch {
      /* change meta may be incomplete during early scaffolding */
    }
  }
}

export function guidesForTask(ws: Workspace, stage: DeliveryStage, task: string): GuideDef[] {
  const harness = ws.readHarness();
  return harness.guides
    .filter((g) => g.stage === stage && (!g.task || g.task === task))
    .sort((a: GuideDef, b: GuideDef) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function buildContextPack(ws: Workspace, change: string, stage: DeliveryStage, task: string): ContextPack {
  const t0 = Date.now();
  const meta = readMeta(ws, change);
  const sections: ContextPack["sections"] = [];
  const key = taskKey(stage, task);

  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);

  for (const g of guidesForTask(ws, stage, task)) {
    pushGuideArtifacts(ws, sections, g);
  }

  for (const artifact of TASK_ARTIFACTS[key] ?? []) {
    pushArtifact(sections, `Artifact: ${artifact}`, path.join(ws.changeDir(change), artifact));
  }

  if (stage === "dev" && ["propose", "design"].includes(task)) pushRequirements(ws, change, sections);
  pushOrgContext(ws, change, stage, task, sections);
  if (stage === "dev" && ["design", "plan", "apply", "verify"].includes(task)) pushDesignArtifacts(ws, change, sections);

  const traceFile = ws.deliveryTraceFile(change);
  if (fs.existsSync(traceFile) && stage === "dev" && ["plan", "apply", "verify"].includes(task)) {
    pushArtifact(sections, "Delivery trace", traceFile);
  }

  if (stage === "dev" && ["design", "plan", "apply", "verify"].includes(task)) {
    const dir = ws.deltaSpecsDir(change);
    if (fs.existsSync(dir)) {
      for (const cap of fs.readdirSync(dir)) {
        pushArtifact(sections, `Delta spec: ${cap}`, path.join(dir, cap, "spec.md"));
      }
    }
  }

  return {
    stage,
    task,
    change,
    persona: `You are the ${stage}/${task} agent for change "${change}" (profile: ${meta.profile}, domains: ${meta.touchedDomains.join(", ")}).`,
    permissions: TASK_PERMISSIONS[key] ?? "No special permissions.",
    sections,
    assembledInMs: Date.now() - t0
  };
}

/** Task-scoped pack for apply handoff: requirement slice + LLD + code hints only. */
export function buildTaskPack(ws: Workspace, change: string, task: Task): ContextPack {
  const t0 = Date.now();
  const sections: ContextPack["sections"] = [];

  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);

  const harness = ws.readHarness();
  for (const g of harness.guides.filter((x) => x.kind === "guide.skill" && x.stage === "dev" && x.task === "apply")) {
    pushSkillArtifacts(ws, sections, g);
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
    stage: "dev",
    task: "apply",
    change,
    persona: `You are implementing task ${task.id} [${task.track}] for "${task.requirement}" (${task.capability}).`,
    permissions: TASK_PERMISSIONS["dev.apply"],
    sections,
    assembledInMs: Date.now() - t0
  };
}

export function renderContextPack(pack: ContextPack): string {
  const parts = [
    `# Context Pack — ${pack.stage}/${pack.task} / ${pack.change}`,
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

/** Req-stage context pack for organization PRD authoring. */
export function buildPrdPack(ws: Workspace, slug: string): ContextPack {
  const t0 = Date.now();
  const sections: ContextPack["sections"] = [];
  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);
  for (const g of guidesForTask(ws, "req", "prd-writing")) {
    pushGuideArtifacts(ws, sections, g);
  }
  pushArtifact(sections, "PRD document", ws.prdFile(slug));
  return {
    stage: "req",
    task: "prd-writing",
    change: slug,
    persona: `You are the PRD authoring agent for "${slug}".`,
    permissions: TASK_PERMISSIONS["req.prd-writing"],
    sections,
    assembledInMs: Date.now() - t0
  };
}

/** Arch-stage context pack for global HLD or a specific module LLD. */
export function buildArchPack(ws: Workspace, moduleId?: string): ContextPack {
  const t0 = Date.now();
  const sections: ContextPack["sections"] = [];
  pushArtifact(sections, "Constitution (highest priority)", ws.constitutionFile);
  if (moduleId) {
    for (const g of guidesForTask(ws, "arch", "internal-interface")) {
      pushGuideArtifacts(ws, sections, g);
    }
    pushArtifact(sections, "Global HLD", ws.archOverviewFile());
    pushArtifact(sections, "Module registry", ws.archRegistryFile());
    pushArtifact(sections, `Module LLD: ${moduleId}`, ws.archModuleLld(moduleId));
    return {
      stage: "arch",
      task: "internal-interface",
      change: moduleId,
      persona: `You are the module LLD agent for "${moduleId}".`,
      permissions: TASK_PERMISSIONS["arch.internal-interface"],
      sections,
      assembledInMs: Date.now() - t0
    };
  }
  for (const g of guidesForTask(ws, "arch", "subsystem-division")) {
    pushGuideArtifacts(ws, sections, g);
  }
  pushArtifact(sections, "Global HLD", ws.archOverviewFile());
  pushArtifact(sections, "Module registry", ws.archRegistryFile());
  return {
    stage: "arch",
    task: "subsystem-division",
    change: "-",
    persona: "You are the global architecture (HLD) agent.",
    permissions: TASK_PERMISSIONS["arch.subsystem-division"],
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
