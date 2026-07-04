import fs from "node:fs";
import { Workspace } from "./paths.js";
import { listDeltaFiles, parseDelta, readMainSpec, mergeDelta, type MergeConflict } from "./artifactStore.js";

/**
 * T-404 (FR-011): pre-archive rebase check for concurrent changes.
 * Dry-runs the delta merge against the *current* main specs; conflicts caused
 * by another change having archived first are reported with resolution guidance.
 */

export interface RebaseReport {
  clean: boolean;
  conflicts: (MergeConflict & { guidance: string })[];
}

export function rebaseCheck(ws: Workspace, change: string): RebaseReport {
  const conflicts: RebaseReport["conflicts"] = [];
  for (const { capability, file } of listDeltaFiles(ws, change)) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    const base = readMainSpec(ws, capability);
    for (const c of mergeDelta(base, delta).conflicts) {
      conflicts.push({
        ...c,
        guidance:
          c.op === "MODIFIED"
            ? `Requirement "${c.requirement}" no longer exists in ${capability}/spec.md — a concurrent change likely renamed or removed it. Re-read the current spec and rewrite your MODIFIED entry against it.`
            : c.op === "ADDED"
              ? `Requirement "${c.requirement}" already exists in ${capability}/spec.md — a concurrent change added it first. Convert your entry to MODIFIED or drop the duplicate.`
              : `Requirement "${c.requirement}" is already gone from ${capability}/spec.md — drop your REMOVED entry.`
      });
    }
  }
  return { clean: conflicts.length === 0, conflicts };
}
