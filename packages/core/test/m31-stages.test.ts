import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  createChange,
  readMeta,
  profileStages,
  profileDevTasks,
  orchestration
} from "@harnessx/core";

const { nextTask, DELIVERY_STAGES, STAGE_TASKS } = orchestration;

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m31-"));

describe("four-stage delivery model", () => {
  it("defines req/arch/dev/test stages with task registry", () => {
    expect(DELIVERY_STAGES).toEqual(["req", "arch", "dev", "test"]);
    expect(STAGE_TASKS.req.some((t) => t.id === "prd-writing" && t.required)).toBe(true);
    expect(STAGE_TASKS.dev.map((t) => t.id)).toContain("propose");
    expect(STAGE_TASKS.test.map((t) => t.id)).toContain("test-case-design");
  });

  it("createChange initializes meta at dev/propose", () => {
    const { ws } = initWorkspace(tmp());
    const { meta } = createChange(ws, "c1", ["auth"], "standard");
    expect(meta.stage).toBe("dev");
    expect(meta.task).toBe("propose");
  });

  it("resolves profile stages and dev_tasks from harness.yaml", () => {
    const { ws } = initWorkspace(tmp());
    const harness = ws.readHarness();
    expect(profileStages(harness, "standard")).toContain("dev");
    expect(profileDevTasks(harness, "lite")).toEqual(["propose", "apply", "archive"]);
    expect(profileDevTasks(harness, "enterprise-sdlc")).toContain("plan");
  });

  it("nextTask advances within dev stage", () => {
    const { ws } = initWorkspace(tmp());
    createChange(ws, "c1", ["auth"], "standard");
    const harness = ws.readHarness();
    let meta = readMeta(ws, "c1");
    meta.stage = "dev";
    meta.task = "propose";
    const next = nextTask(harness, meta);
    expect(next).toEqual({ stage: "dev", task: "design" });
  });

  it("nextTask crosses stages when dev tasks are complete", () => {
    const { ws } = initWorkspace(tmp());
    createChange(ws, "c2", ["billing"], "standard");
    const harness = ws.readHarness();
    const meta = readMeta(ws, "c2");
    meta.stage = "dev";
    meta.task = "archive";
    const next = nextTask(harness, meta);
    expect(next).toEqual({ stage: "test", task: "test-case-design" });
  });
});
