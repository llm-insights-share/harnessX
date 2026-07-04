import { Command } from "commander";
import path from "node:path";
import {
  Workspace,
  traceCheck,
  verifyChange,
  approveFixture,
  verifyFixtures,
  generateTestStubs,
  approveTests,
  syncCheck,
  writeDashboard,
  collectStatus,
  addWaiver,
  readMeta,
  gitChangedFiles,
  lintHarness,
  rebaseCheck,
  recommendProfile,
  applyProfileChoice,
  type RunnerOptions,
  type WaiverRecord
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";
import crypto from "node:crypto";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = (w: Workspace): RunnerOptions => ({ builtins: builtinSensors, changedFiles: gitChangedFiles(w.root) });

export function registerBehaviourCommands(program: Command): void {
  const trace = program.command("trace").description("Traceability (FR-023)");
  trace
    .command("check [change]")
    .option("--all", "check every active change")
    .action((change: string | undefined, opts: { all?: boolean }) => {
      const w = ws();
      const targets = opts.all || !change ? w.listChanges() : [change];
      let failed = false;
      for (const c of targets) {
        const res = traceCheck(w, c);
        console.log(`${c}: ${res.covered} covered, ${res.waived} waived, ${res.uncovered.length} uncovered`);
        for (const u of res.uncovered) console.error(`  UNCOVERED ${u.capability}/${u.requirement} — Scenario: ${u.scenario}`);
        if (!res.passed) failed = true;
      }
      if (failed) process.exit(1);
    });

  program
    .command("verify <change>")
    .description("Run the verification suite + traceability; sets state to verified (FR-008)")
    .action(async (change: string) => {
      const w = ws();
      const res = await verifyChange(w, change, runnerOpts(w));
      for (const b of res.gate.blockers) console.error(`BLOCKER  ${b}`);
      for (const wmsg of res.gate.warnings) console.warn(`warning  ${wmsg}`);
      console.log(res.verified ? "VERIFIED" : "NOT VERIFIED");
      if (!res.verified) process.exit(1);
    });

  const fixture = program.command("fixture").description("Approved fixtures (FR-025)");
  fixture
    .command("approve <file>")
    .requiredOption("--by <name>", "approving human")
    .action((file: string, opts: { by: string }) => {
      const res = approveFixture(ws(), file, opts.by);
      console.log(`approved ${res.file} (${res.hash.slice(0, 12)}) by ${opts.by}`);
    });
  fixture.command("verify").action(() => {
    const violations = verifyFixtures(ws());
    for (const v of violations) console.error(`VIOLATION approved fixture ${v.problem}: ${v.file}`);
    if (violations.length) process.exit(1);
    console.log("all approved fixtures intact");
  });

  const testfirst = program.command("testfirst").description("Test-first workflow for strict profiles (FR-026)");
  testfirst.command("generate <change>").action((change: string) => {
    for (const f of generateTestStubs(ws(), change)) console.log(`wrote ${f}`);
    console.log("Review the stubs, write assertions, then: hx testfirst approve <change> --files <f1,f2> --by <name>");
  });
  testfirst
    .command("approve <change>")
    .requiredOption("--files <list>")
    .requiredOption("--by <name>")
    .action((change: string, opts: { files: string; by: string }) => {
      approveTests(ws(), change, opts.files.split(","), opts.by);
      console.log("approved test files recorded in meta.yaml (hash-locked)");
    });

  program
    .command("sync")
    .description("Detect spec/code drift (FR-010)")
    .action(() => {
      const findings = syncCheck(ws());
      if (!findings.length) {
        console.log("no drift detected");
        return;
      }
      for (const f of findings) {
        console.log(`[${f.kind}] Scenario: ${f.scenario}${f.capability ? ` (${f.capability}/${f.requirement})` : ""}`);
        console.log(`  → ${f.suggestion}`);
      }
      process.exit(1);
    });

  program
    .command("view")
    .description("Render a static HTML dashboard")
    .option("--out <file>", "output file", "harnessx-dashboard.html")
    .action((opts: { out: string }) => {
      console.log(`wrote ${writeDashboard(ws(), path.resolve(process.cwd(), opts.out))}`);
    });

  program.command("status").description("Table of active changes").action(() => {
    for (const r of collectStatus(ws())) {
      console.log(
        `${r.change}\t${r.status}\t${r.profile}\ttasks ${r.tasksDone}/${r.tasksTotal}\tscenarios ${r.scenarios.covered}/${r.scenarios.total}`
      );
    }
  });

  const waiver = program.command("waiver").description("Waivers with expiry (FR-028)");
  waiver
    .command("add <change>")
    .requiredOption("--target <target>", 'e.g. "scenario:idle timeout", "tests:tests/x.test.ts", or a sensor id')
    .requiredOption("--reason <reason>")
    .requiredOption("--requested-by <name>")
    .requiredOption("--approved-by <name>")
    .option("--expires <iso>", "expiry timestamp; default +14 days")
    .action((change: string, opts: { target: string; reason: string; requestedBy: string; approvedBy: string; expires?: string }) => {
      const rec: WaiverRecord = {
        id: crypto.randomUUID().slice(0, 8),
        target: opts.target,
        reason: opts.reason,
        requestedBy: opts.requestedBy,
        approvedBy: opts.approvedBy,
        createdAt: new Date().toISOString(),
        expiresAt: opts.expires ?? new Date(Date.now() + 14 * 86400e3).toISOString()
      };
      addWaiver(ws(), change, rec);
      console.log(`waiver ${rec.id} added for ${rec.target}, expires ${rec.expiresAt}`);
    });
  waiver.command("list <change>").action((change: string) => {
    const meta = readMeta(ws(), change);
    for (const w of meta.waivers) {
      const expired = new Date(w.expiresAt) <= new Date();
      console.log(`${w.id}\t${w.target}\t${expired ? "EXPIRED" : "active"}\tby ${w.approvedBy}\t${w.reason}`);
    }
  });

  const harness = program.command("harness").description("Harness self-checks (FR-034)");
  harness.command("lint").action(() => {
    const conflicts = lintHarness(ws());
    if (!conflicts.length) {
      console.log("no conflicting guide directives found");
      return;
    }
    for (const c of conflicts) {
      console.error(`CONFLICT between "${c.a.guideId}" (${c.a.layer}) and "${c.b.guideId}" (${c.b.layer}):`);
      console.error(`  A: ${c.a.text}`);
      console.error(`  B: ${c.b.text}`);
      console.error(`  → ${c.resolution}`);
    }
    process.exit(1);
  });

  const rebase = program.command("rebase").description("Concurrent-change rebase check (FR-011)");
  rebase.command("check <change>").action((change: string) => {
    const res = rebaseCheck(ws(), change);
    if (res.clean) {
      console.log("deltas apply cleanly against current specs");
      return;
    }
    for (const c of res.conflicts) {
      console.error(`CONFLICT ${c.capability}/"${c.requirement}" (${c.op}): ${c.reason}`);
      console.error(`  → ${c.guidance}`);
    }
    process.exit(1);
  });

  const profile = program.command("profile").description("Scale-adaptive profile recommendation (FR-013)");
  profile
    .command("recommend <change>")
    .option("--diff-lines <n>", "estimated diff size in lines")
    .option("--choose <profile>", "record the chosen profile")
    .option("--override-reason <reason>", "required when choosing below the recommendation")
    .action((change: string, opts: { diffLines?: string; choose?: string; overrideReason?: string }) => {
      const w = ws();
      const meta = readMeta(w, change);
      const rec = recommendProfile(w, {
        domains: meta.touchedDomains,
        estimatedDiffLines: opts.diffLines ? parseInt(opts.diffLines, 10) : undefined
      });
      console.log(`recommended: ${rec.recommended} (score ${rec.score})`);
      for (const r of rec.reasons) console.log(`  - ${r}`);
      if (opts.choose) {
        applyProfileChoice(w, change, rec, opts.choose, opts.overrideReason);
        console.log(`profile set to ${opts.choose}${opts.overrideReason ? ` (override: ${opts.overrideReason})` : ""}`);
      }
    });
}
