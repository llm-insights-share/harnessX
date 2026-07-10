import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, sha256, STAGE_TASKS, loadSkillPackage, formatSkillResourceAppendix, type DeliveryStage } from "@harnessx/core";
import { computeTier, TARGETS, type Tier } from "./capability.js";

/**
 * T-604: single-source → multi-target compilation.
 */

export const ADAPTER_VERSION = "1.0.0";

export interface CommandDef {
  name: string;
  description: string;
  run: string;
  prompt?: string;
}

const STAGE_COMMAND_DESCRIPTIONS: Record<string, string> = {
  "req.prd-writing": "Author or revise org-level PRD",
  "arch.subsystem-division": "Write global architecture HLD",
  "arch.internal-interface": "Write module LLD",
  "dev.plan": "Generate dual-track tasks.md",
  "dev.propose": "Draft proposal.md + initial delta specs",
  "dev.design": "Write design.md (requires propose gate)",
  "dev.apply": "Implement task-by-task with fast-suite self-correction",
  "dev.verify": "Run the verification suite + traceability",
  "dev.archive": "Merge deltas into main specs and archive",
  "test.test-case-design": "Design test cases for the change"
};

function slashName(stage: DeliveryStage, task: string): string {
  return `hx-${stage}-${task.replace(/_/g, "-")}`;
}

export function standardCommands(): CommandDef[] {
  const commands: CommandDef[] = [];
  const orgRuns: Record<string, string> = {
    "req.prd-writing": 'hx req prd init <slug> --title "..."',
    "arch.subsystem-division": 'hx arch init --title "..."',
    "arch.internal-interface": 'hx arch lld init <module> --title "..."'
  };
  for (const stage of ["req", "arch", "dev", "test"] as DeliveryStage[]) {
    for (const t of STAGE_TASKS[stage]) {
      const key = `${stage}.${t.id}`;
      const run =
        orgRuns[key] ??
        (stage === "dev" || stage === "test"
          ? `hx ${stage === "dev" ? "dev" : "test"} ${t.id.replace(/-/g, " ")} <change>`
          : `hx ${stage} ${t.id}`);
      commands.push({
        name: slashName(stage, t.id),
        description: STAGE_COMMAND_DESCRIPTIONS[key] ?? t.title.en,
        run
      });
    }
  }
  return commands;
}

export function collectCommands(ws: Workspace): CommandDef[] {
  const harness = ws.readHarness();
  const commands = standardCommands();
  for (const g of harness.guides) {
    if (g.kind !== "guide.command") continue;
    const f = path.join(ws.base, g.source);
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, "utf8");
    const name = slashName(g.stage, g.task ?? g.stage);
    const existing = commands.find((c) => c.name === name);
    if (existing) existing.prompt = content;
    else {
      commands.push({
        name,
        description: `${g.stage}/${g.task ?? ""} workflow`,
        run: `hx ${g.stage} ${g.task ?? ""}`,
        prompt: content
      });
    }
  }
  return commands;
}

export function commandBody(c: CommandDef): string {
  if (c.prompt) return `${c.prompt.trimEnd()}\n\nCLI entry point: \`${c.run}\`\n`;
  return `# ${c.name}\n\n${c.description}\n\nRun:\n\n\`\`\`bash\n${c.run}\n\`\`\`\n`;
}

export interface SkillFile {
  rel: string;
  content: string;
}

export interface SkillSource {
  id: string;
  root: string;
  content: string;
  files: SkillFile[];
}

/** Inline SKILL.md plus resource appendix for flat rule/skill targets. */
export function skillInlineBody(skill: SkillSource): string {
  const appendix = formatSkillResourceAppendix(skill.id, { files: skill.files, entryRel: "SKILL.md" });
  return appendix ? `${skill.content.trimEnd()}\n\n${appendix}` : skill.content;
}

