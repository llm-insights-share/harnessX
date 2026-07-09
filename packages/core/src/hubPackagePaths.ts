import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { AssetManifest } from "./schemas.js";
import type { HubRef } from "./hub.js";

export interface HubPackageLocation {
  dir: string;
  id: string;
  version: string;
  kind: string;
}

/** `guide.template` -> `guide/template` */
export function kindToPackageSegments(kind: string): string[] {
  const segments = kind.split(".").filter(Boolean);
  if (segments.length < 2) throw new Error(`package kind must contain a dot (e.g. guide.template), got "${kind}"`);
  return segments;
}

export function hubPackageDirForKind(hubRoot: string, kind: string, id: string, version: string): string {
  return path.join(hubRoot, "packages", ...kindToPackageSegments(kind), id, version);
}

function readPackageManifest(dir: string): AssetManifest | null {
  const f = path.join(dir, "asset.yaml");
  if (!fs.existsSync(f)) return null;
  try {
    return AssetManifest.parse(YAML.parse(fs.readFileSync(f, "utf8")));
  } catch {
    return null;
  }
}

/** Walk packages/ and collect every asset directory (kind-scoped and legacy flat layouts). */
export function walkHubPackages(hubRoot: string): HubPackageLocation[] {
  const root = path.join(hubRoot, "packages");
  if (!fs.existsSync(root)) return [];

  const out: HubPackageLocation[] = [];
  const visit = (dir: string) => {
    const manifest = readPackageManifest(dir);
    if (manifest) {
      out.push({ dir, id: manifest.id, version: manifest.version, kind: manifest.kind });
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(dir, entry.name));
    }
  };
  visit(root);
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
}

/** Resolve on-disk package dir by id@version (supports kind-scoped and legacy flat layouts). */
export function resolveHubPackageDir(hubRoot: string, ref: HubRef, kindHint?: string): string | null {
  if (kindHint) {
    const hinted = hubPackageDirForKind(hubRoot, kindHint, ref.id, ref.version);
    if (fs.existsSync(path.join(hinted, "asset.yaml"))) return hinted;
  }

  const legacy = path.join(hubRoot, "packages", ref.id, ref.version);
  if (fs.existsSync(path.join(legacy, "asset.yaml"))) return legacy;

  for (const loc of walkHubPackages(hubRoot)) {
    if (loc.id === ref.id && loc.version === ref.version) return loc.dir;
  }
  return null;
}

export function listHubPackageRefs(hubRoot: string): HubRef[] {
  return walkHubPackages(hubRoot).map((p) => ({ id: p.id, version: p.version }));
}

export function hubPackageVersions(hubRoot: string, id: string): string[] {
  const versions = walkHubPackages(hubRoot)
    .filter((p) => p.id === id)
    .map((p) => p.version);
  return [...new Set(versions)].sort();
}
