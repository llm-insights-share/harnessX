import fs from "node:fs";
import path from "node:path";
import { Workspace, writeYaml, readYaml } from "./paths.js";
import { ApprovalRecord, StageApprovals } from "./schemas.js";
import { sha256 } from "./telemetry.js";
import type { DeliveryStage } from "./stages.js";

/** Workspace-level req/arch human approvals at docs/.stage-approvals.yaml */
export function stageApprovalsFile(ws: Workspace): string {
  return path.join(ws.root, "docs", ".stage-approvals.yaml");
}

export function readStageApprovals(ws: Workspace): StageApprovals {
  const file = stageApprovalsFile(ws);
  if (!fs.existsSync(file)) {
    return StageApprovals.parse({ version: "2.0", prd: {}, arch: undefined, archLld: {} });
  }
  const raw = readYaml<Record<string, unknown>>(file) as Record<string, unknown> & { archLld?: unknown };
  if (!raw.archLld) raw.archLld = {};
  return StageApprovals.parse(raw);
}

export function writeStageApprovals(ws: Workspace, data: StageApprovals): void {
  writeYaml(stageApprovalsFile(ws), data);
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
export function recordStageApproval(
  ws: Workspace,
  gate: "prd" | "arch" | "arch-lld",
  approver: string,
  prdSlug?: string,
  moduleId?: string
): ApprovalRecord {
  const store = readStageApprovals(ws);
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
  writeStageApprovals(ws, store);
  return record;
}

export function prdApproval(ws: Workspace, slug: string): ApprovalRecord | undefined {
  return readStageApprovals(ws).prd[slug];
}

export function archApproval(ws: Workspace): ApprovalRecord | undefined {
  return readStageApprovals(ws).arch;
}

export function archLldApproval(ws: Workspace, moduleId: string): ApprovalRecord | undefined {
  return readStageApprovals(ws).archLld[moduleId];
}

/** True when approval exists and still matches current artifact content. */
export function isStageApproved(ws: Workspace, stage: "req" | "arch", prdSlug?: string): boolean {
  const record = stage === "req" ? prdApproval(ws, prdSlug!) : archApproval(ws);
  if (!record) return false;
  const current = stage === "req" ? prdArtifactHash(ws, prdSlug!) : archArtifactHash(ws);
  return Boolean(current) && record.artifactHash === current;
}

export function isArchLldApproved(ws: Workspace, moduleId: string): boolean {
  const record = archLldApproval(ws, moduleId);
  if (!record) return false;
  const current = archLldArtifactHash(ws, moduleId);
  return Boolean(current) && record.artifactHash === current;
}

/** @deprecated use isStageApproved */
export const isPrephaseApproved = (ws: Workspace, gate: "prd" | "arch", prdSlug?: string) =>
  isStageApproved(ws, gate === "prd" ? "req" : "arch", prdSlug);

/** @deprecated use recordStageApproval */
export const recordPrephaseApproval = recordStageApproval;

/** @deprecated use readStageApprovals */
export const readPrephaseApprovals = readStageApprovals;

/** @deprecated use writeStageApprovals */
export const writePrephaseApprovals = writeStageApprovals;
