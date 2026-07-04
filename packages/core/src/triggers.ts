import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { runSensor, type RunnerOptions } from "./sensorRunner.js";
import type { SensorDef, SensorReport } from "./schemas.js";

/**
 * T-609 (FR-027): event-driven sensor triggers.
 * - file-save: fs.watch based watcher matching each sensor's `scope` globs
 * - schedule: `hx schedule run` executes all trigger:schedule sensors once
 *   (invoked by CI cron); the janitor reuses the same entry point.
 */

/** Minimal glob: `**` any depth, `*` within a segment. */
export function globToRegex(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\x00")
    .replace(/\*\*/g, "\x01")
    .replace(/\*/g, "[^/]*")
    .replaceAll("\x00", "(?:.*/)?")
    .replaceAll("\x01", ".*");
  return new RegExp(`^${esc}$`);
}

export function matchesScope(file: string, scopes: string[] | undefined): boolean {
  if (!scopes || scopes.length === 0) return true;
  return scopes.some((s) => globToRegex(s).test(file));
}

export function fileSaveSensors(ws: Workspace): SensorDef[] {
  return ws.readHarness().sensors.filter((s) => s.trigger === "file-save");
}

export function scheduledSensors(ws: Workspace): SensorDef[] {
  return ws.readHarness().sensors.filter((s) => s.trigger === "schedule");
}

/** Dispatches one file-save event to every matching sensor; used by `hx watch` and tests. */
export async function dispatchFileSave(
  ws: Workspace,
  relFile: string,
  opts: RunnerOptions
): Promise<SensorReport[]> {
  const reports: SensorReport[] = [];
  for (const def of fileSaveSensors(ws)) {
    if (!matchesScope(relFile, def.scope)) continue;
    reports.push(await runSensor(ws, def, undefined, { ...opts, changedFiles: [relFile] }));
  }
  return reports;
}

export async function runScheduled(ws: Workspace, opts: RunnerOptions): Promise<SensorReport[]> {
  const reports: SensorReport[] = [];
  for (const def of scheduledSensors(ws)) {
    reports.push(await runSensor(ws, def, undefined, opts));
  }
  return reports;
}

/** `hx watch`: long-running fs watcher over the repo, feeding dispatchFileSave. */
export function startWatcher(
  ws: Workspace,
  opts: RunnerOptions,
  onReport: (file: string, reports: SensorReport[]) => void
): { close: () => void } {
  const watcher = fs.watch(ws.root, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const rel = filename.toString();
    if (rel.startsWith("node_modules") || rel.startsWith(".git")) return;
    void dispatchFileSave(ws, rel, opts).then((reports) => {
      if (reports.length) onReport(rel, reports);
    });
  });
  return { close: () => watcher.close() };
}
