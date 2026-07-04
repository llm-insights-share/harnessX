import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace, readTasks, listDeltaFiles } from "@harnessx/core";
import type { TargetEmitter } from "./compiler.js";

/**
 * T-605..T-608: target emitters. All content comes from the shared EmitContext
 * (single source); each emitter maps it onto the tool's native layout.
 */

/* ── T-605 Cursor: commands / skills / rules / hooks ── */

export const cursorEmitter: TargetEmitter = (_ws, ctx) => {
  const files: string[] = [];
  for (const c of ctx.commands) {
    files.push(ctx.write(`.cursor/commands/${c.name}.md`, `# ${c.name}\n\n${c.description}\n\nRun:\n\n\`\`\`bash\n${c.run}\n\`\`\`\n`));
  }
  for (const s of ctx.skills) {
    files.push(ctx.write(`.cursor/skills/${s.id}/SKILL.md`, s.content));
  }
  files.push(ctx.write(`.cursor/rules/harnessx.mdc`, `---\ndescription: HarnessX ground rules\nalwaysApply: true\n---\n\n${ctx.rules}\n`));
  // hooks: protect fixtures + meta.yaml on save/edit
  files.push(
    ctx.write(
      `.cursor/hooks.json`,
      JSON.stringify(
        {
          version: 1,
          hooks: {
            beforeSubmitPrompt: [{ command: "hx gate hook-check" }],
            afterFileEdit: [{ command: "hx fixture verify", paths: ["tests/fixtures/**", "harnessX/changes/**/meta.yaml"] }]
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
    ctx.write(`.claude/commands/${c.name}.md`, `${c.description}\n\nRun: \`${c.run}\`\n`);
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
