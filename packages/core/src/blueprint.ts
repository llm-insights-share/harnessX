import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace, writeYaml } from "./paths.js";
import { BlueprintYaml, HarnessYaml } from "./schemas.js";
import { hubAdd, type HubRef } from "./hub.js";
import { writeLock } from "./assets.js";
import { resolveHarnessGuideDef, resolveHarnessSensorDef } from "./harnessCompose.js";

/**
 * Delivery Blueprint — composes workflow profile, phase assets, and hub dependencies
 * into a reusable delivery path (v0.3 layered upgrade).
 */

export function blueprintFile(ws: Workspace): string {
  return path.join(ws.base, "blueprint.yaml");
}

export function readBlueprint(ws: Workspace): BlueprintYaml | null {
  const file = blueprintFile(ws);
  if (!fs.existsSync(file)) return null;
  return BlueprintYaml.parse(YAML.parse(fs.readFileSync(file, "utf8")));
}

export function hubBlueprintDir(hubRoot: string, name: string, version: string): string {
  return path.join(hubRoot, "blueprints", name, version);
}

/** Applies a blueprint: profile, hub deps, phase asset wiring into harness.yaml. */
export function applyBlueprint(ws: Workspace, blueprint: BlueprintYaml, hubRoot?: string): string[] {
  const applied: string[] = [];
  const harness = HarnessYaml.parse(YAML.parse(fs.readFileSync(ws.harnessFile, "utf8")));
  let harnessChanged = false;

  if (blueprint.extends) {
    if (!harness.profiles[blueprint.extends]) throw new Error(`blueprint extends unknown profile "${blueprint.extends}"`);
    const config = ws.readConfig();
    writeYaml(ws.configFile, { ...config, profile: blueprint.extends });
    applied.push(`profile → ${blueprint.extends}`);
  }

  if (hubRoot && blueprint.hub_deps.length) {
    for (const dep of blueprint.hub_deps) {
      const ref = parseHubDep(dep);
      hubAdd(ws, hubRoot, ref);
      if (!harness.dependencies.includes(`${ref.id}@${ref.version}`)) {
        harness.dependencies.push(`${ref.id}@${ref.version}`);
      }
      applied.push(`hub: ${ref.id}@${ref.version}`);
    }
    harnessChanged = true;
  }

  if (blueprint.phases) {
    for (const [phase, cfg] of Object.entries(blueprint.phases)) {
      for (const gid of cfg.guides ?? []) {
        if (harness.guides.some((g) => g.id === gid)) continue;
        const def = resolveHarnessGuideDef(ws, gid, { hubRoot, phaseHint: phase });
        if (def) {
          harness.guides.push(def);
          applied.push(`guide: ${gid} → harness.yaml (phase ${phase})`);
          harnessChanged = true;
        } else {
          applied.push(`warn: guide "${gid}" for phase ${phase} not resolvable — install via hub`);
        }
      }
      for (const sid of cfg.sensors ?? []) {
        if (harness.sensors.some((s) => s.id === sid)) continue;
        const def = resolveHarnessSensorDef(ws, sid, { hubRoot, phaseHint: phase });
        if (def) {
          harness.sensors.push(def);
          applied.push(`sensor: ${sid} → harness.yaml (phase ${phase})`);
          harnessChanged = true;
        } else {
          applied.push(`warn: sensor "${sid}" for phase ${phase} not resolvable — install via hub`);
        }
      }
    }
  }

  if (harnessChanged) {
    fs.writeFileSync(ws.harnessFile, YAML.stringify(HarnessYaml.parse(harness)), "utf8");
    writeLock(ws);
  }

  writeYaml(blueprintFile(ws), blueprint);
  applied.push("blueprint.yaml");
  return applied;
}

export function parseHubDep(dep: string): HubRef {
  const [id, version] = dep.split("@");
  if (!id || !version) throw new Error(`invalid hub dependency "${dep}" — use <id>@<version>`);
  return { id, version };
}

/** Loads a blueprint package from hub and applies it to a workspace. */
export function applyHubBlueprint(ws: Workspace, hubRoot: string, ref: HubRef): string[] {
  const dir = hubBlueprintDir(hubRoot, ref.id, ref.version);
  const file = path.join(dir, "blueprint.yaml");
  if (!fs.existsSync(file)) throw new Error(`hub blueprint ${ref.id}@${ref.version} not found at ${dir}`);
  const bp = BlueprintYaml.parse(YAML.parse(fs.readFileSync(file, "utf8")));
  return applyBlueprint(ws, { ...bp, name: bp.name || ref.id }, hubRoot);
}
