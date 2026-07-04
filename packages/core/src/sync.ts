import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { readMainSpec } from "./artifactStore.js";
import { scanTestsForScenarios } from "./traceability.js";

/**
 * T-304 (FR-010): `hx sync` drift detection between archived specs and the codebase.
 * Reports:
 *  - spec scenarios with no test referencing them (spec ahead of code)
 *  - "Scenario:" references in tests that no spec declares (code ahead of spec)
 * Each finding suggests whether to backfill the spec or fix the code/tests.
 */

export interface DriftFinding {
  kind: "scenario-without-test" | "test-without-scenario";
  capability?: string;
  requirement?: string;
  scenario: string;
  files: string[];
  suggestion: string;
}

export function listCapabilities(ws: Workspace): string[] {
  if (!fs.existsSync(ws.specsDir)) return [];
  return fs
    .readdirSync(ws.specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ws.specsDir, d.name, "spec.md")))
    .map((d) => d.name);
}

export function syncCheck(ws: Workspace): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const testHits = scanTestsForScenarios(ws.root);
  const declared = new Set<string>();

  for (const cap of listCapabilities(ws)) {
    const spec = readMainSpec(ws, cap);
    for (const req of spec.requirements) {
      for (const s of req.scenarios) {
        declared.add(s.name);
        if (!testHits.has(s.name)) {
          findings.push({
            kind: "scenario-without-test",
            capability: cap,
            requirement: req.name,
            scenario: s.name,
            files: [],
            suggestion: `Spec declares "${s.name}" but no test references it. Either the behaviour regressed (fix code/tests) or the spec is stale (open a change with a REMOVED/MODIFIED delta).`
          });
        }
      }
    }
  }

  for (const [scenario, files] of testHits) {
    if (!declared.has(scenario)) {
      findings.push({
        kind: "test-without-scenario",
        scenario,
        files,
        suggestion: `Tests reference "Scenario: ${scenario}" but no archived spec declares it. Backfill the spec via a change (ADDED delta) or rename the test.`
      });
    }
  }
  return findings;
}
