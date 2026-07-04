import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  createChange,
  scaffoldProposal,
  traceCheck,
  verifyChange,
  approveFixture,
  verifyFixtures,
  generateTestStubs,
  approveTests,
  checkApprovedTests,
  syncCheck,
  writeMainSpec,
  renderDashboard,
  collectStatus,
  addWaiver,
  readMeta,
  setStatus,
  expiredWaivers,
  activeWaivers,
  generateTasks,
  type RunnerOptions,
  type WaiverRecord
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m3-"));
const opts = (): RunnerOptions => ({ builtins: builtinSensors });

const GOOD_DELTA = `## ADDED Requirements

### Requirement: Session expiry
WHEN a session is idle for 30 minutes, THE SYSTEM SHALL invalidate the session token.

#### Scenario: idle timeout
- THEN 401

#### Scenario: refresh resets timer
- THEN session stays valid
`;

function setup() {
  const ws = initWorkspace(tmp()).ws;
  createChange(ws, "c1", ["auth"]);
  scaffoldProposal(ws, "c1", "Session expiry");
  fs.writeFileSync(path.join(ws.deltaSpecsDir("c1"), "auth", "spec.md"), GOOD_DELTA);
  return ws;
}

function writeTest(ws: Workspace, name: string, scenarios: string[]) {
  const dir = path.join(ws.root, "tests");
  fs.mkdirSync(dir, { recursive: true });
  const body = scenarios.map((s) => `it("Scenario: ${s}", () => {});`).join("\n");
  fs.writeFileSync(path.join(dir, name), `import { it } from "vitest";\n${body}\n`);
}

const waiver = (target: string, expiresAt?: string): WaiverRecord => ({
  id: "w1",
  target,
  reason: "test",
  requestedBy: "bob",
  approvedBy: "alice",
  createdAt: new Date().toISOString(),
  expiresAt: expiresAt ?? new Date(Date.now() + 86400e3).toISOString()
});

describe("T-300 traceability", () => {
  it("maps scenarios to tests via 'Scenario:' references; waivers count", () => {
    const ws = setup();
    writeTest(ws, "auth.test.ts", ["idle timeout"]);
    let res = traceCheck(ws, "c1");
    expect(res.covered).toBe(1);
    expect(res.uncovered.map((u) => u.scenario)).toEqual(["refresh resets timer"]);
    expect(res.passed).toBe(false);

    addWaiver(ws, "c1", waiver("scenario:refresh resets timer"));
    res = traceCheck(ws, "c1");
    expect(res.waived).toBe(1);
    expect(res.passed).toBe(true);
    expect(fs.existsSync(ws.traceFile("c1"))).toBe(true);
  });
});

describe("T-301 verify", () => {
  it("blocks on uncovered scenarios, verifies when all covered", async () => {
    const ws = setup();
    setStatus(ws, "c1", "implementing");
    const blocked = await verifyChange(ws, "c1", opts());
    expect(blocked.verified).toBe(false);
    expect(blocked.gate.blockers.join()).toMatch(/uncovered scenario/);
    expect(readMeta(ws, "c1").status).toBe("implementing");

    writeTest(ws, "auth.test.ts", ["idle timeout", "refresh resets timer"]);
    const ok = await verifyChange(ws, "c1", opts());
    expect(ok.verified).toBe(true);
    expect(readMeta(ws, "c1").status).toBe("verified");
  });
});

describe("T-302 approved fixtures", () => {
  it("detects tampering and deletion of approved fixtures", () => {
    const ws = setup();
    const fx = path.join(ws.root, "tests/fixtures/expected.json");
    fs.mkdirSync(path.dirname(fx), { recursive: true });
    fs.writeFileSync(fx, `{"total": 42}`);
    approveFixture(ws, fx, "alice");
    expect(verifyFixtures(ws)).toHaveLength(0);

    fs.writeFileSync(fx, `{"total": 43}`);
    let violations = verifyFixtures(ws);
    expect(violations).toEqual([{ file: "tests/fixtures/expected.json", problem: "modified" }]);

    // re-approval clears it; deletion is flagged
    approveFixture(ws, fx, "alice");
    fs.rmSync(fx);
    violations = verifyFixtures(ws);
    expect(violations[0].problem).toBe("deleted");

    // fixture-hash builtin sensor reports block findings
    const report = builtinSensors["fixture-hash"]({ ws, change: "c1", def: { id: "fixture-guard" } as never });
    expect((report as { status: string }).status).toBe("fail");
  });
});

