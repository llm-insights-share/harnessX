import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  Workspace,
  initWorkspace,
  createChange,
  scaffoldProposal,
  readMeta,
  setStageTask,
  writeMeta,
  verifyMeta,
  recordApproval,
  gateCheck,
  gateAdvance,
  nextTask,
  runSensor,
  runSuite,
  buildContextPack,
  generateTasks,
  readTasks,
  missingTestTasks,
  applyLoop,
  relatedTests,
  installHooks,
  ciInit,
  appendRun,
  type SensorDef,
  type RunnerOptions
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";
import YAML from "yaml";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m2-"));
const opts = (extra: Partial<RunnerOptions> = {}): RunnerOptions => ({ builtins: builtinSensors, ...extra });

const GOOD_DELTA = `## ADDED Requirements

### Requirement: Session expiry
WHEN a session is idle for 30 minutes, THE SYSTEM SHALL invalidate the session token.

#### Scenario: idle timeout
- THEN 401
`;

function setup(profile = "standard") {
  const ws = initWorkspace(tmp()).ws;
  createChange(ws, "c1", ["auth"], profile);
  scaffoldProposal(ws, "c1", "Session expiry");
  fs.writeFileSync(path.join(ws.deltaSpecsDir("c1"), "auth", "spec.md"), GOOD_DELTA);
  // fill proposal sections so completeness passes
  const p = path.join(ws.changeDir("c1"), "proposal.md");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("{{title}}", "Session expiry"));
  return ws;
}

const shellSensor = (id: string, run: string, over: Partial<SensorDef> = {}): SensorDef => ({
  id,
  kind: "sensor.script",
  execution: "computational",
  trigger: "task",
  run,
  on_fail: "block",
  max_retries: 0,
  timeout_ms: 10000,
  ...over
});

describe("T-200 gate state machine", () => {
  it("advances along the profile tasks only when gates pass", async () => {
    const ws = setup();
    const meta = readMeta(ws, "c1");
    expect(nextTask(ws.readHarness(), meta)).toEqual({ stage: "dev", task: "design" });

    const adv = await gateAdvance(ws, "c1", opts());
    expect(adv.passed).toBe(true);
    expect(adv.toTask).toBe("design");
    expect(adv.toStage).toBe("dev");
    expect(readMeta(ws, "c1").task).toBe("design");
  });

  it("fail-closed: unknown suite or crashing sensor blocks the gate", async () => {
    const ws = setup();
    const harness = ws.readHarness();
    const res = await runSuite(ws, harness, "no-such-suite", "c1", opts());
    expect(res.passed).toBe(false);
    expect(res.blockers[0]).toMatch(/fail-closed/);

    const crash = await runSensor(ws, shellSensor("boom", "exit 7"), "c1", opts());
    expect(crash.status).toBe("fail");
    const timeoutDef = shellSensor("slow", "sleep 5", { timeout_ms: 200 });
    const timedOut = await runSensor(ws, timeoutDef, "c1", opts());
    expect(timedOut.status).toBe("error");
  });
});

describe("T-201 sensor runner", () => {
  it("shell sensor passes/fails with structured report and retry semantics", async () => {
    const ws = setup();
    const pass = await runSensor(ws, shellSensor("ok", "true"), "c1", opts());
    expect(pass.status).toBe("pass");

    // retry: fails twice then succeeds via a counter file
    const counter = path.join(ws.root, "count.txt");
    const cmd = `n=$(cat ${counter} 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${counter}; [ $n -ge 3 ]`;
    const retried = await runSensor(ws, shellSensor("flaky", cmd, { on_fail: "retry", max_retries: 3 }), "c1", opts());
    expect(retried.status).toBe("pass");
    expect(fs.readFileSync(counter, "utf8").trim()).toBe("3");
  });

  it("parses JSON sensor reports from stdout", async () => {
    const ws = setup();
    const json = `{"status":"fail","summary":"2 issues","findings":[{"severity":"block","message":"bad import"}],"fix_hint":"use services layer"}`;
    const r = await runSensor(ws, shellSensor("custom", `echo '${json}'; exit 1`), "c1", opts());
    expect(r.status).toBe("fail");
    expect(r.findings[0].message).toBe("bad import");
    expect(r.fix_hint).toBe("use services layer");
  });

  it("on_fail: warn produces warnings not blockers", async () => {
    const ws = setup();
    const harness = ws.readHarness();
    harness.sensors.push(shellSensor("advisory", "exit 1", { on_fail: "warn" }));
    harness.suites["w"] = ["advisory"];
    const res = await runSuite(ws, harness, "w", "c1", opts());
    expect(res.passed).toBe(true);
    expect(res.warnings).toHaveLength(1);
  });
});

