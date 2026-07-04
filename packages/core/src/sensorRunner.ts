import { spawnSync } from "node:child_process";
import { Workspace } from "./paths.js";
import { SensorReport, type HarnessYaml, type SensorDef, type SuiteResult } from "./schemas.js";
import { appendRun } from "./telemetry.js";
import { recordFailure } from "./failureCatalog.js";

export type BuiltinSensorFn = (ctx: {
  ws: Workspace;
  change?: string;
  def: SensorDef;
  changedFiles?: string[];
}) => Promise<SensorReport> | SensorReport;

export interface RunnerOptions {
  builtins: Record<string, BuiltinSensorFn>;
  changedFiles?: string[];
  /** Sensor ids waived for this run (valid, unexpired waivers). */
  waivedSensors?: string[];
}

/**
 * T-201 (FR-021/FR-024/FR-053): executes one sensor with retry semantics.
 * Fail-closed: crashes, timeouts and unparseable output all yield status=error → blocker.
 */
export async function runSensor(
  ws: Workspace,
  def: SensorDef,
  change: string | undefined,
  opts: RunnerOptions
): Promise<SensorReport> {
  const attempts = def.on_fail === "retry" ? def.max_retries + 1 : 1;
  let report: SensorReport = { sensor: def.id, status: "error", summary: "sensor did not run", findings: [] };
  for (let i = 0; i < attempts; i++) {
    report = await runOnce(ws, def, change, opts);
    if (report.status === "pass") break;
  }
  // full report is persisted on failure so `hx fix` can rebuild context (T-611)
  appendRun(ws, {
    kind: "sensor",
    change,
    name: def.id,
    status: report.status,
    detail: report.status === "pass" ? { summary: report.summary } : report
  });
  if (report.status !== "pass") recordFailure(ws, { sensor: def.id, change, report });
  return report;
}

async function runOnce(ws: Workspace, def: SensorDef, change: string | undefined, opts: RunnerOptions): Promise<SensorReport> {
  try {
    if (def.builtin) {
      const fn = opts.builtins[def.builtin];
      if (!fn) return errorReport(def, `builtin sensor "${def.builtin}" is not registered`);
      const r = await fn({ ws, change, def, changedFiles: opts.changedFiles });
      return SensorReport.parse(r);
    }
    if (def.run) {
      return runShellSensor(ws, def, change);
    }
    if (def.plugin) {
      const { runPluginSensor } = await import("./pluginApi.js");
      return await runPluginSensor(ws, def, change);
    }
    return errorReport(def, "sensor has neither builtin, run, nor plugin");
  } catch (e) {
    // fail-closed (FR-053)
    return errorReport(def, `sensor crashed: ${(e as Error).message}`);
  }
}

function errorReport(def: SensorDef, message: string): SensorReport {
  return {
    sensor: def.id,
    status: "error",
    summary: message,
    findings: [{ severity: "block", message }],
    fix_hint: def.fix_hint,
    agent_instruction: "This sensor errored; the gate is blocked (fail-closed). Fix the sensor configuration or the underlying issue."
  };
}

/** Shell sensor protocol: exit 0 = pass; JSON on stdout is parsed as a SensorReport when present. */
export function runShellSensor(ws: Workspace, def: SensorDef, change?: string): SensorReport {
  const cmd = (def.run as string).replaceAll("$CHANGE", change ?? "");
  const res = spawnSync(cmd, { shell: true, cwd: ws.root, timeout: def.timeout_ms, encoding: "utf8" });
  if (res.error) return errorReport(def, `spawn failed: ${res.error.message}`);
  if (res.signal) return errorReport(def, `sensor timed out or was killed (${res.signal})`);

  const stdout = (res.stdout ?? "").trim();
  const jsonLine = stdout.split("\n").find((l) => l.startsWith("{"));
  if (jsonLine) {
    try {
      const parsed = SensorReport.parse({ sensor: def.id, ...JSON.parse(jsonLine) });
      return parsed;
    } catch {
      if (res.status !== 0) return errorReport(def, "sensor emitted unparseable JSON report (fail-closed)");
    }
  }
  if (res.status === 0) return { sensor: def.id, status: "pass", summary: "ok", findings: [] };
  return {
    sensor: def.id,
    status: "fail",
    summary: `exit ${res.status}`,
    findings: [
      {
        severity: "block",
        message: (res.stderr || stdout || `command failed: ${cmd}`).slice(0, 2000)
      }
    ],
    fix_hint: def.fix_hint,
    fix_command: change ? `hx fix --change ${change} --sensor ${def.id}` : undefined
  };
}

/** Runs a named Sensor Suite from harness.yaml; aggregates blockers/warnings (FR-021). */
export async function runSuite(
  ws: Workspace,
  harness: HarnessYaml,
  suiteName: string,
  change: string | undefined,
  opts: RunnerOptions
): Promise<SuiteResult> {
  const ids = harness.suites[suiteName];
  if (!ids) {
    return {
      suite: suiteName,
      passed: false,
      reports: [],
      blockers: [`suite "${suiteName}" is not defined in harness.yaml (fail-closed)`],
      warnings: [],
      fixHints: []
    };
  }
  const result: SuiteResult = { suite: suiteName, passed: true, reports: [], blockers: [], warnings: [], fixHints: [] };
  for (const id of ids) {
    const def = harness.sensors.find((s) => s.id === id);
    if (!def) {
      result.blockers.push(`sensor "${id}" referenced by suite "${suiteName}" is not registered (fail-closed)`);
      continue;
    }
    const report = await runSensor(ws, def, change, opts);
    result.reports.push(report);
    const waived = opts.waivedSensors?.includes(def.id) ?? false;
    if (report.status === "pass") continue;
    const label = `${def.id}: ${report.summary}`;
    if (waived) result.warnings.push(`${label} (waived)`);
    else if (report.status === "error") result.blockers.push(`${label} [sensor error — fail-closed]`);
    else if (def.on_fail === "warn") result.warnings.push(label);
    else result.blockers.push(label);
    if (report.fix_hint) result.fixHints.push(`${def.id}: ${report.fix_hint}`);
  }
  result.passed = result.blockers.length === 0;
  appendRun(ws, { kind: "suite", change, name: suiteName, status: result.passed ? "pass" : "fail", detail: { blockers: result.blockers } });
  return result;
}