describe("T-303 test-first", () => {
  it("generates failing stubs from scenarios; approved assertions are hash-locked", () => {
    const ws = setup();
    const files = generateTestStubs(ws, "c1");
    expect(files).toHaveLength(1);
    const content = fs.readFileSync(path.join(ws.root, files[0]), "utf8");
    expect(content).toContain('it("Scenario: idle timeout"');
    expect(content).toContain("not implemented");

    approveTests(ws, "c1", files, "alice");
    expect(checkApprovedTests(ws, "c1")).toHaveLength(0);

    // agent modifies approved assertions → violation
    fs.appendFileSync(path.join(ws.root, files[0]), "// sneaky edit\n");
    let violations = checkApprovedTests(ws, "c1");
    expect(violations).toHaveLength(1);
    expect(violations[0].problem).toBe("modified");

    // waiver exempts
    addWaiver(ws, "c1", waiver(`tests:${files[0]}`));
    violations = checkApprovedTests(ws, "c1");
    expect(violations).toHaveLength(0);
  });
});

describe("T-304 sync drift detection", () => {
  it("reports scenarios without tests and tests without scenarios", () => {
    const ws = setup();
    writeMainSpec(ws, {
      capability: "auth",
      preamble: "# auth Specification",
      requirements: [
        { name: "Login", text: "THE SYSTEM SHALL allow login.", scenarios: [{ name: "valid credentials", body: "- THEN ok" }] }
      ]
    });
    writeTest(ws, "auth.test.ts", ["ghost behaviour"]);
    const findings = syncCheck(ws);
    const kinds = findings.map((f) => f.kind).sort();
    expect(kinds).toEqual(["scenario-without-test", "test-without-scenario"]);
    expect(findings.find((f) => f.kind === "scenario-without-test")!.scenario).toBe("valid credentials");
    expect(findings.find((f) => f.kind === "test-without-scenario")!.suggestion).toMatch(/Backfill the spec/);
  });
});

describe("T-305 dashboard", () => {
  it("renders change status, tasks and traceability into HTML", () => {
    const ws = setup();
    generateTasks(ws, "c1");
    traceCheck(ws, "c1");
    const rows = collectStatus(ws);
    expect(rows[0].tasksTotal).toBe(2);
    expect(rows[0].scenarios.total).toBe(2);
    const html = renderDashboard(ws);
    expect(html).toContain("c1");
    expect(html).toContain("HarnessX — Change Dashboard");
    expect(html).toContain("tbody");
  });
});

describe("T-306 waivers", () => {
  it("expired waivers stop counting and are listed for janitor", () => {
    const ws = setup();
    addWaiver(ws, "c1", waiver("scenario:idle timeout", new Date(Date.now() - 1000).toISOString()));
    const meta = readMeta(ws, "c1");
    expect(activeWaivers(meta)).toHaveLength(0);
    expect(expiredWaivers(meta)).toHaveLength(1);
    // expired waiver does not cover the scenario
    const res = traceCheck(ws, "c1");
    expect(res.uncovered.map((u) => u.scenario)).toContain("idle timeout");
  });
});

describe("T-307 M3 acceptance", () => {
  it("uncovered blocks verify; fixture tamper detected; waiver flow unblocks", async () => {
    const ws = setup();
    setStatus(ws, "c1", "implementing");

    // 1. uncovered scenarios block verify
    let res = await verifyChange(ws, "c1", opts());
    expect(res.verified).toBe(false);

    // 2. one test + one waiver → verify passes
    writeTest(ws, "auth.test.ts", ["idle timeout"]);
    addWaiver(ws, "c1", waiver("scenario:refresh resets timer"));
    res = await verifyChange(ws, "c1", opts());
    expect(res.verified).toBe(true);

    // 3. fixture tampering is detected by the sensor CI would run
    const fx = path.join(ws.root, "tests/fixtures/golden.txt");
    fs.mkdirSync(path.dirname(fx), { recursive: true });
    fs.writeFileSync(fx, "golden");
    approveFixture(ws, fx, "alice");
    fs.writeFileSync(fx, "tampered");
    expect(verifyFixtures(ws)).toHaveLength(1);
  });
});
