import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { hubPackageDirForKind } from "./hubPackagePaths.js";
import { ensureDir } from "./paths.js";
import type { HubRef } from "./hub.js";

const BUILTIN_HUB_GOLDEN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../hub-golden");

export const SEED_PROFILES = ["minimal", "standard", "strict", "enterprise", "enterprise-sdlc"] as const;
export const SEED_SCENARIOS = ["core", "api", "frontend", "mobile", "library", "data", "observability", "async-jobs"] as const;
export const SEED_WITH_FILTERS = ["guides", "sensors", "rubrics", "bundles", "blueprints", "evals", "commands", "all"] as const;

export type SeedProfile = (typeof SEED_PROFILES)[number];
export type SeedScenario = (typeof SEED_SCENARIOS)[number];
export type SeedWithFilter = (typeof SEED_WITH_FILTERS)[number];

export type SeedAssetCategory = "package" | "bundle" | "blueprint" | "eval";

export interface SeedCatalogEntry {
  category: SeedAssetCategory;
  kind?: string;
  path?: string;
}

export interface SeedManifestSection {
  includes?: string[];
  assets?: string[];
}

export interface SeedManifest {
  version: string;
  profiles: Record<string, SeedManifestSection>;
  scenarios: Record<string, SeedManifestSection>;
  catalog: Record<string, SeedCatalogEntry>;
}

export interface SeedHubOptions {
  goldenDir?: string;
  profile?: string;
  scenario?: string[];
  with?: string[];
  exclude?: string[];
  dryRun?: boolean;
  /** When true, copy entire golden hub (legacy behavior). */
  full?: boolean;
}

export interface SeedHubPlan {
  profile?: string;
  scenarios: string[];
  assets: string[];
  skipped: string[];
}

export interface SeedHubResult {
  plan: SeedHubPlan;
  seeded: HubRef[];
  dryRun: boolean;
}

function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function seedManifestFile(goldenDir = BUILTIN_HUB_GOLDEN_DIR): string {
  return path.join(goldenDir, "seed-manifest.yaml");
}

export function readSeedManifest(goldenDir = BUILTIN_HUB_GOLDEN_DIR): SeedManifest {
  const file = seedManifestFile(goldenDir);
  if (!fs.existsSync(file)) throw new Error(`seed manifest not found: ${file}`);
  const raw = YAML.parse(fs.readFileSync(file, "utf8")) as SeedManifest;
  if (!raw?.catalog || !raw.profiles || !raw.scenarios) {
    throw new Error("seed-manifest.yaml must define profiles, scenarios, and catalog");
  }
  return raw;
}

function parseRef(ref: string): { id: string; version: string } {
  const at = ref.lastIndexOf("@");
  if (at <= 0) throw new Error(`invalid asset ref "${ref}" — expected <id>@<version>`);
  return { id: ref.slice(0, at), version: ref.slice(at + 1) };
}

function resolveSectionAssets(
  manifest: SeedManifest,
  sectionName: string,
  section: SeedManifestSection | undefined,
  bucket: "profiles" | "scenarios",
  seenSections: Set<string>
): string[] {
  if (!section) throw new Error(`unknown seed ${bucket.slice(0, -1)} "${sectionName}"`);
  if (seenSections.has(`${bucket}:${sectionName}`)) return [];
  seenSections.add(`${bucket}:${sectionName}`);

  const refs: string[] = [];
  for (const include of section.includes ?? []) {
    const nested = manifest[bucket][include];
    refs.push(...resolveSectionAssets(manifest, include, nested, bucket, seenSections));
  }
  refs.push(...(section.assets ?? []));
  return refs;
}

function kindMatchesWithFilter(kind: string | undefined, filters: Set<SeedWithFilter>): boolean {
  if (filters.has("all") || filters.size === 0) return true;
  if (!kind) return true;
  if (filters.has("guides") && kind.startsWith("guide.")) return true;
  if (filters.has("commands") && kind === "guide.command") return true;
  if (filters.has("rubrics") && kind === "sensor.rubric") return true;
  if (filters.has("sensors") && kind.startsWith("sensor.") && kind !== "sensor.rubric") return true;
  if (filters.has("bundles") && kind === "harness.bundle") return true;
  if (filters.has("blueprints") && kind === "harness.blueprint") return true;
  return false;
}

function catalogKind(manifest: SeedManifest, ref: string): string | undefined {
  return manifest.catalog[ref]?.kind;
}

function catalogCategory(manifest: SeedManifest, ref: string): SeedAssetCategory {
  const entry = manifest.catalog[ref];
  if (!entry) throw new Error(`asset ref not in seed catalog: ${ref}`);
  return entry.category;
}

function assetSourcePath(goldenDir: string, manifest: SeedManifest, ref: string): string {
  const entry = manifest.catalog[ref];
  if (!entry) throw new Error(`asset ref not in seed catalog: ${ref}`);
  if (entry.path) return path.join(goldenDir, entry.path);
  const { id, version } = parseRef(ref);
  if (entry.category === "eval") return path.join(goldenDir, "evals", "golden-repos", id);
  if (entry.category === "package") {
    const kind = entry.kind;
    if (!kind) throw new Error(`seed catalog entry ${ref} missing kind for package`);
    return hubPackageDirForKind(goldenDir, kind, id, version);
  }
  const plural = entry.category === "bundle" ? "bundles" : "blueprints";
  return path.join(goldenDir, plural, id, version);
}

