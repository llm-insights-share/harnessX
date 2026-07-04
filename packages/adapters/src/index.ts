import fs from "node:fs";
import path from "node:path";
import { Workspace } from "@harnessx/core";
import { compileTarget, checkGeneratedFile, type CompileResult, type DriftState, type TargetEmitter } from "./compiler.js";
import { cursorEmitter, traeEmitter, qoderEmitter, claudeEmitter, genericEmitter, exportQoderQuest } from "./targets.js";

export * from "./capability.js";
export * from "./compiler.js";
export { exportQoderQuest } from "./targets.js";

const EMITTERS: Record<string, TargetEmitter> = {
  cursor: cursorEmitter,
  trae: traeEmitter,
  qoder: qoderEmitter,
  claude: claudeEmitter,
  generic: genericEmitter
};

export function availableTargets(): string[] {
  return Object.keys(EMITTERS);
}

export function compileAdapters(ws: Workspace, targets: string[]): CompileResult[] {
  return targets.map((t) => compileTarget(ws, t, EMITTERS[t] ?? genericEmitter));
}

export interface DriftFindingFile {
  file: string;
  state: DriftState;
}

/** Scans previously generated adapter outputs for manual edits. */
export function adapterDrift(ws: Workspace, results: CompileResult[] | string[]): DriftFindingFile[] {
  const files = Array.isArray(results) && typeof results[0] === "string" ? (results as string[]) : (results as CompileResult[]).flatMap((r) => r.files);
  const out: DriftFindingFile[] = [];
  for (const rel of files) {
    const abs = path.join(ws.root, rel);
    if (!fs.existsSync(abs)) continue;
    const state = checkGeneratedFile(abs);
    if (state !== "ok") out.push({ file: rel, state });
  }
  return out;
}
