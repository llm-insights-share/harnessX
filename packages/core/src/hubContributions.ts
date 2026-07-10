import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { loadAssetDir } from "./assets.js";
import {
  hubContributionDir,
  resolveHubDestDir,
  resolveHubPackage,
  scanAssetDir,
  hubCategoryFromKind,
  writeHubMeta,
  type HubRef
} from "./hub.js";
import { hubEvalLocal } from "./hubEval.js";
import { requestHubReview, approveHubReview, rejectHubReview, readHubReview } from "./hubReview.js";
import { hashHubAssetDir } from "./hubIntegrity.js";
import { HubAssetMeta } from "./hubAssetSchema.js";
import { readHubRepoPolicy, assertHubMaintainer } from "./hubPolicySchema.js";

function copyDir(src: string, dest: string) {
  ensureDir(dest);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export interface HubSubmitOptions {
  actor: string;
  evidence?: string;
  skipEval?: boolean;
}

export interface ContributionRef extends HubRef {
  actor: string;
}

export interface ContributionEntry {
  ref: ContributionRef;
  dir: string;
  reviewStatus: "pending" | "approved" | "rejected";
  kind?: string;
}

export function parseContributionRef(ref: string, defaultActor?: string): ContributionRef {
  const at = ref.lastIndexOf("@");
  if (at < 0) throw new Error(`use <actor>/<id>@<version> or <id>@<version>`);
  const version = ref.slice(at + 1);
  const left = ref.slice(0, at);
  const slash = left.indexOf("/");
  if (slash >= 0) {
    return { actor: left.slice(0, slash), id: left.slice(slash + 1), version };
  }
  if (!defaultActor) throw new Error(`contribution ref "${ref}" needs actor prefix or --actor`);
  return { actor: defaultActor, id: left, version };
}

export function contributionRefKey(ref: ContributionRef): string {
  return `${ref.actor}/${ref.id}@${ref.version}`;
}

function contributionRoot(hubRoot: string): string {
  return path.join(hubRoot, "contributions");
}

export function listHubContributions(
  hubRoot: string,
  filters?: { status?: "pending" | "approved" | "rejected"; actor?: string }
): ContributionEntry[] {
  const root = contributionRoot(hubRoot);
  if (!fs.existsSync(root)) return [];
  const out: ContributionEntry[] = [];
  for (const actorDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!actorDir.isDirectory()) continue;
    if (filters?.actor && actorDir.name !== filters.actor) continue;
    const actorPath = path.join(root, actorDir.name);
    for (const idDir of fs.readdirSync(actorPath, { withFileTypes: true })) {
      if (!idDir.isDirectory()) continue;
      const idPath = path.join(actorPath, idDir.name);
      for (const ver of fs.readdirSync(idPath, { withFileTypes: true })) {
        if (!ver.isDirectory()) continue;
        const dir = path.join(idPath, ver.name);
        if (!fs.existsSync(path.join(dir, "asset.yaml"))) continue;
        const review = readHubReview(dir);
        if (filters?.status && review.status !== filters.status) continue;
        const asset = loadAssetDir(dir, "hub");
        out.push({
          ref: { actor: actorDir.name, id: idDir.name, version: ver.name },
          dir,
          reviewStatus: review.status,
          kind: asset?.manifest.kind
        });
      }
    }
  }
  return out.sort((a, b) => contributionRefKey(a.ref).localeCompare(contributionRefKey(b.ref)));
}

