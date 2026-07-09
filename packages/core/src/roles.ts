import fs from "node:fs";
import { Workspace, readYaml, writeYaml } from "./paths.js";
import { RolesYaml } from "./schemas.js";

const DEFAULT_ROLES: RolesYaml = {
  version: "1.0",
  workflow: { workorders: "optional" },
  roles: {
    "chief-architect": { can: ["hub.*", "arch.init", "arch.approve"], approves: [] },
    "tech-manager": {
      can: ["wo.approve", "wo.reject", "gate.approve", "test-cases.approve"],
      approves: ["req-review", "req-change", "arch-review", "arch-change", "test-case-review"]
    },
    "product-manager": { can: ["prd.*", "wo.submit", "cr.create"], approves: [] },
    architect: { can: ["arch.*", "design.*", "cr.create"], approves: [] },
    developer: { can: ["design.lld", "apply", "bug.fix"], approves: [] },
    tester: { can: ["test-cases.*", "bug.create", "wo.submit"], approves: [] }
  },
  members: {}
};

export function readRoles(ws: Workspace): RolesYaml {
  const file = ws.rolesFile();
  if (!fs.existsSync(file)) return RolesYaml.parse(DEFAULT_ROLES);
  return RolesYaml.parse(readYaml(file));
}

export function writeRoles(ws: Workspace, data: RolesYaml): void {
  writeYaml(ws.rolesFile(), data);
}

export function scaffoldRoles(ws: Workspace): string {
  const file = ws.rolesFile();
  if (!fs.existsSync(file)) writeRoles(ws, RolesYaml.parse(DEFAULT_ROLES));
  return file;
}

export function memberRole(ws: Workspace, member: string): string | undefined {
  return readRoles(ws).members[member];
}

export function workordersRequired(ws: Workspace): boolean {
  const roles = readRoles(ws);
  if (roles.workflow.workorders === "required") return true;
  try {
    return ws.readConfig().profile === "enterprise-sdlc";
  } catch {
    return false;
  }
}

export interface RoleCheckResult {
  ok: boolean;
  role?: string;
  message?: string;
}

/** Check if member can perform action; hard block when enterprise-sdlc + workorders required. */
export function checkRolePermission(ws: Workspace, member: string, action: string, opts?: { hard?: boolean }): RoleCheckResult {
  const roles = readRoles(ws);
  const role = roles.members[member];
  if (!role) {
    const hard = opts?.hard ?? workordersRequired(ws);
    if (hard) return { ok: false, message: `member "${member}" not mapped in roles.yaml` };
    return { ok: true, message: `member "${member}" not mapped (soft allow)` };
  }
  const def = roles.roles[role];
  if (!def) return { ok: false, role, message: `unknown role "${role}"` };
  const allowed = def.can.some((p) => matchPattern(p, action)) || def.approves.some((t) => action === `wo.approve:${t}`);
  if (!allowed) {
    const hard = opts?.hard ?? workordersRequired(ws);
    if (hard) return { ok: false, role, message: `role "${role}" cannot perform "${action}"` };
    return { ok: true, role, message: `soft allow: role "${role}" lacks "${action}"` };
  }
  return { ok: true, role };
}

export function canApproveWorkOrderType(ws: Workspace, member: string, woType: string): RoleCheckResult {
  const roles = readRoles(ws);
  const role = roles.members[member];
  if (!role) {
    if (workordersRequired(ws)) return { ok: false, message: `member "${member}" not mapped` };
    return { ok: true };
  }
  const def = roles.roles[role];
  if (!def?.approves.includes(woType)) {
    if (workordersRequired(ws)) return { ok: false, role, message: `role "${role}" cannot approve work order type "${woType}"` };
    return { ok: true, role, message: "soft allow" };
  }
  return { ok: true, role };
}

function matchPattern(pattern: string, action: string): boolean {
  if (pattern === action) return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    return action.startsWith(prefix);
  }
  return false;
}
