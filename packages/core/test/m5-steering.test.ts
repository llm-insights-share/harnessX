import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  createChange,
  recordFailure,
  aggregatePatterns,
  failureSignature,
  distillPattern,
  harvestReviews,
  coverageReport,
  redact,
  applyBudget,
  runRubric,
  heuristicJudge,
  commandJudge,
  addRubricRule,
  recordRubricFeedback,
  readRubric,
  addWaiver,
  janitorRun,
  runSensor,
  readYaml,
  type RubricFile,
  type SensorDef,
  type WaiverRecord
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m5-"));

describe("T-500 failure catalog", () => {
  it("normalizes signatures and flags patterns at >=3 occurrences", () => {
    const ws = initWorkspace(tmp()).ws;
    expect(failureSignature("lint", "src/a.ts:12 unused var")).toBe(failureSignature("lint", "src/b.ts:99 unused var"));

    for (const change of ["c1", "c2", "c3"]) {
      recordFailure(ws, { sensor: "lint", change, message: `src/x${change}.ts:1 unused var` });
    }
    recordFailure(ws, { sensor: "typecheck", change: "c1", message: "TS2551 property missing" });

    const patterns = aggregatePatterns(ws);
    expect(patterns[0].count).toBe(3);
    expect(patterns[0].isPattern).toBe(true);
    expect(patterns[0].changes).toEqual(["c1", "c2", "c3"]);
    expect(patterns[1].isPattern).toBe(false);
  });

  it("sensor runner feeds failures into the catalog automatically", async () => {
    const ws = initWorkspace(tmp()).ws;
    const def: SensorDef = { id: "always-fails", kind: "sensor.script", execution: "computational", trigger: "phase", run: "echo boom >&2; exit 1", on_fail: "block", max_retries: 0, timeout_ms: 5000 };
    await runSensor(ws, def, "c1", { builtins: builtinSensors });
    const patterns = aggregatePatterns(ws);
    expect(patterns.some((p) => p.sensor === "always-fails")).toBe(true);
  });
});

describe("T-501 distill", () => {
  it("produces a draft asset with provenance chain from a pattern", () => {
    const ws = initWorkspace(tmp()).ws;
    for (const c of ["c1", "c2", "c3"]) recordFailure(ws, { sensor: "arch-boundary", change: c, message: "repositories imports routes layer" });
    const pattern = aggregatePatterns(ws)[0];
    const res = distillPattern(ws, pattern, "guide.skill");
    expect(fs.existsSync(res.manifestFile)).toBe(true);
    const manifest = readYaml<{ status: string; provenance: { type: string; ref: string }[]; metrics: { occurrences: number } }>(res.manifestFile);
    expect(manifest.status).toBe("draft");
    expect(manifest.provenance[0].type).toBe("failure-pattern");
    expect(manifest.provenance.map((p) => p.ref)).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
    expect(manifest.metrics.occurrences).toBe(3);
    expect(fs.readFileSync(res.contentFile, "utf8")).toContain("Distilled from 3 occurrences");
  });
});

describe("T-502 harvest-pr", () => {
  it("clusters review comments by topic into rubric drafts with provenance", () => {
    const comments = [
      { pr: 1, author: "alice", body: "Please add error handling around this fetch" },
      { pr: 2, author: "bob", body: "This throw is swallowed — error handling again" },
      { pr: 3, author: "carol", body: "nit: rename this variable" }
    ];
    const drafts = harvestReviews(comments);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].topic).toBe("error-handling");
    expect(drafts[0].provenance).toHaveLength(2);
    expect(drafts[0].provenance[0].ref).toContain("PR#1");
  });
});

describe("T-503 coverage report", () => {
  it("reports first-attempt pass rate and uncovered recurrent patterns", async () => {
    const ws = initWorkspace(tmp()).ws;
    const pass: SensorDef = { id: "s-ok", kind: "sensor.script", execution: "computational", trigger: "phase", run: "true", on_fail: "block", max_retries: 0, timeout_ms: 5000 };
    const fail: SensorDef = { id: "s-bad", kind: "sensor.script", execution: "computational", trigger: "phase", run: "exit 1", on_fail: "block", max_retries: 0, timeout_ms: 5000 };
    await runSensor(ws, pass, "c1", { builtins: builtinSensors });
    await runSensor(ws, fail, "c1", { builtins: builtinSensors });
    await runSensor(ws, fail, "c2", { builtins: builtinSensors });
    await runSensor(ws, fail, "c3", { builtins: builtinSensors });

    const rep = coverageReport(ws);
    expect(rep.metrics.totalSensorRuns).toBe(4);
    expect(rep.metrics.firstAttemptPassRate).toBeCloseTo(0.25);
    expect(rep.metrics.recurrentPatterns).toBe(1);
    expect(rep.uncoveredPatterns).toBe(1);
    expect(rep.metrics.failuresPerChange["c1"]).toBe(1);
  });
});

