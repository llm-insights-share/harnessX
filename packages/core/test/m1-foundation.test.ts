import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  createChange,
  scaffoldProposal,
  scaffoldExplore,
  parseDelta,
  parseSpec,
  serializeSpec,
  mergeDelta,
  mergeChangeIntoSpecs,
  readMainSpec,
  archiveChange,
  setStatus,
  importOpenspec,
  readMeta
} from "@harnessx/core";
import { specValidate, checkEars } from "@harnessx/sensors";
import type { SensorDef } from "@harnessx/core/schemas.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m1-"));

const sensorDef: SensorDef = {
  id: "spec-validate",
  kind: "sensor.script",
  execution: "computational",
  trigger: "phase",
  on_fail: "block",
  max_retries: 0,
  timeout_ms: 120000
};

function writeDelta(ws: Workspace, change: string, capability: string, md: string) {
  const f = path.join(ws.deltaSpecsDir(change), capability, "spec.md");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, md);
}

const GOOD_DELTA = `# Delta for auth

## ADDED Requirements

### Requirement: Session expiry
WHEN a session is idle for 30 minutes, THE SYSTEM SHALL invalidate the session token.

#### Scenario: idle timeout
- GIVEN a logged-in user
- WHEN 30 minutes pass without a request
- THEN the next request returns 401
`;

describe("T-100 hx init", () => {
  it("creates the full harnessX skeleton with constitution and registry", () => {
    const root = tmp();
    const res = initWorkspace(root);
    expect(fs.existsSync(res.ws.constitutionFile)).toBe(true);
    expect(fs.existsSync(res.ws.harnessFile)).toBe(true);
    expect(fs.existsSync(res.ws.configFile)).toBe(true);
    expect(fs.existsSync(path.join(res.ws.assetsDir, "guides/proposal-template/template.md"))).toBe(true);
    expect(fs.existsSync(path.join(res.ws.assetsDir, "guides/design-template/template.md"))).toBe(true);
    const harness = res.ws.readHarness();
    expect(harness.guides.map((g) => g.id)).toContain("design-template");
    expect(Object.keys(harness.profiles)).toEqual(expect.arrayContaining(["lite", "standard", "strict"]));
    expect(res.nextSteps.length).toBeGreaterThan(2);
    expect(() => initWorkspace(root)).toThrow(/already initialized/);
  });

  it("--bundle api-service merges sensors, guides and suites", () => {
    const root = tmp();
    const res = initWorkspace(root, { bundle: "api-service" });
    const harness = res.ws.readHarness();
    expect(harness.sensors.map((s) => s.id)).toContain("arch-boundary");
    expect(harness.guides.map((g) => g.id)).toContain("api-design");
    expect(harness.suites["verification"]).toContain("arch-boundary");
    expect(fs.existsSync(path.join(res.ws.bundlesDir, "api-service"))).toBe(true);
  });

  it("--locale hx-cn seeds Chinese scaffold with design-template", () => {
    const root = tmp();
    const res = initWorkspace(root, { locale: "hx-cn", bundle: "api-service-cn" });
    expect(res.ws.readConfig().locale).toBe("zh-CN");
    const constitution = fs.readFileSync(res.ws.constitutionFile, "utf8");
    expect(constitution).toContain("项目宪法");
    const harness = res.ws.readHarness();
    expect(harness.guides.map((g) => g.id)).toContain("design-template");
    const proposeCmd = fs.readFileSync(path.join(res.ws.assetsDir, "commands/propose.md"), "utf8");
    expect(proposeCmd).toContain("起草提案");
    expect(res.nextSteps[0]).toContain("constitution.md");
    expect(fs.existsSync(path.join(res.ws.bundlesDir, "api-service-cn/skills/api-design.md"))).toBe(true);
  });

  it("hx-cn enterprise guides and templates are localized", () => {
    const root = tmp();
    const res = initWorkspace(root, { locale: "hx-cn", bundle: "api-service-cn" });
    const assets = res.ws.assetsDir;
    const prdSkill = fs.readFileSync(path.join(assets, "guides/prd-writing/SKILL.md"), "utf8");
    expect(prdSkill).toContain("PRD 蒸馏");
    expect(prdSkill).not.toContain("Do not invent");
    const feLayout = fs.readFileSync(path.join(assets, "guides/fe-layout/SKILL.md"), "utf8");
    expect(feLayout).toContain("壳组件");
    const tokensSkill = fs.readFileSync(path.join(assets, "guides/design-tokens/SKILL.md"), "utf8");
    expect(tokensSkill).toContain("设计令牌");
    const proposalTpl = fs.readFileSync(path.join(assets, "guides/proposal-template/template.md"), "utf8");
    expect(proposalTpl).toContain("## PRD Reference");
    const designTpl = fs.readFileSync(path.join(assets, "guides/design-template/template.md"), "utf8");
    expect(designTpl).toContain("## UI Layout");
    expect(designTpl).toContain("## Design Tokens");
    createChange(res.ws, "points", ["points"]);
    scaffoldProposal(res.ws, "points", "会员积分");
    const prdSummary = fs.readFileSync(path.join(res.ws.requirementsDir("points"), "prd-summary.md"), "utf8");
    expect(prdSummary).toContain("PRD 摘要");
    const userStories = fs.readFileSync(path.join(res.ws.requirementsDir("points"), "user-stories.md"), "utf8");
    expect(userStories).toContain("## 用户故事");
  });
});

