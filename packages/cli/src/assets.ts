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
  listGoldenHubBlueprints,
  listHubBundles,
  listHubEvalSets,
  hubEvalAsset,
  hubEvalLocal,
  hubEvalGoldenRepo,
  writeHubEvalReport,
  scanAssetDir,
  searchHubCatalog,
  writeHubIndex,
  resolveHubContext,
  assertHubAction,
  readHubConnection,
  hubSubmit,
  listHubContributions,
  hubAcceptContribution,
  hubRejectContribution,
  hubContributionInfo,
  parseContributionRef,
  contributionRefKey,
  readHubRepoPolicy,
  hubGitPush,
  loadAssetDir,
  ensureDir,
  type AssetStatus,
  type HubAction
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";
import { compileAdapters, adapterDrift, availableTargets, exportQoderQuest, TARGETS, computeTier } from "@harnessx/adapters";
import { dispatchFileSave, runScheduled, startWatcher, buildFixPack } from "@harnessx/core";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = () => ({ builtins: builtinSensors });

interface HubCliBase {
  hub?: string;
  actor?: string;
  offline?: boolean;
  refresh?: boolean;
}

function hubCtx(opts: HubCliBase, action: HubAction, requireHub = true) {
  const workspace = ws();
  if (requireHub) {
    const { hubRoot, connection, actor } = resolveHubContext(workspace, {
      hubRef: opts.hub,
      offline: opts.offline,
      refresh: opts.refresh,
      action
    });
    const policy = readHubRepoPolicy(hubRoot);
    const requireApproved = connection?.role === "consumer" && policy.installRequiresApproval;
    return { workspace, hubRoot, connection, actor: opts.actor ?? actor, requireApproved };
  }
  assertHubAction(workspace, action);
  const connection = readHubConnection(workspace);
  return { workspace, hubRoot: "", connection, actor: opts.actor ?? "", requireApproved: false };
}

interface SeedSubmitOptions {
  submit?: boolean;
  remote?: string;
  branch: string;
  message: string;
}

