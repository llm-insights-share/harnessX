import { Command } from "commander";
import fs from "node:fs";
import { Workspace, scaffoldPrd, listPrdSlugs, runSensor, buildPrdPack, renderContextPack, createWorkOrder, submitWorkOrder } from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = () => ({ builtins: builtinSensors });

function printSensorReport(sensor: string, status: string, summary: string) {
  if (status === "pass") console.log(`PASS  ${sensor}: ${summary}`);
  else {
    console.error(`FAIL  ${sensor}: ${summary}`);
    process.exit(1);
  }
}

export function registerPrdCommands(program: Command): void {
  const prd = program.command("prd").description("Organization-level PRD (pre-phase; prefer hx req prd)");
  registerPrdOnParent(prd, { deprecatedPrefix: "hx prd" });
}

export function registerPrdOnParent(prd: Command, opts?: { deprecatedPrefix?: string }): void {
  const warn = opts?.deprecatedPrefix ? () => console.warn(`[deprecated] ${opts.deprecatedPrefix} — prefer hx req prd`) : () => {};

  prd
    .command("init <slug>")
    .requiredOption("--title <title>", "PRD title")
    .description("Scaffold docs/prd/<slug>.md from prd-template")
    .action((slug: string, opts: { title: string }) => {
      warn();
      console.log(`Wrote ${scaffoldPrd(ws(), slug, opts.title)}`);
    });

  prd
    .command("check <slug>")
    .description("Run prd-complete sensor on docs/prd/<slug>.md")
    .action(async (slug: string) => {
      warn();
      const w = ws();
      const def = w.readHarness().sensors.find((s) => s.id === "prd-complete");
      if (!def) throw new Error("prd-complete sensor not registered in harness.yaml");
      const report = await runSensor(w, def, undefined, { ...runnerOpts(), prdSlug: slug });
      printSensorReport(def.id, report.status, report.summary);
    });

  prd.command("list").action(() => {
    warn();
    for (const s of listPrdSlugs(ws())) console.log(s);
  });

  prd
    .command("submit <slug>")
    .requiredOption("--by <name>", "submitter (product manager)")
    .option("--title <title>", "review title override")
    .description("Create and submit req-review work order for PRD")
    .action((slug: string, opts: { by: string; title?: string }) => {
      warn();
      const w = ws();
      const wo = createWorkOrder(w, {
        type: "req-review",
        title: opts.title ?? `Review PRD ${slug}`,
        scope: "prephase",
        ref: { prd: slug },
        assigneeRole: "tech-manager",
        createdBy: opts.by,
        artifacts: [{ path: `docs/prd/${slug}.md` }]
      });
      submitWorkOrder(w, wo.id, opts.by);
      console.log(`submitted ${wo.id} for PRD "${slug}"`);
    });
}

export function registerPrdGuidePack(guide: Command): void {
  guide
    .command("prd-pack <slug>")
    .option("--out <file>", "write pack to file")
    .action((slug: string, opts: { out?: string }) => {
      const pack = buildPrdPack(ws(), slug);
      const text = renderContextPack(pack);
      if (opts.out) {
        fs.writeFileSync(opts.out, text);
        console.log(`wrote ${opts.out}`);
      } else console.log(text);
    });
}
