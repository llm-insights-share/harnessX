import { z } from "zod";

/** Plugin API version (NFR-008): consumers accept same major. */
export const PLUGIN_API_VERSION = "1.0.0";

/* ── Phase model (§15.1): display name / state name / command are three views of one phase ── */

export const PHASE_STATES = [
  "explore",
  "proposed",
  "designed",
  "specified",
  "planned",
  "implementing",
  "verified",
  "archived"
] as const;
export type PhaseState = (typeof PHASE_STATES)[number];

export interface PhaseInfo {
  display: string;
  state: PhaseState;
  command: string;
}

/** Single mapping between the three naming schemes (design doc §15.1). */
export const PHASES: PhaseInfo[] = [
  { display: "Explore", state: "explore", command: "explore" },
  { display: "Propose", state: "proposed", command: "propose" },
  { display: "Design", state: "designed", command: "design" },
  { display: "Spec", state: "specified", command: "spec" },
  { display: "Plan", state: "planned", command: "plan" },
  { display: "Apply", state: "implementing", command: "apply" },
  { display: "Verify", state: "verified", command: "verify" },
  { display: "Archive", state: "archived", command: "archive" }
];

export const phaseByCommand = (cmd: string): PhaseInfo | undefined =>
  PHASES.find((p) => p.command === cmd);
export const phaseByState = (state: string): PhaseInfo | undefined =>
  PHASES.find((p) => p.state === state);

/* ── Asset kinds: direction is encoded in the kind prefix; execution is orthogonal (§8.1) ── */

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

export const AssetKind = z.enum([...GUIDE_KINDS, ...SENSOR_KINDS, ...ORCH_KINDS]);
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
  phase: z.array(z.string()).default([]),
  source: z.string(),
  priority: z.number().optional()
});
export type GuideDef = z.infer<typeof GuideDef>;

export const OnFail = z.enum(["block", "warn", "retry"]);

export const SensorDef = z.object({
  id: z.string(),
  kind: z.enum(SENSOR_KINDS),
  execution: Execution,
  phase: z.array(z.string()).optional(),
  trigger: z.enum(["phase", "file-save", "schedule"]).default("phase"),
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
  phases: z.array(z.string()),
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
  profiles: z.record(ProfileDef),
  suites: z.record(z.array(z.string())).default({}),
  guides: z.array(GuideDef).default([]),
  sensors: z.array(SensorDef).default([]),
  dependencies: z.array(z.string()).default([]),
  overrides: z.array(OverrideDef).default([])
});
export type HarnessYaml = z.infer<typeof HarnessYaml>;

/* ── config.yaml: this repo's choices (kept separate from the registry, §7.1) ── */

export const ConfigYaml = z.object({
  profile: z.string().default("standard"),
  locale: z.enum(["en", "zh-CN"]).default("en"),
  compat_mode: z.enum(["openspec"]).optional(),
  hub: z.string().optional()
});
export type ConfigYaml = z.infer<typeof ConfigYaml>;

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
  phase: z.string(),
  suite: z.string().optional(),
  at: z.string(),
  passed: z.boolean(),
  logHash: z.string().optional(),
  /** number of telemetry lines the hash covers (prefix hash — later runs append) */
  logLines: z.number().int().optional()
});
export type GateHistoryEntry = z.infer<typeof GateHistoryEntry>;

export const MetaYaml = z.object({
  change: z.string(),
  status: z.enum(PHASE_STATES),
  profile: z.string(),
  touchedDomains: z.array(z.string()).default([]),
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
  phase: z.array(z.string()).default([]),
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
