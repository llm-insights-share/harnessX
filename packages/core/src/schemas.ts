import { z } from "zod";

/** Plugin API version (NFR-008): consumers accept same major. */
export const PLUGIN_API_VERSION = "1.0.0";

export const DELIVERY_STAGE = z.enum(["req", "arch", "dev", "test"]);
export type DeliveryStage = z.infer<typeof DELIVERY_STAGE>;

/* ── Asset kinds ── */

export const GUIDE_KINDS = [
  "guide.template",
  "guide.skill",
  "guide.exemplar",
  "guide.scaffold",
  "guide.codemod",
  "guide.constraint",
  "guide.glossary",
  "guide.capability",
  "guide.command",
  "guide.env"
] as const;

export const SENSOR_KINDS = [
  "sensor.rule",
  "sensor.script",
  "sensor.arch",
  "sensor.rubric",
  "sensor.fixture",
  "sensor.budget",
  "sensor.drift",
  "sensor.mutation",
  "sensor.eval"
] as const;

export const ORCH_KINDS = ["orch.profile", "orch.waiver", "orch.pattern"] as const;
export const HUB_KINDS = ["harness.bundle", "harness.blueprint"] as const;

export const AssetKind = z.enum([...GUIDE_KINDS, ...SENSOR_KINDS, ...ORCH_KINDS, ...HUB_KINDS]);
export type AssetKind = z.infer<typeof AssetKind>;

export const Execution = z.enum(["computational", "inferential"]);
export type Execution = z.infer<typeof Execution>;

export const AssetStatus = z.enum(["draft", "trial", "enforced", "deprecated"]);
export type AssetStatus = z.infer<typeof AssetStatus>;

export const AssetOrigin = z.enum(["builtin", "local", "team", "hub", "change"]);
export type AssetOrigin = z.infer<typeof AssetOrigin>;

/* ── harness.yaml (§8.1): registry of guides / sensors / suites / profiles ── */

export const GuideDef = z.object({
  id: z.string(),
  kind: z.enum(GUIDE_KINDS),
  execution: Execution,
  stage: DELIVERY_STAGE,
  task: z.string().optional(),
  source: z.string(),
  priority: z.number().optional()
});
export type GuideDef = z.infer<typeof GuideDef>;

export const OnFail = z.enum(["block", "warn", "retry"]);

export const SensorDef = z.object({
  id: z.string(),
  kind: z.enum(SENSOR_KINDS),
  execution: Execution,
  stage: DELIVERY_STAGE.optional(),
  task: z.string().optional(),
  trigger: z.enum(["task", "file-save", "schedule"]).default("task"),
  scope: z.array(z.string()).optional(),
  run: z.string().optional(),
  builtin: z.string().optional(),
  plugin: z.string().optional(),
  on_fail: OnFail.default("block"),
  max_retries: z.number().int().min(0).default(0),
  fix_hint: z.string().optional(),
  budget_tokens: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().default(120000)
});
export type SensorDef = z.infer<typeof SensorDef>;

export const ProfileDef = z.object({
  stages: z.array(DELIVERY_STAGE),
  dev_tasks: z.array(z.string()).optional(),
  test_tasks: z.array(z.string()).optional(),
  req_tasks: z.array(z.string()).optional(),
  arch_tasks: z.array(z.string()).optional(),
  suites: z.record(z.string()).default({})
});
export type ProfileDef = z.infer<typeof ProfileDef>;

export const OverrideDef = z.object({
  id: z.string(),
  source: z.string(),
  reason: z.string().min(1, "override must declare a reason")
});

export const HarnessYaml = z.object({
  version: z.string().default("1.0"),
  constitution: z.string().optional(),
  /** Topology bundle refs expanded at read time, e.g. api-service@1.0.0 */
  imports: z.array(z.string()).default([]),
  profiles: z.record(ProfileDef),
  suites: z.record(z.array(z.string())).default({}),
  guides: z.array(GuideDef).default([]),
  sensors: z.array(SensorDef).default([]),
  dependencies: z.array(z.string()).default([]),
  overrides: z.array(OverrideDef).default([])
});
export type HarnessYaml = z.infer<typeof HarnessYaml>;

/* ── config.yaml: this repo's choices (kept separate from the registry, §7.1) ── */

export const HubRole = z.enum(["consumer", "maintainer"]);
export type HubRole = z.infer<typeof HubRole>;

export const HubConnectionYaml = z.object({
  source: z.string(),
  role: HubRole.optional(),
  actor: z.string().optional(),
  branch: z.string().optional()
});
export type HubConnectionYaml = z.infer<typeof HubConnectionYaml>;

export const HubConfigField = z.union([z.string(), HubConnectionYaml]);
export type HubConfigField = z.infer<typeof HubConfigField>;