export function collectSkills(ws: Workspace): SkillSource[] {
  const harness = ws.readHarness();
  const out: SkillSource[] = [];
  for (const g of harness.guides) {
    if (g.kind !== "guide.skill") continue;
    try {
      const pkg = loadSkillPackage(ws.base, g.source);
      out.push({
        id: g.id,
        root: pkg.rootRel,
        content: pkg.entryContent,
        files: pkg.files
      });
      continue;
    } catch {
      /* legacy single-file source */
    }
    const f = path.join(ws.base, g.source);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
    const content = fs.readFileSync(f, "utf8");
    const root = path.dirname(path.relative(ws.base, f)).replace(/\\/g, "/");
    out.push({ id: g.id, root, content, files: [{ rel: "SKILL.md", content }] });
  }
  return out;
}

export function rulesDigest(ws: Workspace): string {
  const parts: string[] = [];
  if (fs.existsSync(ws.constitutionFile)) {
    parts.push("## Constitution (highest priority)", fs.readFileSync(ws.constitutionFile, "utf8"));
  }
  parts.push(
    "## HarnessX ground rules",
    "- Work inside a change workspace; never edit harnessX/specs/ directly.",
    "- Never edit meta.yaml, harness.lock, fixtures.lock or approved fixtures by hand.",
    "- When a sensor fails, read fix_hint/agent_instruction before editing code.",
    "- Run `hx gate check <change> --stage <s> --task <t>` before claiming a task is complete."
  );
  return parts.join("\n\n");
}

export function withHeader(content: string, sourceNote: string, commentStyle: "html" | "hash" | "raw" = "html"): string {
  if (commentStyle === "raw") return content;
  const hash = sha256(content).slice(0, 16);
  const line = `GENERATED by harnessx adapter v${ADAPTER_VERSION} from ${sourceNote} — do not edit (hash:${hash})`;
  return commentStyle === "html" ? `<!-- ${line} -->\n${content}` : `# ${line}\n${content}`;
}

const HEADER_RE = /GENERATED by harnessx adapter v([\d.]+) from (.+?) — do not edit \(hash:([0-9a-f]{16})\)/;

export type DriftState = "ok" | "manually-edited" | "missing-header";

export function checkGeneratedFile(file: string): DriftState {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(HEADER_RE);
  if (!m) {
    if (file.endsWith(".json")) return "ok";
    return "missing-header";
  }
  const body = raw.split("\n").slice(1).join("\n");
  return sha256(body).slice(0, 16) === m[3] ? "ok" : "manually-edited";
}

export interface CompileResult {
  target: string;
  tier: Tier;
  files: string[];
  skipped: string[];
}

export type TargetEmitter = (ws: Workspace, ctx: EmitContext) => { files: string[]; skipped: string[] };

export interface EmitContext {
  commands: CommandDef[];
  skills: SkillSource[];
  rules: string;
  write: (rel: string, content: string, style?: "html" | "hash" | "raw", sourceNote?: string) => string;
}

export function makeEmitContext(ws: Workspace): Omit<EmitContext, "write"> {
  return { commands: collectCommands(ws), skills: collectSkills(ws), rules: rulesDigest(ws) };
}

export function compileTarget(ws: Workspace, target: string, emitter: TargetEmitter): CompileResult {
  const spec = TARGETS[target];
  if (!spec) throw new Error(`unknown adapter target: ${target}`);
  const files: string[] = [];
  const ctx: EmitContext = {
    ...makeEmitContext(ws),
    write: (rel, content, style = "html", sourceNote = "harnessX/assets") => {
      const abs = path.join(ws.root, rel);
      ensureDir(path.dirname(abs));
      fs.writeFileSync(abs, withHeader(content, sourceNote, style));
      files.push(rel);
      return rel;
    }
  };
  const res = emitter(ws, ctx);
  return { target, tier: computeTier(spec.capabilities), files: [...files, ...res.files], skipped: res.skipped };
}
