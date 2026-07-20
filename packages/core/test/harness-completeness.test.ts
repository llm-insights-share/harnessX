import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  createProject,
  hubAdd,
  landHubAssets,
  resolveProfileAssets,
  effectiveProfileTaskSet,
  validateHarnessCompleteness,
  seedGoldenHub,
  writeYaml
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-completeness-"));

function makeSkill(
  dir: string,
  id: string,
  over: Record<string, unknown> = {},
  content = `# Skill: ${id}\n\n- body\n`
) {
  fs.mkdirSync(dir, { recursive: true });
  writeYaml(path.join(dir, "asset.yaml"), {
    id,
    kind: "guide.skill",
    version: "0.1.0",
    status: "trial",
    origin: "hub",
    stage: "req",
    task: "biz-understanding",
    ...over
  });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
}

describe("harness completeness & effective task set", () => {
  it("effectiveProfileTaskSet includes optional suite tasks like biz-understanding", () => {
    const root = tmp();
    const ws = initWorkspace(root, { profile: "enterprise" }).ws;
    const tasks = effectiveProfileTaskSet("enterprise", ws.readHarness());
    expect(tasks.some((t) => t.stage === "req" && t.taskId === "biz-understanding")).toBe(true);
    expect(tasks.some((t) => t.stage === "req" && t.taskId === "requirements-research")).toBe(true);
    expect(tasks.some((t) => t.stage === "arch" && t.taskId === "key-mechanisms")).toBe(true);
    expect(tasks.some((t) => t.stage === "req" && t.taskId === "prd-writing")).toBe(true);
  });

  it("resolveProfileAssets includes hub skills bound to optional biz-understanding", () => {
    const root = tmp();
    const hub = path.join(root, "hub");
    seedGoldenHub(hub);
    makeSkill(path.join(hub, "packages/guide/skill/business-insight/0.1.0"), "business-insight");

    const ws = initWorkspace(root, { profile: "enterprise" }).ws;
    const withoutWs = resolveProfileAssets(hub, "enterprise");
    const withWs = resolveProfileAssets(hub, "enterprise", ws);

    // Without workspace still uses builtin scaffold suites → also includes optional tasks
    expect(withoutWs.assets.some((a) => a.id === "business-insight")).toBe(true);
    expect(withWs.assets.some((a) => a.id === "business-insight")).toBe(true);
    expect(withWs.tasks.some((t) => t.taskId === "biz-understanding")).toBe(true);
  });

  it("hub-cache package not in harness.yaml yields hub_cache_unregistered warn", () => {
    const root = tmp();
    const ws = initWorkspace(root, { profile: "standard" }).ws;
    const hub = path.join(root, "hub");
    makeSkill(path.join(hub, "packages/guide/skill/business-insight/0.1.0"), "business-insight");
    hubAdd(ws, hub, { id: "business-insight", version: "0.1.0" });

    const report = validateHarnessCompleteness(ws);
    expect(report.findings.some((f) => f.code === "hub_cache_unregistered" && f.message.includes("business-insight"))).toBe(
      true
    );
    expect(report.ok).toBe(true); // warn-only

    landHubAssets(ws, hub, { skipCompleteness: true });
    const after = validateHarnessCompleteness(ws);
    expect(after.findings.some((f) => f.code === "hub_cache_unregistered" && f.message.includes("business-insight"))).toBe(
      false
    );
    expect(ws.readHarness().guides.some((g) => g.id === "business-insight")).toBe(true);
  });

  it("removing STAGE_TASKS guide from harness reports missing_stage_task_guide", () => {
    const root = tmp();
    const ws = initWorkspace(root, { profile: "standard" }).ws;
    const harness = ws.readHarness();
    harness.guides = harness.guides.filter((g) => g.id !== "biz-understanding-outline");
    writeYaml(ws.harnessFile, harness);

    const report = validateHarnessCompleteness(ws, { profile: "standard" });
    expect(
      report.findings.some(
        (f) => f.code === "missing_stage_task_guide" && f.message.includes("biz-understanding-outline")
      )
    ).toBe(true);
  });

  it("createProject lite profile passes completeness", () => {
    const root = tmp();
    const hub = path.join(root, "hub");
    seedGoldenHub(hub);
    const res = createProject(root, { profile: "lite", hubRoot: hub });
    const report = validateHarnessCompleteness(res.ws, { profile: "lite" });
    expect(report.findings.filter((f) => f.level === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
