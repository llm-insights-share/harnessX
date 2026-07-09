import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Workspace, ensureDir, readYaml, writeYaml } from "./paths.js";
import { loadAssetDir, assetContentHash, type LoadedAsset } from "./assets.js";
import { scanGuideContent } from "./supplyChain.js";
import { HubAssetMeta, type HubAssetStatus } from "./hubAssetSchema.js";
import { assertHubAssetTransition } from "./hubLifecycle.js";
import { approveHubReview, readHubReview, requestHubReview } from "./hubReview.js";
import { hashHubAssetDir } from "./hubIntegrity.js";
import { hubEvalLocal } from "./hubEval.js";
import { hubBlueprintDir } from "./blueprint.js";
import type { AssetManifest } from "./schemas.js";
import type { HubAssetCategory } from "./hubAssetSchema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Built-in golden hub packages shipped with harnessx (T-602). */
export const BUILTIN_HUB_GOLDEN_DIR = path.resolve(HERE, "../../hub-golden");

/**
 * T-602 (§11.5): Harness Hub — a directory/git repo of shared asset packages:
 *   hub/packages/<id>/<version>/{asset.yaml, content...}
 *   hub/bundles/<id>/<version>/{bundle.yaml, assets/...}
 *   hub/blueprints/<name>/<version>/{blueprint.yaml, ...}
 *   hub/packages/<id>/<version>/.review (publication review marker, T-603)
 * - add:     copy a hub package version into the repo's hub cache layer
 * - sync:    detect upstream updates vs local overrides (three-way-ish report)
 * - sync --apply: three-way merge upstream vs local override vs baseline
 * - promote: publish a local asset to the hub with provenance/evidence
 */

export interface HubRef {
  id: string;
  version: string;
}

export interface HubSyncMeta {
  version: string;
  baselineHash: string;
  syncedAt: string;
}

export function hubPackageDir(hubRoot: string, id: string, version: string): string {
  return path.join(hubRoot, "packages", id, version);
}

export function hubBundleDir(hubRoot: string, id: string, version: string): string {
  return path.join(hubRoot, "bundles", id, version);
}

export function hubCategoryFromKind(kind: string): HubAssetCategory {
  if (kind === "harness.bundle") return "bundle";
  if (kind === "harness.blueprint") return "blueprint";
  return "package";
}

export function resolveHubDestDir(hubRoot: string, manifest: Pick<AssetManifest, "id" | "version" | "kind">): string {
  switch (manifest.kind) {
    case "harness.bundle":
      return hubBundleDir(hubRoot, manifest.id, manifest.version);
    case "harness.blueprint":
      return hubBlueprintDir(hubRoot, manifest.id, manifest.version);
    default:
      return hubPackageDir(hubRoot, manifest.id, manifest.version);
  }
}

function validatePromoteLayout(assetDir: string, manifest: AssetManifest): void {
  if (manifest.kind === "harness.bundle") {
    if (!fs.existsSync(path.join(assetDir, "bundle.yaml"))) throw new Error("harness.bundle requires bundle.yaml");
  } else if (manifest.kind === "harness.blueprint") {
    if (!fs.existsSync(path.join(assetDir, "blueprint.yaml"))) throw new Error("harness.blueprint requires blueprint.yaml");
  }
}

export function hubContributionDir(hubRoot: string, actor: string, id: string, version: string): string {
  return path.join(hubRoot, "contributions", actor, id, version);
}

