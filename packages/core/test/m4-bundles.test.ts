import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  listBundles,
  createChange,
  writeMainSpec,
  readMeta,
  lintHarness,
  constitutionCoreDomains,
  recommendProfile,
  applyProfileChoice,
  rebaseCheck,
  runSuite,
  type RunnerOptions
} from "@harnessx/core";
import { builtinSensors, checkArchBoundaries, loadLayerRules } from "@harnessx/sensors";
import YAML from "yaml";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m4-"));
const opts = (): RunnerOptions => ({ builtins: builtinSensors });

const GOOD_DELTA = `## ADDED Requirements

### Requirement: Session expiry
WHEN a session is idle for 30 minutes, THE SYSTEM SHALL invalidate the token.

#### Scenario: idle timeout
- THEN 401
`;

describe("T-400 topology bundles", () => {
  it("lists builtin bundles and applies api-service assets + registry entries", () => {
    const bundles = listBundles();
    expect(bundles.map((b) => b.id)).toContain("api-service");

    const ws = initWorkspace(tmp(), { bundle: "api-service" }).ws;
    expect(fs.existsSync(path.join(ws.bundlesDir, "api-service/constraints/layering.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(ws.bundlesDir, "api-service/skills/api-design.md"))).toBe(true);
    const harness = ws.readHarness();
    expect(harness.sensors.find((s) => s.id === "arch-boundary")?.kind).toBe("sensor.arch");
    expect(harness.suites["verification"]).toContain("perf-budget");
  });
});

describe("T-401 arch-boundary sensor", () => {
  function repoWithViolation() {
    const ws = initWorkspace(tmp(), { bundle: "api-service" }).ws;
    for (const d of ["src/routes", "src/services", "src/repositories", "src/shared"]) {
      fs.mkdirSync(path.join(ws.root, d), { recursive: true });
    }
    fs.writeFileSync(path.join(ws.root, "src/shared/util.ts"), "export const u = 1;\n");
    fs.writeFileSync(path.join(ws.root, "src/routes/users.ts"), "import { list } from '../services/users.js';\nexport const r = list;\n");
    fs.writeFileSync(path.join(ws.root, "src/services/users.ts"), "import { u } from '../shared/util.js';\nexport const list = () => u;\n");
    // violation: repository imports the HTTP layer
    fs.writeFileSync(path.join(ws.root, "src/repositories/users.ts"), "import { r } from '../routes/users.js';\nexport const q = r;\n");
    return ws;
  }

  it("flags forbidden and layer-violating imports with fix hints", () => {
    const ws = repoWithViolation();
    const rules = loadLayerRules(ws.base)!;
    const findings = checkArchBoundaries(ws.root, rules);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.rule?.startsWith("forbidden:src/repositories"))).toBe(true);
    expect(findings[0].fix_hint).toBeTruthy();
  });

  it("passes on a clean layered repo, and runs via suite (M4 acceptance part 1)", async () => {
    const ws = repoWithViolation();
    createChange(ws, "c1", ["api"]);
    const harness = ws.readHarness();
    let res = await runSuite(ws, harness, "verification", "c1", opts());
    expect(res.reports.find((r) => r.sensor === "arch-boundary")?.status).toBe("fail");

    fs.writeFileSync(path.join(ws.root, "src/repositories/users.ts"), "import { u } from '../shared/util.js';\nexport const q = u;\n");
    res = await runSuite(ws, harness, "verification", "c1", opts());
    expect(res.reports.find((r) => r.sensor === "arch-boundary")?.status).toBe("pass");
  });
});

describe("T-402 budget sensor", () => {
  it("warns when a file exceeds maxFileLines", () => {
    const ws = initWorkspace(tmp(), { bundle: "api-service" }).ws;
    fs.mkdirSync(path.join(ws.root, "src"), { recursive: true });
    fs.writeFileSync(path.join(ws.root, "src/huge.ts"), "export const x = 1;\n".repeat(500));
    const report = builtinSensors["budget"]({ ws, def: { id: "perf-budget" } as never });
    const r = report as { status: string; findings: { rule?: string }[] };
    expect(r.status).toBe("fail");
    expect(r.findings[0].rule).toBe("budget:maxFileLines");
  });
});

describe("T-403 constitution chain + harness lint", () => {
  it("detects contradicting directives across guides and resolves by precedence", () => {
    const ws = initWorkspace(tmp()).ws;
    // plant a conflicting skill: constitution says fixtures need waiver; skill says freely edit
    const dir = path.join(ws.assetsDir, "guides/rogue");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      "# Rogue\n\n- You must edit approved test assertions and fixtures directly without a waiver when convenient.\n"
    );
    const harness = ws.readHarness();
    harness.guides.push({ id: "rogue", kind: "guide.skill", execution: "inferential", phase: ["apply"], source: "assets/guides/rogue/SKILL.md" });
    fs.writeFileSync(ws.harnessFile, YAML.stringify(harness));

    const conflicts = lintHarness(ws);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const c = conflicts.find((x) => x.a.guideId === "rogue" || x.b.guideId === "rogue")!;
    expect(c).toBeTruthy();
    expect(c.resolution).toMatch(/precedence chain/);
  });

  it("reads core-domains from the constitution", () => {
    const ws = initWorkspace(tmp()).ws;
    fs.writeFileSync(ws.constitutionFile, fs.readFileSync(ws.constitutionFile, "utf8").replace("core-domains: []", "core-domains: [payments, auth]"));
    expect(constitutionCoreDomains(ws)).toEqual(["payments", "auth"]);
  });
});