function assetDestPath(targetRoot: string, manifest: SeedManifest, ref: string): string {
  const entry = manifest.catalog[ref];
  const { id, version } = parseRef(ref);
  if (entry.category === "eval") return path.join(targetRoot, "evals", "golden-repos", id);
  if (entry.category === "package") {
    const kind = entry.kind;
    if (!kind) throw new Error(`seed catalog entry ${ref} missing kind for package`);
    return hubPackageDirForKind(targetRoot, kind, id, version);
  }
  const plural = entry.category === "bundle" ? "bundles" : "blueprints";
  return path.join(targetRoot, plural, id, version);
}

export function planSeedHub(opts: SeedHubOptions = {}, goldenDir = opts.goldenDir ?? BUILTIN_HUB_GOLDEN_DIR): SeedHubPlan {
  if (opts.full) {
    const manifest = fs.existsSync(seedManifestFile(goldenDir)) ? readSeedManifest(goldenDir) : null;
    const assets = manifest ? Object.keys(manifest.catalog) : [];
    return { assets, scenarios: [], skipped: [] };
  }

  const manifest = readSeedManifest(goldenDir);
  const profile = opts.profile ?? "standard";
  const scenarios = opts.scenario?.length ? opts.scenario : (["core"] as string[]);
  const exclude = new Set((opts.exclude ?? []).map((s) => s.trim()).filter(Boolean));
  const withFilters = new Set(
    (opts.with ?? [])
      .flatMap((v) => v.split(","))
      .map((s) => s.trim())
      .filter(Boolean) as SeedWithFilter[]
  );

  const seen = new Set<string>();
  const refs: string[] = [];
  for (const ref of resolveSectionAssets(manifest, profile, manifest.profiles[profile], "profiles", new Set())) {
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  for (const scenario of scenarios) {
    for (const ref of resolveSectionAssets(manifest, scenario, manifest.scenarios[scenario], "scenarios", new Set())) {
      if (!seen.has(ref)) {
        seen.add(ref);
        refs.push(ref);
      }
    }
  }

  const assets: string[] = [];
  const skipped: string[] = [];
  for (const ref of refs) {
    if (exclude.has(ref)) {
      skipped.push(ref);
      continue;
    }
    const kind = catalogKind(manifest, ref);
    const category = catalogCategory(manifest, ref);
    if (category === "eval") {
      if (withFilters.size > 0 && !withFilters.has("all") && !withFilters.has("evals")) {
        skipped.push(ref);
        continue;
      }
    } else if (!kindMatchesWithFilter(kind, withFilters)) {
      skipped.push(ref);
      continue;
    }
    assets.push(ref);
  }

  return { profile, scenarios, assets, skipped };
}

export function seedHub(targetRoot: string, opts: SeedHubOptions = {}): SeedHubResult {
  const goldenDir = opts.goldenDir ?? BUILTIN_HUB_GOLDEN_DIR;
  ensureDir(targetRoot);

  if (opts.full) {
    const seeded: HubRef[] = [];
    for (const sub of ["packages", "bundles", "blueprints", "evals"] as const) {
      const src = path.join(goldenDir, sub);
      if (!fs.existsSync(src)) continue;
      if (!opts.dryRun) copyDir(src, path.join(targetRoot, sub));
    }
    const policySrc = path.join(goldenDir, "hub-policy.yaml");
    if (fs.existsSync(policySrc) && !opts.dryRun) {
      fs.copyFileSync(policySrc, path.join(targetRoot, "hub-policy.yaml"));
    }
    if (fs.existsSync(seedManifestFile(goldenDir))) {
      const manifest = readSeedManifest(goldenDir);
      for (const ref of Object.keys(manifest.catalog)) {
        const { id, version } = parseRef(ref);
        seeded.push({ id, version });
      }
    }
    return {
      plan: { assets: seeded.map((s) => `${s.id}@${s.version}`), scenarios: [], skipped: [] },
      seeded,
      dryRun: !!opts.dryRun
    };
  }

  const plan = planSeedHub(opts, goldenDir);
  const manifest = readSeedManifest(goldenDir);
  const seeded: HubRef[] = [];

  if (!opts.dryRun) {
    const policySrc = path.join(goldenDir, "hub-policy.yaml");
    if (fs.existsSync(policySrc)) fs.copyFileSync(policySrc, path.join(targetRoot, "hub-policy.yaml"));
  }

  for (const ref of plan.assets) {
    const src = assetSourcePath(goldenDir, manifest, ref);
    const dest = assetDestPath(targetRoot, manifest, ref);
    if (!fs.existsSync(src)) throw new Error(`seed asset source missing: ${src}`);
    if (!opts.dryRun) {
      ensureDir(path.dirname(dest));
      copyDir(src, dest);
    }
    const { id, version } = parseRef(ref);
    seeded.push({ id, version });
  }

  return { plan, seeded, dryRun: !!opts.dryRun };
}

/** @deprecated Use seedHub() with profile/scenario options. Full copy when opts.full is true. */
export function seedGoldenHub(targetRoot: string, goldenDir = BUILTIN_HUB_GOLDEN_DIR): HubRef[] {
  return seedHub(targetRoot, { goldenDir, full: true }).seeded;
}