export function hubVersions(hubRoot: string, id: string, category: "packages" | "bundles" | "blueprints" = "packages"): string[] {
  const dir = path.join(hubRoot, category, id);
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

function syncMetaFile(cacheDir: string): string {
  return path.join(cacheDir, ".sync-meta.yaml");
}

export function readSyncMeta(cacheDir: string): HubSyncMeta | null {
  const f = syncMetaFile(cacheDir);
  if (!fs.existsSync(f)) return null;
  return readYaml<HubSyncMeta>(f);
}

export function writeSyncMeta(cacheDir: string, version: string, baselineHash: string): void {
  writeYaml(syncMetaFile(cacheDir), { version, baselineHash, syncedAt: new Date().toISOString() });
}

/** Lists relative file paths in an asset directory (excluding manifests/meta). */
export function listAssetContentFiles(dir: string): string[] {
  const skip = new Set(["asset.yaml", ".sync-meta.yaml", ".review"]);
  const out: string[] = [];
  const visit = (d: string, prefix = "") => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (skip.has(e.name)) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const p = path.join(d, e.name);
      if (e.isDirectory()) visit(p, rel);
      else out.push(rel);
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return out;
}

/** Three-way text merge: base=baseline, local=override, remote=upstream. */
export function threeWayMergeText(base: string, local: string, remote: string): { content: string; conflict: boolean } {
  if (local === remote) return { content: local, conflict: false };
  if (local === base) return { content: remote, conflict: false };
  if (remote === base) return { content: local, conflict: false };

  // additive line merge: both sides extended the same baseline with different lines
  if (base && local.startsWith(base) && remote.startsWith(base)) {
    const localSuffix = local.slice(base.length);
    const remoteSuffix = remote.slice(base.length);
    if (localSuffix && remoteSuffix && localSuffix !== remoteSuffix) {
      const lines = [...new Set([...localSuffix.split("\n").filter((l) => l.length > 0), ...remoteSuffix.split("\n").filter((l) => l.length > 0)])];
      return { content: base + lines.join("\n") + "\n", conflict: false };
    }
  }

  return {
    content: [`<<<<<<< local`, local, `=======`, remote, `>>>>>>> upstream`].join("\n"),
    conflict: true
  };
}

export interface MergeDirResult {
  merged: string[];
  conflicts: string[];
}

/** Merges content files from baseline/local/remote asset dirs into dest. */
export function mergeAssetDirs(baselineDir: string, localDir: string, remoteDir: string, destDir: string): MergeDirResult {
  const paths = new Set([
    ...listAssetContentFiles(baselineDir),
    ...listAssetContentFiles(localDir),
    ...listAssetContentFiles(remoteDir)
  ]);
  const merged: string[] = [];
  const conflicts: string[] = [];
  fs.rmSync(destDir, { recursive: true, force: true });
  ensureDir(destDir);

  const read = (root: string, rel: string) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };

  for (const rel of [...paths].sort()) {
    const base = read(baselineDir, rel);
    const local = read(localDir, rel);
    const remote = read(remoteDir, rel);
    const outPath = path.join(destDir, rel);
    ensureDir(path.dirname(outPath));

    if (!base && !local && remote) {
      fs.copyFileSync(path.join(remoteDir, rel), outPath);
      merged.push(rel);
      continue;
    }
    if (!remote && local && !base) {
      fs.copyFileSync(path.join(localDir, rel), outPath);
      merged.push(rel);
      continue;
    }

    const { content, conflict } = threeWayMergeText(base, local, remote);
    fs.writeFileSync(outPath, content, "utf8");
    merged.push(rel);
    if (conflict) conflicts.push(rel);
  }

  const manifest = path.join(remoteDir, "asset.yaml");
  if (fs.existsSync(manifest)) fs.copyFileSync(manifest, path.join(destDir, "asset.yaml"));
  return { merged, conflicts };
}

/** Resolves a hub ref across packages/, bundles/, blueprints/. */
export function resolveHubPackage(hubRoot: string, ref: HubRef): { kind: "package" | "bundle" | "blueprint"; dir: string } | null {
  for (const [kind, category] of [
    ["package", "packages"],
    ["bundle", "bundles"],
    ["blueprint", "blueprints"]
  ] as const) {
    const dir = path.join(hubRoot, category, ref.id, ref.version);
    if (fs.existsSync(dir)) return { kind, dir };
  }
  return null;
}

/** hub add: install a package version into the repo hub cache (with injection scan, T-603). */
export interface HubAddOptions {
  /** When true, only approved packages may be installed (consumer role default). */
  requireApproved?: boolean;
}

