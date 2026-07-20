import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { resolveHarnessGuideDef } from "./harnessCompose.js";
import { resolveSuiteName, resolveSuiteSensors } from "./profileResolve.js";
import { STAGE_TASKS, taskById, type DeliveryStage } from "./stages.js";
import type { GuideDef } from "./schemas.js";

/** Marker for the compile-time bound-guides appendix (do not hand-edit generated shells). */
export const BOUND_GUIDES_MARKER = "<!-- harnessx:bound-guides -->";

export interface TaskShell {
  id: string;
  stage: DeliveryStage;
  task: string;
  name: string;
  description: string;
  run: string;
  /** Workflow / command override body (without appendix). */
  body: string;
  /** Auto-assembled pack / bound guides / sensors / gate appendix. */
  appendix: string;
  boundGuides: GuideDef[];
}

const STAGE_COMMAND_DESCRIPTIONS: Record<string, string> = {
  "req.biz-understanding": "Capture business background and problem context",
  "req.requirements-research": "Stakeholder research and findings",
  "req.requirements-analysis": "Problem/user/priority analysis sidecar",
  "req.prototype-design": "Org-level wireframe page inventory",
  "req.prd-writing": "Author or revise org-level PRD",
  "arch.subsystem-division": "Write global architecture HLD",
  "arch.tech-selection": "Fill technology selection in HLD overview",
  "arch.database-design": "Fill database design in HLD overview",
  "arch.interface-design": "Fill external/inter-system interfaces in HLD",
  "arch.key-mechanisms": "Document key design mechanisms / ADRs",
  "arch.internal-interface": "Write module LLD",
  "dev.plan": "Generate dual-track tasks.md",
  "dev.propose": "Draft proposal.md + initial delta specs",
  "dev.design": "Write design.md (requires propose gate)",
  "dev.apply": "Implement task-by-task with fast-suite self-correction",
  "dev.verify": "Run the verification suite + traceability",
  "dev.archive": "Merge deltas into main specs and archive",
  "test.test-case-design": "Design test cases for the change",
  "test.test-execution": "Execute tests, UAT, bugs, and test report"
};

const ORG_RUNS: Record<string, string> = {
  "req.biz-understanding": "hx req check --task biz-understanding --prd <slug>",
  "req.requirements-research": "hx req research init <slug>",
  "req.requirements-analysis": "hx req analysis init <slug>",
  "req.prototype-design": "hx req prototype init <slug>",
  "req.prd-writing": 'hx req prd init <slug> --title "..."',
  "arch.subsystem-division": 'hx arch init --title "..."',
  "arch.tech-selection": "hx arch check --task tech-selection",
  "arch.database-design": "hx arch check --task database-design",
  "arch.interface-design": "hx arch check --task interface-design",
  "arch.key-mechanisms": "hx arch check --task key-mechanisms",
  "arch.internal-interface": 'hx arch lld init <module> --title "..."',
  "test.test-case-design": "hx test-cases init <change>",
  "test.test-execution": "hx test report init <change>"
};

export function slashName(stage: DeliveryStage, task: string): string {
  return `hx-${stage}-${task.replace(/_/g, "-")}`;
}

export function defaultRunForTask(stage: DeliveryStage, task: string): string {
  const key = `${stage}.${task}`;
  if (ORG_RUNS[key]) return ORG_RUNS[key]!;
  if (stage === "dev" || stage === "test") {
    return `hx ${stage === "dev" ? "dev" : "test"} ${task.replace(/-/g, " ")} <change>`;
  }
  return `hx ${stage} ${task}`;
}

function readGuideSource(ws: Workspace, g: GuideDef): string | null {
  const abs = path.join(ws.base, g.source);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return fs.readFileSync(abs, "utf8");
}

