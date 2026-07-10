import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { MetaYaml, type GateHistoryEntry, type ApprovalRecord, type WaiverRecord } from "./schemas.js";
import type { DeliveryStage } from "./stages.js";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { sha256, runsLogHash } from "./telemetry.js";

/**
 * Exclusive meta.yaml writer (FR-050): every mutation goes through this module,
 * which stamps a contentHash. `verifyMeta` lets CI detect manual edits and
 * checks that recorded gate results are bound to the actual sensor log.
 */

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonical(meta: MetaYaml): string {
  const { contentHash: _omit, ...rest } = meta;
  return stableStringify(rest);
}

export function writeMeta(ws: Workspace, meta: MetaYaml): void {
  meta.contentHash = sha256(canonical(meta));
  writeYaml(ws.metaFile(meta.change), meta);
}

export function readMeta(ws: Workspace, change: string): MetaYaml {
  return MetaYaml.parse(YAML.parse(fs.readFileSync(ws.metaFile(change), "utf8")));
}

export interface MetaVerifyResult {
  ok: boolean;
  problems: string[];
}

export function verifyMeta(ws: Workspace, change: string): MetaVerifyResult {
  const problems: string[] = [];
  let meta: MetaYaml;
  try {
    meta = readMeta(ws, change);
  } catch (e) {
    return { ok: false, problems: [`meta.yaml unreadable or invalid: ${(e as Error).message}`] };
  }
  if (!meta.contentHash) problems.push("meta.yaml missing contentHash (was it written by hand?)");
  else if (meta.contentHash !== sha256(canonical(meta)))
    problems.push("meta.yaml contentHash mismatch — file was edited outside the hx CLI");

  const lastGate = meta.gateHistory.at(-1);
  if (lastGate?.logHash) {
    const actual = runsLogHash(ws, change, lastGate.logLines);
    if (actual.hash !== lastGate.logHash)
      problems.push("gate result logHash does not match sensor run log — logs or meta were tampered with");
  }
  return { ok: problems.length === 0, problems };
}

export function initMeta(
  ws: Workspace,
  change: string,
  profile: string,
  domains: string[],
  opts?: { prdRef?: string; archModules?: string[] }
): MetaYaml {
  const meta = MetaYaml.parse({
    change,
    profile,
    touchedDomains: domains,
    stage: "dev",
    task: "propose",
    stageProgress: { dev: { current: "propose", completed: [] } },
    ...(opts?.prdRef ? { prdRef: opts.prdRef } : {}),
    ...(opts?.archModules?.length ? { archModules: opts.archModules } : {})
  });
  ensureDir(ws.changeDir(change));
  writeMeta(ws, meta);
  return meta;
}

export function setStageTask(ws: Workspace, change: string, stage: DeliveryStage, task: string): MetaYaml {
  const meta = readMeta(ws, change);
  meta.stage = stage;
  meta.task = task;
  writeMeta(ws, meta);
  return meta;
}

export function recordGate(ws: Workspace, change: string, entry: Omit<GateHistoryEntry, "at" | "logHash" | "logLines">): MetaYaml {
  const meta = readMeta(ws, change);
  const { hash, lines } = runsLogHash(ws, change);
  meta.gateHistory.push({
    ...entry,
    at: new Date().toISOString(),
    logHash: hash,
    logLines: lines
  });
  writeMeta(ws, meta);
  return meta;
}

export function recordApproval(ws: Workspace, change: string, gate: string, approver: string): ApprovalRecord {
  const meta = readMeta(ws, change);
  const specsDir = ws.deltaSpecsDir(change);
  let artifactContent = "";
  if (fs.existsSync(specsDir)) {
    for (const cap of fs.readdirSync(specsDir).sort()) {
      const f = path.join(specsDir, cap, "spec.md");
      if (fs.existsSync(f)) artifactContent += fs.readFileSync(f, "utf8");
    }
  }
  const record: ApprovalRecord = {
    gate,
    approver,
    at: new Date().toISOString(),
    artifactHash: sha256(artifactContent)
  };
  meta.approvals.push(record);
  writeMeta(ws, meta);
  return record;
}

export function addWaiver(ws: Workspace, change: string, waiver: WaiverRecord): void {
  const meta = readMeta(ws, change);
  meta.waivers.push(waiver);
  writeMeta(ws, meta);
}

export function activeWaivers(meta: MetaYaml, now = new Date()): WaiverRecord[] {
  return meta.waivers.filter((w) => new Date(w.expiresAt) > now);
}

export function expiredWaivers(meta: MetaYaml, now = new Date()): WaiverRecord[] {
  return meta.waivers.filter((w) => new Date(w.expiresAt) <= now);
}
