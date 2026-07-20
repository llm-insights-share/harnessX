import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { readHubConnection, resolveHubContext } from "./hubConnection.js";
import { readHubRepoPolicy } from "./hubPolicySchema.js";
import { hubGovernanceReport } from "./hubGovernance.js";
import { listHubContributions } from "./hubContributions.js";
import { listHubEvalSets } from "./hub.js";
import { validateHarnessCompleteness } from "./harnessCompleteness.js";

export interface HubDoctorFinding {
  level: "error" | "warn" | "info";
  code: string;
  message: string;
  suggestion?: string;
}

export interface HubDoctorReport {
  ok: boolean;
  findings: HubDoctorFinding[];
  hints: string[];
}

/** Diagnose hub configuration and repository health with fix hints. */
export function runHubDoctor(ws: Workspace, opts: { hubRef?: string } = {}): HubDoctorReport {
  const findings: HubDoctorFinding[] = [];
  const hints: string[] = [];
  const conn = readHubConnection(ws);

  if (!conn && !opts.hubRef) {
    findings.push({
      level: "error",
      code: "missing_hub_config",
      message: "Hub is not configured.",
      suggestion: "Add hub.source in harnessX/config.yaml or pass --hub."
    });
    hints.push("hxhub init . --hub <git-url> --actor <name>");
    return { ok: false, findings, hints };
  }

  const { hubRoot } = resolveHubContext(ws, { hubRef: opts.hubRef, action: "hub.search", refresh: true });
  findings.push({ level: "info", code: "hub_root", message: `Resolved hub root: ${hubRoot}` });

  const policy = readHubRepoPolicy(hubRoot);
  if (policy.maintainers.length === 0) {
    findings.push({
      level: "warn",
      code: "no_maintainers",
      message: "hub-policy.yaml has no maintainers.",
      suggestion: "Add maintainers list in hub-policy.yaml."
    });
  }
  if (policy.installRequiresApproval) {
    findings.push({ level: "info", code: "approval_gate", message: "Consumer installs require approved reviews." });
  }

  const gov = hubGovernanceReport(hubRoot);
  for (const issue of gov.issues) {
    findings.push({
      level: issue.severity === "error" ? "error" : "warn",
      code: "governance",
      message: `${issue.asset}: ${issue.message}`
    });
  }

  const pending = listHubContributions(hubRoot, { status: "pending" });
  if (pending.length > 0) {
    findings.push({
      level: pending.length > 10 ? "warn" : "info",
      code: "pending_contributions",
      message: `Pending contributions: ${pending.length}`,
      suggestion: "Review with `hxhub contributions list --status pending`."
    });
  }

  if (fs.existsSync(ws.harnessFile)) {
    const completeness = validateHarnessCompleteness(ws);
    for (const f of completeness.findings) {
      if (f.level === "info" && f.code !== "hub_cache_unregistered") continue;
      findings.push({
        level: f.level,
        code: `harness_completeness:${f.code}`,
        message: f.message,
        suggestion: f.suggestion
      });
    }
    if (completeness.findings.some((f) => f.code === "hub_cache_unregistered")) {
      hints.push("hx project sync-hub  # register hub-cache packages into harness.yaml");
      hints.push("hx harness lint --completeness");
    }
  }

  const evalSets = listHubEvalSets(hubRoot);
  if (evalSets.length === 0) {
    findings.push({
      level: "warn",
      code: "missing_eval_sets",
      message: "No golden eval sets found.",
      suggestion: "Add evals/golden-repos/<name>/checks.yaml."
    });
  }

  const mirrorRoot = path.join(ws.base, ".hub-remotes");
  if (!fs.existsSync(mirrorRoot)) {
    findings.push({
      level: "info",
      code: "no_remote_cache",
      message: "No remote mirror cache yet (will be created on first remote command)."
    });
  }

  hints.push("hxhub policy check --strict");
  hints.push("hxhub contributions list --status pending");
  hints.push("hxhub help");
  if (findings.some((f) => f.level === "warn" || f.level === "error")) {
    hints.push("hxhub asset create --kind guide.skill --id <id> --out <dir>");
  }

  return { ok: findings.every((f) => f.level !== "error"), findings, hints };
}
