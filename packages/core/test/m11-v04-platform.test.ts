import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  createChange,
  seedGoldenHub,
  searchHubCatalog,
  writeHubIndex,
  listHubBundles,
  aggregateCoverage,
  phaseFunnel,
  assetEffectiveness,
  renderDashboard
} from "@harnessx/core";
import { prototypeComplete, uatComplete, driftSensor, integrationSmoke } from "@harnessx/sensors";
import { builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m11-"));

describe("v0.4 platform upgrade", () => {
  it("prototype-complete blocks when UI in scope but pages.md missing", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "ui1", ["web"], "enterprise");
    fs.writeFileSync(path.join(ws.changeDir("ui1"), "proposal.md"), "## What Changes\n\nNew checkout UI pages\n");
    const def = { id: "prototype-complete", kind: "sensor.script" as const, execution: "computational" as const, trigger: "task" as const, on_fail: "block" as const, max_retries: 0, timeout_ms: 5000 };
    const report = prototypeComplete({ ws, change: "ui1", def });
    expect(report.status).toBe("fail");
  });

  it("uat-complete requires uat-checklist.md", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "r1", ["auth"], "enterprise");
    const def = { id: "uat-complete", kind: "sensor.script" as const, execution: "computational" as const, trigger: "task" as const, on_fail: "block" as const, max_retries: 0, timeout_ms: 5000 };
    expect(uatComplete({ ws, change: "r1", def }).status).toBe("fail");
    fs.writeFileSync(
      path.join(ws.changeDir("r1"), "uat-checklist.md"),
      "## Scenario Walkthrough\n\n| Scenario ID | Steps | Expected | Pass |\n|---|---|---|---|\n| s1 | x | y | [ ] |\n\n## Sign-off\n- [ ] Product owner approves\n"
    );
    expect(uatComplete({ ws, change: "r1", def }).status).toBe("pass");
  });

  it("drift sensor is registered and runs without crash", () => {
    const ws = initWorkspace(tmp()).ws;
    const def = { id: "drift", kind: "sensor.drift" as const, execution: "computational" as const, trigger: "task" as const, on_fail: "warn" as const, max_retries: 0, timeout_ms: 5000 };
    const report = driftSensor({ ws, def });
    expect(report.status).toBe("pass");
    expect(builtinSensors.drift).toBeDefined();
  });

  it("integration-smoke skips when no integration script", () => {
    const ws = initWorkspace(tmp()).ws;
    const def = { id: "integration-smoke", kind: "sensor.script" as const, execution: "computational" as const, trigger: "task" as const, on_fail: "warn" as const, max_retries: 0, timeout_ms: 5000 };
    const report = integrationSmoke({ ws, def });
    expect(report.status).toBe("pass");
    expect(report.summary).toMatch(/skipped/);
  });

  it("hub search indexes packages, bundles, and blueprints", () => {
    const hub = path.join(tmp(), "hub");
    seedGoldenHub(hub);
    const results = searchHubCatalog(hub, { query: "prd" });
    expect(results.some((e) => e.id === "prd-writing")).toBe(true);
    const bundles = searchHubCatalog(hub, { category: "bundle" });
    expect(bundles.some((e) => e.id === "api-service")).toBe(true);
    expect(bundles.some((e) => e.id === "frontend-2c")).toBe(true);
    expect(fs.existsSync(writeHubIndex(hub))).toBe(true);
    expect(listHubBundles(hub).length).toBeGreaterThanOrEqual(2);
  });

  it("aggregates coverage across multiple harness repos", () => {
    const parent = tmp();
    const a = path.join(parent, "svc-a");
    const b = path.join(parent, "svc-b");
    initWorkspace(a);
    initWorkspace(b);
    const agg = aggregateCoverage([a, b]);
    expect(agg.totals.repos).toBe(2);
  });

  it("view dashboard includes funnel and asset sections (v0.4)", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    const html = renderDashboard(ws);
    expect(html).toContain("Stage funnel");
    expect(html).toContain("Asset effectiveness");
    expect(html).toContain("First-attempt pass");
    expect(phaseFunnel(ws).length).toBeGreaterThan(0);
    expect(assetEffectiveness(ws)).toBeDefined();
  });
});
