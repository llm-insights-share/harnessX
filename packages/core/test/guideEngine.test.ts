import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initWorkspace, writeYaml, buildContextPack, createChange, type Workspace } from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-guide-"));

describe("guideEngine skill packages", () => {
  let root: string;
  let ws: Workspace;

  beforeEach(() => {
    root = tmp();
    ({ ws } = initWorkspace(root));
    const skillDir = path.join(ws.assetsDir, "guides", "biz-insight");
    fs.mkdirSync(path.join(skillDir, "examples"), { recursive: true });
    writeYaml(path.join(skillDir, "asset.yaml"), {
      id: "biz-insight",
      kind: "guide.skill",
      version: "1.0.0",
      status: "trial",
      stage: "dev",
      task: "apply"
    });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Business insight\n", "utf8");
    fs.writeFileSync(path.join(skillDir, "examples", "report.md"), "# Sample report\n", "utf8");

    const harness = ws.readHarness();
    harness.guides.push({
      id: "biz-insight",
      kind: "guide.skill",
      execution: "inferential",
      stage: "dev",
      task: "apply",
      source: "assets/guides/biz-insight"
    });
    writeYaml(ws.harnessFile, harness);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("buildContextPack includes skill resource files", () => {
    createChange(ws, "chg-1", ["auth"]);
    const pack = buildContextPack(ws, "chg-1", "dev", "apply");
    const titles = pack.sections.map((s) => s.title);
    expect(titles.some((t) => t.includes("biz-insight") && t.includes("examples/report.md"))).toBe(true);
    const resource = pack.sections.find((s) => s.title.includes("examples/report.md"));
    expect(resource?.content).toContain("Sample report");
  });
});
