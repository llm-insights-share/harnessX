import fs from "node:fs";
import path from "node:path";
import { Workspace, readYaml, writeYaml } from "./paths.js";
import { sha256 } from "./telemetry.js";

/**
 * T-302 (FR-025/FR-052): Approved Fixtures.
 * A human approves a fixture with `hx fixture approve`, which records its
 * content hash in fixtures.lock. The fixture-hash sensor (file-save trigger +
 * CI) verifies every locked fixture; drift without re-approval blocks.
 */

interface FixturesLock {
  fixtures: Record<string, { hash: string; approvedBy: string; at: string }>;
}

export function readFixturesLock(ws: Workspace): FixturesLock {
  if (!fs.existsSync(ws.fixturesLock)) return { fixtures: {} };
  return readYaml<FixturesLock>(ws.fixturesLock) ?? { fixtures: {} };
}

export function approveFixture(ws: Workspace, file: string, approvedBy: string): { file: string; hash: string } {
  const abs = path.resolve(ws.root, file);
  if (!fs.existsSync(abs)) throw new Error(`fixture not found: ${file}`);
  const rel = path.relative(ws.root, abs);
  const hash = sha256(fs.readFileSync(abs));
  const lock = readFixturesLock(ws);
  lock.fixtures[rel] = { hash, approvedBy, at: new Date().toISOString() };
  writeYaml(ws.fixturesLock, lock);
  return { file: rel, hash };
}

export interface FixtureViolation {
  file: string;
  problem: "modified" | "deleted";
}

export function verifyFixtures(ws: Workspace, onlyFiles?: string[]): FixtureViolation[] {
  const lock = readFixturesLock(ws);
  const violations: FixtureViolation[] = [];
  for (const [rel, entry] of Object.entries(lock.fixtures)) {
    if (onlyFiles && !onlyFiles.includes(rel)) continue;
    const abs = path.join(ws.root, rel);
    if (!fs.existsSync(abs)) violations.push({ file: rel, problem: "deleted" });
    else if (sha256(fs.readFileSync(abs)) !== entry.hash) violations.push({ file: rel, problem: "modified" });
  }
  return violations;
}