/** Consumer: submit a local asset to contributions/ for maintainer review. */
export function hubSubmit(ws: Workspace, hubRoot: string, assetDir: string, opts: HubSubmitOptions): { dest: string } {
  const policy = readHubRepoPolicy(hubRoot);
  if (!policy.consumerCanSubmit) throw new Error("hub policy disallows consumer submissions");

  const asset = loadAssetDir(assetDir, "local");
  if (!asset) throw new Error(`no asset.yaml in ${assetDir}`);
  if (asset.manifest.status === "draft") throw new Error("draft assets cannot be submitted — promote to trial locally first");

  if (!opts.skipEval) {
    const evalRes = hubEvalLocal(assetDir);
    if (!evalRes.passed) {
      const fail = evalRes.checks.find((c) => !c.ok);
      throw new Error(`hub eval failed before submit: ${fail?.name ?? "unknown"}${fail?.detail ? ` (${fail.detail})` : ""}`);
    }
  }

  const findings = scanAssetDir(assetDir);
  if (findings.length > 0) throw new Error(`asset failed injection scan: ${findings[0]}`);

  const dest = hubContributionDir(hubRoot, opts.actor, asset.manifest.id, asset.manifest.version);
  if (fs.existsSync(dest)) throw new Error(`contribution ${opts.actor}/${asset.manifest.id}@${asset.manifest.version} already exists`);
  copyDir(assetDir, dest);

  const manifest = { ...asset.manifest };
  manifest.provenance = [
    ...manifest.provenance,
    { type: "submitted-from", ref: `${path.basename(ws.root)}:${path.relative(ws.root, assetDir)}` },
    ...(opts.evidence ? [{ type: "evidence", ref: opts.evidence }] : [])
  ];
  writeYaml(path.join(dest, "asset.yaml"), manifest);
  requestHubReview(dest, opts.actor);
  return { dest };
}

/** Maintainer: merge an approved contribution into official hub paths. */
export function hubAcceptContribution(hubRoot: string, ref: ContributionRef, reviewer: string): { dest: string } {
  assertHubMaintainer(hubRoot, reviewer);
  const src = hubContributionDir(hubRoot, ref.actor, ref.id, ref.version);
  if (!fs.existsSync(path.join(src, "asset.yaml"))) {
    throw new Error(`contribution ${contributionRefKey(ref)} not found`);
  }
  const asset = loadAssetDir(src, "hub");
  if (!asset) throw new Error(`invalid contribution at ${src}`);

  const official = resolveHubDestDir(hubRoot, asset.manifest);
  if (fs.existsSync(official)) {
    throw new Error(`${asset.manifest.id}@${asset.manifest.version} already exists in official hub — reject or bump version`);
  }

  copyDir(src, official);
  const manifest = { ...asset.manifest, origin: "hub" as const };
  manifest.provenance = [
    ...manifest.provenance,
    { type: "accepted-from-contribution", ref: contributionRefKey(ref) },
    { type: "reviewed-by", ref: reviewer }
  ];
  writeYaml(path.join(official, "asset.yaml"), manifest);
  approveHubReview(official, reviewer);

  const category = hubCategoryFromKind(asset.manifest.kind);
  writeHubMeta(
    official,
    HubAssetMeta.parse({
      id: asset.manifest.id,
      version: asset.manifest.version,
      category,
      kind: asset.manifest.kind,
      owner: ref.actor,
      status: asset.manifest.status,
      stages: asset.manifest.stage ? [asset.manifest.stage] : [],
      provenance: { source: `contribution:${ref.actor}`, evidence: [] },
      security: { hash: hashHubAssetDir(official) },
      updatedAt: new Date().toISOString()
    })
  );

  approveHubReview(src, reviewer);
  return { dest: official };
}

export function hubRejectContribution(hubRoot: string, ref: ContributionRef, reviewer: string, reason: string): void {
  assertHubMaintainer(hubRoot, reviewer);
  const src = hubContributionDir(hubRoot, ref.actor, ref.id, ref.version);
  if (!fs.existsSync(src)) throw new Error(`contribution ${contributionRefKey(ref)} not found`);
  rejectHubReview(src, reviewer, reason);
}

export function hubContributionInfo(hubRoot: string, ref: ContributionRef): ContributionEntry {
  const dir = hubContributionDir(hubRoot, ref.actor, ref.id, ref.version);
  if (!fs.existsSync(dir)) throw new Error(`contribution ${contributionRefKey(ref)} not found`);
  const asset = loadAssetDir(dir, "hub");
  return {
    ref,
    dir,
    reviewStatus: readHubReview(dir).status,
    kind: asset?.manifest.kind
  };
}

/** Check whether an official asset already exists (used before accept). */
export function officialAssetExists(hubRoot: string, ref: HubRef): boolean {
  return resolveHubPackage(hubRoot, ref) !== null;
}