export function hubAdd(ws: Workspace, hubRoot: string, ref: HubRef, opts: HubAddOptions = {}): { dir: string; asset: LoadedAsset } {
  const resolved = resolveHubPackage(hubRoot, ref);
  if (!resolved || resolved.kind !== "package") {
    const src = hubPackageDir(hubRoot, ref.id, ref.version);
    if (!fs.existsSync(path.join(src, "asset.yaml"))) throw new Error(`hub package ${ref.id}@${ref.version} not found in ${hubRoot}`);
  }
  const src = resolved?.kind === "package" ? resolved.dir : hubPackageDir(hubRoot, ref.id, ref.version);
  if (!fs.existsSync(path.join(src, "asset.yaml"))) throw new Error(`hub package ${ref.id}@${ref.version} not found in ${hubRoot}`);

  if (opts.requireApproved) {
    const review = readHubReview(src);
    if (review.status !== "approved") {
      throw new Error(`hub package ${ref.id}@${ref.version} is not approved (status: ${review.status})`);
    }
  }

  const findings = scanAssetDir(src);
  if (findings.length > 0) {
    throw new Error(`hub package ${ref.id}@${ref.version} failed injection scan: ${findings[0]}`);
  }

  const dest = path.join(ws.base, ".hub-cache", ref.id);
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(src, dest);
  const baselineHash = assetContentHash(dest);
  writeSyncMeta(dest, ref.version, baselineHash);
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
    const meta = readSyncMeta(installedDir);
    const baselineHash = meta?.baselineHash ?? installed.contentHash;
    const locallyModified = assetContentHash(installedDir) !== baselineHash;
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

export interface HubSyncApplyResult {
  id: string;
  action: "skipped" | "updated" | "merged" | "conflict";
  fromVersion?: string;
  toVersion?: string;
  conflicts?: string[];
  detail?: string;
}

export interface HubSyncApplyOptions {
  /** Apply even when merge conflicts occur (conflict markers left in files). */
  force?: boolean;
  /** Only apply specific package ids. */
  only?: string[];
}

/**
 * hub sync --apply: three-way merge upstream vs local override vs baseline.
 * - update-available (no local edits): fast-forward to latest
 * - locally-modified: merge upstream refresh into local overrides
 * - update-and-local-changes: full three-way merge
 */
export function hubSyncApply(ws: Workspace, hubRoot: string, opts: HubSyncApplyOptions = {}): HubSyncApplyResult[] {
  const results: HubSyncApplyResult[] = [];
  for (const entry of hubSync(ws, hubRoot)) {
    if (opts.only?.length && !opts.only.includes(entry.id)) continue;
    if (entry.state === "up-to-date") {
      results.push({ id: entry.id, action: "skipped", detail: "up-to-date" });
      continue;
    }

    const cacheDir = path.join(ws.base, ".hub-cache", entry.id);
    const installed = loadAssetDir(cacheDir, "hub")!;
    const meta = readSyncMeta(cacheDir);
    const baselineVersion = meta?.version ?? installed.manifest.version;
    const targetVersion = entry.state.includes("update") ? entry.latest : baselineVersion;

    const baselineDir = hubPackageDir(hubRoot, entry.id, baselineVersion);
    const remoteDir = hubPackageDir(hubRoot, entry.id, targetVersion);
    if (!fs.existsSync(remoteDir)) {
      results.push({ id: entry.id, action: "conflict", detail: `upstream ${entry.id}@${targetVersion} not found` });
      continue;
    }

    if (entry.state === "update-available") {
      hubAdd(ws, hubRoot, { id: entry.id, version: targetVersion });
      results.push({ id: entry.id, action: "updated", fromVersion: entry.installed, toVersion: targetVersion });
      continue;
    }

    const tmp = path.join(ws.base, ".hub-cache", `.merge-${entry.id}`);
    const { conflicts } = mergeAssetDirs(
      fs.existsSync(baselineDir) ? baselineDir : remoteDir,
      cacheDir,
      remoteDir,
      tmp
    );

    if (conflicts.length && !opts.force) {
      fs.rmSync(tmp, { recursive: true, force: true });
      results.push({ id: entry.id, action: "conflict", conflicts, detail: "merge conflicts — use --force to apply with conflict markers" });
      continue;
    }

    fs.rmSync(cacheDir, { recursive: true, force: true });
    fs.renameSync(tmp, cacheDir);
    writeSyncMeta(cacheDir, targetVersion, assetContentHash(remoteDir));
    results.push({
      id: entry.id,
      action: conflicts.length ? "conflict" : "merged",
      fromVersion: entry.installed,
      toVersion: targetVersion,
      conflicts: conflicts.length ? conflicts : undefined,
      detail: conflicts.length ? "applied with conflict markers" : "merged cleanly"
    });
  }
  return results;
}

export interface PromoteOptions {
  evidence?: string;
  publishedBy: string;
  /** Skip pre-publish eval (not recommended). */
  skipEval?: boolean;
  owner?: string;
}

export function hubMetaFile(dir: string): string {
  return path.join(dir, ".hub-meta.yaml");
}

export function readHubMeta(dir: string): HubAssetMeta | null {
  const f = hubMetaFile(dir);
  if (!fs.existsSync(f)) return null;
  return HubAssetMeta.parse(readYaml<HubAssetMeta>(f));
}

export function writeHubMeta(dir: string, meta: HubAssetMeta): void {
  writeYaml(hubMetaFile(dir), HubAssetMeta.parse(meta));
}

/** hub promote: publish a local asset dir to the hub with provenance; review marker required before consumption. */
export function hubPromote(ws: Workspace, hubRoot: string, assetDir: string, opts: PromoteOptions): { dest: string } {
  const asset = loadAssetDir(assetDir, "local");
  if (!asset) throw new Error(`no asset.yaml in ${assetDir}`);
  if (asset.manifest.status === "draft") throw new Error("draft assets cannot be promoted to the hub — promote to trial/enforced locally first");

  if (!opts.skipEval) {
    const evalRes = hubEvalLocal(assetDir);
    if (!evalRes.passed) {
      const fail = evalRes.checks.find((c) => !c.ok);
      throw new Error(`hub eval failed before promote: ${fail?.name ?? "unknown check"}${fail?.detail ? ` (${fail.detail})` : ""}`);
    }
  }

  const findings = scanAssetDir(assetDir);
  if (findings.length > 0) throw new Error(`asset failed injection scan before publish: ${findings[0]}`);

  validatePromoteLayout(assetDir, asset.manifest);

  const category = hubCategoryFromKind(asset.manifest.kind);
  const dest = resolveHubDestDir(hubRoot, asset.manifest);
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
  requestHubReview(dest, opts.publishedBy);
  const hash = hashHubAssetDir(dest);
  writeHubMeta(
    dest,
    HubAssetMeta.parse({
      id: manifest.id,
      version: manifest.version,
      category,
      kind: manifest.kind,
      owner: opts.owner,
      status: manifest.status,
      phases: manifest.phase ?? [],
      provenance: {
        source: `${path.basename(ws.root)}`,
        evidence: opts.evidence ? [{ type: "evidence", ref: opts.evidence }] : []
      },
      security: { hash },
      updatedAt: new Date().toISOString()
    })
  );
  return { dest };
}

export function hubApproveReview(hubRoot: string, id: string, version: string, reviewer: string): void {
  const resolved = resolveHubPackage(hubRoot, { id, version });
  if (!resolved) throw new Error(`hub asset ${id}@${version} not found`);
  approveHubReview(resolved.dir, reviewer);
}

export function hubReviewStatus(hubRoot: string, id: string, version: string): "pending" | "approved" | "rejected" | "missing" {
  const resolved = resolveHubPackage(hubRoot, { id, version });
  if (!resolved) return "missing";
  return readHubReview(resolved.dir).status;
}

export interface HubAssetInfo {
  id: string;
  version: string;
  category: "package" | "bundle" | "blueprint";
  dir: string;
  meta?: HubAssetMeta;
  reviewStatus: "pending" | "approved" | "rejected";
}

export function hubAssetInfo(hubRoot: string, ref: HubRef): HubAssetInfo {
  const resolved = resolveHubPackage(hubRoot, ref);
  if (!resolved) throw new Error(`hub asset ${ref.id}@${ref.version} not found`);
  return {
    id: ref.id,
    version: ref.version,
    category: resolved.kind,
    dir: resolved.dir,
    meta: readHubMeta(resolved.dir) ?? undefined,
    reviewStatus: readHubReview(resolved.dir).status
  };
}

export function hubSetAssetStatus(hubRoot: string, ref: HubRef, to: HubAssetStatus): HubAssetMeta {
  const info = hubAssetInfo(hubRoot, ref);
  const current = info.meta?.status ?? "trial";
  assertHubAssetTransition(current, to);
  const next = HubAssetMeta.parse({
    ...(info.meta ?? {
      id: ref.id,
      version: ref.version,
      category: info.category,
      status: current,
      phases: [],
      tags: [],
      provenance: { evidence: [] }
    }),
    status: to,
    security: { ...(info.meta?.security ?? {}), hash: hashHubAssetDir(info.dir) },
    updatedAt: new Date().toISOString()
  });
  writeHubMeta(info.dir, next);
  return next;
}

/** Lists package ids available in the built-in golden hub catalog. */
export function listGoldenHubPackages(goldenDir = BUILTIN_HUB_GOLDEN_DIR): HubRef[] {
  const root = path.join(goldenDir, "packages");
  if (!fs.existsSync(root)) return [];
  const out: HubRef[] = [];
  for (const id of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const ver of hubVersions(goldenDir, id.name)) {
      out.push({ id: id.name, version: ver });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
}

export function listGoldenHubBundles(goldenDir = BUILTIN_HUB_GOLDEN_DIR): HubRef[] {
  const root = path.join(goldenDir, "bundles");
  if (!fs.existsSync(root)) return [];
  const out: HubRef[] = [];
  for (const id of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const ver of hubVersions(goldenDir, id.name, "bundles")) {
      out.push({ id: id.name, version: ver });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
}

/** Lists bundles in any hub repo (v0.4). */
export function listHubBundles(hubRoot: string): HubRef[] {
  const root = path.join(hubRoot, "bundles");
  if (!fs.existsSync(root)) return [];
  const out: HubRef[] = [];
  for (const id of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const ver of hubVersions(hubRoot, id.name, "bundles")) {
      out.push({ id: id.name, version: ver });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
}

export function listHubBlueprints(hubRoot: string): HubRef[] {
  const root = path.join(hubRoot, "blueprints");
  if (!fs.existsSync(root)) return [];
  const out: HubRef[] = [];
  for (const id of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const ver of hubVersions(hubRoot, id.name, "blueprints")) {
      out.push({ id: id.name, version: ver });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
}

export function listGoldenHubBlueprints(goldenDir = BUILTIN_HUB_GOLDEN_DIR): HubRef[] {
  return listHubBlueprints(goldenDir);
}

export function listHubEvalSets(hubRoot: string): string[] {
  const root = path.join(hubRoot, "evals", "golden-repos");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Creates a hub repo from built-in golden packages (pre-approved for local consumption). */
export function seedGoldenHub(targetRoot: string, goldenDir = BUILTIN_HUB_GOLDEN_DIR): HubRef[] {
  const seeded: HubRef[] = [];
  for (const sub of ["packages", "bundles", "blueprints", "evals"] as const) {
    const src = path.join(goldenDir, sub);
    if (!fs.existsSync(src)) continue;
    copyDir(src, path.join(targetRoot, sub));
  }
  const policySrc = path.join(goldenDir, "hub-policy.yaml");
  if (fs.existsSync(policySrc)) fs.copyFileSync(policySrc, path.join(targetRoot, "hub-policy.yaml"));
  seeded.push(...listGoldenHubPackages(goldenDir), ...listGoldenHubBundles(goldenDir), ...listGoldenHubBlueprints(goldenDir));
  return seeded;
}
