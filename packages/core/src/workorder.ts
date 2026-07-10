import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, readYaml, writeYaml } from "./paths.js";
import {
  WorkOrderYaml,
  WorkOrderIndex,
  WorkOrderSpawnSpec,
  WorkOrderType,
  WorkOrderStatus,
  WorkOrderRef
} from "./schemas.js";
import { sha256 } from "./telemetry.js";
import { canApproveWorkOrderType, checkRolePermission } from "./roles.js";
import { listBugs } from "./bugs.js";
import { readMeta } from "./metaStore.js";
import { readArchRegistry } from "./archRegistry.js";

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

function canonicalWo(wo: WorkOrderYaml): string {
  const { contentHash: _omit, ...rest } = wo;
  return stableStringify(rest);
}

function writeWorkOrder(ws: Workspace, wo: WorkOrderYaml): void {
  wo.contentHash = sha256(canonicalWo(wo));
  writeYaml(ws.workorderFile(wo.id), wo);
  rebuildIndex(ws);
}

function readIndex(ws: Workspace): WorkOrderIndex {
  ensureDir(ws.workordersDir());
  const file = ws.workorderIndexFile();
  if (!fs.existsSync(file)) return WorkOrderIndex.parse({ version: "1.0", nextSeq: 1, orders: [] });
  return WorkOrderIndex.parse(readYaml(file));
}

function rebuildIndex(ws: Workspace): void {
  const index = readIndex(ws);
  const orders: WorkOrderIndex["orders"] = [];
  if (!fs.existsSync(ws.workordersDir())) return;
  for (const f of fs.readdirSync(ws.workordersDir()).filter((n) => n.startsWith("WO-") && n.endsWith(".yaml"))) {
    const wo = readWorkOrder(ws, f.replace(/\.yaml$/, ""));
    orders.push({
      id: wo.id,
      type: wo.type,
      status: wo.status,
      assigneeRole: wo.assigneeRole,
      title: wo.title,
      ref: wo.ref
    });
  }
  index.orders = orders.sort((a, b) => a.id.localeCompare(b.id));
  writeYaml(ws.workorderIndexFile(), index);
}

function nextId(ws: Workspace): string {
  const index = readIndex(ws);
  const id = `WO-${String(index.nextSeq).padStart(5, "0")}`;
  index.nextSeq += 1;
  writeYaml(ws.workorderIndexFile(), index);
  return id;
}

export function readWorkOrder(ws: Workspace, id: string): WorkOrderYaml {
  const file = ws.workorderFile(id);
  if (!fs.existsSync(file)) throw new Error(`work order "${id}" not found`);
  return WorkOrderYaml.parse(readYaml(file));
}

export function hashArtifact(ws: Workspace, relPath: string): string {
  const abs = path.join(ws.root, relPath);
  if (!fs.existsSync(abs)) return "";
  return sha256(fs.readFileSync(abs, "utf8"));
}

export interface CreateWorkOrderOpts {
  type: WorkOrderType;
  title: string;
  scope: "req" | "arch" | "change";
  ref?: WorkOrderRef;
  assigneeRole: string;
  createdBy: string;
  artifacts?: { path: string }[];
  spawn?: WorkOrderSpawnSpec[];
  parentId?: string;
}

export function createWorkOrder(ws: Workspace, opts: CreateWorkOrderOpts): WorkOrderYaml {
  ensureDir(ws.workordersDir());
  const id = nextId(ws);
  const wo = WorkOrderYaml.parse({
    id,
    version: "1.0",
    type: opts.type,
    title: opts.title,
    status: "draft",
    scope: opts.scope,
    ref: opts.ref ?? {},
    assigneeRole: opts.assigneeRole,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
    artifacts: (opts.artifacts ?? []).map((a) => ({ path: a.path, hash: hashArtifact(ws, a.path) })),
    history: [{ action: "create", by: opts.createdBy, at: new Date().toISOString() }],
    spawn: opts.spawn ?? defaultSpawnOnApprove(opts.type),
    downstream: [],
    parentId: opts.parentId
  });
  writeWorkOrder(ws, wo);
  return wo;
}

function defaultSpawnOnApprove(type: WorkOrderType): WorkOrderSpawnSpec[] {
  switch (type) {
    case "req-review":
      return [{ type: "arch-design", assigneeRole: "architect" }];
    case "arch-review":
      return [];
    case "test-case-review":
      return [{ type: "test-run", assigneeRole: "tester" }];
    case "bug-fix":
      return [{ type: "retest", assigneeRole: "tester" }];
    default:
      return [];
  }
}

export function submitWorkOrder(ws: Workspace, id: string, by: string): WorkOrderYaml {
  checkRolePermission(ws, by, "wo.submit", { hard: true });
  const wo = readWorkOrder(ws, id);
  if (wo.status !== "draft" && wo.status !== "rejected") throw new Error(`cannot submit work order in status "${wo.status}"`);
  wo.status = "pending";
  wo.history.push({ action: "submit", by, at: new Date().toISOString() });
  writeWorkOrder(ws, wo);
  return wo;
}

