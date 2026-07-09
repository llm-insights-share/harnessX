import fs from "node:fs";
import path from "node:path";
import { Workspace, writeYaml, readYaml } from "./paths.js";
import { ApprovalRecord, PrephaseApprovals } from "./schemas.js";
import { sha256 } from "./telemetry.js";

/** Workspace-level PRD/arch human approvals (pre-phase, outside change meta). */
export function prephaseApprovalsFile(ws: Workspace): string {
  return path.join(ws.root, "docs", ".prephase-approvals.yaml");
}

export function readPrephaseApprovals(ws: Workspace): PrephaseApprovals {
  const file = prephaseApprovalsFile(ws);
  if (!fs.existsSync(file)) {
    return PrephaseApprovals.parse({ version: "1.1", prd: {}, arch: undefined, archLld: {} });
  }
  const raw = readYaml(file);
  if (!raw.archLld) raw.archLld = {};
  return PrephaseApprovals.parse(raw);
}

export function writePrephaseApprovals(ws: Workspace, data: PrephaseApprovals): void {
  writeYaml(prephaseApprovalsFile(ws), data);
}

export function prdArtifactHash(ws: Workspace, slug: string): string {
  const file = ws.prdFile(slug);
  return fs.existsSync(file) ? sha256(fs.readFileSync(file, "utf8")) : "";
}

export function archArtifactHash(ws: Workspace): string {
  let content = "";
  const overview = ws.archOverviewFile();
  const registry = ws.archRegistryFile();
  if (fs.existsSync(overview)) content += fs.readFileSync(overview, "utf8");
  if (fs.existsSync(registry)) content += fs.readFileSync(registry, "utf8");
  return content ? sha256(content) : "";
}

export function archLldArtifactHash(ws: Workspace, moduleId: string): string {
  const file = ws.archModuleLld(moduleId);
  return fs.existsSync(file) ? sha256(fs.readFileSync(file, "utf8")) : "";
}

/** Record human sign-off for org-level PRD, global arch HLD, or module LLD. */
export function recordPrephaseApproval(
  ws: Workspace,
  gate: "prd" | "arch" | "arch-lld",
  approver: string,
  prdSlug?: string,
  moduleId?: string
): ApprovalRecord {
  const store = readPrephaseApprovals(ws);
  let artifactHash = "";
  if (gate === "prd") {
    if (!prdSlug) throw new Error("--prd <slug> required for gate prd");
    artifactHash = prdArtifactHash(ws, prdSlug);
    if (!artifactHash) throw new Error(`PRD file missing for slug "${prdSlug}"`);
  } else if (gate === "arch") {
    artifactHash = archArtifactHash(ws);
    if (!artifactHash) throw new Error("architecture overview/registry missing — run hx arch init");
  } else {
    if (!moduleId) throw new Error("--module <id> required for gate arch-lld");
    artifactHash = archLldArtifactHash(ws, moduleId);
    if (!artifactHash) throw new Error(`module LLD missing for "${moduleId}" — run hx arch lld init`);
  }
  const record: ApprovalRecord = {
    gate,
    approver,
    at: new Date().toISOString(),
    artifactHash
  };
  if (gate === "prd") {
    store.prd[prdSlug!] = record;
  } else if (gate === "arch") {
    store.arch = record;
  } else {
    store.archLld[moduleId!] = record;
  }
  writePrephaseApprovals(ws, store);
  return record;
}

export function prdApproval(ws: Workspace, slug: string): ApprovalRecord | undefined {
  return readPrephaseApprovals(ws).prd[slug];
}

export function archApproval(ws: Workspace): ApprovalRecord | undefined {
  return readPrephaseApprovals(ws).arch;
}

export function archLldApproval(ws: Workspace, moduleId: string): ApprovalRecord | undefined {
  return readPrephaseApprovals(ws).archLld[moduleId];
}

/** True when approval exists and still matches current artifact content. */
export function isPrephaseApproved(ws: Workspace, gate: "prd" | "arch", prdSlug?: string): boolean {
  const record = gate === "prd" ? prdApproval(ws, prdSlug!) : archApproval(ws);
  if (!record) return false;
  const current = gate === "prd" ? prdArtifactHash(ws, prdSlug!) : archArtifactHash(ws);
  return Boolean(current) && record.artifactHash === current;
}

export function isArchLldApproved(ws: Workspace, moduleId: string): boolean {
  const record = archLldApproval(ws, moduleId);
  if (!record) return false;
  const current = archLldArtifactHash(ws, moduleId);
  return Boolean(current) && record.artifactHash === current;
}