describe("T-101 artifact store: delta parse + merge", () => {
  it("parses ADDED/MODIFIED/REMOVED sections", () => {
    const delta = parseDelta("auth", `## ADDED Requirements\n\n### Requirement: A\nTHE SYSTEM SHALL do A.\n\n#### Scenario: s1\n- THEN a\n\n## REMOVED Requirements\n\n### Requirement: B\n`);
    expect(delta.sections).toHaveLength(2);
    expect(delta.sections[0].op).toBe("ADDED");
    expect(delta.sections[0].requirements[0].scenarios).toHaveLength(1);
    expect(delta.sections[1].op).toBe("REMOVED");
  });

  it("merge: golden roundtrip ADD + MODIFY + REMOVE", () => {
    const base = parseSpec("auth", `# auth Specification\n\n## Requirements\n\n### Requirement: Login\nTHE SYSTEM SHALL allow login.\n\n#### Scenario: ok\n- THEN logged in\n\n### Requirement: Legacy\nTHE SYSTEM SHALL support legacy tokens.\n\n#### Scenario: legacy\n- THEN ok\n`);
    const delta = parseDelta("auth", `## MODIFIED Requirements\n\n### Requirement: Login\nTHE SYSTEM SHALL allow login with MFA.\n\n#### Scenario: mfa\n- THEN mfa prompted\n\n## REMOVED Requirements\n\n### Requirement: Legacy\n\n## ADDED Requirements\n\n### Requirement: Logout\nTHE SYSTEM SHALL allow logout.\n\n#### Scenario: out\n- THEN logged out\n`);
    const { merged, conflicts } = mergeDelta(base, delta);
    expect(conflicts).toHaveLength(0);
    const names = merged.requirements.map((r) => r.name);
    expect(names).toEqual(["Login", "Logout"]);
    expect(merged.requirements[0].text).toContain("MFA");
    const out = serializeSpec(merged);
    expect(out).toContain("### Requirement: Logout");
    expect(out).not.toContain("Legacy");
    // golden: reparse equals merge output
    expect(parseSpec("auth", out).requirements.map((r) => r.name)).toEqual(names);
  });

  it("merge conflicts reported for MODIFIED-missing and ADDED-duplicate", () => {
    const base = parseSpec("auth", `## Requirements\n\n### Requirement: A\nTHE SYSTEM SHALL a.\n\n#### Scenario: s\n- THEN a\n`);
    const bad = parseDelta("auth", `## MODIFIED Requirements\n\n### Requirement: Ghost\nTHE SYSTEM SHALL x.\n\n#### Scenario: s\n- x\n\n## ADDED Requirements\n\n### Requirement: A\nTHE SYSTEM SHALL a2.\n\n#### Scenario: s\n- x\n`);
    const { conflicts } = mergeDelta(base, bad);
    expect(conflicts.map((c) => c.op).sort()).toEqual(["ADDED", "MODIFIED"]);
  });
});

describe("T-102 change create", () => {
  let ws: Workspace;
  beforeEach(() => {
    ws = initWorkspace(tmp()).ws;
  });

  it("creates workspace dirs and meta.yaml; requires domains", () => {
    const res = createChange(ws, "add-auth", ["auth"]);
    expect(res.meta.status).toBe("proposed");
    expect(fs.existsSync(ws.metaFile("add-auth"))).toBe(true);
    expect(fs.existsSync(path.join(ws.changeDir("add-auth"), "specs"))).toBe(true);
    expect(() => createChange(ws, "no-domains", [])).toThrow(/domains/);
    expect(() => createChange(ws, "Bad_Name", ["x"])).toThrow(/kebab-case/);
  });

  it("warns on domain overlap with active changes (FR-011)", () => {
    createChange(ws, "change-a", ["auth", "billing"]);
    const res = createChange(ws, "change-b", ["billing"]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0].otherChange).toBe("change-a");
    expect(res.warnings[0].domains).toEqual(["billing"]);
  });
});

describe("T-103/T-104 propose + explore scaffolds", () => {
  it("propose fills template title and creates delta draft", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "add-auth", ["auth"]);
    const res = scaffoldProposal(ws, "add-auth", "Add session expiry");
    const proposal = fs.readFileSync(res.proposalFile, "utf8");
    expect(proposal).toContain("# Proposal: Add session expiry");
    expect(proposal).toContain("## What Changes");
    expect(fs.readFileSync(res.deltaFile, "utf8")).toContain("## ADDED Requirements");
  });

  it("explore writes read-only notes", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "probe", ["core"]);
    const f = scaffoldExplore(ws, "probe", "cache strategy");
    expect(fs.readFileSync(f, "utf8")).toContain("Read-only phase");
  });
});

