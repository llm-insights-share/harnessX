import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { readTrace } from "./traceability.js";
import { readTasks } from "./plan.js";
import { PHASES } from "./schemas.js";
import { resolveAssets } from "./assets.js";
import { coverageReport } from "./steering.js";
import { telemetrySummary } from "./coverageAggregate.js";

/**
 * T-305 + v0.4: `hx view` dashboard — phases, funnel, assets, coverage.
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
      lastGate: lastGate
        ? {
            phase: lastGate.phase ?? (lastGate.stage && lastGate.task ? `${lastGate.stage}/${lastGate.task}` : "unknown"),
            passed: lastGate.passed,
            at: lastGate.at
          }
        : undefined,
      scenarios: { covered, total }
    };
  });
}

export interface PhaseFunnel {
  phase: string;
  count: number;
}

/** Counts active changes at or past each phase (funnel). */
export function phaseFunnel(ws: Workspace): PhaseFunnel[] {
  const order = PHASES.map((p) => p.state);
  const counts = new Map<string, number>();
  for (const p of order) counts.set(p, 0);
  for (const change of ws.listChanges()) {
    const meta = readMeta(ws, change);
    const idx = order.indexOf(meta.status);
    if (idx >= 0) counts.set(meta.status, (counts.get(meta.status) ?? 0) + 1);
  }
  return order.map((phase) => ({ phase, count: counts.get(phase) ?? 0 }));
}

export interface AssetEffectivenessRow {
  id: string;
  kind: string;
  layer: string;
  runs: number;
  failures: number;
}

export function assetEffectiveness(ws: Workspace): AssetEffectivenessRow[] {
  const { resolved } = resolveAssets(ws);
  return [...resolved.values()]
    .map((a) => ({
      id: a.manifest.id,
      kind: a.manifest.kind,
      layer: a.layer,
      runs: Number(a.manifest.metrics["runs"] ?? 0),
      failures: Number(a.manifest.metrics["failures"] ?? 0)
    }))
    .sort((a, b) => b.runs - a.runs);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function renderDashboard(ws: Workspace): string {
  const rows = collectStatus(ws);
  const funnel = phaseFunnel(ws);
  const assets = assetEffectiveness(ws).slice(0, 12);
  const coverage = coverageReport(ws);
  const telemetry = telemetrySummary(ws);
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  const phaseBar = (status: string) => {
    const idx = PHASES.findIndex((p) => p.state === status);
    return PHASES.map((p, i) => `<span class="ph ${i <= idx ? "on" : ""}" title="${p.display}">${p.display[0]}</span>`).join("");
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HarnessX Dashboard</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;background:#0f172a;color:#e2e8f0}
h1{font-size:1.3rem} h2{font-size:1rem;margin-top:2rem;color:#94a3b8}
table{border-collapse:collapse;width:100%;margin-top:.6rem}
th,td{padding:.5rem .8rem;border-bottom:1px solid #334155;text-align:left;font-size:.9rem}
.ph{display:inline-block;width:1.4em;text-align:center;border-radius:3px;margin-right:2px;background:#1e293b;color:#64748b}
.ph.on{background:#0ea5e9;color:#fff}
.pass{color:#4ade80}.fail{color:#f87171}
.badge{background:#1e293b;border-radius:4px;padding:.1rem .45rem;font-size:.8rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.8rem;margin-top:.8rem}
.card{background:#1e293b;border-radius:8px;padding:.8rem}
.card strong{font-size:1.4rem;display:block}
.bar{height:8px;background:#334155;border-radius:4px;margin-top:4px}
.bar>i{display:block;height:100%;background:#0ea5e9;border-radius:4px}
</style></head><body>
<h1>HarnessX — Delivery Dashboard</h1>
<div class="grid">
  <div class="card"><span>Sensor runs</span><strong>${telemetry.sensorRuns}</strong></div>
  <div class="card"><span>First-attempt pass</span><strong>${(coverage.metrics.firstAttemptPassRate * 100).toFixed(0)}%</strong></div>
  <div class="card"><span>Recurrent patterns</span><strong>${coverage.metrics.recurrentPatterns}</strong></div>
  <div class="card"><span>Uncovered patterns</span><strong>${coverage.uncoveredPatterns}</strong></div>
</div>

<h2>Phase funnel (active changes)</h2>
${funnel
  .map(
    (f) => `<div style="margin:.35rem 0"><span class="badge">${esc(f.phase)}</span> ${f.count}
  <div class="bar"><i style="width:${((f.count / maxFunnel) * 100).toFixed(0)}%"></i></div></div>`
  )
  .join("")}

<h2>Changes</h2>
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
  <td>${r.lastGate ? `<span class="${r.lastGate.passed ? "pass" : "fail"}">${r.lastGate.phase} ${r.lastGate.passed ? "✓" : "✗"}</span>` : "—"}</td>
</tr>`
  )
  .join("\n")}
</tbody></table>

<h2>Asset effectiveness (top by runs)</h2>
<table><thead><tr><th>Asset</th><th>Kind</th><th>Layer</th><th>Runs</th><th>Failures</th></tr></thead>
<tbody>
${assets.map((a) => `<tr><td>${esc(a.id)}</td><td>${esc(a.kind)}</td><td>${esc(a.layer)}</td><td>${a.runs}</td><td>${a.failures}</td></tr>`).join("\n")}
</tbody></table>

<p><small>Generated ${new Date().toISOString()} by hx view (v0.4)</small></p>
</body></html>`;
}

export function writeDashboard(ws: Workspace, outFile: string): string {
  fs.writeFileSync(outFile, renderDashboard(ws), "utf8");
  return outFile;
}
