import { Command } from "commander";
import fs from "node:fs";
import {
  Workspace,
  aggregatePatterns,
  distillPattern,
  harvestReviews,
  coverageReport,
  addRubricRule,
  recordRubricFeedback,
  janitorRun,
  type ReviewComment
} from "@harnessx/core";

const ws = () => Workspace.locate(process.cwd());

export function registerSteeringCommands(program: Command): void {
  const steer = program.command("steer").description("Steering loop (FR-040/041/042)");

  steer
    .command("report")
    .option("--threshold <n>", "occurrences to flag a pattern", "3")
    .action((opts: { threshold: string }) => {
      const patterns = aggregatePatterns(ws(), parseInt(opts.threshold, 10));
      if (!patterns.length) {
        console.log("failure catalog is empty");
        return;
      }
      for (const p of patterns) {
        console.log(`${p.isPattern ? "PATTERN " : "        "}${p.count}x ${p.signature} (changes: ${p.changes.join(", ") || "-"})`);
      }
    });

  steer
    .command("distill <signature>")
    .option("--kind <kind>", "guide.skill | sensor.rubric", "guide.skill")
    .action((signature: string, opts: { kind: string }) => {
      const patterns = aggregatePatterns(ws());
      const p = patterns.find((x) => x.signature.includes(signature));
      if (!p) throw new Error(`no failure pattern matching "${signature}"`);
      const res = distillPattern(ws(), p, opts.kind as "guide.skill" | "sensor.rubric");
      console.log(`draft asset written: ${res.dir}`);
      console.log("review and promote it via: hx asset promote <id> --to trial");
    });

  steer
    .command("harvest-pr")
    .requiredOption("--from <file>", "JSON file of review comments [{pr,author,body}]")
    .action((opts: { from: string }) => {
      const comments = JSON.parse(fs.readFileSync(opts.from, "utf8")) as ReviewComment[];
      const drafts = harvestReviews(comments);
      if (!drafts.length) {
        console.log("no clusters found (need >=2 comments per topic)");
        return;
      }
      for (const d of drafts) {
        const { rule, file } = addRubricRule(ws(), d.check);
        console.log(`draft rubric rule ${rule.id} (topic: ${d.topic}, ${d.provenance.length} comments) → ${file}`);
      }
    });

  steer.command("coverage").action(() => {
    const rep = coverageReport(ws());
    console.log(`sensor runs: ${rep.metrics.totalSensorRuns}`);
    console.log(`first-attempt pass rate: ${(rep.metrics.firstAttemptPassRate * 100).toFixed(1)}%`);
    console.log(`recurrent patterns (>=3): ${rep.metrics.recurrentPatterns}, uncovered: ${rep.uncoveredPatterns}`);
    for (const p of rep.patterns) {
      console.log(`  ${p.count}x ${p.signature} — covered by: ${p.coveredBy.join(", ") || "(nothing)"}`);
    }
  });

  const rubric = program.command("rubric").description("AI review rubric management");
  rubric
    .command("add <text>")
    .option("--pattern <regex>", "optional deterministic pattern for the heuristic judge")
    .option("--severity <sev>", "block|warn|info", "warn")
    .action((text: string, opts: { pattern?: string; severity: "block" | "warn" | "info" }) => {
      const { file, rule } = addRubricRule(ws(), text, opts);
      console.log(`added ${rule.id} (draft) to ${file}`);
      console.log("promote to trial by editing status once reviewed; trial rules report as info until enforced");
    });
  rubric
    .command("feedback <file> <ruleId>")
    .option("--false-positive", "mark the last finding as a false positive")
    .action((file: string, ruleId: string, opts: { falsePositive?: boolean }) => {
      const rule = recordRubricFeedback(file, ruleId, Boolean(opts.falsePositive));
      const rate = rule.evaluations ? ((rule.falsePositives ?? 0) / rule.evaluations) * 100 : 0;
      console.log(`${rule.id}: ${rule.falsePositives}/${rule.evaluations} false positives (${rate.toFixed(0)}%)`);
    });

  program
    .command("janitor")
    .argument("<action>", "run")
    .description("Scheduled hygiene scan (FR-027)")
    .action((action: string) => {
      if (action !== "run") throw new Error(`unknown janitor action: ${action}`);
      const rep = janitorRun(ws());
      console.log(`expired waivers: ${rep.expiredWaivers.length}`);
      console.log(`drift findings: ${rep.drift.length}`);
      console.log(`dead assets: ${rep.deadAssets.length}`);
      console.log(`report (PR-body ready): ${rep.reportFile}`);
    });
}
