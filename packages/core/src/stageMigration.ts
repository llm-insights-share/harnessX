import type { MetaYaml, PhaseState } from "./schemas.js";
import { STATUS_TO_STAGE_TASK, type DeliveryStage } from "./stages.js";

export interface MigratedMeta {
  stage: DeliveryStage;
  task: string;
  stageProgress: NonNullable<MetaYaml["stageProgress"]>;
}

/** Map legacy meta.status to v0.5 stage + task fields. */
export function migrateMetaV04ToV05(meta: MetaYaml): MigratedMeta {
  const mapped = STATUS_TO_STAGE_TASK[meta.status] ?? { stage: "dev" as DeliveryStage, task: "propose" };
  const stageProgress: NonNullable<MetaYaml["stageProgress"]> = {
    ...(meta.stageProgress ?? {}),
    [mapped.stage]: {
      done: meta.status === "archived",
      current: mapped.task,
      completed: completedTasksForStatus(meta.status),
      ...(meta.stageProgress?.[mapped.stage] ?? {})
    }
  };
  return { stage: mapped.stage, task: mapped.task, stageProgress };
}

function completedTasksForStatus(status: PhaseState): string[] {
  const order: { status: PhaseState; task: string }[] = [
    { status: "explore", task: "requirements-research" },
    { status: "proposed", task: "propose" },
    { status: "designed", task: "design" },
    { status: "specified", task: "design" },
    { status: "planned", task: "plan" },
    { status: "test_designed", task: "test-case-design" },
    { status: "implementing", task: "apply" },
    { status: "verified", task: "verify" },
    { status: "archived", task: "archive" }
  ];
  const idx = order.findIndex((o) => o.status === status);
  if (idx < 0) return [];
  const tasks: string[] = [];
  for (let i = 0; i < idx; i++) {
    if (!tasks.includes(order[i].task)) tasks.push(order[i].task);
  }
  return tasks;
}

/** Ensure meta has stage fields; does not write. */
export function ensureStageFields(meta: MetaYaml): MetaYaml {
  if (meta.stage && meta.task) return meta;
  const migrated = migrateMetaV04ToV05(meta);
  return {
    ...meta,
    stage: meta.stage ?? migrated.stage,
    task: meta.task ?? migrated.task,
    stageProgress: meta.stageProgress ?? migrated.stageProgress,
    taskHistory: meta.taskHistory ?? []
  };
}