/** Skills/templates bound in harness for this stage/task. */
export function boundGuidesFromHarness(ws: Workspace, stage: DeliveryStage, task: string): GuideDef[] {
  const harness = ws.readHarness();
  return harness.guides
    .filter(
      (g) =>
        (g.kind === "guide.skill" || g.kind === "guide.template") &&
        g.stage === stage &&
        (!g.task || g.task === task)
    )
    .sort((a, b) => {
      const pd = (b.priority ?? 0) - (a.priority ?? 0);
      return pd !== 0 ? pd : a.id.localeCompare(b.id);
    });
}

/**
 * Resolve bound skills/templates: harness bindings first, then STAGE_TASKS.guides
 * via resolveHarnessGuideDef (hub-cache / builtin).
 */
export function resolveBoundGuides(ws: Workspace, stage: DeliveryStage, task: string): GuideDef[] {
  const fromHarness = boundGuidesFromHarness(ws, stage, task);
  const byId = new Map(fromHarness.map((g) => [g.id, g]));
  const def = taskById(stage, task);
  for (const guideId of def?.guides ?? []) {
    if (byId.has(guideId)) continue;
    const resolved = resolveHarnessGuideDef(ws, guideId);
    if (resolved && (resolved.kind === "guide.skill" || resolved.kind === "guide.template")) {
      byId.set(resolved.id, resolved);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const pd = (b.priority ?? 0) - (a.priority ?? 0);
    return pd !== 0 ? pd : a.id.localeCompare(b.id);
  });
}

function findEntryGuide(ws: Workspace, stage: DeliveryStage, task: string, kind: "guide.command" | "guide.workflow"): GuideDef | undefined {
  const harness = ws.readHarness();
  return harness.guides.find((g) => g.kind === kind && g.stage === stage && (!g.task || g.task === task));
}

/** True when a task shell can be assembled (workflow, command override, or STAGE_TASKS entry). */
export function hasTaskEntryForTask(ws: Workspace, stage: DeliveryStage, taskId: string): boolean {
  if (findEntryGuide(ws, stage, taskId, "guide.command")) return true;
  if (findEntryGuide(ws, stage, taskId, "guide.workflow")) return true;
  return Boolean(taskById(stage, taskId));
}

function resolveShellBody(ws: Workspace, stage: DeliveryStage, task: string, description: string, run: string): string {
  const command = findEntryGuide(ws, stage, task, "guide.command");
  if (command) {
    const content = readGuideSource(ws, command);
    if (content?.trim()) return content.trimEnd();
  }
  const workflow = findEntryGuide(ws, stage, task, "guide.workflow");
  if (workflow) {
    const content = readGuideSource(ws, workflow);
    if (content?.trim()) return content.trimEnd();
  }
  const name = slashName(stage, task);
  return [`# /${name} — ${description}`, "", `You are running the **${stage}** stage task \`${task}\`.`, "", `CLI entry point: \`${run}\``].join(
    "\n"
  );
}

function packLoadStep(stage: DeliveryStage, task: string): string {
  if (stage === "dev" && task === "apply") {
    return [
      "### 特别上下文 — Load context",
      "1. For each unchecked task: `hx guide task-pack <change> <taskId>` (or read `tasks/<taskId>-pack.md`).",
      "2. Then follow the Bound Skills below (and Templates if any).",
      "Resolve `<change>` / `<taskId>` from the slash-command argument or user message; if missing, ask the user first."
    ].join("\n");
  }
  if (stage === "req") {
    return [
      "### 特别上下文 — Load context",
      "1. Run: `hx guide prd-pack <slug>` (optionally `--out …`).",
      "2. Read the full Context Pack (constitution, bound guides, PRD artifacts).",
      "Resolve `<slug>` from the slash-command argument or user message; if missing, ask the user first."
    ].join("\n");
  }
  if (stage === "arch") {
    return [
      "### 特别上下文 — Load context",
      "1. Run: `hx guide arch-pack` (add `--module <id>` for LLD-scoped work).",
      "2. Read the full Context Pack (constitution, bound guides, architecture artifacts).",
      "If a module id is required and not provided, ask the user first."
    ].join("\n");
  }
  return [
    "### 特别上下文 — Load context",
    `1. Run: \`hx guide pack <change> --stage ${stage} --task ${task}\` (optionally \`--out harnessX/changes/<change>/.pack.md\`).`,
    "2. Read the full Context Pack (constitution, bound guides, change artifacts).",
    "Resolve `<change>` from the slash-command argument or user message; if missing, ask the user first."
  ].join("\n");
}