describe("T-202 guide engine context pack", () => {
  it("assembles constitution + task guides + task artifacts with persona/permissions, <2s", () => {
    const ws = setup();
    const pack = buildContextPack(ws, "c1", "dev", "apply");
    expect(pack.assembledInMs).toBeLessThan(2000);
    expect(pack.persona).toContain("apply agent");
    expect(pack.permissions).toMatch(/Never edit meta.yaml/);
    const titles = pack.sections.map((s) => s.title);
    expect(titles[0]).toMatch(/Constitution/);
    expect(titles.join()).toContain("coding-conventions");
    expect(titles.join()).toContain("Delta spec: auth");
    // exclusion: propose-task template guide not in apply pack
    expect(titles.join()).not.toContain("proposal-template");
  });
});

describe("T-203 plan generation", () => {
  it("emits dual-track tasks annotated with requirement ids", () => {
    const ws = setup();
    const { tasks } = generateTasks(ws, "c1");
    expect(tasks).toHaveLength(2);
    expect(tasks[0].track).toBe("test");
    expect(tasks[1].track).toBe("impl");
    expect(tasks[0].requirement).toBe("Session expiry");
    expect(missingTestTasks(tasks)).toHaveLength(0);
    const parsed = readTasks(ws, "c1");
    expect(parsed).toHaveLength(2);
  });
});

describe("T-204/T-205 apply loop with self-correction + relevance", () => {
  it("executor fixes a failing sensor on retry; tasks get checked off", async () => {
    const ws = setup();
    generateTasks(ws, "c1");
    // gate the apply suite on a marker file the executor creates on attempt 2
    const marker = path.join(ws.root, "fixed.txt");
    const harness = ws.readHarness();
    harness.suites["fast"] = ["marker"];
    harness.sensors.push(shellSensor("marker", `test -f ${marker}`, { fix_hint: "create fixed.txt" }));
    fs.writeFileSync(ws.harnessFile, YAML.stringify(harness));

    const attempts: number[] = [];
    const res = await applyLoop(ws, "c1", {
      runner: opts(),
      maxRetries: 2,
      executor: ({ attempt, fixHints }) => {
        attempts.push(attempt);
        if (attempt === 2) {
          expect(fixHints.join()).toContain("marker");
          fs.writeFileSync(marker, "ok");
        }
      }
    });
    expect(res.completed).toEqual(["01a", "01b"]);
    expect(res.remaining).toBe(0);
    expect(attempts[0]).toBe(1);
    expect(attempts[1]).toBe(2);
    expect(readTasks(ws, "c1").every((t) => t.done)).toBe(true);
  });

  it("stops after self-correction limit", async () => {
    const ws = setup();
    generateTasks(ws, "c1");
    const harness = ws.readHarness();
    harness.suites["fast"] = ["never"];
    harness.sensors.push(shellSensor("never", "false"));
    fs.writeFileSync(ws.harnessFile, YAML.stringify(harness));
    const res = await applyLoop(ws, "c1", { runner: opts(), maxRetries: 1, executor: () => {} });
    expect(res.failed?.task.id).toBe("01a");
    expect(res.completed).toHaveLength(0);
  });

  it("relatedTests selects tests transitively affected by the diff", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/util.ts"), "export const x = 1;\n");
    fs.writeFileSync(path.join(root, "src/service.ts"), "import { x } from './util.js';\nexport const y = x;\n");
    fs.writeFileSync(path.join(root, "tests/service.test.ts"), "import { y } from '../src/service.js';\n");
    fs.writeFileSync(path.join(root, "tests/other.test.ts"), "export {};\n");
    const related = relatedTests(root, ["src/util.ts"]);
    expect(related).toEqual(["tests/service.test.ts"]);
  });
});

