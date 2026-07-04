import fs from "node:fs";
import path from "node:path";
import { ensureDir, Workspace } from "./paths.js";

/* ── Spec document model: markdown with Requirements + Scenarios (OpenSpec-compatible) ── */

export interface Scenario {
  name: string;
  body: string;
}

export interface Requirement {
  name: string;
  text: string;
  scenarios: Scenario[];
}

export interface SpecDoc {
  capability: string;
  preamble: string;
  requirements: Requirement[];
}

const REQ_HEADING = /^### Requirement: (.+)$/;
const SCEN_HEADING = /^#### Scenario: (.+)$/;

/** Parses the `## Requirements`/delta-section body into Requirement objects. */
export function parseRequirementBlocks(lines: string[]): Requirement[] {
  const reqs: Requirement[] = [];
  let cur: Requirement | null = null;
  let curScen: Scenario | null = null;
  for (const line of lines) {
    const rm = line.match(REQ_HEADING);
    if (rm) {
      cur = { name: rm[1].trim(), text: "", scenarios: [] };
      curScen = null;
      reqs.push(cur);
      continue;
    }
    const sm = line.match(SCEN_HEADING);
    if (sm && cur) {
      curScen = { name: sm[1].trim(), body: "" };
      cur.scenarios.push(curScen);
      continue;
    }
    if (curScen) curScen.body += line + "\n";
    else if (cur) cur.text += line + "\n";
  }
  for (const r of reqs) {
    r.text = r.text.trim();
    for (const s of r.scenarios) s.body = s.body.trim();
  }
  return reqs;
}

export function parseSpec(capability: string, md: string): SpecDoc {
  const lines = md.split("\n");
  const reqIdx = lines.findIndex((l) => /^## Requirements/.test(l));
  const preamble = (reqIdx >= 0 ? lines.slice(0, reqIdx) : lines).join("\n").trim();
  const reqLines = reqIdx >= 0 ? lines.slice(reqIdx + 1) : [];
  return { capability, preamble, requirements: parseRequirementBlocks(reqLines) };
}

export function serializeSpec(doc: SpecDoc): string {
  const parts: string[] = [];
  parts.push(doc.preamble || `# ${doc.capability} Specification`);
  parts.push("", "## Requirements");
  for (const r of doc.requirements) {
    parts.push("", `### Requirement: ${r.name}`, r.text);
    for (const s of r.scenarios) {
      parts.push("", `#### Scenario: ${s.name}`, s.body);
    }
  }
  return parts.join("\n").trim() + "\n";
}

/* ── Delta spec: ADDED / MODIFIED / REMOVED sections (§7.3) ── */

export type DeltaOp = "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";

export interface DeltaSpec {
  capability: string;
  sections: { op: DeltaOp; requirements: Requirement[] }[];
}

const DELTA_HEADING = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements?/;

export function parseDelta(capability: string, md: string): DeltaSpec {
  const lines = md.split("\n");
  const sections: DeltaSpec["sections"] = [];
  let buf: string[] = [];
  let op: DeltaOp | null = null;
  const flush = () => {
    if (op) sections.push({ op, requirements: parseRequirementBlocks(buf) });
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(DELTA_HEADING);
    if (m) {
      flush();
      op = m[1] as DeltaOp;
      continue;
    }
    buf.push(line);
  }
  flush();
  return { capability, sections };
}

export interface MergeConflict {
  capability: string;
  requirement: string;
  op: DeltaOp;
  reason: string;
}

/** Applies a delta to a base spec. Returns conflicts instead of silently mis-merging (FR-011). */
export function mergeDelta(base: SpecDoc, delta: DeltaSpec): { merged: SpecDoc; conflicts: MergeConflict[] } {
  const merged: SpecDoc = {
    capability: base.capability,
    preamble: base.preamble,
    requirements: base.requirements.map((r) => ({ ...r, scenarios: [...r.scenarios] }))
  };
  const conflicts: MergeConflict[] = [];
  const find = (name: string) => merged.requirements.findIndex((r) => r.name === name);

  for (const section of delta.sections) {
    for (const req of section.requirements) {
      const idx = find(req.name);
      if (section.op === "ADDED") {
        if (idx >= 0)
          conflicts.push({ capability: base.capability, requirement: req.name, op: "ADDED", reason: "already exists in base spec" });
        else merged.requirements.push(req);
      } else if (section.op === "MODIFIED") {
        if (idx < 0)
          conflicts.push({ capability: base.capability, requirement: req.name, op: "MODIFIED", reason: "not found in base spec (concurrent change may have removed/renamed it)" });
        else merged.requirements[idx] = req;
      } else if (section.op === "REMOVED") {
        if (idx < 0)
          conflicts.push({ capability: base.capability, requirement: req.name, op: "REMOVED", reason: "not found in base spec" });
        else merged.requirements.splice(idx, 1);
      }
    }
  }
  return { merged, conflicts };
}

/* ── Store operations over the workspace ── */

export function listDeltaFiles(ws: Workspace, change: string): { capability: string; file: string }[] {
  const dir = ws.deltaSpecsDir(change);
  if (!fs.existsSync(dir)) return [];
  const out: { capability: string; file: string }[] = [];
  for (const cap of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!cap.isDirectory()) continue;
    const f = path.join(dir, cap.name, "spec.md");
    if (fs.existsSync(f)) out.push({ capability: cap.name, file: f });
  }
  return out;
}

export function readMainSpec(ws: Workspace, capability: string): SpecDoc {
  const f = path.join(ws.specsDir, capability, "spec.md");
  if (!fs.existsSync(f)) return { capability, preamble: `# ${capability} Specification`, requirements: [] };
  return parseSpec(capability, fs.readFileSync(f, "utf8"));
}

export function writeMainSpec(ws: Workspace, doc: SpecDoc): void {
  const f = path.join(ws.specsDir, doc.capability, "spec.md");
  ensureDir(path.dirname(f));
  fs.writeFileSync(f, serializeSpec(doc), "utf8");
}

/** Merge every delta of a change into main specs. Conflicts abort before any write (rebase check, FR-011). */
export function mergeChangeIntoSpecs(ws: Workspace, change: string): { conflicts: MergeConflict[]; capabilities: string[] } {
  const deltas = listDeltaFiles(ws, change);
  const staged: SpecDoc[] = [];
  const conflicts: MergeConflict[] = [];
  for (const { capability, file } of deltas) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    const base = readMainSpec(ws, capability);
    const res = mergeDelta(base, delta);
    conflicts.push(...res.conflicts);
    staged.push(res.merged);
  }
  if (conflicts.length > 0) return { conflicts, capabilities: [] };
  for (const doc of staged) writeMainSpec(ws, doc);
  return { conflicts: [], capabilities: staged.map((d) => d.capability) };
}

/** Moves a completed change into archive/ with a date prefix (FR-009). */
export function archiveChangeDir(ws: Workspace, change: string): string {
  const date = new Date().toISOString().slice(0, 10);
  ensureDir(ws.archiveDir);
  const dest = path.join(ws.archiveDir, `${date}-${change}`);
  fs.renameSync(ws.changeDir(change), dest);
  return dest;
}
