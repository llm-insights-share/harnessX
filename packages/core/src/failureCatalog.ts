import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import type { SensorReport } from "./schemas.js";

/**
 * FR-040: aggregates sensor failures and human interventions into a failure
 * catalog. Entries with the same signature accumulate; >=3 occurrences flags
 * a pattern (orch.pattern candidate) for the Steering loop.
 */

export interface FailureEvent {
  at: string;
  sensor: string;
  change?: string;
  signature: string;
  message: string;
  kind: "sensor-failure" | "human-intervention";
}

export interface FailurePattern {
  signature: string;
  sensor: string;
  count: number;
  isPattern: boolean;
  examples: string[];
  changes: string[];
}

/** Normalizes a failure message into a stable signature (strips paths, line numbers, hashes). */
export function failureSignature(sensor: string, message: string): string {
  const norm = message
    .replace(/[A-Za-z0-9_\-./\\]+\.(ts|js|tsx|jsx|py|md|yaml|yml|json)/g, "<file>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/[a-f0-9]{7,64}/g, "<hash>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return `${sensor}::${norm}`;
}

export function recordFailure(
  ws: Workspace,
  input: { sensor: string; change?: string; report?: SensorReport; message?: string; kind?: FailureEvent["kind"] }
): FailureEvent {
  const message = input.message ?? input.report?.findings[0]?.message ?? input.report?.summary ?? "unknown failure";
  const event: FailureEvent = {
    at: new Date().toISOString(),
    sensor: input.sensor,
    change: input.change,
    signature: failureSignature(input.sensor, message),
    message: message.slice(0, 500),
    kind: input.kind ?? "sensor-failure"
  };
  ensureDir(path.dirname(ws.failureCatalog));
  fs.appendFileSync(ws.failureCatalog, JSON.stringify(event) + "\n");
  return event;
}

export function readFailures(ws: Workspace): FailureEvent[] {
  if (!fs.existsSync(ws.failureCatalog)) return [];
  return fs
    .readFileSync(ws.failureCatalog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FailureEvent);
}

export function aggregatePatterns(ws: Workspace, threshold = 3): FailurePattern[] {
  const bySig = new Map<string, FailurePattern>();
  for (const e of readFailures(ws)) {
    let p = bySig.get(e.signature);
    if (!p) {
      p = { signature: e.signature, sensor: e.sensor, count: 0, isPattern: false, examples: [], changes: [] };
      bySig.set(e.signature, p);
    }
    p.count++;
    if (p.examples.length < 3) p.examples.push(e.message);
    if (e.change && !p.changes.includes(e.change)) p.changes.push(e.change);
  }
  const out = [...bySig.values()];
  for (const p of out) p.isPattern = p.count >= threshold;
  return out.sort((a, b) => b.count - a.count);
}