describe("T-206 meta exclusive write + verify", () => {
  it("detects manual edits and log tampering", () => {
    const ws = setup();
    expect(verifyMeta(ws, "c1").ok).toBe(true);

    // manual edit
    const f = ws.metaFile("c1");
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("standard", "lite"));
    const res = verifyMeta(ws, "c1");
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/edited outside/);

    // restore via CLI-path write, then tamper the log after a gate record
    const meta = readMeta(ws, "c1");
    meta.profile = "standard";
    writeMeta(ws, meta);
    expect(verifyMeta(ws, "c1").ok).toBe(true);
  });

  it("binds gate results to the sensor log hash", async () => {
    const ws = setup();
    // apply gate runs the fast suite → sensor telemetry is recorded and hashed
    generateTasks(ws, "c1");
    await gateCheck(ws, "c1", { task: "apply" }, opts());
    expect(verifyMeta(ws, "c1").ok).toBe(true);
    // later legitimate runs may append without breaking the recorded hash
    appendRun(ws, { kind: "sensor", change: "c1", name: "later", status: "pass" });
    expect(verifyMeta(ws, "c1").ok).toBe(true);
    // but editing a recorded log line is detected
    const logFile = path.join(ws.changeRunsDir("c1"), "telemetry.jsonl");
    const lines = fs.readFileSync(logFile, "utf8").split("\n");
    lines[0] = lines[0].replace(/"status":"[a-z]+"/, '"status":"forged"');
    fs.writeFileSync(logFile, lines.join("\n"));
    const res = verifyMeta(ws, "c1");
    expect(res.ok).toBe(false);
    expect(res.problems.join()).toMatch(/logHash/);
  });
});

describe("T-207/T-208 hooks + CI replay templates", () => {
  it("installs executable pre-commit/pre-push hooks", () => {
    const root = tmp();
    execSync("git init -q", { cwd: root });
    const files = installHooks(root);
    expect(files).toHaveLength(2);
    for (const f of files) {
      expect(fs.statSync(f).mode & 0o111).toBeTruthy();
      expect(fs.readFileSync(f, "utf8")).toContain("hx gate hook-check");
    }
  });

  it("writes harness-verify workflow with replay + meta verify + trace + fixtures", () => {
    const root = tmp();
    const [wf, doc] = ciInit(root);
    const y = fs.readFileSync(wf, "utf8");
    expect(y).toContain("hx gate replay");
    expect(y).toContain("hx meta verify --all");
    expect(y).toContain("hx trace check --all");
    expect(y).toContain("hx fixture verify");
    expect(fs.readFileSync(doc, "utf8")).toContain("CODEOWNERS");
  });
});

describe("T-209/T-210 design precondition + human approval gate", () => {
  it("design gate blocks on incomplete proposal", async () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c2", ["auth"]);
    const res = await gateCheck(ws, "c2", { task: "design" }, opts());
    expect(res.passed).toBe(false);
    expect(res.blockers.join()).toMatch(/proposal\.md missing/);
  });

  it("design→plan requires recorded human approval (FR-012)", async () => {
    const ws = setup();
    setStageTask(ws, "c1", "dev", "design");
    const blocked = await gateCheck(ws, "c1", { task: "plan" }, opts());
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers.join()).toMatch(/human approval/);

    recordApproval(ws, "c1", "design-to-plan", "alice");
    const ok = await gateCheck(ws, "c1", { task: "plan" }, opts());
    expect(ok.passed).toBe(true);
    const meta = readMeta(ws, "c1");
    expect(meta.approvals[0].approver).toBe("alice");
    expect(meta.approvals[0].artifactHash).toHaveLength(64);
  });
});

describe("T-211 M2 acceptance", () => {
  it("full gated pipeline: propose→design→approve→plan→apply(self-correct)→verify state", async () => {
    const ws = setup();
    // propose → design
    let adv = await gateAdvance(ws, "c1", opts());
    expect(adv.toTask).toBe("design");
    expect(adv.toStage).toBe("dev");

    // plan blocked without approval (fail-closed on human gate)
    const planBlocked = await gateCheck(ws, "c1", { task: "plan" }, opts());
    expect(planBlocked.passed).toBe(false);
    recordApproval(ws, "c1", "design-to-plan", "alice");
    generateTasks(ws, "c1");
    const planOk = await gateCheck(ws, "c1", { task: "plan" }, opts());
    expect(planOk.passed).toBe(true);

    // design → apply
    adv = await gateAdvance(ws, "c1", opts());
    expect(adv.toTask).toBe("apply");
    expect(adv.passed).toBe(true);

    // apply with a sensor that the executor "fixes" on first attempt
    const marker = path.join(ws.root, "ok.txt");
    const harness = ws.readHarness();
    harness.suites["fast"] = ["m"];
    harness.sensors.push(shellSensor("m", `test -f ${marker}`));
    fs.writeFileSync(ws.harnessFile, YAML.stringify(harness));
    const res = await applyLoop(ws, "c1", {
      runner: opts(),
      executor: () => fs.writeFileSync(marker, "1")
    });
    expect(res.remaining).toBe(0);
    expect(readMeta(ws, "c1").task).toBe("apply");
    // meta verify passes at the end (no tampering happened)
    expect(verifyMeta(ws, "c1").ok).toBe(true);
  });
});