export const ConfigYaml = z.object({
  profile: z.string().default("standard"),
  locale: z.enum(["en", "zh-CN"]).default("en"),
  compat_mode: z.enum(["openspec"]).optional(),
  hub: HubConfigField.optional(),
  adapter: z
    .object({
      target: z.string().optional(),
      tier: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional()
    })
    .optional(),
  compensation: z
    .object({
      enabled: z.boolean().default(true),
      extra_verify_sensors: z.array(z.string()).optional(),
      escalate_warn_to_block: z.boolean().optional()
    })
    .optional()
});
export type ConfigYaml = z.infer<typeof ConfigYaml>;

/** Delivery blueprint — composes profile, stage assets, and hub dependencies. */
export const BlueprintStageDef = z.object({
  guides: z.array(z.string()).optional(),
  sensors: z.array(z.string()).optional()
});

export const BlueprintYaml = z.object({
  name: z.string(),
  extends: z.string().optional(),
  hub_deps: z.array(z.string()).default([]),
  stages: z.record(BlueprintStageDef).optional()
});
export type BlueprintYaml = z.infer<typeof BlueprintYaml>;

/* ── meta.yaml: phase state, approvals, waivers, gate history — CLI-exclusive writes (FR-050) ── */

export const ApprovalRecord = z.object({
  gate: z.string(),
  approver: z.string(),
  at: z.string(),
  artifactHash: z.string()
});
export type ApprovalRecord = z.infer<typeof ApprovalRecord>;

export const WaiverRecord = z.object({
  id: z.string(),
  target: z.string(),
  reason: z.string(),
  requestedBy: z.string(),
  approvedBy: z.string(),
  createdAt: z.string(),
  expiresAt: z.string()
});
export type WaiverRecord = z.infer<typeof WaiverRecord>;

export const GateHistoryEntry = z.object({
  stage: DELIVERY_STAGE,
  task: z.string(),
  suite: z.string().optional(),
  at: z.string(),
  passed: z.boolean(),
  logHash: z.string().optional(),
  /** number of telemetry lines the hash covers (prefix hash — later runs append) */
  logLines: z.number().int().optional()
});
export type GateHistoryEntry = z.infer<typeof GateHistoryEntry>;

export const ArchModule = z.object({
  id: z.string(),
  name: z.string().optional(),
  owner: z.string().optional(),
  lld: z.string(),
  capabilities: z.array(z.string()).default([]),
  status: z.enum(["draft", "active", "deprecated"]).default("active")
});
export type ArchModule = z.infer<typeof ArchModule>;

export const ArchRegistry = z.object({
  version: z.string().default("1.0"),
  updated_at: z.string().optional(),
  modules: z.array(ArchModule).default([])
});
export type ArchRegistry = z.infer<typeof ArchRegistry>;

/** Org-level req/arch approvals at docs/.stage-approvals.yaml */
export const StageApprovals = z.object({
  version: z.string().default("2.0"),
  prd: z.record(ApprovalRecord).default({}),
  arch: ApprovalRecord.optional(),
  archLld: z.record(ApprovalRecord).default({})
});
export type StageApprovals = z.infer<typeof StageApprovals>;

/* ── Work orders (enterprise SDLC) ── */

export const WORK_ORDER_TYPES = [
  "req-review",
  "req-revise",
  "req-change",
  "arch-review",
  "arch-revise",
  "arch-change",
  "arch-design",
  "lld-design",
  "test-case-review",
  "test-run",
  "bug-fix",
  "retest"
] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

export const WORK_ORDER_STATUSES = ["draft", "pending", "approved", "rejected", "done", "cancelled"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WorkOrderRef = z.object({
  prd: z.string().optional(),
  change: z.string().optional(),
  module: z.string().optional(),
  bug: z.string().optional(),
  changeRequest: z.string().optional()
});
export type WorkOrderRef = z.infer<typeof WorkOrderRef>;

export const WorkOrderArtifact = z.object({
  path: z.string(),
  hash: z.string()
});
export type WorkOrderArtifact = z.infer<typeof WorkOrderArtifact>;

export const WorkOrderHistoryEntry = z.object({
  action: z.string(),
  by: z.string(),
  at: z.string(),
  note: z.string().optional(),
  reason: z.string().optional()
});
export type WorkOrderHistoryEntry = z.infer<typeof WorkOrderHistoryEntry>;

export const WorkOrderSpawnSpec = z.object({
  type: z.enum(WORK_ORDER_TYPES),
  assigneeRole: z.string(),
  ref: WorkOrderRef.optional(),
  title: z.string().optional()
});
export type WorkOrderSpawnSpec = z.infer<typeof WorkOrderSpawnSpec>;

export const WorkOrderYaml = z.object({
  id: z.string(),
  version: z.literal("1.0").default("1.0"),
  type: z.enum(WORK_ORDER_TYPES),
  title: z.string(),
  status: z.enum(WORK_ORDER_STATUSES),
  scope: z.enum(["req", "arch", "change"]),
  ref: WorkOrderRef.default({}),
  assigneeRole: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  artifacts: z.array(WorkOrderArtifact).default([]),
  history: z.array(WorkOrderHistoryEntry).default([]),
  spawn: z.array(WorkOrderSpawnSpec).default([]),
  downstream: z.array(z.string()).default([]),
  parentId: z.string().optional(),
  contentHash: z.string().optional()
});
export type WorkOrderYaml = z.infer<typeof WorkOrderYaml>;

export const WorkOrderIndex = z.object({
  version: z.literal("1.0").default("1.0"),
  nextSeq: z.number().int().positive().default(1),
  orders: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        status: z.string(),
        assigneeRole: z.string(),
        title: z.string(),
        ref: WorkOrderRef.default({})
      })
    )
    .default([])
});
export type WorkOrderIndex = z.infer<typeof WorkOrderIndex>;