function formatGuideTable(guides: GuideDef[], kindLabel: string): string {
  if (!guides.length) return "";
  const lines = [
    `### Bound ${kindLabel}`,
    "",
    "| id | kind | source |",
    "|----|------|--------|",
    ...guides.map((g) => `| \`${g.id}\` | ${g.kind} | \`${g.source}\` |`)
  ];
  return lines.join("\n");
}

function selectionGuidance(skills: GuideDef[], templates: GuideDef[]): string {
  const parts: string[] = ["### How to use bound guides"];

  if (skills.length === 0 && templates.length === 0) {
    parts.push("No skill or template assets are bound to this task.");
    return parts.join("\n");
  }

  if (skills.length === 1) {
    parts.push(`- **Skill:** Follow \`${skills[0]!.id}\` from the Context Pack / IDE skills directory.`);
  } else if (skills.length > 1) {
    parts.push(
      `- **Skills (${skills.length}):** You may apply more than one when relevant. Prefer by domain fit and \`priority\`.`,
      `- **If the user did not specify which skills to prioritize:** ask before writing deliverables, e.g.`,
      `  > This task has multiple skills (${skills.map((s) => `\`${s.id}\``).join(", ")}). Which should I prioritize? I recommend …`
    );
  }

  if (templates.length === 1) {
    parts.push(`- **Template:** Structure the deliverable using \`${templates[0]!.id}\`.`);
  } else if (templates.length > 1) {
    parts.push(
      `- **Templates (${templates.length}):** Normally pick **one** output shape.`,
      `- **If the user did not specify a template:** ask before writing deliverables, e.g.`,
      `  > This task has multiple templates (${templates.map((t) => `\`${t.id}\``).join(", ")}). Which one should I use? I recommend …`
    );
  }

  parts.push(
    "- Do not invent a fourth structure when a bound template exists; extend the chosen template instead.",
    "- After the user confirms (when asked), proceed; if they already named an id in the message, use that without re-asking."
  );
  return parts.join("\n");
}

function gateReminder(stage: DeliveryStage, task: string): string {
  if (stage === "dev" || stage === "test") {
    return [
      "### 特别约束 — Gate",
      `Before claiming done: \`hx gate check <change> --stage ${stage} --task ${task}\` — do not finish until green.`,
      "Cursor stop-hook may auto-run this gate after a slash turn; if blocked and actionable, iterate fixes. If blocked by approvals/missing inputs, stop and ask the user."
    ].join("\n");
  }
  if (stage === "req") {
    return [
      "### 特别约束 — Gate",
      `Before claiming done: \`hx gate check --stage req --task ${task}\` (or \`hx req check --task ${task}\`) — do not finish until green.`
    ].join("\n");
  }
  return [
    "### 特别约束 — Gate",
    `Before claiming done: \`hx arch check --task ${task}\` (or \`hx gate check --stage arch --task ${task}\`) — do not finish until green.`
  ].join("\n");
}

