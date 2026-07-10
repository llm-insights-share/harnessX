import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HarnessYaml,
  MetaYaml,
  AssetManifest,
  SensorDef,
  DELIVERY_STAGE,
  PLUGIN_API_VERSION
} from "@harnessx/core/schemas.js";
import { orchestration } from "@harnessx/core";

const { STAGE_TASKS } = orchestration;
import { Workspace } from "@harnessx/core/paths.js";
import { appendRun, readRuns, runsLogHash, sha256 } from "@harnessx/core/telemetry.js";

describe("T-001 core schemas", () => {
  it("parses a valid harness.yaml with kind + execution split", () => {
    const h = HarnessYaml.parse({
      profiles: {
        lite: {
          stages: ["dev"],
          dev_tasks: ["propose", "apply", "archive"],
          suites: { "dev.apply": "fast" }
        }
      },
      suites: { fast: ["lint"] },
      guides: [
        {
          id: "conv",
          kind: "guide.skill",
          execution: "inferential",
          stage: "dev",
          task: "apply",
          source: "assets/guides/conv/SKILL.md"
        }
      ],
      sensors: [{ id: "lint", kind: "sensor.rule", execution: "computational", run: "npm run lint", on_fail: "retry", max_retries: 3 }]
    });
    expect(h.sensors[0].max_retries).toBe(3);
    expect(h.guides[0].kind).toBe("guide.skill");
    expect(h.guides[0].stage).toBe("dev");
    expect(h.guides[0].task).toBe("apply");
  });

  it("rejects unknown kinds and missing override reasons", () => {
    expect(() => SensorDef.parse({ id: "x", kind: "sensor.nope", execution: "computational" })).toThrow();
    expect(() =>
      HarnessYaml.parse({ profiles: {}, overrides: [{ id: "a", source: "local", reason: "" }] })
    ).toThrow();
  });

  it("meta.yaml enforces valid stage+task states", () => {
    expect(() => MetaYaml.parse({ change: "c", stage: "nope", task: "propose", profile: "standard" })).toThrow();
    const m = MetaYaml.parse({ change: "c", stage: "dev", task: "propose", profile: "standard" });
    expect(m.approvals).toEqual([]);
    expect(m.stage).toBe("dev");
    expect(m.task).toBe("propose");
  });

  it("asset manifest defaults lifecycle to draft", () => {
    const a = AssetManifest.parse({ id: "api-design", kind: "guide.skill", stage: "dev" });
    expect(a.status).toBe("draft");
    expect(a.origin).toBe("local");
    expect(a.stage).toBe("dev");
  });

  it("DELIVERY_STAGE and STAGE_TASKS define the four-stage model", () => {
    expect(DELIVERY_STAGE.options).toEqual(["req", "arch", "dev", "test"]);
    expect(STAGE_TASKS.dev.map((t) => t.id)).toEqual(
      expect.arrayContaining(["plan", "propose", "design", "apply", "verify", "archive"])
    );
    expect(STAGE_TASKS.req.some((t) => t.id === "prd-writing" && t.required)).toBe(true);
    expect(PLUGIN_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("T-002 telemetry", () => {
  it("writes JSONL globally and per-change, and hashes the change log", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hx-tel-"));
    const ws = new Workspace(root);
    appendRun(ws, { kind: "sensor", change: "add-auth", name: "lint", status: "pass" });
    appendRun(ws, { kind: "gate", change: "add-auth", name: "verify", status: "fail" });
    appendRun(ws, { kind: "janitor", name: "scan", status: "info" });

    expect(readRuns(ws)).toHaveLength(3);
    expect(readRuns(ws, "add-auth")).toHaveLength(2);

    const h1 = runsLogHash(ws, "add-auth");
    expect(h1.hash).toHaveLength(64);
    expect(h1.lines).toBe(2);
    appendRun(ws, { kind: "sensor", change: "add-auth", name: "lint", status: "pass" });
    expect(runsLogHash(ws, "add-auth").hash).not.toBe(h1.hash);
    // prefix hash over the original line count is stable across appends
    expect(runsLogHash(ws, "add-auth", 2).hash).toBe(h1.hash);
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});
