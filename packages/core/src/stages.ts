/**
 * Four-stage delivery model (req → arch → dev → test).
 * Authoritative stage/task registry; legacy PHASES are aliases for dev/test tasks.
 */

export const DELIVERY_STAGES = ["req", "arch", "dev", "test"] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

export interface StageTaskDef {
  id: string;
  title: { zh: string; en: string };
  required: boolean;
  /** Legacy gate phase command (dev/test tasks). */
  command?: string;
  guides?: string[];
  sensors?: string[];
}

export interface StageInfo {
  id: DeliveryStage;
  display: { zh: string; en: string };
  output: { zh: string; en: string };
  scope: "org" | "change";
}

export const STAGE_INFO: Record<DeliveryStage, StageInfo> = {
  req: {
    id: "req",
    display: { zh: "需求", en: "Requirements" },
    output: { zh: "产品需求文档", en: "Product requirements document" },
    scope: "org"
  },
  arch: {
    id: "arch",
    display: { zh: "设计", en: "Architecture" },
    output: { zh: "概要设计文档 + 子系统详细设计文档", en: "HLD + module LLD" },
    scope: "org"
  },
  dev: {
    id: "dev",
    display: { zh: "开发", en: "Development" },
    output: { zh: "可运行代码", en: "Runnable code" },
    scope: "change"
  },
  test: {
    id: "test",
    display: { zh: "测试", en: "Testing" },
    output: { zh: "测试用例 + 测试报告", en: "Test cases + test report" },
    scope: "change"
  }
};

export const STAGE_TASKS: Record<DeliveryStage, StageTaskDef[]> = {
  req: [
    { id: "biz-understanding", title: { zh: "业务理解", en: "Business understanding" }, required: false, guides: ["requirements-research-outline"] },
    { id: "requirements-research", title: { zh: "需求调研", en: "Requirements research" }, required: false, command: "explore" },
    { id: "requirements-analysis", title: { zh: "需求分析", en: "Requirements analysis" }, required: true, sensors: ["requirements-complete"] },
    { id: "prototype-design", title: { zh: "产品原型设计", en: "Prototype design" }, required: true, guides: ["prototype-wireframe"] },
    { id: "prd-writing", title: { zh: "产品需求文档编写", en: "PRD writing" }, required: true, command: "prd", sensors: ["prd-complete", "prd-approved"] }
  ],
  arch: [
    { id: "subsystem-division", title: { zh: "子系统划分", en: "Subsystem division" }, required: true, command: "arch", sensors: ["arch-hld-complete"] },
    { id: "tech-selection", title: { zh: "技术选型", en: "Technology selection" }, required: true },
    { id: "database-design", title: { zh: "数据库设计", en: "Database design" }, required: true },
    { id: "interface-design", title: { zh: "接口设计", en: "Interface design" }, required: true },
    { id: "key-mechanisms", title: { zh: "关键设计机制", en: "Key design mechanisms" }, required: false },
    {
      id: "internal-interface",
      title: { zh: "内部接口设计", en: "Internal interface design" },
      required: true,
      command: "arch-lld",
      sensors: ["arch-lld-complete", "arch-lld-approved"]
    }
  ],
  dev: [
    { id: "plan", title: { zh: "开发计划", en: "Development plan" }, required: true, command: "plan", sensors: ["plan-coverage"] },
    { id: "propose", title: { zh: "change:propose", en: "change:propose" }, required: true, command: "propose" },
    { id: "design", title: { zh: "change:design", en: "change:design" }, required: true, command: "design", sensors: ["design-hld-complete", "design-lld-complete"] },
    { id: "apply", title: { zh: "change:apply", en: "change:apply" }, required: true, command: "apply" },
    { id: "verify", title: { zh: "change:verify", en: "change:verify" }, required: true, command: "verify", sensors: ["spec-validate", "spec-trace"] },
    { id: "archive", title: { zh: "change:archive", en: "change:archive" }, required: true, command: "archive" }
  ],
  test: [
    {
      id: "test-case-design",
      title: { zh: "测试用例设计", en: "Test case design" },
      required: true,
      command: "test-cases",
      sensors: ["test-cases-complete", "test-cases-approved"]
    },
    { id: "test-execution", title: { zh: "测试任务执行", en: "Test execution" }, required: true, sensors: ["uat-complete", "bugs-closed"] }
  ]
};

