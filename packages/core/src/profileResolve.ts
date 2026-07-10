import type { HarnessYaml, ProfileDef } from "./schemas.js";
import {
  DEFAULT_PROFILE_STAGES,
  type DeliveryStage,
  STAGE_TASKS,
  TASK_TO_PHASE,
  suiteKey
} from "./stages.js";

/** Legacy phase list derived from a profile (phases field or stages conversion). */
export function profilePhases(harness: HarnessYaml, profile: string): string[] {
  const p = resolveProfile(harness, profile);
  if (p.phases?.length) return p.phases;
  return stagesToPhases(p);
}

export function profileStages(harness: HarnessYaml, profile: string): DeliveryStage[] {
  const p = resolveProfile(harness, profile);
  if (p.stages?.length) return p.stages;
  return phasesToStages(p.phases ?? []);
}

export function profileDevTasks(harness: HarnessYaml, profile: string): string[] {
  const p = resolveProfile(harness, profile);
  if (p.dev_tasks?.length) return p.dev_tasks;
  const defaults = DEFAULT_PROFILE_STAGES[profile]?.dev_tasks;
  if (defaults) return defaults;
  return (p.phases ?? [])
    .filter((cmd) => ["plan", "propose", "design", "spec", "apply", "verify", "archive"].includes(cmd));
}

export function profileTestTasks(harness: HarnessYaml, profile: string): string[] {
  const p = resolveProfile(harness, profile);
  if (p.test_tasks?.length) return p.test_tasks;
  const defaults = DEFAULT_PROFILE_STAGES[profile]?.test_tasks;
  if (defaults) return defaults;
  if ((p.phases ?? []).includes("test-design")) return ["test-case-design", "test-execution"];
  if (profileStages(harness, profile).includes("test")) return ["test-execution"];
  return [];
}

export function resolveProfile(harness: HarnessYaml, profile: string): ProfileDef {
  const p = harness.profiles[profile];
  if (!p) throw new Error(`profile "${profile}" not defined in harness.yaml`);
  return p;
}

/** Convert legacy phases array to four delivery stages. */
export function phasesToStages(phases: string[]): DeliveryStage[] {
  const stages: DeliveryStage[] = [];
  const add = (s: DeliveryStage) => {
    if (!stages.includes(s)) stages.push(s);
  };
  if (phases.includes("explore") || phases.includes("propose")) add("req");
  if (phases.includes("design") || phases.includes("spec")) add("arch");
  if (phases.some((p) => ["plan", "propose", "design", "spec", "apply", "verify", "archive"].includes(p))) add("dev");
  if (phases.includes("test-design") || phases.includes("verify")) add("test");
  return stages.length ? stages : ["dev"];
}

/** Convert stages profile to legacy phase commands for compat gate. */
export function stagesToPhases(p: ProfileDef): string[] {
  if (p.phases?.length) return p.phases;
  const profileName = inferProfileName(p);
  const stages = p.stages ?? DEFAULT_PROFILE_STAGES[profileName]?.stages ?? ["dev"];
  const phases: string[] = [];
  if (stages.includes("req") && profileName !== "lite") phases.push("explore");
  const devTasks = p.dev_tasks ?? DEFAULT_PROFILE_STAGES[profileName]?.dev_tasks ?? STAGE_TASKS.dev.map((t) => t.id);
  for (const task of devTasks) {
    const cmd = TASK_TO_PHASE[task] ?? task;
    if (cmd === "design" && !phases.includes("propose")) phases.push("propose");
    if (!phases.includes(cmd)) {
      if (task === "design" && !phases.includes("spec")) phases.push("spec");
      phases.push(cmd);
    }
  }
  const testTasks = p.test_tasks ?? DEFAULT_PROFILE_STAGES[profileName]?.test_tasks ?? [];
  if (testTasks.includes("test-case-design") && !phases.includes("test-design")) {
    const planIdx = phases.indexOf("plan");
    const applyIdx = phases.indexOf("apply");
    if (planIdx >= 0 && applyIdx > planIdx) phases.splice(applyIdx, 0, "test-design");
    else phases.push("test-design");
  }
  return phases;
}

function inferProfileName(p: ProfileDef): string {
  const dev = p.dev_tasks ?? [];
  if (dev.length === 3 && dev.includes("propose") && dev.includes("apply") && dev.includes("archive")) return "lite";
  if (p.test_tasks?.includes("test-case-design")) return "enterprise-sdlc";
  return "standard";
}

/** Suite name for a stage task (stages mode) or legacy phase command. */
export function resolveSuiteName(harness: HarnessYaml, profile: string, stage: DeliveryStage, taskId: string): string | undefined {
  const p = resolveProfile(harness, profile);
  const key = suiteKey(stage, taskId);
  if (p.suites[key]) return p.suites[key];
  const phase = TASK_TO_PHASE[taskId];
  if (phase && p.suites[phase]) return p.suites[phase];
  return undefined;
}

export function normalizeHarnessProfiles(harness: HarnessYaml): HarnessYaml {
  const profiles: Record<string, ProfileDef> = {};
  for (const [name, p] of Object.entries(harness.profiles)) {
    const defaults = DEFAULT_PROFILE_STAGES[name];
    profiles[name] = {
      ...p,
      phases: p.phases ?? (defaults ? stagesToPhases({ ...p, stages: p.stages ?? defaults.stages }) : p.phases),
      stages: p.stages ?? defaults?.stages ?? phasesToStages(p.phases ?? []),
      dev_tasks: p.dev_tasks ?? defaults?.dev_tasks,
      test_tasks: p.test_tasks ?? defaults?.test_tasks,
      suites: p.suites ?? {}
    };
  }
  return { ...harness, profiles };
}
