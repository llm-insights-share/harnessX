import fs from "node:fs";
import { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { readTrace } from "./traceability.js";
import { readTasks } from "./plan.js";
import { PHASES } from "./schemas.js";

/**
 * T-305: `hx view` renders a static HTML dashboard of change phases, gate
 * history and traceability. `hx status` provides the same data as a table.
 */

export interface ChangeStatusRow {
  change: string;
  status: string;
  profile: string;
  domains: string[];
  tasksDone: number;
  tasksTotal: number;
  lastGate?: { phase: string; passed: boolean; at: string };
  scenarios: { covered: number; total: number };
}

export function collectStatus(ws: Workspace): ChangeStatusRow[] {
  return ws.listChanges().map((change) => {
    const meta = readMeta(ws, change);
    const tasks = readTasks(ws, change);
    const trace = readTrace(ws, change);
    let covered = 0;
    let total = 0;
    for (const req of Object.values(trace.requirements)) {
      for (const s of Object.values(req.scenarios)) {
        total++;
        if (s.status === "covered" || s.status === "waived") covered++;
      }
    }
    const lastGate = meta.gateHistory.at(-1);
    return {
      change,
      status: meta.status,
      profile: meta.profile,
      domains: meta.touchedDomains,
      tasksDone: tasks.filter((t) => t.done).length,
      tasksTotal: tasks.length,
      lastGate: lastGate ? { phase: lastGate.phase, passed: lastGate.passed, at: lastGate.at } : undefined,
      scenarios: { covered, total }
    };
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function renderDashboard(ws: Workspace): string {
  const rows = collectStatus(ws);
  const phaseBar = (status: string) => {
    const idx = PHASES.findIndex((p) => p.state === status);
    return PHASES.map(
      (p, i) =>
        `<span class="ph ${i <= idx ? "on" : ""}" title="${p.display}">${p.display[0]}</span>`
    ).join("");
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HarnessX Dashboard</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;background:#0f172a;color:#e2e8f0}
h1{font-size:1.3rem} table{border-collapse:collapse;width:100%;margin-top:1rem}
th,td{padding:.5rem .8rem;border-bottom:1px solid #334155;text-align:left;font-size:.9rem}
.ph{display:inline-block;width:1.4em;text-align:center;border-radius:3px;margin-right:2px;background:#1e293b;color:#64748b}
.ph.on{background:#0ea5e9;color:#fff}
.pass{color:#4ade80}.fail{color:#f87171}
.badge{background:#1e293b;border-radius:4px;padding:.1rem .45rem;font-size:.8rem}
</style></head><body>
<h1>HarnessX — Change Dashboard</h1>
<table><thead><tr><th>Change</th><th>Phase</th><th>Profile</th><th>Domains</th><th>Tasks</th><th>Scenarios</th><th>Last gate</th></tr></thead>
<tbody>
${rows
  .map(
    (r) => `<tr>
  <td><strong>${esc(r.change)}</strong></td>
  <td>${phaseBar(r.status)} <span class="badge">${esc(r.status)}</span></td>
  <td>${esc(r.profile)}</td>
  <td>${r.domains.map((d) => `<span class="badge">${esc(d)}</span>`).join(" ")}</td>
  <td>${r.tasksDone}/${r.tasksTotal}</td>
  <td>${r.scenarios.covered}/${r.scenarios.total}</td>
  <td>${r.lastGate ? `<span class="${r.lastGate.passed ? "pass" : "fail"}">${r.lastGate.phase} ${r.lastGate.passed ? "✓" : "✗"}</span> <small>${esc(r.lastGate.at)}</small>` : "—"}</td>
</tr>`
  )
  .join("\n")}
</tbody></table>
<p><small>Generated ${new Date().toISOString()} by hx view</small></p>
</body></html>`;
}

export function writeDashboard(ws: Workspace, outFile: string): string {
  fs.writeFileSync(outFile, renderDashboard(ws), "utf8");
  return outFile;
}
