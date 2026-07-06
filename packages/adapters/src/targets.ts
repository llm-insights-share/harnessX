import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace, ensureDir, readTasks, listDeltaFiles } from "@harnessx/core";
import { commandBody, type TargetEmitter } from "./compiler.js";

/**
 * T-605..T-608: target emitters. All content comes from the shared EmitContext
 * (single source); each emitter maps it onto the tool's native layout.
 */

/* ── T-605 Cursor: commands / skills / rules / hooks ── */

/** Cursor postToolUse hook: verify approved fixtures after Write and inject violations into agent context. */
const CURSOR_FIXTURE_VERIFY_HOOK = `#!/usr/bin/env node
/** HarnessX Cursor hook — run hx fixture verify after protected file writes. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function relativePath(filePath, roots) {
  if (!filePath) return "";
  const norm = filePath.replace(/\\\\/g, "/");
  for (const root of roots ?? []) {
    const r = root.replace(/\\\\/g, "/");
    if (norm.startsWith(r + "/")) return norm.slice(r.length + 1);
  }
  return norm;
}

function isProtected(rel) {
  if (!rel) return false;
  if (rel.startsWith("tests/fixtures/")) return true;
  return /^harnessX\\/changes\\/[^/]+\\/meta\\.yaml$/.test(rel);
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + "\\n");
}

function runFixtureVerify(cwd) {
  const localHx = path.join(cwd, "node_modules", ".bin", "hx");
  const cmd = existsSync(localHx) ? localHx : "hx";
  return spawnSync(cmd, ["fixture", "verify"], { encoding: "utf8", cwd });
}

const input = readInput();
const roots = input.workspace_roots ?? [];
const cwd = roots[0] ?? process.cwd();
let rel = "";

if (input.file_path) {
  rel = relativePath(input.file_path, roots);
} else if (input.tool_name === "Write") {
  rel = relativePath(input.tool_input?.file_path ?? input.tool_input?.path ?? "", roots);
}

if (!isProtected(rel)) {
  out({});
  process.exit(0);
}

const hx = runFixtureVerify(cwd);
if (hx.error) {
  const err = \`hx fixture verify failed to run (\${hx.error.code}): ensure hx is on PATH or installed in node_modules\`;
  if (input.tool_name === "Write") out({ additional_context: \`[HarnessX fixture guard] \${err}\` });
  else console.error(err);
  process.exit(0);
}
if (hx.status === 0) {
  out({});
  process.exit(0);
}

const detail = (hx.stderr || hx.stdout || "fixture verify failed").trim();
const ctx = \`[HarnessX fixture guard] \${detail}\\nRestore the fixture, or have a human re-approve: hx fixture approve \${rel} --by <name>\`;

if (input.tool_name === "Write") {
  out({ additional_context: ctx });
} else {
  console.error(ctx);
  out({});
}
process.exit(0);
`;

export const cursorEmitter: TargetEmitter = (ws, ctx) => {
  const files: string[] = [];
  for (const c of ctx.commands) {
    files.push(ctx.write(`.cursor/commands/${c.name}.md`, commandBody(c)));
  }
  for (const s of ctx.skills) {
    files.push(ctx.write(`.cursor/skills/${s.id}/SKILL.md`, s.content));
  }
  files.push(ctx.write(`.cursor/rules/harnessx.mdc`, `---\ndescription: HarnessX ground rules\nalwaysApply: true\n---\n\n${ctx.rules}\n`));
  const hookRel = ".cursor/hooks/fixture-verify.mjs";
  const hookAbs = path.join(ws.root, hookRel);
  ensureDir(path.dirname(hookAbs));
  fs.writeFileSync(hookAbs, CURSOR_FIXTURE_VERIFY_HOOK);
  files.push(hookRel);
  // hooks: postToolUse feeds violations back to the agent; afterFileEdit is observational only
  files.push(
    ctx.write(
      `.cursor/hooks.json`,
      JSON.stringify(
        {
          version: 1,
          hooks: {
            beforeSubmitPrompt: [{ command: "hx gate hook-check" }],
            postToolUse: [{ command: "node .cursor/hooks/fixture-verify.mjs", matcher: "Write" }],
            afterFileEdit: [
              {
                command: "node .cursor/hooks/fixture-verify.mjs",
                paths: ["tests/fixtures/**", "harnessX/changes/**/meta.yaml"]
              }
            ]
          }
        },
        null,
        2
      )
    )
  );
  return { files: [], skipped: [] };
};

/* ── T-606 Trae: project rules + planner/executor agents + MCP ── */