function gitConfigValue(cwd: string, key: string): string | null {
  const r = spawnSync("git", ["config", "--get", key], { cwd, encoding: "utf8" });
  if ((r.status ?? 1) !== 0) return null;
  const value = (r.stdout ?? "").trim();
  return value || null;
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
  const gitName = gitConfigValue(target, "user.name");
  const gitEmail = gitConfigValue(target, "user.email");
  const commitArgs = ["commit", "-m", opts.message];
  if (!gitName) commitArgs.unshift("-c", "user.name=HarnessX Seed Bot");
  if (!gitEmail) commitArgs.unshift("-c", "user.email=harnessx-seed-bot@local");
  const commit = spawnSync("git", commitArgs, { cwd: target, encoding: "utf8" });
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
    hubCtx({}, "hub.golden", false);
    for (const p of listGoldenHubPackages()) console.log(`package\t${p.id}@${p.version}`);
    for (const p of listGoldenHubBundles()) console.log(`bundle\t${p.id}@${p.version}`);
    for (const p of listGoldenHubBlueprints()) console.log(`blueprint\t${p.id}@${p.version}`);
  });
  hub
    .command("seed [path]")
    .description("Create a hub repo from built-in golden packages (pre-approved)")
    .option("--submit", "commit and push seeded hub to a git remote")
    .option("--remote <git-url>", "remote repository URL used with --submit")
    .option("--branch <name>", "remote branch name (default: main)", "main")
    .option("--message <text>", "commit message used with --submit", "seed hub packages")
    .action((hubPath: string | undefined, opts: SeedSubmitOptions) => {
      hubCtx({}, "hub.seed", false);
      const target = path.resolve(hubPath ?? "harness-hub");
      ensureDir(target);
      const pkgs = seedGoldenHub(target);
      console.log(`Seeded ${target} with ${pkgs.length} asset(s):`);
      for (const p of pkgs) console.log(`  ${p.id}@${p.version}`);
      submitSeededHub(target, opts);
      if (opts.submit) console.log(`Submitted ${target} to ${opts.remote} (${opts.branch})`);
    });
  hub
    .command("add <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((pkg: string, opts: { hub?: string }) => {
      const { workspace, hubRoot, requireApproved } = hubCtx(opts, "hub.add");
      const [id, version] = pkg.split("@");
      if (!version) throw new Error("use <id>@<version>");
      const res = hubAdd(workspace, hubRoot, { id, version }, { requireApproved });
      console.log(`installed ${id}@${version} → ${res.dir}`);
      console.log("run hx lock write to pin it");
    });
  hub
    .command("sync")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--apply", "apply upstream updates with three-way merge")
    .option("--force", "apply merges even when conflicts occur")
    .option("--offline", "use local hub cache without remote fetch")
    .option("--refresh", "force refresh remote cache before operation")
    .option("--only <ids>", "comma-separated package ids to sync")
    .action((opts: { hub?: string; apply?: boolean; force?: boolean; only?: string; offline?: boolean; refresh?: boolean }) => {
      const { workspace, hubRoot } = hubCtx(opts, "hub.sync");
      if (opts.apply) {
        const only = opts.only?.split(",").map((s) => s.trim()).filter(Boolean);
        for (const r of hubSyncApply(workspace, hubRoot, { force: opts.force, only })) {
          const conflicts = r.conflicts?.length ? ` conflicts: ${r.conflicts.join(", ")}` : "";
          console.log(`${r.id}\t${r.action}\t${r.detail ?? ""}${r.toVersion ? ` → ${r.toVersion}` : ""}${conflicts}`);
        }
        console.log("run hx lock write to refresh harness.lock");
        return;
      }
      for (const e of hubSync(workspace, hubRoot)) {
        console.log(`${e.id}\tinstalled ${e.installed}\tlatest ${e.latest}\t${e.state}`);
      }
    });
  hub
    .command("promote <dir>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--by <name>")
    .option("--evidence <ref>", "metrics/report evidencing the asset's value")
    .option("--skip-policy", "skip policy check before publish")
    .option("--skip-eval", "skip pre-publish hub eval")
    .action((dir: string, opts: { hub?: string; by: string; evidence?: string; skipPolicy?: boolean; skipEval?: boolean }) => {
      const { workspace, hubRoot } = hubCtx(opts, "hub.promote");
      if (!opts.skipPolicy) {
        const report = hubGovernanceReport(hubRoot);
        if (!report.ok) {
          const first = report.issues.find((i) => i.severity === "error");
          throw new Error(`hub policy check failed before promote: ${first?.asset} ${first?.message}`);
        }
      }
      const res = hubPromote(workspace, hubRoot, path.resolve(dir), {
        publishedBy: opts.by,
        evidence: opts.evidence,
        skipEval: opts.skipEval
      });
      console.log(`published to ${res.dest} (review pending)`);
    });
  hub
    .command("submit <dir>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--evidence <ref>", "metrics/report evidencing the asset's value")
    .option("--actor <name>", "submitter identity (defaults to config hub.actor)")
    .option("--skip-eval", "skip pre-submit hub eval")
    .action((dir: string, opts: { hub?: string; evidence?: string; actor?: string; skipEval?: boolean }) => {
      const { workspace, hubRoot, actor } = hubCtx(opts, "hub.submit");
      const res = hubSubmit(workspace, hubRoot, path.resolve(dir), {
        actor,
        evidence: opts.evidence,
        skipEval: opts.skipEval
      });
      console.log(`submitted to ${res.dest} (pending maintainer review)`);
    });
  hub
    .command("push")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--message <text>", "commit message", "chore: hub update")
    .option("--branch <name>", "remote branch to push")
    .action((opts: { hub?: string; message?: string; branch?: string }) => {
      const { hubRoot } = hubCtx(opts, "hub.push");
      const result = hubGitPush(hubRoot, { message: opts.message ?? "chore: hub update", branch: opts.branch });
      console.log(`push complete (committed=${result.committed}, pushed=${result.pushed})`);
    });
  hub
    .command("approve <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>")
    .action((pkg: string, opts: { hub?: string; reviewer: string }) => {
      const [id, version] = pkg.split("@");
      const { hubRoot } = hubCtx(opts, "hub.review");
      hubApproveReview(hubRoot, id!, version!, opts.reviewer);
      console.log(`${pkg} review approved by ${opts.reviewer}`);
    });
  hub
    .command("eval [pkg]")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--local <dir>", "evaluate a local asset directory instead of a hub package")
    .option("--golden <name>", "evaluate a golden-repo eval set")
    .option("--list", "list golden eval sets in hub")
    .option("--out <file>", "write eval report json")
    .action((pkg: string | undefined, opts: { hub?: string; local?: string; golden?: string; list?: boolean; out?: string }) => {
      if (opts.local) {
        const res = hubEvalLocal(path.resolve(opts.local));
        for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
        if (opts.out) console.log(`report\t${writeHubEvalReport(path.resolve(opts.out), res)}`);
        if (!res.passed) process.exit(1);
        return;
      }
      const { hubRoot } = hubCtx(opts, "hub.eval");
      if (opts.list) {
        for (const name of listHubEvalSets(hubRoot)) console.log(name);
        return;
      }
      if (opts.golden) {
        const res = hubEvalGoldenRepo(hubRoot, opts.golden);
        for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
        if (opts.out) console.log(`report\t${writeHubEvalReport(path.resolve(opts.out), res)}`);
        if (!res.passed) process.exit(1);
        return;
      }
      if (!pkg) throw new Error("missing <id>@<version>; use --local <dir> to evaluate a local asset directory");
      const [id, version] = pkg.split("@");
      if (!version) throw new Error("use <id>@<version>");
      const res = hubEvalAsset(hubRoot, { id, version });
      for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
      if (opts.out) console.log(`report\t${writeHubEvalReport(path.resolve(opts.out), res)}`);
      if (!res.passed) process.exit(1);
    });
  hub
    .command("search [query]")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--kind <kind>", "filter by asset kind")
    .option("--phase <phase>", "filter by phase")
    .option("--category <cat>", "package | bundle | blueprint")
    .option("--index", "write hub index.json")
    .action((query: string | undefined, opts: { hub?: string; kind?: string; phase?: string; category?: string; index?: boolean }) => {
      const { hubRoot } = hubCtx(opts, "hub.search");
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
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((action: string, opts: { hub?: string }) => {
      if (action !== "rebuild") throw new Error(`unknown hub catalog action: ${action}`);
      const { hubRoot } = hubCtx({ ...opts, refresh: true }, "hub.catalog");
      console.log(`wrote ${writeHubIndex(hubRoot)}`);
    });

  const hubContrib = hub.command("contributions").description("Contribution review queue (maintainer)");
  hubContrib
    .command("list")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--status <status>", "pending | approved | rejected")
    .option("--actor <name>", "filter by submitter")
    .action((opts: { hub?: string; status?: "pending" | "approved" | "rejected"; actor?: string }) => {
      const { hubRoot } = hubCtx(opts, "hub.contributions");
      for (const e of listHubContributions(hubRoot, { status: opts.status, actor: opts.actor })) {
        console.log(`${contributionRefKey(e.ref)}\t${e.reviewStatus}\t${e.kind ?? ""}`);
      }
    });
  hubContrib
    .command("show <ref>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((ref: string, opts: { hub?: string }) => {
      const { hubRoot, actor } = hubCtx(opts, "hub.contributions");
      const parsed = parseContributionRef(ref, actor);
      const info = hubContributionInfo(hubRoot, parsed);
      console.log(JSON.stringify(info, null, 2));
    });
  hubContrib
    .command("accept <ref>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>", "maintainer reviewer")
    .action((ref: string, opts: { hub?: string; reviewer: string }) => {
      const { hubRoot, actor } = hubCtx(opts, "hub.contributions");
      const parsed = parseContributionRef(ref, actor);
      const res = hubAcceptContribution(hubRoot, parsed, opts.reviewer);
      console.log(`accepted ${ref} → ${res.dest}`);
    });
  hubContrib
    .command("reject <ref>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>", "maintainer reviewer")
    .requiredOption("--reason <text>", "rejection reason")
    .action((ref: string, opts: { hub?: string; reviewer: string; reason: string }) => {
      const { hubRoot, actor } = hubCtx(opts, "hub.contributions");
      const parsed = parseContributionRef(ref, actor);
      hubRejectContribution(hubRoot, parsed, opts.reviewer, opts.reason);
      console.log(`rejected ${ref}: ${opts.reason}`);
    });

  const hubAsset = hub.command("asset").description("Hub asset lifecycle management");
  hubAsset
    .command("info <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((pkg: string, opts: { hub?: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx(opts, "hub.asset");
      const info = hubAssetInfo(hubRoot, { id, version });
      console.log(JSON.stringify(info, null, 2));
    });
  hubAsset
    .command("promote <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--to <status>", "draft | trial | enforced | deprecated | archived")
    .action((pkg: string, opts: { hub?: string; to: "draft" | "trial" | "enforced" | "deprecated" | "archived" }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...opts, refresh: true }, "hub.asset");
      const meta = hubSetAssetStatus(hubRoot, { id, version }, opts.to);
      console.log(`${pkg} -> ${meta.status}`);
    });
  hubAsset
    .command("deprecate <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reason <text>", "deprecation reason")
    .action((pkg: string, opts: { hub?: string; reason: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...opts, refresh: true }, "hub.asset");
      const meta = hubSetAssetStatus(hubRoot, { id, version }, "deprecated");
      console.log(`${pkg} -> ${meta.status} (${opts.reason})`);
    });

  const hubReviewCmd = hub.command("review").description("Hub review workflow");
  hubReviewCmd
    .command("request <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--by <name>", "requestor")
    .action((pkg: string, opts: { hub?: string; by: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...opts, refresh: true }, "hub.review");
      const info = hubAssetInfo(hubRoot, { id, version });
      const rec = requestHubReview(info.dir, opts.by);
      console.log(`${pkg}\t${rec.status}\trequested by ${opts.by}`);
    });
  hubReviewCmd
    .command("approve <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>", "reviewer")
    .action((pkg: string, opts: { hub?: string; reviewer: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...opts, refresh: true }, "hub.review");
      const info = hubAssetInfo(hubRoot, { id, version });
      const rec = approveHubReview(info.dir, opts.reviewer);
      console.log(`${pkg}\t${rec.status}\tapproved by ${opts.reviewer}`);
    });
  hubReviewCmd
    .command("reject <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>", "reviewer")
    .requiredOption("--reason <text>", "rejection reason")
    .action((pkg: string, opts: { hub?: string; reviewer: string; reason: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...opts, refresh: true }, "hub.review");
      const info = hubAssetInfo(hubRoot, { id, version });
      const rec = rejectHubReview(info.dir, opts.reviewer, opts.reason);
      console.log(`${pkg}\t${rec.status}\trejected by ${opts.reviewer}: ${opts.reason}`);
    });

  hub
    .command("policy")
    .argument("<action>", "check")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--strict", "fail on warnings")
    .action((action: string, opts: { hub?: string; strict?: boolean }) => {
      if (action !== "check") throw new Error(`unknown hub policy action: ${action}`);
      const { hubRoot } = hubCtx({ ...opts, refresh: true }, "hub.policy");
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