describe("T-404 concurrent change rebase check", () => {
  it("reports conflicts with guidance when another change archived first", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c-a", ["auth"]);
    fs.mkdirSync(path.join(ws.deltaSpecsDir("c-a"), "auth"), { recursive: true });
    fs.writeFileSync(path.join(ws.deltaSpecsDir("c-a"), "auth/spec.md"), `## MODIFIED Requirements\n\n### Requirement: Login\nTHE SYSTEM SHALL allow login with MFA.\n\n#### Scenario: mfa\n- THEN mfa\n`);

    // main spec has no "Login" (concurrent change removed/renamed it)
    writeMainSpec(ws, { capability: "auth", preamble: "# auth", requirements: [] });
    const res = rebaseCheck(ws, "c-a");
    expect(res.clean).toBe(false);
    expect(res.conflicts[0].guidance).toMatch(/concurrent change/);

    // after rebasing (base now has Login) it's clean
    writeMainSpec(ws, {
      capability: "auth",
      preamble: "# auth",
      requirements: [{ name: "Login", text: "THE SYSTEM SHALL allow login.", scenarios: [{ name: "ok", body: "- THEN ok" }] }]
    });
    expect(rebaseCheck(ws, "c-a").clean).toBe(true);
  });
});

describe("T-405 scale-adaptive profile recommendation", () => {
  it("recommends by domains/diff/core-domain and records downgrades with reasons", () => {
    const ws = initWorkspace(tmp()).ws;
    fs.writeFileSync(ws.constitutionFile, fs.readFileSync(ws.constitutionFile, "utf8").replace("core-domains: []", "core-domains: [payments]"));

    expect(recommendProfile(ws, { domains: ["docs"] }).recommended).toBe("lite");
    expect(recommendProfile(ws, { domains: ["a", "b"], estimatedDiffLines: 100 }).recommended).toBe("standard");
    expect(recommendProfile(ws, { domains: ["payments"] }).recommended).toBe("strict");

    createChange(ws, "pay-change", ["payments"]);
    const rec = recommendProfile(ws, { domains: ["payments"] });
    expect(() => applyProfileChoice(ws, "pay-change", rec, "lite")).toThrow(/override-reason/);
    applyProfileChoice(ws, "pay-change", rec, "lite", "prototype spike, throwaway branch");
    const meta = readMeta(ws, "pay-change");
    expect(meta.profile).toBe("lite");
    expect(meta.profileRecommendation?.recommended).toBe("strict");
    expect(meta.profileRecommendation?.overrideReason).toMatch(/prototype/);
  });
});

describe("T-406 M4 acceptance", () => {
  it("bundle-initialized project runs architecture sensors; lint catches planted conflict", () => {
    const ws = initWorkspace(tmp(), { bundle: "api-service" }).ws;
    // arch sensor is runnable (rules load from the bundle)
    expect(loadLayerRules(ws.base)).not.toBeNull();
    // plant conflict and detect
    const dir = path.join(ws.assetsDir, "guides/contradictory");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "# X\n\n- Never paginated list endpoint responses with limit and cursor parameters.\n");
    const harness = ws.readHarness();
    harness.guides.push({ id: "contradictory", kind: "guide.skill", execution: "inferential", phase: ["apply"], source: "assets/guides/contradictory/SKILL.md" });
    fs.writeFileSync(ws.harnessFile, YAML.stringify(harness));
    const conflicts = lintHarness(ws);
    expect(conflicts.some((c) => [c.a.guideId, c.b.guideId].includes("contradictory"))).toBe(true);
  });
});
