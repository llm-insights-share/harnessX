import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Task } from "./plan.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const L1_AGENT_ENV_SCHEMA = path.resolve(HERE, "../../../schemas/l1/agent-env-contract.json");
export const L1_AGENT_ENV_SCHEMA_ID = "https://harnessx.dev/schemas/l1/agent-env-contract.json";

/** Apply-loop environment contract for Tier-1 agent runners. */
export interface ApplyTaskEnv {
  HX_CHANGE: string;
  HX_PHASE: "apply";
  HX_STAGE: "dev";
  HX_TASK: "apply";
  HX_TASK_ID: string;
  HX_TASK_TRACK: Task["track"];
  HX_TASK_TITLE: string;
  HX_TASK_REQUIREMENT: string;
  HX_TASK_PACK: string;
  HX_FIX_HINTS: string;
}

/** Fix-session environment contract. */
export interface FixSessionEnv {
  HX_CHANGE: string;
  HX_FIX_SENSOR: string;
  HX_FIX_PACK: string;
  HX_FIX_HINTS: string;
}

export function buildApplyTaskEnv(change: string, task: Task, taskPackPath: string, fixHints: string[] = []): ApplyTaskEnv {
  return {
    HX_CHANGE: change,
    HX_PHASE: "apply",
    HX_STAGE: "dev",
    HX_TASK: "apply",
    HX_TASK_ID: task.id,
    HX_TASK_TRACK: task.track,
    HX_TASK_TITLE: task.title,
    HX_TASK_REQUIREMENT: task.requirement,
    HX_TASK_PACK: taskPackPath,
    HX_FIX_HINTS: fixHints.join("\n")
  };
}

export function buildFixSessionEnv(change: string, sensorId: string, fixPackPath: string, fixHints: string[] = []): FixSessionEnv {
  return {
    HX_CHANGE: change,
    HX_FIX_SENSOR: sensorId,
    HX_FIX_PACK: fixPackPath,
    HX_FIX_HINTS: fixHints.join("\n")
  };
}

/** Maps contract object to process.env-compatible strings. */
export function envFromContract(contract: Record<string, string>): Record<string, string> {
  return { ...contract };
}
