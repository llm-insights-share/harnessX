import { buildHubCatalog, queryHubCatalog, writeHubCatalog, type HubCatalogEntry as CatalogEntry } from "./hubCatalog.js";

/**
 * Hub asset search & catalog index (v0.4).
 */

export interface HubSearchOptions {
  kind?: string;
  phase?: string;
  category?: "package" | "bundle" | "blueprint";
  query?: string;
}

/** Indexes all hub assets across packages/, bundles/, blueprints/. */
export function indexHubCatalog(hubRoot: string): CatalogEntry[] {
  return buildHubCatalog(hubRoot);
}

export function searchHubCatalog(hubRoot: string, opts: HubSearchOptions = {}): CatalogEntry[] {
  return queryHubCatalog(hubRoot, opts);
}

/** Writes a searchable JSON index beside the hub root. */
export function writeHubIndex(hubRoot: string): string {
  return writeHubCatalog(hubRoot);
}
