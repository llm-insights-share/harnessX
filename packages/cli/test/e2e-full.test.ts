import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Overall integration test (final acceptance): drives the real `hx` CLI binary
 * through a complete delivery cycle — init → change → propose → author specs →
 * gates → approval → plan → apply (with a self-corrected sensor) → verify →
 * archive — then compiles adapters and renders the dashboard.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hxBin = path.join(repoRoot, "bin", "hx.js");

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hx-e2e-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

function hx(cwd: string, args: string[], opts: { expectFail?: boolean } = {}): string {
  try {
    return execFileSync("node", [hxBin, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    if (opts.expectFail) return `${err.stdout ?? ""}${err.stderr ?? ""}`;
    throw new Error(`hx ${args.join(" ")} failed (${err.status}):\n${err.stdout}\n${err.stderr}`);
  }
}

const GOOD_DELTA = `## ADDED Requirements

### Requirement: Session expiry
WHEN a session is idle for 30 minutes, THE SYSTEM SHALL invalidate the session token.

#### Scenario: idle timeout
- GIVEN a logged-in user
- WHEN 30 minutes pass
- THEN the next request returns 401
`;

describe("overall verification: full delivery cycle through the CLI", () => {
  it("can seed and directly submit a hub repository", () => {
    const repo = makeRepo();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), "hx-hub-remote-"));
    execFileSync("git", ["init", "--bare", "-q"], { cwd: remote });

    const out = hx(repo, [
      "hub",
      "seed",
      "./harness-hub",
      "--submit",
      "--remote",
      remote,
      "--branch",
      "main",
      "--message",
      "seeded via cli"
    ]);
    expect(out).toContain("Seeded");
    expect(out).toContain("Submitted");

    const hubDir = path.join(repo, "harness-hub");
    const latest = execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: hubDir, encoding: "utf8" }).trim();
    expect(latest).toBe("seeded via cli");
    const remoteOrigin = execFileSync("git", ["remote", "get-url", "origin"], { cwd: hubDir, encoding: "utf8" }).trim();
    expect(remoteOrigin).toBe(remote);
    const remoteHeads = execFileSync("git", ["ls-remote", "--heads", "origin", "main"], { cwd: hubDir, encoding: "utf8" }).trim();
    expect(remoteHeads).toContain("refs/heads/main");
  });

  it("fails seed submit when remote is missing", () => {
    const repo = makeRepo();
    const out = hx(repo, ["hub", "seed", "./harness-hub", "--submit"], { expectFail: true });
    expect(out).toContain("--remote <git-url> is required when --submit is enabled");
  });

  it("runs init → propose → gates → plan → apply → verify → archive end-to-end", () => {
    const repo = makeRepo();
    const hxDir = path.join(repo, "harnessX");

    // init + enforcement scaffolding
    expect(hx(repo, ["init"])).toContain("Initialized");
    expect(hx(repo, ["hooks", "install"])).toContain("pre-commit");
    hx(repo, ["ci", "init"]);
    expect(fs.existsSync(path.join(repo, ".github/workflows/harness-verify.yml"))).toBe(true);

    // change + propose
    hx(repo, ["change", "create", "session-expiry", "--domains", "auth"]);
    hx(repo, ["propose", "session-expiry", "--title", "Session expiry"]);

    // placeholder delta must be blocked by the design gate (spec-validate not needed — proposal placeholder check)
    const blocked = hx(repo, ["gate", "check", "session-expiry", "--phase", "spec"], { expectFail: true });
    expect(blocked).toContain("GATE BLOCKED");

    // author the real artifacts
    const proposal = path.join(hxDir, "changes/session-expiry/proposal.md");
    fs.writeFileSync(proposal, fs.readFileSync(proposal, "utf8").replace("{{title}}", "Session expiry"));
    fs.writeFileSync(path.join(hxDir, "changes/session-expiry/specs/auth/spec.md"), GOOD_DELTA);

    // advance: design → spec
    expect(hx(repo, ["gate", "advance", "session-expiry"])).toContain("designed");
    expect(hx(repo, ["gate", "advance", "session-expiry"])).toContain("specified");

    // human approval gate blocks plan until approved (FR-012)
    const noApproval = hx(repo, ["gate", "advance", "session-expiry"], { expectFail: true });
    expect(noApproval).toContain("human approval");
    hx(repo, ["gate", "approve", "session-expiry", "--gate", "spec", "--approver", "alice"]);

    // plan + advance to planned
    expect(hx(repo, ["plan", "session-expiry"])).toContain("2 tasks");
    expect(hx(repo, ["gate", "advance", "session-expiry"])).toContain("planned");

    // apply: runner writes the test covering the scenario on first task
    const testFile = path.join(repo, "tests", "auth.test.ts");
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    const runner = `node -e "require('fs').writeFileSync('${testFile.replaceAll("\\", "/")}', 'import { it } from \\"vitest\\";\\nit(\\"Scenario: idle timeout\\", () => {});\\n')"`;
    const applyOut = hx(repo, ["apply", "session-expiry", "--runner", runner]);
    expect(applyOut).toContain("completed tasks: 01a, 01b");

    // verify → verified
    expect(hx(repo, ["verify", "session-expiry"])).toContain("VERIFIED");
    expect(hx(repo, ["meta", "verify", "session-expiry"])).toContain("ok");

    // archive merges the delta into main specs
    expect(hx(repo, ["archive", "session-expiry"])).toContain("Merged capabilities: auth");
    const mainSpec = fs.readFileSync(path.join(hxDir, "specs/auth/spec.md"), "utf8");
    expect(mainSpec).toContain("### Requirement: Session expiry");
    expect(fs.existsSync(path.join(hxDir, "changes/session-expiry"))).toBe(false);
    const archived = fs.readdirSync(path.join(hxDir, "archive"));
    expect(archived.some((d) => d.endsWith("session-expiry"))).toBe(true);

    // post-delivery surfaces: adapters, dashboard, steering, lock
    hx(repo, ["adapter", "sync"]);
    expect(fs.existsSync(path.join(repo, ".cursor/rules/harnessx.mdc"))).toBe(true);
    expect(fs.existsSync(path.join(repo, ".trae/rules/project_rules.md"))).toBe(true);
    expect(fs.existsSync(path.join(repo, ".qoder/rules/harnessx.md"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "AGENTS.md"))).toBe(true);

    hx(repo, ["view", "--out", "dash.html"]);
    expect(fs.readFileSync(path.join(repo, "dash.html"), "utf8")).toContain("HarnessX");

    hx(repo, ["lock", "write"]);
    expect(hx(repo, ["lock", "verify"])).toContain("verified");

    const steer = hx(repo, ["steer", "coverage"]);
    expect(steer).toContain("first-attempt pass rate");
  }, 120000);

  it("fail-closed: a crashing custom sensor blocks the gate and CI replay catches tampering", () => {
    const repo = makeRepo();
    hx(repo, ["init"]);
    hx(repo, ["change", "create", "risky", "--domains", "core"]);
    hx(repo, ["propose", "risky", "--title", "Risky"]);

    // register a crashing sensor into the apply suite
    const harnessFile = path.join(repo, "harnessX/harness.yaml");
    let doc = fs.readFileSync(harnessFile, "utf8");
    doc = doc.replace(/fast: \[[^\]]+\]/, (m) => m.replace("]", ", crasher]"));
    doc = doc.replace(
      "sensors:",
      `sensors:\n  - id: crasher\n    kind: sensor.script\n    execution: computational\n    run: "exit 99"\n    on_fail: block\n`
    );
    fs.writeFileSync(harnessFile, doc);
    fs.writeFileSync(path.join(repo, "harnessX/changes/risky/tasks.md"), "- [ ] 01a [test] (core / Requirement: R) t\n");

    const out = hx(repo, ["gate", "check", "risky", "--phase", "apply"], { expectFail: true });
    expect(out).toContain("GATE BLOCKED");
    expect(out).toContain("crasher");

    // tamper meta.yaml by hand → meta verify fails (CI replay, FR-050/051)
    const metaFile = path.join(repo, "harnessX/changes/risky/meta.yaml");
    fs.writeFileSync(metaFile, fs.readFileSync(metaFile, "utf8").replace("status: proposed", "status: verified"));
    const metaOut = hx(repo, ["meta", "verify", "risky"], { expectFail: true });
    expect(metaOut).toContain("TAMPERED");
  }, 120000);
});
