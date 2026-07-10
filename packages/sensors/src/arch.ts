import fs from "node:fs";
import path from "node:path";
import { listDeltaFiles } from "@harnessx/core/artifactStore.js";
import { readDesignOverview, extractApiPaths } from "@harnessx/core/designLayout.js";
import { readArchRegistry, resolveModuleByCapability, resolveModulesForChange, isStageApproved } from "@harnessx/core";
import { readMeta } from "@harnessx/core/metaStore.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";
import { hasPlaceholderContent } from "./placeholder.js";

function block(findings: Finding[], ctx: SensorContext, summary: string): SensorReport {
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length ? "Fix each finding, then re-run hx arch check." : undefined
  };
}

const HLD_SECTIONS = [
  /##\s*(系统边界|System Boundary)/i,
  /##\s*(架构方案|Architecture)/i,
  /##\s*(模块职责|Module Responsibilities)/i,
  /##\s*(数据流|Data Flow)/i,
  /##\s*(非功能|Non-Functional)/i,
  /##\s*ADR/i,
  /##\s*(风险|Risks)/i
];

const LLD_SECTIONS = [
  /##\s*(组件|Components)/i,
  /##\s*(接口契约|Interface Contracts)/i,
  /##\s*(数据模型|Data Model)/i,
  /##\s*(核心流程|Core Flow)/i,
  /##\s*(异常|Error Handling)/i,
  /##\s*(安全|Security)/i
];

/** arch-hld-complete: global overview.md sections */
export const archHldComplete = (ctx: SensorContext): SensorReport => {
  const findings: Finding[] = [];
  const overview = ctx.ws.archOverviewFile();
  if (!fs.existsSync(overview)) {
    findings.push({ severity: "block", message: "docs/architecture/overview.md missing — run hx arch init" });
    return block(findings, ctx, "global HLD missing");
  }
  const text = fs.readFileSync(overview, "utf8");
  for (const pat of HLD_SECTIONS) {
    if (!pat.test(text)) findings.push({ severity: "block", message: `overview missing section matching ${pat}` });
  }
  if (!/\|\s*\w+/.test(text.split("模块职责")[1]?.split("##")[0] ?? text)) {
    findings.push({ severity: "warn", message: "module table appears empty in overview" });
  }
  if (!/Decision:/i.test(text)) findings.push({ severity: "warn", message: "ADR Decision field not filled" });
  if (hasPlaceholderContent(text)) findings.push({ severity: "block", message: "overview still contains template placeholders" });
  return block(findings, ctx, findings.length ? `${findings.length} HLD issue(s)` : "global HLD complete");
};

/** arch-approved: human sign-off for global architecture */
export const archApproved = (ctx: SensorContext): SensorReport => {
  if (!isStageApproved(ctx.ws, "arch")) {
    return block(
      [{ severity: "block", message: "global architecture not approved — run: hx gate approve --gate arch --approver <name>" }],
      ctx,
      "arch not approved"
    );
  }
  return block([], ctx, "global architecture approved");
};