describe("T-504 rubric runner", () => {
  const rubric: RubricFile = {
    rules: [
      { id: "no-todo", status: "enforced", check: "No TODO left in specs", pattern: "\\bTODO\\b", severity: "block" },
      { id: "trial-rule", status: "trial", check: "Mentions rollback plan", pattern: "no rollback", severity: "block" },
      { id: "draft-rule", status: "draft", check: "not evaluated", pattern: ".", severity: "block" },
      { id: "dep-rule", status: "deprecated", check: "not evaluated", pattern: ".", severity: "block" }
    ]
  };

  it("evaluates only trial+enforced rules; trial findings downgrade to info", () => {
    const findings = runRubric(rubric, "TODO: finish this. There is no rollback here.", {});
    expect(findings.map((f) => f.rule).sort()).toEqual(["no-todo", "trial-rule"]);
    expect(findings.find((f) => f.rule === "no-todo")!.severity).toBe("block");
    expect(findings.find((f) => f.rule === "trial-rule")!.severity).toBe("info");
  });

  it("redaction middleware masks secrets before judging; budget truncates", () => {
    const secret = `api_key = "sk_live_abcdef1234567890"`;
    expect(redact(secret)).toContain("[REDACTED]");
    expect(redact(secret)).not.toContain("sk_live_abcdef1234567890");
    expect(redact("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----")).toBe("[REDACTED]");
    const truncated = applyBudget("x".repeat(1000), 10);
    expect(truncated.length).toBeLessThan(200);
    expect(truncated).toContain("[TRUNCATED");
  });

  it("supports an external command judge (local LLM slot) with fail-closed", () => {
    const judge = commandJudge(`node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(JSON.stringify({violation:j.content.includes('bad')}))})"`);
    expect(judge({ id: "r", status: "enforced", check: "c", severity: "warn" }, "this is bad").violation).toBe(true);
    expect(judge({ id: "r", status: "enforced", check: "c", severity: "warn" }, "fine").violation).toBe(false);
    const broken = commandJudge("exit 3");
    expect(() => broken({ id: "r", status: "enforced", check: "c", severity: "warn" }, "x")).toThrow(/fail-closed/);
  });

  it("rubric builtin sensor blocks on enforced violations in change artifacts", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    fs.mkdirSync(path.join(ws.deltaSpecsDir("c1"), "auth"), { recursive: true });
    fs.writeFileSync(path.join(ws.deltaSpecsDir("c1"), "auth/spec.md"), "## ADDED Requirements\n\n### Requirement: X\nTHE SYSTEM SHALL x. TODO fill in.\n\n#### Scenario: s\n- THEN x\n");
    const dir = path.join(ws.assetsDir, "rubrics/team-review");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "rules.yaml"), `rules:\n  - id: no-todo\n    status: enforced\n    check: No TODO in specs\n    pattern: "\\\\bTODO\\\\b"\n    severity: block\n`);
    const report = builtinSensors["rubric"]({ ws, change: "c1", def: { id: "ai-spec-review", budget_tokens: 8000 } as never });
    const r = report as { status: string; findings: { rule?: string }[] };
    expect(r.status).toBe("fail");
    expect(r.findings[0].rule).toBe("no-todo");
  });
});

describe("T-505 natural-language rubric entry", () => {
  it("adds colloquial checks as draft rules and tracks false positives", () => {
    const ws = initWorkspace(tmp()).ws;
    const { file, rule } = addRubricRule(ws, "don't leave console.log in production code", { pattern: "console\\.log" });
    expect(rule.status).toBe("draft");
    expect(readRubric(file).rules).toHaveLength(1);

    recordRubricFeedback(file, rule.id, false);
    const updated = recordRubricFeedback(file, rule.id, true);
    expect(updated.evaluations).toBe(2);
    expect(updated.falsePositives).toBe(1);
  });
});

describe("T-506 janitor", () => {
  it("finds expired waivers, drift and dead assets; writes PR-ready report", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    const expired: WaiverRecord = {
      id: "w1", target: "scenario:x", reason: "r", requestedBy: "b", approvedBy: "a",
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString()
    };
    addWaiver(ws, "c1", expired);

    const rep = janitorRun(ws);
    expect(rep.expiredWaivers).toHaveLength(1);
    expect(rep.deadAssets.length).toBeGreaterThan(0); // no sensors have run yet
    const md = fs.readFileSync(rep.reportFile, "utf8");
    expect(md).toContain("Expired waivers");
    expect(md).toContain("- [ ] c1: waiver w1");
  });
});

describe("T-507 M5 acceptance", () => {
  it("repeated failures → pattern → distilled draft with traceable evidence", async () => {
    const ws = initWorkspace(tmp()).ws;
    const def: SensorDef = { id: "lint", kind: "sensor.rule", execution: "computational", trigger: "phase", run: "echo 'unused variable foo' >&2; exit 1", on_fail: "block", max_retries: 0, timeout_ms: 5000 };
    for (const c of ["c1", "c2", "c3"]) await runSensor(ws, def, c, { builtins: builtinSensors });

    const pattern = aggregatePatterns(ws).find((p) => p.isPattern)!;
    expect(pattern).toBeTruthy();
    const draft = distillPattern(ws, pattern, "sensor.rubric");
    const manifest = readYaml<{ status: string; provenance: { ref: string }[] }>(draft.manifestFile);
    expect(manifest.status).toBe("draft");
    // evidence chain: pattern signature + each originating change
    expect(manifest.provenance.length).toBeGreaterThanOrEqual(4);
    expect(fs.existsSync(draft.contentFile)).toBe(true);
  });
});
