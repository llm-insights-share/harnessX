import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, readYaml, writeYaml } from "./paths.js";
import { loadAssetDir, assetContentHash, type LoadedAsset } from "./assets.js";
import { scanGuideContent } from "./supplyChain.js";

/**
 * T-602 (§11.5): Harness Hub — a directory/git repo of shared asset packages:
 *   hub/packages/<id>/<version>/{asset.yaml, content...}
 *   hub/packages/<id>/<version>/.review (publication review marker, T-603)
 * - add:     copy a hub package version into the repo's hub cache layer
 * - sync:    detect upstream updates vs local overrides (three-way-ish report)
 * - promote: publish a local asset to the hub with provenance/evidence
 */

export interface HubRef {
  id: string;
  version: string;
}

export function hubPackageDir(hubRoot: string, id: string, version: string): string {
  return path.join(hubRoot, "packages", id, version);
}

export function hubVersions(hubRoot: string, id: string): string[] {
  const dir = path.join(hubRoot, "packages", id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

function copyDir(src: string, dest: string) {
  ensureDir(dest);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** hub add: install a package version into the repo hub cache (with injection scan, T-603). */
export function hubAdd(ws: Workspace, hubRoot: string, ref: HubRef): { dir: string; asset: LoadedAsset } {
  const src = hubPackageDir(hubRoot, ref.id, ref.version);
  if (!fs.existsSync(path.join(src, "asset.yaml"))) throw new Error(`hub package ${ref.id}@${ref.version} not found in ${hubRoot}`);

  // supply-chain: refuse assets containing instruction-hijack text
  const findings = scanAssetDir(src);
  if (findings.length > 0) {
    throw new Error(`hub package ${ref.id}@${ref.version} failed injection scan: ${findings[0]}`);
  }

  const dest = path.join(ws.base, ".hub-cache", ref.id);
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(src, dest);
  const asset = loadAssetDir(dest, "hub")!;
  return { dir: dest, asset };
}

export function scanAssetDir(dir: string): string[] {
  const findings: string[] = [];
  const visit = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.(md|txt|yaml|yml)$/.test(e.name)) {
        for (const f of scanGuideContent(fs.readFileSync(p, "utf8"))) {
          findings.push(`${path.relative(dir, p)}: ${f}`);
        }
      }
    }
  };
  visit(dir);
  return findings;
}

export interface HubSyncEntry {
  id: string;
  installed: string;
  latest: string;
  state: "up-to-date" | "update-available" | "locally-modified" | "update-and-local-changes";
}

/** hub sync: compare installed cache entries against the hub (upstream vs local override 三方对比). */
export function hubSync(ws: Workspace, hubRoot: string): HubSyncEntry[] {
  const cache = path.join(ws.base, ".hub-cache");
  if (!fs.existsSync(cache)) return [];
  const out: HubSyncEntry[] = [];
  for (const e of fs.readdirSync(cache, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const installedDir = path.join(cache, e.name);
    const installed = loadAssetDir(installedDir, "hub");
    if (!installed) continue;
    const versions = hubVersions(hubRoot, e.name);
    const latest = versions.at(-1) ?? installed.manifest.version;
    const upstreamDir = hubPackageDir(hubRoot, e.name, installed.manifest.version);
    const locallyModified = fs.existsSync(upstreamDir) && assetContentHash(upstreamDir) !== installed.contentHash;
    const updateAvailable = latest !== installed.manifest.version;
    out.push({
      id: e.name,
      installed: installed.manifest.version,
      latest,
      state: updateAvailable && locallyModified ? "update-and-local-changes" : updateAvailable ? "update-available" : locallyModified ? "locally-modified" : "up-to-date"
    });
  }
  return out;
}

export interface PromoteOptions {
  evidence?: string;
  publishedBy: string;
}

/** hub promote: publish a local asset dir to the hub with provenance; review marker required before consumption. */
export function hubPromote(ws: Workspace, hubRoot: string, assetDir: string, opts: PromoteOptions): { dest: string } {
  const asset = loadAssetDir(assetDir, "local");
  if (!asset) throw new Error(`no asset.yaml in ${assetDir}`);
  if (asset.manifest.status === "draft") throw new Error("draft assets cannot be promoted to the hub — promote to trial/enforced locally first");

  const findings = scanAssetDir(assetDir);
  if (findings.length > 0) throw new Error(`asset failed injection scan before publish: ${findings[0]}`);

  const dest = hubPackageDir(hubRoot, asset.manifest.id, asset.manifest.version);
  if (fs.existsSync(dest)) throw new Error(`${asset.manifest.id}@${asset.manifest.version} already published — bump the version`);
  copyDir(assetDir, dest);

  const manifest = { ...asset.manifest };
  manifest.origin = "hub";
  manifest.provenance = [
    ...manifest.provenance,
    { type: "promoted-from", ref: `${path.basename(ws.root)}:${path.relative(ws.root, assetDir)}` },
    ...(opts.evidence ? [{ type: "evidence", ref: opts.evidence }] : [])
  ];
  writeYaml(path.join(dest, "asset.yaml"), manifest);
  // publication review marker: pending until a hub maintainer approves (T-603)
  writeYaml(path.join(dest, ".review"), { status: "pending", publishedBy: opts.publishedBy, at: new Date().toISOString() });
  return { dest };
}

export function hubApproveReview(hubRoot: string, id: string, version: string, reviewer: string): void {
  const marker = path.join(hubPackageDir(hubRoot, id, version), ".review");
  if (!fs.existsSync(marker)) throw new Error("no review marker — was this package published via hx hub promote?");
  writeYaml(marker, { status: "approved", reviewer, at: new Date().toISOString() });
}

export function hubReviewStatus(hubRoot: string, id: string, version: string): "pending" | "approved" | "missing" {
  const marker = path.join(hubPackageDir(hubRoot, id, version), ".review");
  if (!fs.existsSync(marker)) return "missing";
  return (readYaml<{ status: "pending" | "approved" }>(marker)).status;
}
