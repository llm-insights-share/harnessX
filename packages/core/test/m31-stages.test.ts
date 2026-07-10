import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  createChange,
  readMeta,
  migrateMetaV04ToV05,
  ensureStageFields,
  profileStages,
  profileDevTasks,
  nextTask,
  STAGE_TASKS,
  DELIVERY_STAGES,
  statusToStageTask,
  MetaYaml
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m31-"));

describe("four-stage delivery model", () => {
  it("defines req/arch/dev/test stages with task registry", () => {
    expect(DELIVERY_STAGES).toEqual(["req", "arch", "dev", "test"]);
    expect(STAGE_TASKS.req.some((t) => t.id === "prd-writing" && t.required)).toBe(true);
    expect(STAGE_TASKS.dev.map((t) => t.id)).toContain("propose");
    expect(STAGE_TASKS.test.map((t) => t.id)).toContain("test-case-design");
  });

  it("migrates legacy meta.status to stage+task", () => {
    const meta = MetaYaml.parse({ change: "c1", status: "planned", profile: "standard" });
    const m = migrateMetaV04ToV05(meta);
    expect(m.stage).toBe("dev");
    expect(m.task).toBe("plan");
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

  it("statusToStageTask maps all phase states", () => {
    expect(statusToStageTask("test_designed")).toEqual({ stage: "test", task: "test-case-design" });
    expect(statusToStageTask("implementing")).toEqual({ stage: "dev", task: "apply" });
  });

  it("ensureStageFields fills missing stage on read", () => {
    const dir = tmp();
    const { ws } = initWorkspace(dir);
    createChange(ws, "c2", ["billing"], "standard");
    const raw = readMeta(ws, "c2");
    delete (raw as { stage?: string }).stage;
    const filled = ensureStageFields(raw);
    expect(filled.stage).toBe("dev");
    expect(filled.task).toBe("propose");
  });
});