describe("T-105 spec-validate sensor (EARS)", () => {
  it("checkEars accepts the five patterns and rejects vagueness", () => {
    expect(checkEars("THE SYSTEM SHALL log every request.")).toEqual([]);
    expect(checkEars("WHEN a user logs in, THE SYSTEM SHALL create a session.")).toEqual([]);
    expect(checkEars("WHILE in maintenance mode, THE SYSTEM SHALL reject writes.")).toEqual([]);
    expect(checkEars("WHERE MFA is enabled, THE SYSTEM SHALL require a second factor.")).toEqual([]);
    expect(checkEars("IF the token is expired, THEN THE SYSTEM SHALL return 401.")).toEqual([]);
    expect(checkEars("The system responds quickly.").join(" ")).toMatch(/SHALL/);
    expect(checkEars("THE SYSTEM SHALL respond quickly.").join(" ")).toMatch(/unmeasurable/);
    expect(checkEars("IF the token is expired the system SHALL return 401.").join(" ")).toMatch(/THEN/);
  });

  it("fails on missing scenario and passes a good delta, with LLM-optimized report", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    writeDelta(ws, "c1", "auth", `## ADDED Requirements\n\n### Requirement: No scenario here\nTHE SYSTEM SHALL do something concrete.\n`);
    const bad = specValidate({ ws, change: "c1", def: sensorDef });
    expect(bad.status).toBe("fail");
    expect(bad.findings.some((f) => f.rule === "scenario-required")).toBe(true);
    expect(bad.agent_instruction).toBeTruthy();
    expect(bad.fix_command).toContain("hx fix");

    writeDelta(ws, "c1", "auth", GOOD_DELTA);
    const good = specValidate({ ws, change: "c1", def: sensorDef });
    expect(good.status).toBe("pass");
  });
});

describe("T-106 archive", () => {
  it("blocks when not verified, merges + moves + writes retro when verified", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "add-auth", ["auth"]);
    writeDelta(ws, "add-auth", "auth", GOOD_DELTA);

    const blocked = archiveChange(ws, "add-auth");
    expect(blocked.ok).toBe(false);
    expect(blocked.problems[0]).toMatch(/verified/);

    setStatus(ws, "add-auth", "verified");
    const res = archiveChange(ws, "add-auth");
    expect(res.ok).toBe(true);
    expect(readMainSpec(ws, "auth").requirements.map((r) => r.name)).toContain("Session expiry");
    expect(fs.existsSync(path.join(res.archivedTo!, "retro.md"))).toBe(true);
    expect(fs.existsSync(ws.changeDir("add-auth"))).toBe(false);
  });
});

describe("T-107 openspec import", () => {
  it("maps openspec/ specs and changes into harnessX/", () => {
    const root = tmp();
    const os_ = path.join(root, "openspec");
    fs.mkdirSync(path.join(os_, "specs/payments"), { recursive: true });
    fs.writeFileSync(path.join(os_, "specs/payments/spec.md"), "# payments Specification\n\n## Requirements\n\n### Requirement: Charge\nTHE SYSTEM SHALL charge cards.\n\n#### Scenario: ok\n- THEN charged\n");
    fs.mkdirSync(path.join(os_, "changes/add-refunds/specs/payments"), { recursive: true });
    fs.writeFileSync(path.join(os_, "changes/add-refunds/specs/payments/spec.md"), GOOD_DELTA);
    fs.writeFileSync(path.join(os_, "project.md"), "# Project conventions\n");

    const ws = new Workspace(root);
    const res = importOpenspec(root, os_, ws);
    expect(res.specs).toEqual(["payments"]);
    expect(res.changes).toEqual(["add-refunds"]);
    expect(readMeta(ws, "add-refunds").touchedDomains).toEqual(["payments"]);
    expect(fs.readFileSync(ws.constitutionFile, "utf8")).toContain("Project conventions");
  });
});

describe("T-108 M1 acceptance: propose→archive E2E", () => {
  it("full happy path; spec-validate intercepts a bad delta first", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "session-expiry", ["auth"]);
    scaffoldProposal(ws, "session-expiry", "Session expiry");

    // scaffolded placeholder delta must be rejected by spec-validate
    const rejected = specValidate({ ws, change: "session-expiry", def: sensorDef });
    expect(rejected.status).toBe("fail");

    // author a real delta, validate, verify, archive
    writeDelta(ws, "session-expiry", "auth", GOOD_DELTA);
    expect(specValidate({ ws, change: "session-expiry", def: sensorDef }).status).toBe("pass");
    setStatus(ws, "session-expiry", "verified");
    const res = archiveChange(ws, "session-expiry");
    expect(res.ok).toBe(true);
    expect(readMainSpec(ws, "auth").requirements[0].name).toBe("Session expiry");
    // archived change merges cleanly into a second change's base
    const spec = readMainSpec(ws, "auth");
    expect(serializeSpec(spec)).toContain("#### Scenario: idle timeout");
  });
});
