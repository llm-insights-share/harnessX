import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { readMeta, expiredWaivers } from "./metaStore.js";
import { syncCheck, type DriftFinding } from "./sync.js";
import { readRuns } from "./telemetry.js";
import { appendRun } from "./telemetry.js";

/**
 * T-506 (FR-027 schedule): `hx janitor run` — scheduled hygiene scan.
 * Finds expired waivers, spec/code drift and dead assets (guides/sensors never
 * exercised in telemetry), and emits a cleanup report suitable as a PR body.
 */

export interface JanitorReport {
  expiredWaivers: { change: string; id: string; target: string; expiredAt: string }[];
  drift: DriftFinding[];
  deadAssets: { id: string; kind: string; reason: string }[];
  reportFile: string;
}

export function janitorRun(ws: Workspace): JanitorReport {
  const report: JanitorReport = { expiredWaivers: [], drift: [], deadAssets: [], reportFile: "" };

  for (const change of ws.listChanges()) {
    try {
      const meta = readMeta(ws, change);
      for (const w of expiredWaivers(meta)) {
        report.expiredWaivers.push({ change, id: w.id, target: w.target, expiredAt: w.expiresAt });
      }
    } catch {
      // unreadable meta is reported by meta verify, not the janitor
    }
  }

  report.drift = syncCheck(ws);

  const harness = ws.readHarness();
  const runNames = new Set(readRuns(ws).map((r) => r.name));
  for (const s of harness.sensors) {
    if (!runNames.has(s.id)) {
      report.deadAssets.push({ id: s.id, kind: s.kind, reason: "sensor never executed in telemetry" });
    }
  }

  const lines = [
    "# Janitor report",
    "",
    `Generated ${new Date().toISOString()}`,
    "",
    "## Expired waivers",
    ...(report.expiredWaivers.length
      ? report.expiredWaivers.map((w) => `- [ ] ${w.change}: waiver ${w.id} for "${w.target}" expired ${w.expiredAt} — re-approve or fix`)
      : ["- none"]),
    "",
    "## Spec/code drift",
    ...(report.drift.length ? report.drift.map((d) => `- [ ] [${d.kind}] Scenario "${d.scenario}": ${d.suggestion}`) : ["- none"]),
    "",
    "## Dead assets",
    ...(report.deadAssets.length ? report.deadAssets.map((a) => `- [ ] ${a.id} (${a.kind}): ${a.reason}`) : ["- none"]),
    ""
  ];
  const file = path.join(ws.runsDir, "janitor-report.md");
  fs.mkdirSync(ws.runsDir, { recursive: true });
  fs.writeFileSync(file, lines.join("\n"));
  report.reportFile = file;
  appendRun(ws, {
    kind: "janitor",
    name: "scan",
    status: "info",
    detail: { expiredWaivers: report.expiredWaivers.length, drift: report.drift.length, deadAssets: report.deadAssets.length }
  });
  return report;
}
