import { Workspace } from "./paths.js";
import { HubConnectionYaml, type HubRole } from "./schemas.js";
import { readRoles } from "./roles.js";
import { resolveHubSource } from "./hubSource.js";

export type HubAction =
  | "hub.search"
  | "hub.catalog"
  | "hub.golden"
  | "hub.add"
  | "hub.sync"
  | "hub.submit"
  | "hub.promote"
  | "hub.contributions"
  | "hub.review"
  | "hub.asset"
  | "hub.policy"
  | "hub.seed"
  | "hub.push"
  | "hub.eval";

const CONSUMER_ACTIONS = new Set<HubAction>([
  "hub.search",
  "hub.catalog",
  "hub.golden",
  "hub.add",
  "hub.sync",
  "hub.submit",
  "hub.eval"
]);

const MAINTAINER_ACTIONS = new Set<HubAction>([
  "hub.search",
  "hub.catalog",
  "hub.golden",
  "hub.add",
  "hub.sync",
  "hub.promote",
  "hub.contributions",
  "hub.review",
  "hub.asset",
  "hub.policy",
  "hub.seed",
  "hub.push",
  "hub.eval"
]);

export interface ResolvedHubConnection {
  source: string;
  role: HubRole;
  actor?: string;
  branch?: string;
}

export function parseHubConfigField(hub: string | HubConnectionYaml | undefined): Omit<ResolvedHubConnection, "role"> & { role?: HubRole } | null {
  if (!hub) return null;
  if (typeof hub === "string") {
    return { source: hub };
  }
  const parsed = HubConnectionYaml.parse(hub);
  return {
    source: parsed.source,
    role: parsed.role,
    actor: parsed.actor,
    branch: parsed.branch
  };
}

export function hubConfigSource(hub: string | HubConnectionYaml | undefined): string | undefined {
  return parseHubConfigField(hub)?.source;
}

/** Infer maintainer when hub.role is unset and member has hub.* in roles.yaml. */
export function inferHubRole(ws: Workspace): HubRole {
  const actor = resolveHubActor(ws, undefined, { allowMissing: true });
  if (actor) {
    const roles = readRoles(ws);
    const roleName = roles.members[actor];
    const def = roleName ? roles.roles[roleName] : undefined;
    if (def?.can.some((p) => p === "hub.*" || p.startsWith("hub."))) return "maintainer";
  }
  return "consumer";
}

export function readHubConnection(ws: Workspace): ResolvedHubConnection | null {
  try {
    const raw = ws.readConfig().hub;
    const parsed = parseHubConfigField(raw);
    if (!parsed) return null;
    const role = parsed.role ?? inferHubRole(ws);
    return { source: parsed.source, role, actor: parsed.actor, branch: parsed.branch };
  } catch {
    return null;
  }
}

export function resolveHubActor(ws: Workspace, override?: string, opts?: { allowMissing?: boolean }): string {
  if (override) return override;
  if (process.env.HX_ACTOR) return process.env.HX_ACTOR;
  const conn = readHubConnection(ws);
  if (conn?.actor) return conn.actor;
  const members = Object.keys(readRoles(ws).members);
  if (members.length === 1) return members[0]!;
  if (opts?.allowMissing) return "";
  throw new Error(
    members.length === 0
      ? "hub actor not set — add hub.actor to config.yaml, set HX_ACTOR, or map a member in roles.yaml"
      : `hub actor ambiguous (${members.length} members) — set hub.actor in config.yaml or pass --actor`
  );
}

export function assertHubAction(ws: Workspace, action: HubAction): void {
  const conn = readHubConnection(ws);
  if (!conn) return;
  const allowed = conn.role === "maintainer" ? MAINTAINER_ACTIONS : CONSUMER_ACTIONS;
  if (!allowed.has(action)) {
    const hint = conn.role === "consumer" ? "maintainer role required" : "action not allowed for maintainer";
    throw new Error(`hub action "${action}" denied for role "${conn.role}" (${hint})`);
  }
}

export interface ResolveHubContextOptions {
  hubRef?: string;
  offline?: boolean;
  refresh?: boolean;
  action?: HubAction;
}

export function resolveHubContext(ws: Workspace, opts: ResolveHubContextOptions = {}): {
  hubRoot: string;
  connection: ResolvedHubConnection | null;
  actor: string;
} {
  if (opts.action) assertHubAction(ws, opts.action);
  const connection = readHubConnection(ws);
  const hubRef = opts.hubRef ?? connection?.source;
  if (!hubRef) throw new Error("hub not configured — set config.yaml hub.source or pass --hub");
  const hubRoot = resolveHubSource(ws.root, hubRef, {
    updateRemote: true,
    offline: opts.offline,
    refresh: opts.refresh,
    branch: connection?.branch
  });
  const actor = resolveHubActor(ws, undefined, { allowMissing: !opts.action || opts.action === "hub.search" });
  return { hubRoot, connection, actor };
}
