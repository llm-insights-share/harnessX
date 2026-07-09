import path from "node:path";
import fs from "node:fs";
import type { HubCatalogEntry } from "./hubCatalog.js";
import { readHubRepoPolicy } from "./hubPolicySchema.js";
import { listHubContributions } from "./hubContributions.js";
import { readHubReview } from "./hubReview.js";
import { resolveHubPackageDir } from "./hubPackagePaths.js";

export interface HubPolicyIssue {
  asset: string;
  severity: "error" | "warn";
  message: string;
}

export interface HubPolicyOptions {
  minApprovalsForEnforced?: number;
  hubRoot?: string;
}

export function checkHubPolicy(entries: HubCatalogEntry[], opts: HubPolicyOptions = {}): HubPolicyIssue[] {
  const issues: HubPolicyIssue[] = [];
  const repoPolicy = opts.hubRoot ? readHubRepoPolicy(opts.hubRoot) : null;
  const minApprovals = opts.minApprovalsForEnforced ?? repoPolicy?.minApprovals ?? 1;

  if (repoPolicy && repoPolicy.maintainers.length === 0) {
    issues.push({ asset: "hub-policy.yaml", severity: "warn", message: "no maintainers configured" });
  }

  for (const e of entries) {
    const key = `${e.id}@${e.version}`;
    if (!e.owner) issues.push({ asset: key, severity: "warn", message: "missing owner" });
    if (!e.hash) issues.push({ asset: key, severity: "warn", message: "missing integrity hash" });
    if (e.status === "enforced") {
      if (e.review !== "approved") issues.push({ asset: key, severity: "error", message: "enforced asset is not approved" });
      if (opts.hubRoot) {
        const resolved =
          e.category === "package"
            ? resolveHubPackageDir(opts.hubRoot, { id: e.id, version: e.version }, e.kind)
            : path.join(opts.hubRoot, e.category === "bundle" ? "bundles" : "blueprints", e.id, e.version);
        if (resolved && fs.existsSync(resolved)) {
          const review = readHubReview(resolved);
          if (minApprovals > 1 && (review.approvedBy?.length ?? 0) < minApprovals) {
            issues.push({
              asset: key,
              severity: "error",
              message: `enforced asset needs ${minApprovals} approval(s), has ${review.approvedBy?.length ?? 0}`
            });
          }
        }
      }
    }
  }

  if (opts.hubRoot) {
    const pending = listHubContributions(opts.hubRoot, { status: "pending" });
    if (pending.length > 10) {
      issues.push({
        asset: "contributions",
        severity: "warn",
        message: `${pending.length} pending contributions — review backlog`
      });
    }
  }

  return issues;
}