function boundSensorsSection(ws: Workspace, stage: DeliveryStage, task: string): string {
  try {
    const harness = ws.readHarness();
    const profile = ws.readConfig().profile;
    const suiteName = resolveSuiteName(harness, profile, stage, task);
    const sensors = resolveSuiteSensors(harness, profile, stage, task);
    const lines = ["### 特别约束 — Sensors (auto from profile suite)", ""];
    if (!suiteName) {
      lines.push(`No suite bound for \`${stage}.${task}\` in profile \`${profile}\`.`);
      return lines.join("\n");
    }
    lines.push(`Suite: \`${suiteName}\``);
    if (!sensors.length) {
      lines.push("Suite is empty (no sensors registered).");
    } else {
      lines.push("", "| sensor |", "|--------|", ...sensors.map((id) => `| \`${id}\` |`));
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/** Compile-time appendix: pack load + bound skills/templates + suite sensors + gate. */
export function enrichTaskShellAppendix(ws: Workspace, stage: DeliveryStage, task: string, bound: GuideDef[]): string {
  const skills = bound.filter((g) => g.kind === "guide.skill");
  const templates = bound.filter((g) => g.kind === "guide.template");

  const sections = [
    BOUND_GUIDES_MARKER,
    "",
    "## 特别上下文 / 特别约束（adapter sync 自动注入）",
    "",
    packLoadStep(stage, task),
    ""
  ];

  const skillTable = formatGuideTable(skills, "Skills");
  const tplTable = formatGuideTable(templates, "Templates");
  if (skillTable) sections.push(skillTable, "");
  if (tplTable) sections.push(tplTable, "");
  sections.push(selectionGuidance(skills, templates), "");

  const sensors = boundSensorsSection(ws, stage, task);
  if (sensors) sections.push(sensors, "");
  sections.push(gateReminder(stage, task), "");

  return sections.join("\n").trimEnd() + "\n";
}

/** Assemble a thin task shell from workflow/command body + bound guides. */
export function assembleTaskShell(ws: Workspace, stage: DeliveryStage, task: string): TaskShell {
  const key = `${stage}.${task}`;
  const def = taskById(stage, task);
  const description = STAGE_COMMAND_DESCRIPTIONS[key] ?? def?.title.en ?? `${stage}/${task} workflow`;
  const run = defaultRunForTask(stage, task);
  const name = slashName(stage, task);
  const boundGuides = resolveBoundGuides(ws, stage, task);
  const body = resolveShellBody(ws, stage, task, description, run);
  const appendix = enrichTaskShellAppendix(ws, stage, task, boundGuides);
  const entry = findEntryGuide(ws, stage, task, "guide.command") ?? findEntryGuide(ws, stage, task, "guide.workflow");
  return {
    id: entry?.id ?? `wf-${task}`,
    stage,
    task,
    name,
    description,
    run,
    body,
    appendix,
    boundGuides
  };
}

/** Full shell content (body + appendix + CLI line). */
export function taskShellContent(shell: TaskShell): string {
  const appendix = shell.appendix?.trim() ? `\n\n${shell.appendix.trim()}\n` : "";
  return `${shell.body.trimEnd()}${appendix}\nCLI entry point: \`${shell.run}\`\n`;
}

/** SKILL.md body for IDEs without native commands (task entry skill). */
export function taskEntrySkillMarkdown(shell: TaskShell): string {
  const triggers = [
    shell.name,
    `/${shell.name}`,
    `${shell.stage} ${shell.task}`,
    shell.description
  ].join("; ");
  const frontmatter = [
    "---",
    `name: ${shell.name}`,
    "description: >",
    `  Task entry shell for ${shell.stage}.${shell.task}. ${shell.description}.`,
    `  Trigger when the user asks to run this delivery task, mentions ${triggers}.`,
    "---",
    ""
  ].join("\n");
  return `${frontmatter}${taskShellContent(shell)}`;
}

/** Assemble shells for every STAGE_TASKS entry (used by adapter sync). */
export function assembleAllTaskShells(ws: Workspace): TaskShell[] {
  const shells: TaskShell[] = [];
  for (const stage of ["req", "arch", "dev", "test"] as DeliveryStage[]) {
    for (const t of STAGE_TASKS[stage]) {
      shells.push(assembleTaskShell(ws, stage, t.id));
    }
  }
  return shells;
}
