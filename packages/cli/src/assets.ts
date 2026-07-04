import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  Workspace,
  resolveAssets,
  promoteAsset,
  backfillMetrics,
  writeLock,
  verifyLock,
  hubAdd,
  hubSync,
  hubPromote,
  hubApproveReview,
  scanAssetDir,
  dispatchFileSave,
  runScheduled,
  startWatcher,
  buildFixPack,
  loadAssetDir,
  type AssetStatus
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";
import { compileAdapters, adapterDrift, availableTargets, exportQoderQuest, TARGETS, computeTier } from "@harnessx/adapters";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = () => ({ builtins: builtinSensors });

export function registerAssetCommands(program: Command): void {
  const asset = program.command("asset").description("Control asset model (§11)");
  asset.command("list").option("--change <id>").action((opts: { change?: string }) => {
    const res = resolveAssets(ws(), { changeId: opts.change });
    for (const [id, a] of res.resolved) {
      console.log(`${id}\t${a.manifest.kind}\t${a.manifest.status}\t${a.layer}\tv${a.manifest.version}`);
    }
    for (const p of res.problems) console.warn(`warning: ${p}`);
  });
  asset
    .command("promote <dir>")
    .requiredOption("--to <status>", "trial | enforced | deprecated")
    .action((dir: string, opts: { to: string }) => {
      const m = promoteAsset(path.resolve(dir), opts.to as AssetStatus);
      console.log(`${m.id} → ${m.status}`);
    });
  asset.command("backfill <dir>").action((dir: string) => {
    const a = loadAssetDir(path.resolve(dir), "local");
    if (!a) throw new Error("no asset.yaml found");
    const m = backfillMetrics(ws(), a);
    console.log(`metrics: runs=${m.metrics["runs"]}, failures=${m.metrics["failures"]}`);
  });
  asset.command("scan <dir>").description("Injection scan of guide content (NFR-009)").action((dir: string) => {
    const findings = scanAssetDir(path.resolve(dir));
    for (const f of findings) console.error(`INJECTION ${f}`);
    if (findings.length) process.exit(1);
    console.log("no injection patterns found");
  });

  const lock = program.command("lock").description("harness.lock (§11.2 / NFR-009)");
  lock.command("write").action(() => {
    const l = writeLock(ws());
    console.log(`locked ${Object.keys(l.assets).length} asset(s)`);
  });
  lock.command("verify").action(() => {
    const res = verifyLock(ws());
    for (const p of res.problems) console.error(`LOCK ${p}`);
    if (!res.ok) process.exit(1);
    console.log("harness.lock verified");
  });

  const hub = program.command("hub").description("Harness Hub (§11.5)");
  hub
    .command("add <pkg>")
    .requiredOption("--hub <path>", "hub repo path")
    .action((pkg: string, opts: { hub: string }) => {
      const [id, version] = pkg.split("@");
      if (!version) throw new Error("use <id>@<version>");
      const res = hubAdd(ws(), path.resolve(opts.hub), { id, version });
      console.log(`installed ${id}@${version} → ${res.dir}`);
      console.log("run hx lock write to pin it");
    });
  hub
    .command("sync")
    .requiredOption("--hub <path>")
    .action((opts: { hub: string }) => {
      for (const e of hubSync(ws(), path.resolve(opts.hub))) {
        console.log(`${e.id}\tinstalled ${e.installed}\tlatest ${e.latest}\t${e.state}`);
      }
    });
  hub
    .command("promote <dir>")
    .requiredOption("--hub <path>")
    .requiredOption("--by <name>")
    .option("--evidence <ref>", "metrics/report evidencing the asset's value")
    .action((dir: string, opts: { hub: string; by: string; evidence?: string }) => {
      const res = hubPromote(ws(), path.resolve(opts.hub), path.resolve(dir), { publishedBy: opts.by, evidence: opts.evidence });
      console.log(`published to ${res.dest} (review pending)`);
    });
  hub
    .command("approve <pkg>")
    .requiredOption("--hub <path>")
    .requiredOption("--reviewer <name>")
    .action((pkg: string, opts: { hub: string; reviewer: string }) => {
      const [id, version] = pkg.split("@");
      hubApproveReview(path.resolve(opts.hub), id, version, opts.reviewer);
      console.log(`${pkg} review approved by ${opts.reviewer}`);
    });

  const adapter = program.command("adapter").description("Single-source adapter compilation (FR-032/033)");
  adapter
    .command("sync")
    .option("--targets <list>", "comma-separated targets", "cursor,trae,qoder,claude,generic")
    .action((opts: { targets: string }) => {
      const results = compileAdapters(ws(), opts.targets.split(","));
      for (const r of results) {
        console.log(`${r.target} (Tier ${r.tier}): ${r.files.length} file(s)`);
        for (const f of r.files) console.log(`  + ${f}`);
      }
    });
  adapter.command("targets").action(() => {
    for (const t of availableTargets()) {
      const spec = TARGETS[t];
      const caps = Object.entries(spec.capabilities).filter(([, v]) => v).map(([k]) => k);
      console.log(`${t}\tTier ${computeTier(spec.capabilities)}\t${caps.join(",")}`);
    }
  });
  adapter
    .command("drift")
    .option("--targets <list>", "targets to check", "cursor,trae,qoder,claude,generic")
    .action((opts: { targets: string }) => {
      const w = ws();
      const results = compileAdapters(w, []); // no writes
      void results;
      // check known output roots
      const candidates: string[] = [];
      const collect = (dir: string) => {
        const abs = path.join(w.root, dir);
        if (!fs.existsSync(abs)) return;
        const visit = (d: string) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) visit(p);
            else candidates.push(path.relative(w.root, p));
          }
        };
        visit(abs);
      };
      for (const dir of [".cursor", ".trae", ".qoder", ".claude"]) collect(dir);
      for (const f of ["CLAUDE.md", "AGENTS.md"]) if (fs.existsSync(path.join(w.root, f))) candidates.push(f);
      const drift = adapterDrift(w, candidates);
      for (const d of drift) console.error(`DRIFT ${d.file}: ${d.state}`);
      if (drift.length) process.exit(1);
      console.log("no adapter drift");
    });
  adapter.command("quest <change>").description("Export a Qoder Quest spec from delta specs + tasks (T-607)").action((change: string) => {
    console.log(`wrote ${exportQoderQuest(ws(), change)}`);
  });

  program
    .command("watch")
    .description("file-save trigger daemon (FR-027)")
    .action(() => {
      const w = ws();
      console.log("watching for file-save triggered sensors (ctrl-c to stop)");
      startWatcher(w, runnerOpts(), (file, reports) => {
        for (const r of reports) console.log(`[${r.status}] ${r.sensor} ← ${file}: ${r.summary}`);
      });
    });

  program
    .command("schedule")
    .argument("<action>", "run")
    .description("Run trigger:schedule sensors (CI cron entry, FR-027)")
    .action(async (action: string) => {
      if (action !== "run") throw new Error(`unknown schedule action: ${action}`);
      const reports = await runScheduled(ws(), runnerOpts());
      for (const r of reports) console.log(`[${r.status}] ${r.sensor}: ${r.summary}`);
      if (reports.some((r) => r.status !== "pass")) process.exit(1);
    });

  program
    .command("fix")
    .requiredOption("--change <id>")
    .requiredOption("--sensor <id>")
    .option("--runner <cmd>", "launch a fix session command with HX_FIX_PACK env")
    .description("Build a fix Context Pack from the last failing sensor report (T-611)")
    .action((opts: { change: string; sensor: string; runner?: string }) => {
      const pack = buildFixPack(ws(), opts.change, opts.sensor);
      console.log(`fix pack: ${pack.file} (${pack.findings} finding(s))`);
      if (opts.runner) {
        const r = spawnSync(opts.runner, { shell: true, stdio: "inherit", env: { ...process.env, HX_FIX_PACK: pack.file } });
        process.exit(r.status ?? 0);
      }
    });
}
