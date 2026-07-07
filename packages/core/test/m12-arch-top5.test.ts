import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import {
  Workspace,
  initWorkspace,
  seedGoldenHub,
  applyBlueprint,
  expandHarnessImports,
  resolveHarnessGuideDef,
  callMcpTool,
  MCP_TOOLS,
  buildApplyTaskEnv,
  writeYaml,
  createChange,
  generateTasks,
  scaffoldProposal,
  orchestration,
  hub as hubBoundary
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m12-"));
const opts = () => ({ builtins: builtinSensors });

describe("arch review Top 5", () => {
  it("blueprint phases wire missing guides into harness.yaml after hub deps", () => {
    const root = tmp();
    const hub = path.join(root, "hub");
    seedGoldenHub(hub);
    const { ws } = initWorkspace(root);
    writeYaml(ws.configFile, { ...ws.readConfig(), hub });

    const applied = applyBlueprint(
      ws,
      {
        name: "test-bp",
        extends: "standard",
        hub_deps: ["prototype-wireframe@1.0.0"],
        phases: { design: { guides: ["prototype-wireframe"] } }
      },
      hub
    );

    expect(applied.some((a) => a.includes("prototype-wireframe"))).toBe(true);
    const harness = YAML.parse(fs.readFileSync(ws.harnessFile, "utf8"));
    expect(harness.guides.map((g: { id: string }) => g.id)).toContain("prototype-wireframe");
    expect(resolveHarnessGuideDef(ws, "prototype-wireframe", { hubRoot: hub })?.source).toContain(".hub-cache");
  });

  it("harness imports expand topology bundles at read time", () => {
    const { ws } = initWorkspace(tmp());
    const minimal = {
      version: "1.0",
      constitution: "constitution.md",
      imports: ["api-service"],
      profiles: ws.readHarness().profiles,
      suites: {},
      guides: [],
      sensors: [],
      dependencies: [],
      overrides: []
    };
    fs.writeFileSync(ws.harnessFile, YAML.stringify(minimal), "utf8");

    const expanded = ws.readHarness();
    expect(expanded.guides.map((g) => g.id)).toContain("api-design");
    expect(expanded.sensors.map((s) => s.id)).toContain("arch-boundary");
    expect(expanded.suites.verification).toContain("integration-smoke");

    const raw = YAML.parse(fs.readFileSync(ws.harnessFile, "utf8"));
    expect(raw.guides).toEqual([]);
  });

  it("expandHarnessImports is idempotent for nested refs", () => {
    const { ws } = initWorkspace(tmp());
    const raw = {
      version: "1.0",
      imports: ["api-service", "api-service"],
      profiles: { lite: { phases: ["apply"], suites: {} } },
      suites: {},
      guides: [],
      sensors: [],
      dependencies: [],
      overrides: []
    };
    const once = expandHarnessImports(raw, ws);
    const twice = expandHarnessImports(once, ws);
    expect(twice.guides.filter((g) => g.id === "api-design").length).toBe(1);
  });

  it("MCP exposes apply_task, fix_session, drift_check", async () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("apply_task");
    expect(names).toContain("fix_session");
    expect(names).toContain("drift_check");

    const { ws } = initWorkspace(tmp());
    createChange(ws, "mcp-top5", ["auth"]);
    scaffoldProposal(ws, "mcp-top5", "Auth");
    generateTasks(ws, "mcp-top5");

    const taskRes = (await callMcpTool(ws, "apply_task", { change: "mcp-top5", task: "01b" }, opts())) as {
      env: { HX_TASK_ID: string; HX_TASK_PACK: string };
      contractSchema: string;
    };
    expect(taskRes.env.HX_TASK_ID).toBe("01b");
    expect(taskRes.env.HX_TASK_PACK).toContain("01b-pack.md");
    expect(taskRes.contractSchema).toContain("agent-env-contract");

    const fixRes = (await callMcpTool(ws, "fix_session", { change: "mcp-top5", sensor: "spec-validate" }, opts())) as {
      packFile: string;
      env: { HX_FIX_PACK: string };
    };
    expect(fixRes.packFile).toContain("fix-pack.md");
    expect(fixRes.env.HX_FIX_PACK).toBe(fixRes.packFile);

    const drift = (await callMcpTool(ws, "drift_check", { change: "mcp-top5" }, opts())) as { sensor: string };
    expect(drift.sensor).toBe("drift");
  });

  it("L1 env contract builder matches apply runner shape", () => {
    const env = buildApplyTaskEnv("chg", { id: "01b", track: "impl", requirement: "R1", capability: "auth", title: "Do it", done: false }, "/tmp/pack.md", ["fix lint"]);
    expect(env.HX_CHANGE).toBe("chg");
    expect(env.HX_FIX_HINTS).toBe("fix lint");
    expect(orchestration.buildApplyTaskEnv).toBeDefined();
    expect(hubBoundary.expandHarnessImports).toBeDefined();
  });
});
