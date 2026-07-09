import z from "zod";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { readYaml, writeYaml } from "./paths.js";

export const HubRepoPolicy = z.object({
  version: z.string().default("1.0"),
  maintainers: z.array(z.string()).default([]),
  minApprovals: z.number().int().min(1).default(1),
  consumerCanSubmit: z.boolean().default(true),
  installRequiresApproval: z.boolean().default(true)
});
export type HubRepoPolicy = z.infer<typeof HubRepoPolicy>;

const DEFAULT_POLICY = HubRepoPolicy.parse({});

export function hubPolicyFile(hubRoot: string): string {
  return path.join(hubRoot, "hub-policy.yaml");
}

export function readHubRepoPolicy(hubRoot: string): HubRepoPolicy {
  const f = hubPolicyFile(hubRoot);
  if (!fs.existsSync(f)) return DEFAULT_POLICY;
  try {
    return HubRepoPolicy.parse(readYaml(f));
  } catch {
    return DEFAULT_POLICY;
  }
}

export function writeHubRepoPolicy(hubRoot: string, policy: HubRepoPolicy): string {
  const f = hubPolicyFile(hubRoot);
  writeYaml(f, HubRepoPolicy.parse(policy));
  return f;
}

export function assertHubMaintainer(hubRoot: string, actor: string): void {
  const policy = readHubRepoPolicy(hubRoot);
  if (policy.maintainers.length === 0) return;
  if (!policy.maintainers.includes(actor)) {
    throw new Error(`"${actor}" is not a hub maintainer — add to hub-policy.yaml maintainers`);
  }
}