/** arch-registry-complete: registry.yaml valid; active modules have LLD paths */
export const archRegistryComplete = (ctx: SensorContext): SensorReport => {
  const findings: Finding[] = [];
  const registry = readArchRegistry(ctx.ws);
  if (!fs.existsSync(ctx.ws.archRegistryFile())) {
    findings.push({ severity: "block", message: "registry.yaml missing — run hx arch init" });
    return block(findings, ctx, "registry missing");
  }
  const capOwners = new Map<string, string>();
  for (const m of registry.modules) {
    if (!m.lld) findings.push({ severity: "block", message: `module ${m.id} missing lld path` });
    else if (m.status === "active" && !fs.existsSync(path.join(ctx.ws.archDir(), m.lld))) {
      findings.push({ severity: "block", message: `module ${m.id} LLD file missing at ${m.lld}` });
    }
    for (const cap of m.capabilities) {
      if (capOwners.has(cap) && capOwners.get(cap) !== m.id) {
        findings.push({
          severity: "warn",
          message: `capability "${cap}" claimed by both ${capOwners.get(cap)} and ${m.id}`
        });
      }
      capOwners.set(cap, m.id);
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} registry issue(s)` : "registry complete");
};

/** arch-lld-complete: module lld.md sections and interface table */
export const archLldComplete = (ctx: SensorContext): SensorReport => {
  const moduleId = ctx.archModule;
  if (!moduleId) {
    return block([{ severity: "block", message: "archModule required for arch-lld-complete" }], ctx, "no module");
  }
  const findings: Finding[] = [];
  const lld = ctx.ws.archModuleLld(moduleId);
  if (!fs.existsSync(lld)) {
    findings.push({ severity: "block", message: `module LLD missing — run: hx arch lld init ${moduleId}` });
    return block(findings, ctx, "LLD missing");
  }
  const text = fs.readFileSync(lld, "utf8");
  for (const pat of LLD_SECTIONS) {
    if (!pat.test(text)) findings.push({ severity: "block", message: `LLD missing section matching ${pat}` });
  }
  if (!/\bIF-\d+/i.test(text)) findings.push({ severity: "block", message: "no interface contract IDs (IF-xxx)" });
  if (hasPlaceholderContent(text)) findings.push({ severity: "block", message: "LLD still contains template placeholders" });
  return block(findings, ctx, findings.length ? `${findings.length} LLD issue(s)` : "module LLD complete");
};

/** arch-module-boundary: warn on capability overlap (registry scan) */
export const archModuleBoundary = (ctx: SensorContext): SensorReport => {
  return archRegistryComplete(ctx);
};

/** arch-change-align: change domains map to module LLD; API paths aligned */
export const archChangeAlign = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const findings: Finding[] = [];
  const modules = resolveModulesForChange(ctx.ws, ctx.change);
  const meta = ctx.ws.readMetaRaw(ctx.change);
  for (const cap of meta.touchedDomains) {
    const registry = readArchRegistry(ctx.ws);
    const mod = resolveModuleByCapability(registry, cap);
    if (!mod) {
      findings.push({ severity: "block", message: `domain "${cap}" has no module in registry.yaml` });
      continue;
    }
    const lldPath = path.join(ctx.ws.archDir(), mod.lld);
    if (!fs.existsSync(lldPath)) {
      findings.push({ severity: "block", message: `module LLD missing for domain "${cap}" (${mod.id})` });
    }
  }
  if (modules.length === 0 && meta.touchedDomains.length > 0) {
    findings.push({ severity: "warn", message: "no arch modules resolved — check registry capabilities mapping" });
  }
  const designText = readDesignOverview(ctx.ws, ctx.change);
  const designApis = extractApiPaths(designText);
  if (designApis.length > 0) {
    let specBlob = "";
    for (const { file } of listDeltaFiles(ctx.ws, ctx.change)) specBlob += fs.readFileSync(file, "utf8") + "\n";
    for (const p of designApis) {
      const fragment = p.split("/").pop() ?? p;
      if (!specBlob.includes(p) && !specBlob.includes(fragment)) {
        findings.push({ severity: "warn", message: `API ${p} in change design not in delta specs` });
      }
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} arch alignment issue(s)` : "arch aligned");
};

/** arch-drift: change design vs module LLD; unpromoted design after verify */
export const archDrift = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const findings: Finding[] = [];
  const meta = readMeta(ctx.ws, ctx.change);
  const designText = readDesignOverview(ctx.ws, ctx.change);
  const designApis = extractApiPaths(designText);
  const modules = resolveModulesForChange(ctx.ws, ctx.change);

  if (designText.trim() && !meta.archPromoted) {
    findings.push({
      severity: "warn",
      message: `change design not promoted to module LLD — run: hx arch promote ${ctx.change}`
    });
  }

  for (const mod of modules) {
    const lldPath = ctx.ws.archModuleLld(mod.id);
    if (!fs.existsSync(lldPath)) continue;
    const lldText = fs.readFileSync(lldPath, "utf8");
    for (const api of designApis) {
      const fragment = api.split("/").pop() ?? api;
      if (!lldText.includes(api) && !lldText.includes(fragment)) {
        findings.push({ severity: "warn", message: `API ${api} in change design not reflected in module ${mod.id} LLD` });
      }
    }
    if (meta.archPromoted && !lldText.includes(`## Promoted from change \`${ctx.change}\``)) {
      findings.push({ severity: "block", message: `archPromoted recorded but module ${mod.id} LLD missing promotion marker` });
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} arch drift issue(s)` : "no arch drift");
};
