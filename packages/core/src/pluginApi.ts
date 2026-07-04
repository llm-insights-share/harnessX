import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Workspace } from "./paths.js";
import { PLUGIN_API_VERSION, SensorReport, type SensorDef } from "./schemas.js";

/**
 * T-610 (FR-024/NFR-008): custom sensor plugin API.
 * - Node plugins: an ES module exporting { api, id, execute(ctx) }.
 * - Python/other: a `#!`-style executable declared as `plugin: cmd:<command>`;
 *   the context is passed as JSON on stdin, the report returned as JSON on stdout.
 * Compatibility: a plugin's `api` major version must equal the host's
 * (SemVer — the host stays backward compatible within one major).
 */

export interface PluginContext {
  root: string;
  base: string;
  change?: string;
  sensor: { id: string; kind: string; execution: string };
}

export interface NodeSensorPlugin {
  api: string;
  id: string;
  execute(ctx: PluginContext): Promise<unknown> | unknown;
}

export function apiCompatible(pluginApi: string, hostApi = PLUGIN_API_VERSION): boolean {
  const major = (v: string) => v.split(".")[0];
  return major(pluginApi) === major(hostApi);
}

export async function runPluginSensor(ws: Workspace, def: SensorDef, change?: string): Promise<SensorReport> {
  const spec = def.plugin!;
  const ctx: PluginContext = {
    root: ws.root,
    base: ws.base,
    change,
    sensor: { id: def.id, kind: def.kind, execution: def.execution }
  };

  if (spec.startsWith("cmd:")) {
    const cmd = spec.slice(4);
    const res = spawnSync(cmd, { shell: true, cwd: ws.root, input: JSON.stringify(ctx), encoding: "utf8", timeout: def.timeout_ms });
    if (res.error || res.signal) throw new Error(`plugin command failed: ${res.error?.message ?? res.signal}`);
    const line = (res.stdout ?? "").trim().split("\n").findLast((l) => l.startsWith("{"));
    if (!line) throw new Error("plugin produced no JSON report (fail-closed)");
    return SensorReport.parse({ sensor: def.id, ...JSON.parse(line) });
  }

  const file = path.isAbsolute(spec) ? spec : path.join(ws.base, spec);
  if (!fs.existsSync(file)) throw new Error(`plugin module not found: ${file}`);
  const mod = (await import(pathToFileURL(file).href)) as { default?: NodeSensorPlugin } & Partial<NodeSensorPlugin>;
  const plugin = (mod.default ?? mod) as NodeSensorPlugin;
  if (!plugin.api || !plugin.execute) throw new Error("plugin must export { api, id, execute }");
  if (!apiCompatible(plugin.api)) {
    throw new Error(`plugin api ${plugin.api} incompatible with host ${PLUGIN_API_VERSION} (major must match)`);
  }
  const raw = await plugin.execute(ctx);
  return SensorReport.parse({ sensor: def.id, ...(raw as object) });
}
