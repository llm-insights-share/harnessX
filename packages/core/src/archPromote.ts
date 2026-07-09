import { extractApiPaths } from "./designLayout.js";

export interface PromotableContent {
  adrs: string[];
  apiRows: string[];
  apiPaths: string[];
  extraSections: { title: string; body: string }[];
}

const API_TABLE_ROW = /^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|/i;

/** Extract structured promotable slices from change-level design text. */
export function extractPromotableContent(
  designText: string,
  extraFiles: { rel: string; content: string }[] = []
): PromotableContent {
  const adrs: string[] = [];
  const apiRows: string[] = [];
  const extraSections: { title: string; body: string }[] = [];

  if (designText.trim()) {
    const adrParts = designText.split(/(?=###\s+ADR[-\d])/i).slice(1);
    for (const part of adrParts) {
      const trimmed = part.trim();
      if (trimmed.length > 20) adrs.push(trimmed);
    }
    for (const line of designText.split("\n")) {
      if (API_TABLE_ROW.test(line) && !/^\|\s*---/.test(line) && !/Method|方法/i.test(line)) {
        apiRows.push(line.trim());
      }
    }
    extraSections.push({ title: "Change HLD overview", body: designText.trim() });
  }

  for (const f of extraFiles) {
    if (f.content.trim()) extraSections.push({ title: f.rel, body: f.content.trim() });
  }

  return {
    adrs,
    apiRows,
    apiPaths: extractApiPaths(designText),
    extraSections
  };
}

function nextInterfaceId(lldText: string): string {
  const ids = [...lldText.matchAll(/\bIF-(\d+)\b/gi)].map((m) => parseInt(m[1]!, 10));
  const n = ids.length ? Math.max(...ids) + 1 : 1;
  return `IF-${String(n).padStart(3, "0")}`;
}

function mergeApiRowsIntoLld(lldText: string, apiRows: string[]): string {
  if (apiRows.length === 0) return lldText;
  const contractHeading = /##\s*(接口契约|Interface Contracts)/i;
  if (!contractHeading.test(lldText)) return lldText;

  const existingPaths = new Set(extractApiPaths(lldText));
  const newRows: string[] = [];
  for (const row of apiRows) {
    const cols = row.split("|").map((c) => c.trim()).filter(Boolean);
    const path = cols[1] ?? cols[0] ?? "";
    if (!path || existingPaths.has(path)) continue;
    const method = cols[0] ?? "API";
    const purpose = cols[2] ?? changePathLabel(path);
    const id = nextInterfaceId(lldText + newRows.join("\n"));
    newRows.push(`| ${id} | ${method} ${path} | ${purpose} | — | — | — |`);
    existingPaths.add(path);
  }
  if (newRows.length === 0) return lldText;

  const lines = lldText.split("\n");
  const idx = lines.findIndex((l) => contractHeading.test(l));
  if (idx < 0) return lldText;
  let insertAt = idx + 1;
  while (insertAt < lines.length && !lines[insertAt]!.trim().startsWith("|")) insertAt++;
  while (insertAt < lines.length && lines[insertAt]!.trim().startsWith("|")) insertAt++;
  lines.splice(insertAt, 0, ...newRows);
  return lines.join("\n");
}

function changePathLabel(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function buildPromotedBlock(change: string, stamp: string, content: PromotableContent): string {
  const parts: string[] = [`## Promoted from change \`${change}\` (${stamp})`];
  if (content.adrs.length) {
    parts.push("", "### ADRs", ...content.adrs);
  }
  if (content.apiPaths.length) {
    parts.push("", "### API paths", ...content.apiPaths.map((p) => `- \`${p}\``));
  }
  for (const sec of content.extraSections) {
    parts.push("", `### ${sec.title}`, sec.body);
  }
  return parts.join("\n");
}

/** Merge structured promotion into module LLD (interface table + promoted section). */
export function mergePromotedIntoLld(existing: string, change: string, content: PromotableContent, stamp: string): string {
  const marker = `## Promoted from change \`${change}\``;
  let base = existing.includes(marker) ? existing.replace(new RegExp(`${marker}[\\s\\S]*$`), "").trimEnd() : existing.trimEnd();
  base = mergeApiRowsIntoLld(base, content.apiRows);
  return `${base}\n\n---\n\n${buildPromotedBlock(change, stamp, content)}\n`;
}
