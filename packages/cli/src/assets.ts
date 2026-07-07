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
  hubSyncApply,
  hubPromote,
  hubApproveReview,
  hubAssetInfo,
  hubSetAssetStatus,
  requestHubReview,
  approveHubReview,
  rejectHubReview,
  hubGovernanceReport,
  gcHubRemoteCache,
  seedGoldenHub,
  listGoldenHubPackages,
  listGoldenHubBundles,
  listHubBundles,
  hubEvalPackage,
  hubEvalLocal,
  hubEvalGoldenRepo,
  writeHubEvalReport,
  scanAssetDir,
  searchHubCatalog,
  writeHubIndex,
  resolveHubSource,
  dispatchFileSave,
  runScheduled,
  startWatcher,
  buildFixPack,
  loadAssetDir,
  ensureDir,
  type AssetStatus
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";
import { compileAdapters, adapterDrift, availableTargets, exportQoderQuest, TARGETS, computeTier } from "@harnessx/adapters";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = () => ({ builtins: builtinSensors });

interface SeedSubmitOptions {
  submit?: boolean;
  remote?: string;
  branch: string;
  message: string;
}

function runGitOrThrow(cwd: string, args: string[], action: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if ((r.status ?? 1) !== 0) throw new Error(`failed to ${action}: git ${args.join(" ")}${out ? `\n${out}` : ""}`);
  return out;
}