/** Default task sequences per profile (stages mode). */
export const DEFAULT_PROFILE_STAGES: Record<string, { stages: DeliveryStage[]; dev_tasks?: string[]; test_tasks?: string[] }> = {
  lite: { stages: ["dev"], dev_tasks: ["propose", "apply", "archive"] },
  standard: { stages: ["req", "arch", "dev", "test"], dev_tasks: ["plan", "propose", "design", "apply", "verify", "archive"] },
  strict: { stages: ["req", "arch", "dev", "test"], dev_tasks: ["plan", "propose", "design", "apply", "verify", "archive"] },
  enterprise: { stages: ["req", "arch", "dev", "test"], dev_tasks: ["plan", "propose", "design", "apply", "verify", "archive"] },
  "enterprise-sdlc": {
    stages: ["req", "arch", "dev", "test"],
    dev_tasks: ["plan", "propose", "design", "apply", "verify", "archive"],
    test_tasks: ["test-case-design", "test-execution"]
  }
};

/** Legacy phase command → stage + task (for compat and migration). */
export const PHASE_TO_STAGE_TASK: Record<string, { stage: DeliveryStage; task: string }> = {
  explore: { stage: "req", task: "requirements-research" },
  prd: { stage: "req", task: "prd-writing" },
  propose: { stage: "dev", task: "propose" },
  design: { stage: "dev", task: "design" },
  spec: { stage: "dev", task: "design" },
  plan: { stage: "dev", task: "plan" },
  "test-design": { stage: "test", task: "test-case-design" },
  apply: { stage: "dev", task: "apply" },
  verify: { stage: "dev", task: "verify" },
  archive: { stage: "dev", task: "archive" },
  arch: { stage: "arch", task: "subsystem-division" },
  "arch-lld": { stage: "arch", task: "internal-interface" }
};

/** Legacy meta.status → stage + task. */
export const STATUS_TO_STAGE_TASK: Record<string, { stage: DeliveryStage; task: string }> = {
  explore: { stage: "req", task: "requirements-research" },
  proposed: { stage: "dev", task: "propose" },
  designed: { stage: "dev", task: "design" },
  specified: { stage: "dev", task: "design" },
  planned: { stage: "dev", task: "plan" },
  test_designed: { stage: "test", task: "test-case-design" },
  implementing: { stage: "dev", task: "apply" },
  verified: { stage: "dev", task: "verify" },
  archived: { stage: "dev", task: "archive" }
};

/** task → legacy phase command for gate suite lookup in compat bridge. */
export const TASK_TO_PHASE: Record<string, string> = {
  "requirements-research": "explore",
  "prd-writing": "prd",
  plan: "plan",
  propose: "propose",
  design: "design",
  apply: "apply",
  verify: "verify",
  archive: "archive",
  "test-case-design": "test-design",
  "test-execution": "verify"
};

export function taskById(stage: DeliveryStage, taskId: string): StageTaskDef | undefined {
  return STAGE_TASKS[stage].find((t) => t.id === taskId);
}

export function stageTaskIds(stage: DeliveryStage, onlyRequired = false): string[] {
  return STAGE_TASKS[stage].filter((t) => !onlyRequired || t.required).map((t) => t.id);
}

export function phaseToStageTask(phaseCmd: string): { stage: DeliveryStage; task: string } | undefined {
  return PHASE_TO_STAGE_TASK[phaseCmd];
}

export function statusToStageTask(status: string): { stage: DeliveryStage; task: string } {
  return STATUS_TO_STAGE_TASK[status] ?? { stage: "dev", task: "propose" };
}

export function suiteKey(stage: DeliveryStage, taskId: string): string {
  return `${stage}.${taskId}`;
}
