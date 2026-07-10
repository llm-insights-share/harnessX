import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, readYaml, writeYaml } from "./paths.js";
import { ChangeRequestYaml, ChangeRequestIndex } from "./schemas.js";
import { sha256 } from "./telemetry.js";
import { createWorkOrder, submitWorkOrder } from "./workorder.js";
import { readStageApprovals, writeStageApprovals } from "./stageApprovalStore.js";

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

function canonicalCr(cr: ChangeRequestYaml): string {
  const { contentHash: _omit, ...rest } = cr;
  return stableStringify(rest);
}

function writeChangeRequest(ws: Workspace, cr: ChangeRequestYaml): void {
  cr.contentHash = sha256(canonicalCr(cr));
  writeYaml(ws.changeRequestFile(cr.id), cr);
  rebuildCrIndex(ws);
}

function readCrIndex(ws: Workspace): ChangeRequestIndex {
  ensureDir(ws.changeRequestsDir());
  const file = ws.changeRequestIndexFile();
  if (!fs.existsSync(file)) return ChangeRequestIndex.parse({ version: "1.0", nextSeq: 1, requests: [] });
  return ChangeRequestIndex.parse(readYaml(file));
}

function rebuildCrIndex(ws: Workspace): void {
  const index = readCrIndex(ws);
  const requests: ChangeRequestIndex["requests"] = [];
  if (!fs.existsSync(ws.changeRequestsDir())) return;
  for (const f of fs.readdirSync(ws.changeRequestsDir()).filter((n) => n.startsWith("CR-") && n.endsWith(".yaml"))) {
    const cr = readChangeRequest(ws, f.replace(/\.yaml$/, ""));
    requests.push({ id: cr.id, kind: cr.kind, status: cr.status, action: cr.action });
  }
  index.requests = requests.sort((a, b) => a.id.localeCompare(b.id));
  writeYaml(ws.changeRequestIndexFile(), index);
}

function nextCrId(ws: Workspace): string {
  const index = readCrIndex(ws);
  const id = `CR-${String(index.nextSeq).padStart(5, "0")}`;
  index.nextSeq += 1;
  writeYaml(ws.changeRequestIndexFile(), index);
  return id;
}

export function readChangeRequest(ws: Workspace, id: string): ChangeRequestYaml {
  const file = ws.changeRequestFile(id);
  if (!fs.existsSync(file)) throw new Error(`change request "${id}" not found`);
  return ChangeRequestYaml.parse(readYaml(file));
}

export interface CreateChangeRequestOpts {
  kind: ChangeRequestYaml["kind"];
  action: ChangeRequestYaml["action"];
  target: ChangeRequestYaml["target"];
  payload: ChangeRequestYaml["payload"];
  linkedChange?: string;
  createdBy: string;
}

export function createChangeRequest(ws: Workspace, opts: CreateChangeRequestOpts): ChangeRequestYaml {
  ensureDir(ws.changeRequestsDir());
  const id = nextCrId(ws);
  const cr = ChangeRequestYaml.parse({
    id,
    version: "1.0",
    kind: opts.kind,
    action: opts.action,
    target: opts.target,
    payload: opts.payload,
    status: "draft",
    linkedChange: opts.linkedChange,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString()
  });
  writeChangeRequest(ws, cr);
  return cr;
}

export function submitChangeRequest(ws: Workspace, id: string, by: string): { cr: ChangeRequestYaml; workorderId: string } {
  const cr = readChangeRequest(ws, id);
  if (cr.status !== "draft") throw new Error(`cannot submit CR in status "${cr.status}"`);
  const woType = cr.kind === "requirement-change" ? "req-change" : "arch-change";
  const wo = createWorkOrder(ws, {
    type: woType,
    title: `Review ${cr.kind} ${cr.id} (${cr.action})`,
    scope: cr.kind === "requirement-change" ? "req" : "arch",
    ref: { prd: cr.target.prd, change: cr.linkedChange, changeRequest: cr.id },
    assigneeRole: "tech-manager",
    createdBy: by
  });
  cr.status = "submitted";
  cr.workorderId = wo.id;
  writeChangeRequest(ws, cr);
  submitWorkOrder(ws, wo.id, by);
  return { cr, workorderId: wo.id };
}

