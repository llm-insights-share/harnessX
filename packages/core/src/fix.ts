import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { readRuns } from "./telemetry.js";
import { listDeltaFiles } from "./artifactStore.js";
import type { SensorReport } from "./schemas.js";

/**
 * T-611: `hx fix` — repair loop entry point referenced by sensor fix_command.
 * Builds a focused Context Pack for a fix session: the failing sensor's last
 * findings, the relevant delta-spec excerpts, and snippets of the offending
 * files, so an agent can be launched directly with everything it needs.
 */

export interface FixPack {
  change: string;
  sensor: string;
  file: string;
  findings: number;
}

export function buildFixPack(ws: Workspace, change: string, sensorId: string, lastReport?: SensorReport): FixPack {
  const report =
    lastReport ??
    (readRuns(ws, change)
      .reverse()
      .find((r) => r.kind === "sensor" && r.name === sensorId && r.status !== "pass")?.detail as SensorReport | undefined);

  const parts: string[] = [
    `# Fix Pack — sensor "${sensorId}" / change "${change}"`,
    "",
    "## Instructions",
    "Fix the findings below, then re-run: `hx gate check " + change + "`.",
    "Do not weaken tests, specs or sensors to make them pass.",
    ""
  ];

  if (report && "findings" in (report as object)) {
    const rep = report as SensorReport;
    parts.push("## Findings");
    for (const f of rep.findings ?? []) {
      parts.push(`- ${f.file ? `\`${f.file}\`${f.line ? `:${f.line}` : ""} — ` : ""}${f.message}`);
      if (f.fix_hint) parts.push(`  - fix_hint: ${f.fix_hint}`);
      if (f.file) {
        const abs = path.join(ws.root, f.file);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          const lines = fs.readFileSync(abs, "utf8").split("\n");
          const start = Math.max(0, (f.line ?? 1) - 4);
          const snippet = lines.slice(start, start + 8).join("\n");
          parts.push("", "```", snippet, "```", "");
        }
      }
    }
    if (rep.fix_hint) parts.push("", `**Sensor fix_hint:** ${rep.fix_hint}`);
    if (rep.agent_instruction) parts.push(`**Agent instruction:** ${rep.agent_instruction}`);
  } else {
    parts.push(`## Findings`, `No stored report found for sensor "${sensorId}" — run \`hx gate check ${change}\` first.`);
  }

  parts.push("", "## Relevant delta specs", "");
  for (const { capability, file } of listDeltaFiles(ws, change)) {
    parts.push(`### ${capability}`, "", fs.readFileSync(file, "utf8"));
  }

  const out = path.join(ws.changeDir(change), "fix-pack.md");
  fs.writeFileSync(out, parts.join("\n"));
  return { change, sensor: sensorId, file: out, findings: (report as SensorReport | undefined)?.findings?.length ?? 0 };
}