function submitSeededHub(target: string, opts: SeedSubmitOptions): void {
  if (!opts.submit) return;
  if (!opts.remote) throw new Error("--remote <git-url> is required when --submit is enabled");

  const gitDir = path.join(target, ".git");
  if (!fs.existsSync(gitDir)) runGitOrThrow(target, ["init"], "initialize git repository");

  const remoteExists = spawnSync("git", ["remote", "get-url", "origin"], { cwd: target, encoding: "utf8" });
  if ((remoteExists.status ?? 1) === 0) {
    const existing = (remoteExists.stdout ?? "").trim();
    if (existing !== opts.remote) {
      throw new Error(`origin already exists with a different URL (${existing}); expected ${opts.remote}`);
    }
  } else {
    runGitOrThrow(target, ["remote", "add", "origin", opts.remote], "add origin remote");
  }

  runGitOrThrow(target, ["add", "."], "stage seeded hub files");
  const commit = spawnSync("git", ["commit", "-m", opts.message], { cwd: target, encoding: "utf8" });
  if ((commit.status ?? 1) !== 0) {
    const out = `${commit.stdout ?? ""}${commit.stderr ?? ""}`;
    if (!/nothing to commit|no changes added/i.test(out)) {
      throw new Error(`failed to create commit${out.trim() ? `\n${out.trim()}` : ""}`);
    }
  }

  runGitOrThrow(target, ["branch", "-M", opts.branch], "set default branch");
  runGitOrThrow(target, ["push", "-u", "origin", opts.branch], "push branch to origin");
}

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
  hub.command("golden").description("List built-in golden hub packages").action(() => {
    for (const p of listGoldenHubPackages()) console.log(`package\t${p.id}@${p.version}`);
    for (const p of listGoldenHubBundles()) console.log(`bundle\t${p.id}@${p.version}`);
  });
  hub
    .command("seed [path]")
    .description("Create a hub repo from built-in golden packages (pre-approved)")
    .option("--submit", "commit and push seeded hub to a git remote")
    .option("--remote <git-url>", "remote repository URL used with --submit")
    .option("--branch <name>", "remote branch name (default: main)", "main")
    .option("--message <text>", "commit message used with --submit", "seed hub packages")
    .action((hubPath: string | undefined, opts: SeedSubmitOptions) => {
      const target = path.resolve(hubPath ?? "harness-hub");
      ensureDir(target);
      const pkgs = seedGoldenHub(target);
      console.log(`Seeded ${target} with ${pkgs.length} package(s):`);
      for (const p of pkgs) console.log(`  ${p.id}@${p.version}`);
      submitSeededHub(target, opts);
      if (opts.submit) console.log(`Submitted ${target} to ${opts.remote} (${opts.branch})`);
    });
  hub
    .command("add <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .action((pkg: string, opts: { hub: string }) => {
      const [id, version] = pkg.split("@");
      if (!version) throw new Error("use <id>@<version>");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true });
      const res = hubAdd(ws(), hubRoot, { id, version });
      console.log(`installed ${id}@${version} → ${res.dir}`);
      console.log("run hx lock write to pin it");
    });
  hub
    .command("sync")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .option("--apply", "apply upstream updates with three-way merge")
    .option("--force", "apply merges even when conflicts occur")
    .option("--offline", "use local hub cache without remote fetch")
    .option("--refresh", "force refresh remote cache before operation")
    .option("--only <ids>", "comma-separated package ids to sync")
    .action((opts: { hub: string; apply?: boolean; force?: boolean; only?: string; offline?: boolean; refresh?: boolean }) => {
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, offline: opts.offline, refresh: opts.refresh });
      if (opts.apply) {
        const only = opts.only?.split(",").map((s) => s.trim()).filter(Boolean);
        for (const r of hubSyncApply(ws(), hubRoot, { force: opts.force, only })) {
          const conflicts = r.conflicts?.length ? ` conflicts: ${r.conflicts.join(", ")}` : "";
          console.log(`${r.id}\t${r.action}\t${r.detail ?? ""}${r.toVersion ? ` → ${r.toVersion}` : ""}${conflicts}`);
        }
        console.log("run hx lock write to refresh harness.lock");
        return;
      }
      for (const e of hubSync(ws(), hubRoot)) {
        console.log(`${e.id}\tinstalled ${e.installed}\tlatest ${e.latest}\t${e.state}`);
      }
    });
  hub
    .command("promote <dir>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .requiredOption("--by <name>")
    .option("--evidence <ref>", "metrics/report evidencing the asset's value")
    .option("--skip-policy", "skip policy check before publish")
    .action((dir: string, opts: { hub: string; by: string; evidence?: string; skipPolicy?: boolean }) => {
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true });
      if (!opts.skipPolicy) {
        const report = hubGovernanceReport(hubRoot);
        if (!report.ok) {
          const first = report.issues.find((i) => i.severity === "error");
          throw new Error(`hub policy check failed before promote: ${first?.asset} ${first?.message}`);
        }
      }
      const res = hubPromote(ws(), hubRoot, path.resolve(dir), { publishedBy: opts.by, evidence: opts.evidence });
      console.log(`published to ${res.dest} (review pending)`);
    });
  hub
    .command("approve <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .requiredOption("--reviewer <name>")
    .action((pkg: string, opts: { hub: string; reviewer: string }) => {
      const [id, version] = pkg.split("@");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true });
      hubApproveReview(hubRoot, id, version, opts.reviewer);
      console.log(`${pkg} review approved by ${opts.reviewer}`);
    });
  hub
    .command("eval <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .option("--local <dir>", "evaluate a local asset directory instead of a hub package")
    .option("--golden <name>", "evaluate a golden-repo eval set")
    .option("--out <file>", "write eval report json")
    .action((pkg: string, opts: { hub: string; local?: string; golden?: string; out?: string }) => {
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true });
      if (opts.golden) {
        const res = hubEvalGoldenRepo(hubRoot, opts.golden);
        for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
        if (opts.out) console.log(`report\t${writeHubEvalReport(path.resolve(opts.out), res)}`);
        if (!res.passed) process.exit(1);
        return;
      }
      if (opts.local) {
        const res = hubEvalLocal(path.resolve(opts.local));
        for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
        if (opts.out) console.log(`report\t${writeHubEvalReport(path.resolve(opts.out), res)}`);
        if (!res.passed) process.exit(1);
        return;
      }
      const [id, version] = pkg.split("@");
      if (!version) throw new Error("use <id>@<version>");
      const res = hubEvalPackage(hubRoot, { id, version });
      for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
      if (opts.out) console.log(`report\t${writeHubEvalReport(path.resolve(opts.out), res)}`);
      if (!res.passed) process.exit(1);
    });
  hub
    .command("search [query]")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .option("--kind <kind>", "filter by asset kind")
    .option("--phase <phase>", "filter by phase")
    .option("--category <cat>", "package | bundle | blueprint")
    .option("--index", "write hub index.json")
    .action((query: string | undefined, opts: { hub: string; kind?: string; phase?: string; category?: string; index?: boolean }) => {
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true });
      if (opts.index) {
        console.log(`wrote ${writeHubIndex(hubRoot)}`);
        return;
      }
      const results = searchHubCatalog(hubRoot, {
        query,
        kind: opts.kind,
        phase: opts.phase,
        category: opts.category as "package" | "bundle" | "blueprint" | undefined
      });
      for (const e of results) {
        console.log(`${e.category}\t${e.id}@${e.version}\t${e.kind}\t${e.description ?? ""}`);
      }
    });

  hub
    .command("catalog")
    .argument("<action>", "rebuild")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .action((action: string, opts: { hub: string }) => {
      if (action !== "rebuild") throw new Error(`unknown hub catalog action: ${action}`);
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, refresh: true });
      console.log(`wrote ${writeHubIndex(hubRoot)}`);
    });

  const hubAsset = hub.command("asset").description("Hub asset lifecycle management");
  hubAsset
    .command("info <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .action((pkg: string, opts: { hub: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true });
      const info = hubAssetInfo(hubRoot, { id, version });
      console.log(JSON.stringify(info, null, 2));
    });
  hubAsset
    .command("promote <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .requiredOption("--to <status>", "draft | trial | enforced | deprecated | archived")
    .action((pkg: string, opts: { hub: string; to: "draft" | "trial" | "enforced" | "deprecated" | "archived" }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, refresh: true });
      const meta = hubSetAssetStatus(hubRoot, { id, version }, opts.to);
      console.log(`${pkg} -> ${meta.status}`);
    });
  hubAsset
    .command("deprecate <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .requiredOption("--reason <text>", "deprecation reason")
    .action((pkg: string, opts: { hub: string; reason: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, refresh: true });
      const meta = hubSetAssetStatus(hubRoot, { id, version }, "deprecated");
      console.log(`${pkg} -> ${meta.status} (${opts.reason})`);
    });

  const hubReviewCmd = hub.command("review").description("Hub review workflow");
  hubReviewCmd
    .command("request <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .requiredOption("--by <name>", "requestor")
    .action((pkg: string, opts: { hub: string; by: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, refresh: true });
      const info = hubAssetInfo(hubRoot, { id, version });
      const rec = requestHubReview(info.dir, opts.by);
      console.log(`${pkg}\t${rec.status}\trequested by ${opts.by}`);
    });
  hubReviewCmd
    .command("approve <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .requiredOption("--reviewer <name>", "reviewer")
    .action((pkg: string, opts: { hub: string; reviewer: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, refresh: true });
      const info = hubAssetInfo(hubRoot, { id, version });
      const rec = approveHubReview(info.dir, opts.reviewer);
      console.log(`${pkg}\t${rec.status}\tapproved by ${opts.reviewer}`);
    });
  hubReviewCmd
    .command("reject <pkg>")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .requiredOption("--reviewer <name>", "reviewer")
    .requiredOption("--reason <text>", "rejection reason")
    .action((pkg: string, opts: { hub: string; reviewer: string; reason: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, refresh: true });
      const info = hubAssetInfo(hubRoot, { id, version });
      const rec = rejectHubReview(info.dir, opts.reviewer, opts.reason);
      console.log(`${pkg}\t${rec.status}\trejected by ${opts.reviewer}: ${opts.reason}`);
    });

  hub
    .command("policy")
    .argument("<action>", "check")
    .requiredOption("--hub <path>", "hub source (local path or GitHub URL)")
    .option("--strict", "fail on warnings")
    .action((action: string, opts: { hub: string; strict?: boolean }) => {
      if (action !== "check") throw new Error(`unknown hub policy action: ${action}`);
      const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true, refresh: true });
      const report = hubGovernanceReport(hubRoot);
      for (const i of report.issues) {
        const label = i.severity === "error" ? "ERROR" : "WARN";
        console.error(`${label}\t${i.asset}\t${i.message}`);
      }
      const hasWarn = report.issues.some((i) => i.severity === "warn");
      if (!report.ok || (opts.strict && hasWarn)) process.exit(1);
      console.log("hub policy check passed");
    });

  const cache = hub.command("cache").description("Remote hub cache operations");
  cache
    .command("gc")
    .option("--older-than-days <n>", "remove cache entries older than N days", "30")
    .action((opts: { olderThanDays: string }) => {
      const removed = gcHubRemoteCache(process.cwd(), parseInt(opts.olderThanDays, 10) * 24 * 3600_000);
      console.log(`removed ${removed.length} cache entr${removed.length === 1 ? "y" : "ies"}`);
      for (const d of removed) console.log(`  ${d}`);
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
