import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { AssetManifest } from "./schemas.js";
import { hubBundleDir, hubVersions } from "./hub.js";
import { walkHubPackages } from "./hubPackagePaths.js";
import { hubBlueprintDir } from "./blueprint.js";
import { HubAssetMeta, type HubAssetCategory } from "./hubAssetSchema.js";
import { hashHubAssetDir } from "./hubIntegrity.js";
import { readHubReview } from "./hubReview.js";

export interface HubCatalogEntry {
  id: string;
  version: string;
  category: HubAssetCategory;
  kind?: string;
  status?: string;
  stages?: string[];
  description?: string;
  owner?: string;
  review?: string;
  hash?: string;
}

export interface HubCatalogFilters {
  kind?: string;
  category?: HubAssetCategory;
  stage?: string;
  status?: string;
  owner?: string;
  query?: string;
}

function manifestOrNull(dir: string): AssetManifest | null {
  const f = path.join(dir, "asset.yaml");
  if (!fs.existsSync(f)) return null;
  try {
    return AssetManifest.parse(YAML.parse(fs.readFileSync(f, "utf8")));
  } catch {
    return null;
  }
}

function readMeta(dir: string): Partial<HubAssetMeta> {
  const f = path.join(dir, ".hub-meta.yaml");
  if (!fs.existsSync(f)) return {};
  try {
    return HubAssetMeta.partial().parse(YAML.parse(fs.readFileSync(f, "utf8")));
  } catch {
    return {};
  }
}

function readDesc(dir: string, category: HubAssetCategory): string | undefined {
  if (category === "bundle") {
    const f = path.join(dir, "bundle.yaml");
    if (fs.existsSync(f)) return (YAML.parse(fs.readFileSync(f, "utf8")) as { description?: string }).description;
  }
  if (category === "blueprint") {
    const f = path.join(dir, "blueprint.yaml");
    if (fs.existsSync(f)) return (YAML.parse(fs.readFileSync(f, "utf8")) as { name?: string }).name;
  }
  return undefined;
}

export function buildHubCatalog(hubRoot: string): HubCatalogEntry[] {
  const out: HubCatalogEntry[] = [];
  const scan = (category: HubAssetCategory, subdir: "packages" | "bundles" | "blueprints", resolveDir: (id: string, ver: string) => string) => {
    const root = path.join(hubRoot, subdir);
    if (!fs.existsSync(root)) return;
    for (const idDir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!idDir.isDirectory()) continue;
      for (const ver of hubVersions(hubRoot, idDir.name, subdir)) {
        const dir = resolveDir(idDir.name, ver);
        const manifest = manifestOrNull(dir);
        const meta = readMeta(dir);
        const review = readHubReview(dir);
        const id = manifest?.id ?? idDir.name;
        const version = manifest?.version ?? ver;
        out.push({
          id,
          version,
          category,
          kind: manifest?.kind,
          status: meta.status ?? manifest?.status,
          stages: manifest?.stage ? [manifest.stage] : meta.stages,
          description: readDesc(dir, category),
          owner: meta.owner,
          review: review.status,
          hash: meta.security?.hash ?? hashHubAssetDir(dir)
        });
      }
    }
  };

  const scanPackages = () => {
    for (const loc of walkHubPackages(hubRoot)) {
      const dir = loc.dir;
      const manifest = manifestOrNull(dir);
      const meta = readMeta(dir);
      const review = readHubReview(dir);
      out.push({
        id: manifest?.id ?? loc.id,
        version: manifest?.version ?? loc.version,
        category: "package",
        kind: manifest?.kind ?? loc.kind,
        status: meta.status ?? manifest?.status,
        stages: manifest?.stage ? [manifest.stage] : meta.stages,
        description: readDesc(dir, "package"),
        owner: meta.owner,
        review: review.status,
        hash: meta.security?.hash ?? hashHubAssetDir(dir)
      });
    }
  };

  scanPackages();
  scan("bundle", "bundles", (id, ver) => hubBundleDir(hubRoot, id, ver));
  scan("blueprint", "blueprints", (id, ver) => hubBlueprintDir(hubRoot, id, ver));
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
}

export function queryHubCatalog(hubRoot: string, filters: HubCatalogFilters = {}): HubCatalogEntry[] {
  const q = filters.query?.toLowerCase();
  return buildHubCatalog(hubRoot).filter((e) => {
    if (filters.kind && e.kind !== filters.kind) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (filters.stage && !(e.stages ?? []).includes(filters.stage)) return false;
    if (filters.status && e.status !== filters.status) return false;
    if (filters.owner && e.owner !== filters.owner) return false;
    if (q) {
      const hay = `${e.id} ${e.version} ${e.kind ?? ""} ${e.description ?? ""} ${e.owner ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function writeHubCatalog(hubRoot: string): string {
  const file = path.join(hubRoot, "index.json");
  const entries = buildHubCatalog(hubRoot);
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2), "utf8");
  return file;
}
