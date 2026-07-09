import { buildHubCatalog } from "./hubCatalog.js";
import { checkHubPolicy, type HubPolicyIssue, type HubPolicyOptions } from "./hubPolicy.js";

export interface HubGovernanceReport {
  ok: boolean;
  issues: HubPolicyIssue[];
}

export function hubGovernanceReport(hubRoot: string, policy: HubPolicyOptions = {}): HubGovernanceReport {
  const entries = buildHubCatalog(hubRoot);
  const issues = checkHubPolicy(entries, { ...policy, hubRoot });
  return { ok: issues.every((i) => i.severity !== "error"), issues };
}