export interface ApproveWorkOrderOpts {
  by: string;
  note?: string;
  skipSpawn?: boolean;
}

export function approveWorkOrder(ws: Workspace, id: string, opts: ApproveWorkOrderOpts): { wo: WorkOrderYaml; spawned: WorkOrderYaml[] } {
  const check = canApproveWorkOrderType(ws, opts.by, readWorkOrder(ws, id).type);
  if (!check.ok) throw new Error(check.message ?? "not authorized to approve");
  checkRolePermission(ws, opts.by, "wo.approve", { hard: true });

  const wo = readWorkOrder(ws, id);
  if (wo.status !== "pending") throw new Error(`cannot approve work order in status "${wo.status}"`);
  wo.status = "approved";
  wo.history.push({ action: "approve", by: opts.by, at: new Date().toISOString(), note: opts.note });
  writeWorkOrder(ws, wo);

  const spawned: WorkOrderYaml[] = [];
  if (!opts.skipSpawn) {
    for (const spec of wo.spawn) {
      const child = spawnWorkOrder(ws, wo, spec, opts.by);
      spawned.push(child);
      wo.downstream.push(child.id);
    }
    if (wo.type === "arch-review" && wo.ref.change) {
      try {
        const modules = readArchRegistry(ws)
          .modules.filter((m) => m.status === "active")
          .map((m) => m.id);
        for (const m of modules) {
          const child = createWorkOrder(ws, {
            type: "lld-design",
            title: `Detailed design: module ${m}`,
            scope: "change",
            ref: { change: wo.ref.change, module: m },
            assigneeRole: "developer",
            createdBy: opts.by,
            parentId: wo.id
          });
          spawned.push(child);
          wo.downstream.push(child.id);
        }
      } catch {
        /* no registry */
      }
    }
    if (spawned.length) writeWorkOrder(ws, wo);
  }
  return { wo, spawned };
}

function spawnWorkOrder(ws: Workspace, parent: WorkOrderYaml, spec: WorkOrderSpawnSpec, by: string): WorkOrderYaml {
  const ref = { ...parent.ref, ...spec.ref };
  const title = spec.title ?? `${spec.type}: ${parent.title}`;
  const scope = ref.change ? "change" : parent.scope;
  const artifacts: { path: string }[] = [];
  if (ref.prd) artifacts.push({ path: `docs/prd/${ref.prd}.md` });
  if (ref.change && spec.type === "lld-design" && ref.module) {
    artifacts.push({ path: `harnessX/changes/${ref.change}/design/api/${ref.module}.yaml` });
  }
  return createWorkOrder(ws, {
    type: spec.type,
    title,
    scope,
    ref,
    assigneeRole: spec.assigneeRole,
    createdBy: by,
    artifacts,
    parentId: parent.id
  });
}

export function rejectWorkOrder(ws: Workspace, id: string, by: string, reason: string): { wo: WorkOrderYaml; revise?: WorkOrderYaml } {
  checkRolePermission(ws, by, "wo.reject", { hard: true });
  const wo = readWorkOrder(ws, id);
  if (wo.status !== "pending") throw new Error(`cannot reject work order in status "${wo.status}"`);
  wo.status = "rejected";
  wo.history.push({ action: "reject", by, at: new Date().toISOString(), reason });
  writeWorkOrder(ws, wo);

  let revise: WorkOrderYaml | undefined;
  const reviseType = wo.type === "req-review" ? "req-revise" : wo.type === "arch-review" ? "arch-revise" : undefined;
  if (reviseType) {
    revise = createWorkOrder(ws, {
      type: reviseType,
      title: `Revise: ${wo.title}`,
      scope: wo.scope,
      ref: wo.ref,
      assigneeRole: wo.type === "req-review" ? "product-manager" : "architect",
      createdBy: by,
      artifacts: wo.artifacts.map((a) => ({ path: a.path })),
      parentId: wo.id
    });
    wo.downstream.push(revise.id);
    writeWorkOrder(ws, wo);
  }
  return { wo, revise };
}

export function doneWorkOrder(ws: Workspace, id: string, by: string): WorkOrderYaml {
  const wo = readWorkOrder(ws, id);
  wo.status = "done";
  wo.history.push({ action: "done", by, at: new Date().toISOString() });
  writeWorkOrder(ws, wo);
  return wo;
}

export function cancelWorkOrder(ws: Workspace, id: string, by: string, reason?: string): WorkOrderYaml {
  const wo = readWorkOrder(ws, id);
  wo.status = "cancelled";
  wo.history.push({ action: "cancel", by, at: new Date().toISOString(), reason });
  writeWorkOrder(ws, wo);
  return wo;
}

export interface ListWorkOrdersFilter {
  status?: WorkOrderStatus | WorkOrderStatus[];
  type?: WorkOrderType | WorkOrderType[];
  assigneeRole?: string;
  change?: string;
  prd?: string;
}

