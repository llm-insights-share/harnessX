import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { changeScenarios } from "./traceability.js";
import { readMeta, writeMeta, activeWaivers } from "./metaStore.js";
import { sha256 } from "./telemetry.js";

/**
 * T-303 (FR-026): test-first workflow for strict profiles.
 * 1. `generateTestStubs` emits failing test skeletons from scenarios.
 * 2. A human reviews and approves them: `approveTests` records file hashes in meta.yaml.
 * 3. During apply/verify, `checkApprovedTests` blocks modifications to approved
 *    test files unless a waiver (`tests:<file>`) is active.
 */

export function generateTestStubs(ws: Workspace, change: string, outDir = "tests/generated"): string[] {
  const scenarios = changeScenarios(ws, change);
  const byCap = new Map<string, typeof scenarios>();
  for (const s of scenarios) {
    const arr = byCap.get(s.capability) ?? [];
    arr.push(s);
    byCap.set(s.capability, arr);
  }
  const files: string[] = [];
  for (const [cap, list] of byCap) {
    const file = path.join(ws.root, outDir, `${change}-${cap}.test.ts`);
    ensureDir(path.dirname(file));
    const body = [
      `import { describe, it } from "vitest";`,
      "",
      `describe("${cap} — ${change}", () => {`,
      ...list.map((s) =>
        [
          `  it("Scenario: ${s.scenario}", () => {`,
          `    // Requirement: ${s.requirement}`,
          `    throw new Error("not implemented — write assertions before implementation (FR-026)");`,
          `  });`
        ].join("\n")
      ),
      `});`,
      ""
    ].join("\n");
    fs.writeFileSync(file, body, "utf8");
    files.push(path.relative(ws.root, file));
  }
  return files;
}

export function approveTests(ws: Workspace, change: string, files: string[], _approver: string): void {
  const meta = readMeta(ws, change);
  for (const rel of files) {
    const abs = path.join(ws.root, rel);
    if (!fs.existsSync(abs)) throw new Error(`test file not found: ${rel}`);
    meta.approvedTests[rel] = sha256(fs.readFileSync(abs));
  }
  writeMeta(ws, meta);
}

export interface ApprovedTestViolation {
  file: string;
  problem: "modified" | "deleted";
  waived: boolean;
}

export function checkApprovedTests(ws: Workspace, change: string): ApprovedTestViolation[] {
  const meta = readMeta(ws, change);
  const waived = new Set(activeWaivers(meta).map((w) => w.target));
  const violations: ApprovedTestViolation[] = [];
  for (const [rel, hash] of Object.entries(meta.approvedTests)) {
    const abs = path.join(ws.root, rel);
    const isWaived = waived.has(`tests:${rel}`);
    if (!fs.existsSync(abs)) violations.push({ file: rel, problem: "deleted", waived: isWaived });
    else if (sha256(fs.readFileSync(abs)) !== hash) violations.push({ file: rel, problem: "modified", waived: isWaived });
  }
  return violations.filter((v) => !v.waived);
}
