/**
 * T-604 (FR-033/NFR-003): capability declaration model for tool adapters.
 * Each target declares which harness surfaces it supports natively; the tier
 * is computed from the declaration instead of being hardcoded per vendor.
 */

export interface AdapterCapabilities {
  commands: boolean;
  skills: boolean;
  rules: boolean;
  hooks: boolean;
  agents: boolean;
  mcp: boolean;
  permissions: boolean;
}

export type Tier = 0 | 1 | 2;

export function computeTier(c: AdapterCapabilities): Tier {
  const count = Object.values(c).filter(Boolean).length;
  if (c.commands && c.rules && (c.hooks || c.agents) && count >= 4) return 1;
  if (c.rules || c.commands) return 2;
  return 0;
}

export interface TargetSpec {
  name: string;
  capabilities: AdapterCapabilities;
}

export const TARGETS: Record<string, TargetSpec> = {
  cursor: {
    name: "Cursor",
    capabilities: { commands: true, skills: true, rules: true, hooks: true, agents: false, mcp: true, permissions: true }
  },
  trae: {
    name: "Trae",
    capabilities: { commands: true, skills: false, rules: true, hooks: false, agents: true, mcp: true, permissions: false }
  },
  qoder: {
    name: "Qoder",
    capabilities: { commands: true, skills: true, rules: true, hooks: false, agents: true, mcp: true, permissions: false }
  },
  claude: {
    name: "Claude Code",
    capabilities: { commands: true, skills: true, rules: true, hooks: true, agents: true, mcp: true, permissions: true }
  },
  generic: {
    name: "Generic (AGENTS.md)",
    capabilities: { commands: false, skills: false, rules: true, hooks: false, agents: false, mcp: false, permissions: false }
  }
};
