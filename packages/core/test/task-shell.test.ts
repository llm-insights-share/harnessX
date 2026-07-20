import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import {
  initWorkspace,
  assembleTaskShell,
  hasTaskEntryForTask,
  validateHarnessCompleteness,
  writeYaml
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-task-shell-"));

describe("assembleTaskShell", () => {
  it("assembles body from guide.workflow and appendix from bound skills/templates", () => {
    const ws = initWorkspace(tmp()).ws;
    const shell = assembleTaskShell(ws, "dev", "propose");
    expect(shell.name).toBe("hx-dev-propose");
    expect(shell.body).toContain("/hx-dev-propose");
    expect(shell.body).toContain("## Steps");
    expect(shell.appendix).toContain("harnessx:bound-guides");
    expect(shell.appendix).toContain("spec-writing");
    expect(shell.appendix).toContain("proposal-template");
    expect(shell.boundGuides.some((g) => g.id === "spec-writing")).toBe(true);
    expect(hasTaskEntryForTask(ws, "dev", "propose")).toBe(true);
  });

  it("prefers guide.command override over guide.workflow body", () => {
    const ws = initWorkspace(tmp()).ws;
    const override = path.join(ws.assetsDir, "commands", "propose-override.md");
    fs.mkdirSync(path.dirname(override), { recursive: true });
    fs.writeFileSync(override, "# OVERRIDE propose shell\n\nCustom body only.\n");
    const harness = ws.readHarness();
    harness.guides.push({
      id: "cmd-propose-override",
      kind: "guide.command",
      execution: "inferential",
      stage: "dev",
      task: "propose",
      source: "assets/commands/propose-override.md"
    });
    fs.writeFileSync(ws.harnessFile, YAML.stringify(harness));
    const shell = assembleTaskShell(ws, "dev", "propose");
    expect(shell.body).toContain("OVERRIDE propose shell");
    expect(shell.body).not.toContain("## Steps");
    expect(shell.appendix).toContain("spec-writing");
  });

  it("falls back to minimal body when workflow is removed but STAGE_TASKS knows the task", () => {
    const ws = initWorkspace(tmp()).ws;
    const harness = ws.readHarness();
    harness.guides = harness.guides.filter(
      (g) => !(g.stage === "dev" && g.task === "propose" && (g.kind === "guide.workflow" || g.kind === "guide.command"))
    );
    writeYaml(ws.harnessFile, harness);
    const shell = assembleTaskShell(ws, "dev", "propose");
    expect(shell.body).toContain("hx-dev-propose");
    expect(shell.appendix).toContain("spec-writing");
    expect(hasTaskEntryForTask(ws, "dev", "propose")).toBe(true);
  });

  it("completeness accepts workflow without guide.command", () => {
    const ws = initWorkspace(tmp()).ws;
    const report = validateHarnessCompleteness(ws);
    expect(report.findings.some((f) => f.code === "missing_task_entry")).toBe(false);
    expect(report.findings.some((f) => f.code === "missing_command")).toBe(false);
  });
});