/* ── Change requests ── */

export const CHANGE_REQUEST_KINDS = ["requirement-change", "design-change"] as const;
export const CHANGE_REQUEST_ACTIONS = ["add", "modify", "delete"] as const;
export const CHANGE_REQUEST_STATUSES = ["draft", "submitted", "approved", "rejected", "applied"] as const;

export const ChangeRequestYaml = z.object({
  id: z.string(),
  version: z.literal("1.0").default("1.0"),
  kind: z.enum(CHANGE_REQUEST_KINDS),
  action: z.enum(CHANGE_REQUEST_ACTIONS),
  target: z.object({
    prd: z.string().optional(),
    module: z.string().optional(),
    version: z.string().optional()
  }),
  payload: z.object({
    original: z.string().optional(),
    changeNote: z.string().optional(),
    revised: z.string().optional(),
    deleted: z.string().optional()
  }),
  status: z.enum(CHANGE_REQUEST_STATUSES),
  workorderId: z.string().optional(),
  linkedChange: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string().optional(),
  contentHash: z.string().optional()
});
export type ChangeRequestYaml = z.infer<typeof ChangeRequestYaml>;

export const ChangeRequestIndex = z.object({
  version: z.literal("1.0").default("1.0"),
  nextSeq: z.number().int().positive().default(1),
  requests: z.array(z.object({ id: z.string(), kind: z.string(), status: z.string(), action: z.string() })).default([])
});
export type ChangeRequestIndex = z.infer<typeof ChangeRequestIndex>;

/* ── Roles (enterprise SDLC RBAC) ── */

export const RolesYaml = z.object({
  version: z.string().default("1.0"),
  workflow: z.object({ workorders: z.enum(["optional", "required"]).default("optional") }).default({ workorders: "optional" }),
  roles: z.record(z.object({ can: z.array(z.string()).default([]), approves: z.array(z.string()).default([]) })).default({}),
  members: z.record(z.string()).default({})
});
export type RolesYaml = z.infer<typeof RolesYaml>;

/* ── Bugs ── */

export const BUG_STATUSES = ["open", "fixed", "retest", "closed", "reopened"] as const;

export const BugYaml = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["critical", "major", "minor", "trivial"]).default("major"),
  status: z.enum(BUG_STATUSES),
  scenario: z.string().optional(),
  steps: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  fixCommit: z.string().optional(),
  workorders: z.array(z.string()).default([]),
  createdBy: z.string().optional(),
  createdAt: z.string().optional()
});
export type BugYaml = z.infer<typeof BugYaml>;

export const ArchPromotedRecord = z.object({
  at: z.string(),
  by: z.string().optional(),
  modules: z.array(z.string()).default([])
});
export type ArchPromotedRecord = z.infer<typeof ArchPromotedRecord>;

export const StageProgressEntry = z.object({
  done: z.boolean().default(false),
  current: z.string().optional(),
  completed: z.array(z.string()).default([]),
  approvedBy: z.string().optional()
});
export type StageProgressEntry = z.infer<typeof StageProgressEntry>;

export const TaskHistoryEntry = z.object({
  stage: z.enum(["req", "arch", "dev", "test"]),
  task: z.string(),
  at: z.string(),
  gate: z.enum(["pass", "fail"]).default("pass")
});
export type TaskHistoryEntry = z.infer<typeof TaskHistoryEntry>;

