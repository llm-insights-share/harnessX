import type { HarnessYaml, ProfileDef } from "./schemas.js";
import { DEFAULT_PROFILE_STAGES, type DeliveryStage, STAGE_TASKS, suiteKey } from "./stages.js";

export function profileStages(harness: HarnessYaml, profile: string): DeliveryStage[] {
  const p = resolveProfile(harness, profile);
  if (p.stages?.length) return p.stages;
  const defaults = DEFAULT_PROFILE_STAGES[profile]?.stages;
  return defaults ?? ["dev"];
}

export function profileDevTasks(harness: HarnessYaml, profile: string): string[] {
  const p = resolveProfile(harness, profile);
  if (p.dev_tasks?.length) return p.dev_tasks;
  const defaults = DEFAULT_PROFILE_STAGES[profile]?.dev_tasks;
  if (defaults) return defaults;
  return STAGE_TASKS.dev.filter((t) => t.required).map((t) => t.id);
}

export function profileTestTasks(harness: HarnessYaml, profile: string): string[] {
  const p = resolveProfile(harness, profile);
  if (p.test_tasks?.length) return p.test_tasks;
  const defaults = DEFAULT_PROFILE_STAGES[profile]?.test_tasks;
  if (defaults) return defaults;
  if (profileStages(harness, profile).includes("test")) return ["test-case-design", "test-execution"];
  return [];
}

export function profileReqTasks(harness: HarnessYaml, profile: string): string[] {
  const p = resolveProfile(harness, profile);
  if (p.req_tasks?.length) return p.req_tasks;
  if (profileStages(harness, profile).includes("req")) return STAGE_TASKS.req.filter((t) => t.required).map((t) => t.id);
  return [];
}

export function profileArchTasks(harness: HarnessYaml, profile: string): string[] {
  const p = resolveProfile(harness, profile);
  if (p.arch_tasks?.length) return p.arch_tasks;
  if (profileStages(harness, profile).includes("arch")) return STAGE_TASKS.arch.filter((t) => t.required).map((t) => t.id);
  return [];
}

export function resolveProfile(harness: HarnessYaml, profile: string): ProfileDef {
  const p = harness.profiles[profile];
  if (!p) throw new Error(`profile "${profile}" not defined in harness.yaml`);
  return p;
}

/** Suite name for a stage task. */
export function resolveSuiteName(harness: HarnessYaml, profile: string, stage: DeliveryStage, taskId: string): string | undefined {
  const p = resolveProfile(harness, profile);
  const key = suiteKey(stage, taskId);
  return p.suites[key];
}

export function normalizeHarnessProfiles(harness: HarnessYaml): HarnessYaml {
  const profiles: Record<string, ProfileDef> = {};
  for (const [name, p] of Object.entries(harness.profiles)) {
    const defaults = DEFAULT_PROFILE_STAGES[name];
    profiles[name] = {
      ...p,
      stages: p.stages ?? defaults?.stages ?? ["dev"],
      dev_tasks: p.dev_tasks ?? defaults?.dev_tasks,
      test_tasks: p.test_tasks ?? defaults?.test_tasks,
      req_tasks: p.req_tasks,
      arch_tasks: p.arch_tasks,
      suites: p.suites ?? {}
    };
  }
  return { ...harness, profiles };
}