export const traeEmitter: TargetEmitter = (_ws, ctx) => {
  ctx.write(`.trae/rules/project_rules.md`, `${ctx.rules}\n\n## Skills\n\n${ctx.skills.map((s) => s.content).join("\n\n---\n\n")}\n`);
  ctx.write(
    `.trae/agents.yaml`,
    YAML.stringify({
      agents: [
        {
          name: "hx-planner",
          role: "Planning agent: runs propose/design/spec/plan phases",
          prompt: "You plan changes for this repo. Use hx CLI commands (hx propose, hx plan). Never write implementation code.",
          allowedCommands: ctx.commands.filter((c) => ["hx-propose", "hx-design", "hx-spec", "hx-plan"].includes(c.name)).map((c) => c.run)
        },
        {
          name: "hx-executor",
          role: "Execution agent: runs apply/verify phases task-by-task",
          prompt: "You implement planned tasks. After each task run the fast suite via hx apply. Never modify specs or meta.yaml.",
          allowedCommands: ctx.commands.filter((c) => ["hx-apply", "hx-verify"].includes(c.name)).map((c) => c.run)
        }
      ],
      mcp: { servers: { harnessx: { command: "hx", args: ["mcp"], description: "HarnessX CLI bridge" } } }
    }),
    "hash"
  );
  return { files: [], skipped: [] };
};

/* ── T-607 Qoder: rules/skills + Quest Spec bridge + worktree mapping ── */

export const qoderEmitter: TargetEmitter = (_ws, ctx) => {
  ctx.write(`.qoder/rules/harnessx.md`, ctx.rules);
  for (const s of ctx.skills) ctx.write(`.qoder/skills/${s.id}.md`, s.content);
  for (const c of ctx.commands) ctx.write(`.qoder/commands/${c.name}.md`, commandBody(c));
  ctx.write(
    `.qoder/mcp.json`,
    JSON.stringify({ mcpServers: { harnessx: { command: "hx", args: ["mcp"] } } }, null, 2)
  );
  return { files: [], skipped: [] };
};

/** Qoder Quest bridge: exports a change's delta specs + tasks as a Quest input (worktree-isolated apply). */
export function exportQoderQuest(ws: Workspace, change: string): string {
  const tasks = readTasks(ws, change);
  const deltas = listDeltaFiles(ws, change).map(({ capability, file }) => `## Capability: ${capability}\n\n${fs.readFileSync(file, "utf8")}`);
  const quest = [
    `# Quest: ${change}`,
    "",
    "> Generated from HarnessX delta specs + tasks (T-607). Run in an isolated worktree;",
    "> map the worktree to `hx apply` so each task passes the fast suite before commit.",
    "",
    "## Specs",
    "",
    ...deltas,
    "",
    "## Tasks",
    "",
    ...tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.id} [${t.track}] ${t.title} (Requirement: ${t.requirement})`),
    "",
    "## Environment",
    "- worktree: `git worktree add ../quest-" + change + "` (isolates apply phase)",
    "- verify inside worktree: `hx verify " + change + "`",
    ""
  ].join("\n");
  const file = path.join(ws.root, ".qoder", "quests", `${change}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, quest);
  return file;
}

/* ── T-608 Claude Code + generic AGENTS.md fallback ── */

export const claudeEmitter: TargetEmitter = (_ws, ctx) => {
  ctx.write(`CLAUDE.md`, `${ctx.rules}\n\n## Commands\n\n${ctx.commands.map((c) => `- \`/${c.name}\` → \`${c.run}\``).join("\n")}\n`);
  for (const c of ctx.commands) {
    ctx.write(`.claude/commands/${c.name}.md`, commandBody(c));
  }
  ctx.write(
    `.claude/settings.json`,
    JSON.stringify(
      {
        permissions: {
          deny: ["Edit(harnessX/changes/**/meta.yaml)", "Edit(tests/fixtures/**)", "Edit(harnessX/fixtures.lock)", "Edit(harnessX/harness.lock)"]
        },
        hooks: {
          PreToolUse: [
            {
              matcher: "Edit|Write",
              hooks: [{ type: "command", command: "hx fixture verify" }]
            }
          ]
        }
      },
      null,
      2
    )
  );
  return { files: [], skipped: [] };
};

export const genericEmitter: TargetEmitter = (_ws, ctx) => {
  ctx.write(
    `AGENTS.md`,
    `${ctx.rules}\n\n## Skills\n\n${ctx.skills.map((s) => s.content).join("\n\n---\n\n")}\n\n## Commands\n\n${ctx.commands
      .map((c) => `- ${c.description}: \`${c.run}\``)
      .join("\n")}\n`
  );
  return { files: [], skipped: [] };
};
