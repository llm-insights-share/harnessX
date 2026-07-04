import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { mergeChangeIntoSpecs, archiveChangeDir, type MergeConflict } from "./artifactStore.js";
import { readMeta, setStatus } from "./metaStore.js";
import { appendRun, readRuns } from "./telemetry.js";

export interface ArchiveResult {
  ok: boolean;
  conflicts: MergeConflict[];
  archivedTo?: string;
  capabilities: string[];
  problems: string[];
}

/**
 * FR-009: merges delta specs into main specs, moves the change to archive/,
 * and emits a retro summary as Steering input. Rebase conflicts (FR-011) abort.
 */
export function archiveChange(ws: Workspace, change: string, opts: { force?: boolean } = {}): ArchiveResult {
  const problems: string[] = [];
  const meta = readMeta(ws, change);
  if (meta.status !== "verified" && !opts.force) {
    problems.push(`change is in state "${meta.status}", not "verified" — run hx verify first (or --force for lite profiles)`);
    return { ok: false, conflicts: [], capabilities: [], problems };
  }

  const { conflicts, capabilities } = mergeChangeIntoSpecs(ws, change);
  if (conflicts.length > 0) {
    return {
      ok: false,
      conflicts,
      capabilities: [],
      problems: conflicts.map(
        (c) => `${c.capability}/"${c.requirement}" (${c.op}): ${c.reason}. Rebase your delta against current specs/ and retry.`
      )
    };
  }

  writeRetro(ws, change);
  appendRun(ws, { kind: "gate", name: "archive", change, status: "pass", detail: { capabilities } });
  setStatus(ws, change, "archived");
  const archivedTo = archiveChangeDir(ws, change);
  return { ok: true, conflicts: [], archivedTo, capabilities, problems: [] };
}

/** Retro summary stub — aggregated by the Steering loop (FR-040/041). */
function writeRetro(ws: Workspace, change: string): void {
  const runs = readRuns(ws, change);
  const fails = runs.filter((r) => r.status === "fail");
  const bySensor = new Map<string, number>();
  for (const f of fails) bySensor.set(f.name, (bySensor.get(f.name) ?? 0) + 1);
  const lines = [
    `# Retro: ${change}`,
    "",
    `- total sensor/gate runs: ${runs.length}`,
    `- failures: ${fails.length}`,
    "",
    "## Failure breakdown",
    ...(bySensor.size ? [...bySensor.entries()].map(([s, n]) => `- ${s}: ${n} failure(s)`) : ["- none"]),
    "",
    "## Harness improvement candidates",
    "<!-- reviewed by hx steer report -->",
    ""
  ];
  fs.writeFileSync(path.join(ws.changeDir(change), "retro.md"), lines.join("\n"), "utf8");
}
