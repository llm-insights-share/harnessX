import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HarnessYaml,
  MetaYaml,
  AssetManifest,
  SensorDef,
  PHASES,
  phaseByCommand,
  PLUGIN_API_VERSION
} from "@harnessx/core/schemas.js";
import { Workspace } from "@harnessx/core/paths.js";
import { appendRun, readRuns, runsLogHash, sha256 } from "@harnessx/core/telemetry.js";

describe("T-001 core schemas", () => {
  it("parses a valid harness.yaml with kind + execution split", () => {
    const h = HarnessYaml.parse({
      profiles: { lite: { phases: ["propose", "apply", "archive"], suites: { apply: "fast" } } },
      suites: { fast: ["lint"] },
      guides: [
        { id: "conv", kind: "guide.skill", execution: "inferential", phase: ["apply"], source: "assets/guides/conv/SKILL.md" }
      ],
      sensors: [{ id: "lint", kind: "sensor.rule", execution: "computational", run: "npm run lint", on_fail: "retry", max_retries: 3 }]
    });
    expect(h.sensors[0].max_retries).toBe(3);
    expect(h.guides[0].kind).toBe("guide.skill");
  });

  it("rejects unknown kinds and missing override reasons", () => {
    expect(() => SensorDef.parse({ id: "x", kind: "sensor.nope", execution: "computational" })).toThrow();
    expect(() =>
      HarnessYaml.parse({ profiles: {}, overrides: [{ id: "a", source: "local", reason: "" }] })
    ).toThrow();
  });

  it("meta.yaml enforces valid phase states", () => {
    expect(() => MetaYaml.parse({ change: "c", status: "flying", profile: "standard" })).toThrow();
    const m = MetaYaml.parse({ change: "c", status: "proposed", profile: "standard" });
    expect(m.approvals).toEqual([]);
  });

  it("asset manifest defaults lifecycle to draft", () => {
    const a = AssetManifest.parse({ id: "api-design", kind: "guide.skill" });
    expect(a.status).toBe("draft");
    expect(a.origin).toBe("local");
  });

  it("phase mapping table has 9 consistent entries (includes test-design)", () => {
    expect(PHASES).toHaveLength(9);
    expect(phaseByCommand("test-design")?.state).toBe("test_designed");
    expect(phaseByCommand("apply")?.state).toBe("implementing");
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
