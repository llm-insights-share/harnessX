import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  initWorkspace,
  createChange,
  readMeta,
  stageGateCheck,
  scaffoldProposal,
  nextTask,
  profileStages,
  type MetaYaml
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m32-"));

const GOOD_DELTA = `## ADDED Requirements

### Requirement: Widget toggle
WHEN user clicks toggle, THE SYSTEM SHALL flip state.

#### Scenario: flip
- THEN state changes
`;

describe("m32 stage gate e2e path", () => {
  it("resolves req→arch→dev→test task sequence for standard profile", () => {
    const { ws } = initWorkspace(tmp());
    createChange(ws, "c1", ["api"], "standard");
    const harness = ws.readHarness();
    expect(profileStages(harness, "standard")).toEqual(["req", "arch", "dev", "test"]);

    let meta: MetaYaml = readMeta(ws, "c1");
    const steps: string[] = [`${meta.stage}/${meta.task}`];
    for (let i = 0; i < 12; i++) {
      const n = nextTask(harness, meta);
      if (!n) break;
      steps.push(`${n.stage}/${n.task}`);
      meta = { ...meta, stage: n.stage, task: n.task };
    }

    expect(steps).toContain("dev/design");
    expect(steps).toContain("test/test-case-design");
    expect(steps.at(-1)).toMatch(/dev\/archive|test\/test-execution/);
  });

  it("runs dev/propose gate with stage+task API", async () => {
    const { ws } = initWorkspace(tmp());
    createChange(ws, "c1", ["api"], "lite");
    scaffoldProposal(ws, "c1", "Widget toggle");
    fs.mkdirSync(path.join(ws.deltaSpecsDir("c1"), "api"), { recursive: true });
    fs.writeFileSync(path.join(ws.deltaSpecsDir("c1"), "api", "spec.md"), GOOD_DELTA);
    const p = path.join(ws.changeDir("c1"), "proposal.md");
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("{{title}}", "Widget toggle"));

    const res = await stageGateCheck(ws, "c1", "dev", "propose", { builtins: builtinSensors, changedFiles: [] });
    expect(res.passed).toBe(true);
    expect(res.stage).toBe("dev");
    expect(res.task).toBe("propose");
  });
});
