import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { hubGovernanceReport } from "./hubGovernance.js";
import { resolveHubContext } from "./hubConnection.js";
import { hubPolicyFile, readHubRepoPolicy, writeHubRepoPolicy } from "./hubPolicySchema.js";

export interface HubFixAction {
  code: string;
  status: "fixed" | "skipped";
  message: string;
}

export interface HubFixResult {
  ok: boolean;
  hubRoot: string;
  actions: HubFixAction[];
  remainingIssues: Array<{ severity: "error" | "warn"; asset: string; message: string }>;
}

/**
 * Repairs common hub repo issues in-place:
 * - missing core directories
 * - missing hub-policy.yaml
 * - empty maintainers list (if maintainer identity is provided)
 */
export function runHubFix(
  ws: Workspace,
  opts: {
    hubRef?: string;
    maintainer?: string;
  } = {}
): HubFixResult {
  const { hubRoot, connection } = resolveHubContext(ws, {
    hubRef: opts.hubRef,
    action: "hub.policy",
    refresh: true
  });
  const actions: HubFixAction[] = [];

  for (const dir of ["packages", "bundles", "blueprints", "evals"] as const) {
    const target = path.join(hubRoot, dir);
    if (!fs.existsSync(target)) {
      ensureDir(target);
      actions.push({ code: "create_dir", status: "fixed", message: `created ${dir}/` });
    }
  }

  const policyPath = hubPolicyFile(hubRoot);
  const hadPolicy = fs.existsSync(policyPath);
  let policy = readHubRepoPolicy(hubRoot);
  if (!hadPolicy) {
    writeHubRepoPolicy(hubRoot, policy);
    actions.push({ code: "create_policy", status: "fixed", message: "created hub-policy.yaml with defaults" });
  }

  if (policy.maintainers.length === 0) {
    const maintainer = opts.maintainer ?? connection?.actor;
    if (maintainer) {
      policy = { ...policy, maintainers: [maintainer] };
      writeHubRepoPolicy(hubRoot, policy);
      actions.push({ code: "add_maintainer", status: "fixed", message: `added maintainer "${maintainer}"` });
    } else {
      actions.push({
        code: "add_maintainer",
        status: "skipped",
        message: "maintainers empty; pass --maintainer <name> to auto-fix"
      });
    }
  }

  const report = hubGovernanceReport(hubRoot);
  const remainingIssues = report.issues.map((issue) => ({
    severity: issue.severity,
    asset: issue.asset,
    message: issue.message
  }));
  return { ok: report.ok, hubRoot, actions, remainingIssues };
}