export function listWorkOrders(ws: Workspace, filter?: ListWorkOrdersFilter): WorkOrderYaml[] {
  rebuildIndex(ws);
  const index = readIndex(ws);
  let ids = index.orders.map((o) => o.id);
  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    ids = ids.filter((id) => statuses.includes(readWorkOrder(ws, id).status));
  }
  if (filter?.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    ids = ids.filter((id) => types.includes(readWorkOrder(ws, id).type));
  }
  if (filter?.assigneeRole) {
    ids = ids.filter((id) => readWorkOrder(ws, id).assigneeRole === filter.assigneeRole);
  }
  if (filter?.change) {
    ids = ids.filter((id) => readWorkOrder(ws, id).ref.change === filter.change);
  }
  if (filter?.prd) {
    ids = ids.filter((id) => readWorkOrder(ws, id).ref.prd === filter.prd);
  }
  return ids.map((id) => readWorkOrder(ws, id));
}

export function inboxWorkOrders(ws: Workspace, role: string): WorkOrderYaml[] {
  return listWorkOrders(ws, { assigneeRole: role, status: ["pending", "draft"] });
}

export function workorderProblems(ws: Workspace, change?: string, phase?: string): string[] {
  const problems: string[] = [];
  const required = (() => {
    try {
      const cfg = ws.readConfig();
      return cfg.profile === "enterprise-sdlc";
    } catch {
      return false;
    }
  })();
  if (!required) return problems;

  if (!change && phase === "change-create") return problems;

  if (change) {
    let meta;
    try {
      meta = readMeta(ws, change);
    } catch {
      return problems;
    }
    const prdSlug = meta.prdRef;
    if (prdSlug && (phase === "propose" || !phase)) {
      const approved = listWorkOrders(ws, { type: "req-review", prd: prdSlug, status: "approved" });
      const done = listWorkOrders(ws, { type: "req-review", prd: prdSlug, status: "done" });
      if (approved.length === 0 && done.length === 0) {
        problems.push(`req-review work order for PRD "${prdSlug}" must be approved (hx wo list --type req-review --prd ${prdSlug})`);
      }
    }
    if (phase === "design") {
      const archOk = listWorkOrders(ws, { type: "arch-review", change, status: ["approved", "done"] });
      if (archOk.length === 0) {
        problems.push(`arch-review work order must be approved for change "${change}"`);
      }
    }
    if (phase === "plan") {
      const lldPending = listWorkOrders(ws, { type: "lld-design", change, status: ["draft", "pending", "approved"] });
      if (lldPending.length > 0) {
        problems.push(`${lldPending.length} lld-design work order(s) must be marked done before plan gate`);
      }
    }
    if (phase === "test-design" || phase === "apply") {
      const tcr = listWorkOrders(ws, { type: "test-case-review", change, status: ["approved", "done"] });
      if (tcr.length === 0) {
        problems.push(`test-case-review work order must be approved before ${phase}`);
      }
    }
    if (phase === "verify") {
      const openBugs = listBugs(ws, change, ["open", "retest", "reopened"]);
      if (openBugs.length > 0) problems.push(`${openBugs.length} open bug(s) block verify — resolve or waive`);
    }
  }
  return problems;
}

export function buildWorkOrderExtract(ws: Workspace, id: string): string {
  const wo = readWorkOrder(ws, id);
  const parts = [
    `# Work Order Extract — ${wo.id}`,
    "",
    `- **Type**: ${wo.type}`,
    `- **Status**: ${wo.status}`,
    `- **Title**: ${wo.title}`,
    `- **Assignee role**: ${wo.assigneeRole}`,
    `- **Scope**: ${wo.scope}`,
    "",
    "## Reference",
    "```yaml",
    JSON.stringify(wo.ref, null, 2),
    "```",
    "",
    "## Artifacts"
  ];
  for (const a of wo.artifacts) {
    parts.push(`### ${a.path}`, "");
    const abs = path.join(ws.root, a.path);
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, "utf8");
      parts.push(content.slice(0, 8000));
      if (content.length > 8000) parts.push("\n<!-- truncated -->");
    } else parts.push("_(missing)_");
    parts.push("");
  }
  parts.push("## History");
  for (const h of wo.history) {
    parts.push(`- ${h.at} **${h.action}** by ${h.by}${h.note ? `: ${h.note}` : ""}${h.reason ? ` — ${h.reason}` : ""}`);
  }
  return parts.join("\n");
}

export function spawnLldDesignWorkOrders(
  ws: Workspace,
  change: string,
  modules: string[],
  by: string
): WorkOrderYaml[] {
  const spawned: WorkOrderYaml[] = [];
  for (const module of modules) {
    const wo = createWorkOrder(ws, {
      type: "lld-design",
      title: `Detailed design: module ${module}`,
      scope: "change",
      ref: { change, module },
      assigneeRole: "developer",
      createdBy: by,
      artifacts: [{ path: `docs/architecture/modules/${module}/lld.md` }]
    });
    spawned.push(wo);
  }
  return spawned;
}

export function checkReqReviewForPrd(ws: Workspace, prdSlug: string): boolean {
  const wos = listWorkOrders(ws, { type: "req-review", prd: prdSlug });
  return wos.some((w) => w.status === "approved" || w.status === "done");
}