export function applyChangeRequest(ws: Workspace, id: string, by: string): ChangeRequestYaml {
  const cr = readChangeRequest(ws, id);
  if (cr.status !== "approved" && cr.status !== "submitted") {
    if (cr.status === "applied") return cr;
    throw new Error(`cannot apply CR in status "${cr.status}"`);
  }

  if (cr.kind === "requirement-change" && cr.target.prd) {
    applyPrdChange(ws, cr);
    invalidatePrdApproval(ws, cr.target.prd);
  } else if (cr.kind === "design-change") {
    applyDesignChange(ws, cr);
    invalidateArchApproval(ws, cr.target.module);
  }

  cr.status = "applied";
  writeChangeRequest(ws, cr);
  return cr;
}

function applyPrdChange(ws: Workspace, cr: ChangeRequestYaml): void {
  const slug = cr.target.prd!;
  const file = ws.prdFile(slug);
  if (!fs.existsSync(file)) throw new Error(`PRD "${slug}" not found`);
  let content = fs.readFileSync(file, "utf8");

  if (cr.action === "add" && cr.payload.revised) {
    content += `\n\n## Added (${cr.id})\n\n${cr.payload.revised}\n`;
  } else if (cr.action === "modify" && cr.payload.revised) {
    if (cr.payload.original && content.includes(cr.payload.original)) {
      content = content.replace(cr.payload.original, cr.payload.revised);
    } else {
      content += `\n\n## Modified (${cr.id})\n\n**Change note:** ${cr.payload.changeNote ?? ""}\n\n${cr.payload.revised}\n`;
    }
  } else if (cr.action === "delete" && cr.payload.deleted) {
    if (content.includes(cr.payload.deleted)) {
      content = content.replace(cr.payload.deleted, `\n<!-- deleted by ${cr.id} -->\n`);
    }
  }

  if (cr.target.version) {
    content = content.replace(/Version\s*\/\s*Date:.*/i, `Version / Date: ${cr.target.version}`);
  }
  fs.writeFileSync(file, content, "utf8");
}

function applyDesignChange(ws: Workspace, cr: ChangeRequestYaml): void {
  const targetFile = cr.target.module
    ? ws.archModuleLld(cr.target.module)
    : ws.archOverviewFile();
  if (!fs.existsSync(targetFile)) throw new Error(`design target missing: ${targetFile}`);
  let content = fs.readFileSync(targetFile, "utf8");

  if (cr.action === "add" && cr.payload.revised) {
    content += `\n\n## Added (${cr.id})\n\n${cr.payload.revised}\n`;
  } else if (cr.action === "modify" && cr.payload.revised) {
    if (cr.payload.original && content.includes(cr.payload.original)) {
      content = content.replace(cr.payload.original, cr.payload.revised);
    } else {
      content += `\n\n## Modified (${cr.id})\n\n${cr.payload.changeNote ?? ""}\n\n${cr.payload.revised}\n`;
    }
  } else if (cr.action === "delete" && cr.payload.deleted) {
    content = content.replace(cr.payload.deleted, `<!-- deleted by ${cr.id} -->`);
  }
  fs.writeFileSync(targetFile, content, "utf8");
}

function invalidatePrdApproval(ws: Workspace, slug: string): void {
  const store = readStageApprovals(ws);
  delete store.prd[slug];
  writeStageApprovals(ws, store);
}

function invalidateArchApproval(ws: Workspace, module?: string): void {
  const store = readStageApprovals(ws);
  if (module) delete store.archLld[module];
  else store.arch = undefined;
  writeStageApprovals(ws, store);
}

export function approveChangeRequest(ws: Workspace, crId: string, by: string): ChangeRequestYaml {
  const cr = readChangeRequest(ws, crId);
  cr.status = "approved";
  writeChangeRequest(ws, cr);
  return applyChangeRequest(ws, crId, by);
}

export function listChangeRequests(ws: Workspace): ChangeRequestYaml[] {
  rebuildCrIndex(ws);
  return readCrIndex(ws).requests.map((r) => readChangeRequest(ws, r.id));
}

export function showChangeRequestDiff(cr: ChangeRequestYaml): string {
  const parts = [
    `# Change Request ${cr.id}`,
    `- Kind: ${cr.kind}`,
    `- Action: ${cr.action}`,
    `- Status: ${cr.status}`,
    ""
  ];
  if (cr.payload.original) parts.push("## Original\n", cr.payload.original, "");
  if (cr.payload.changeNote) parts.push("## Change Note\n", cr.payload.changeNote, "");
  if (cr.payload.revised) parts.push("## Revised\n", cr.payload.revised, "");
  if (cr.payload.deleted) parts.push("## Deleted\n", cr.payload.deleted, "");
  return parts.join("\n");
}