export const MetaYaml = z.object({
  change: z.string(),
  stage: DELIVERY_STAGE,
  task: z.string(),
  stageProgress: z.record(StageProgressEntry).optional(),
  taskHistory: z.array(TaskHistoryEntry).default([]),
  profile: z.string(),
  touchedDomains: z.array(z.string()).default([]),
  prdRef: z.string().optional(),
  archModules: z.array(z.string()).optional(),
  archPromoted: ArchPromotedRecord.optional(),
  profileRecommendation: z
    .object({
      recommended: z.string(),
      chosen: z.string(),
      overrideReason: z.string().optional()
    })
    .optional(),
  approvals: z.array(ApprovalRecord).default([]),
  waivers: z.array(WaiverRecord).default([]),
  gateHistory: z.array(GateHistoryEntry).default([]),
  approvedTests: z.record(z.string()).default({}),
  contentHash: z.string().optional()
});
export type MetaYaml = z.infer<typeof MetaYaml>;

/* ── asset.yaml manifest (§11.1) ── */

export const AssetManifest = z.object({
  id: z.string(),
  kind: AssetKind,
  category: z.enum(["maintainability", "architecture", "behaviour"]).optional(),
  stage: DELIVERY_STAGE,
  task: z.string().optional(),
  version: z.string().default("0.1.0"),
  owner: z.string().optional(),
  origin: AssetOrigin.default("local"),
  status: AssetStatus.default("draft"),
  execution: Execution.optional(),
  provenance: z
    .array(z.object({ type: z.string(), ref: z.string() }))
    .default([]),
  metrics: z.record(z.union([z.string(), z.number()])).default({})
});
export type AssetManifest = z.infer<typeof AssetManifest>;

/* ── hub asset metadata / review sidecars ── */
export const HubAssetMetaYaml = z.object({
  id: z.string(),
  version: z.string(),
  category: z.enum(["package", "bundle", "blueprint"]),
  status: z.enum(["draft", "trial", "enforced", "deprecated", "archived"]).default("trial"),
  owner: z.string().optional(),
  stages: z.array(DELIVERY_STAGE).default([]),
  tags: z.array(z.string()).default([]),
  security: z.object({ hash: z.string().optional(), signature: z.string().optional() }).optional(),
  updatedAt: z.string().optional()
});
export type HubAssetMetaYaml = z.infer<typeof HubAssetMetaYaml>;

/* ── traceability.yaml (§7.4) ── */

export const ScenarioTrace = z.object({
  tests: z.array(z.string()).default([]),
  code: z.array(z.string()).default([]),
  status: z.enum(["covered", "partial", "waived"]).default("partial")
});

export const TraceabilityYaml = z.object({
  requirements: z.record(z.object({ scenarios: z.record(ScenarioTrace) })).default({})
});
export type TraceabilityYaml = z.infer<typeof TraceabilityYaml>;

/* ── delivery-trace.yaml: PRD AC → requirement → design → tasks → code ── */

export const DeliveryTraceEntry = z.object({
  prd_ref: z.string().optional(),
  requirement: z.string().optional(),
  design_refs: z.array(z.string()).default([]),
  scenarios: z.array(z.string()).default([]),
  tasks: z.array(z.string()).default([]),
  code_hints: z.array(z.string()).default([])
});
export type DeliveryTraceEntry = z.infer<typeof DeliveryTraceEntry>;

export const DeliveryTraceYaml = z.object({
  version: z.literal(1).default(1),
  acceptance_criteria: z.record(DeliveryTraceEntry).default({}),
  requirements: z.record(DeliveryTraceEntry).default({})
});
export type DeliveryTraceYaml = z.infer<typeof DeliveryTraceYaml>;

/* ── harness.lock (§11.2 / NFR-009): exact versions + content hashes ── */

export const HarnessLock = z.object({
  version: z.literal(1).default(1),
  assets: z
    .record(z.object({ version: z.string(), source: z.string(), hash: z.string() }))
    .default({})
});
export type HarnessLock = z.infer<typeof HarnessLock>;

/* ── Sensor report format (§15.3, LLM-optimized) ── */

export const Finding = z.object({
  file: z.string().optional(),
  line: z.number().optional(),
  rule: z.string().optional(),
  severity: z.enum(["block", "warn", "info"]).default("block"),
  message: z.string(),
  fix_hint: z.string().optional()
});
export type Finding = z.infer<typeof Finding>;

export const SensorReport = z.object({
  sensor: z.string(),
  status: z.enum(["pass", "fail", "error"]),
  summary: z.string(),
  findings: z.array(Finding).default([]),
  fix_hint: z.string().optional(),
  agent_instruction: z.string().optional(),
  fix_command: z.string().optional()
});
export type SensorReport = z.infer<typeof SensorReport>;

export interface SuiteResult {
  suite: string;
  passed: boolean;
  reports: SensorReport[];
  blockers: string[];
  warnings: string[];
  fixHints: string[];
}
