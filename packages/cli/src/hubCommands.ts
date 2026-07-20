import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  Workspace,
  ensureDir,
  seedHub,
  SEED_PROFILES,
  SEED_SCENARIOS,
  listGoldenHubPackages,
  listHubEvalSets,
  searchHubCatalog,
  writeHubIndex,
  resolveProfileAssets,
  hubConfigSource,
  hubAdd,
  hubSync,
  hubSyncApply,
  hubPromote,
  hubApproveReview,
  hubEvalAsset,
  hubEvalLocal,
  hubEvalGoldenRepo,
  writeHubEvalReport,
  hubAssetInfo,
  hubSetAssetStatus,
  requestHubReview,
  approveHubReview,
  rejectHubReview,
  hubGovernanceReport,
  gcHubRemoteCache,
  resolveHubContext,
  assertHubAction,
  readHubConnection,
  hubSubmit,
  parseContributionRef,
  listHubContributions,
  contributionRefKey,
  hubContributionInfo,
  hubAcceptContribution,
  hubRejectContribution,
  readHubRepoPolicy,
  hubGitPush,
  pushLocalHubToRemote,
  createAssetScaffold,
  installGuideSkillAsset,
  hubAdvice,
  runHubDoctor,
  runHubFix,
  initHubOpsProject,
  type AssetKind,
  type AssetStatus,
  type HubAction
} from "@harnessx/core";

export interface RegisterHubCommandsOptions {
  mode: "hx" | "hxhub";
}

interface HubCliBase {
  hub?: string;
  actor?: string;
  offline?: boolean;
  refresh?: boolean;
}

const ws = () => Workspace.locate(process.cwd());

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
  branch?: string;
  message?: string;
  profile?: string;
  scenario?: string;
  with?: string;
  exclude?: string;
  dryRun?: boolean;
  full?: boolean;
}

function parseCsvList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function seedOptionsFromCli(opts: SeedSubmitOptions) {
  const selective = !!(opts.profile || opts.scenario || opts.with || opts.exclude || opts.dryRun);
  return {
    profile: opts.profile,
    scenario: parseCsvList(opts.scenario),
    with: parseCsvList(opts.with),
    exclude: parseCsvList(opts.exclude),
    dryRun: opts.dryRun,
    full: opts.full ?? !selective
  };
}

function submitSeededHub(target: string, opts: SeedSubmitOptions): void {
  if (!opts.submit) return;
  const branch = opts.branch ?? "main";
  const result = pushLocalHubToRemote(target, {
    remote: opts.remote ?? "",
    branch,
    message: opts.message ?? "seed hub assets"
  });
  console.log(`Submitted ${target} to ${result.remote} (${result.branch}, committed=${result.committed})`);
}

async function interactiveCreateAsset(outDir?: string, sourceDir?: string) {
  const rl = createInterface({ input, output });
  try {
    const id = (await rl.question("asset id: ")).trim();
    const kind = (await rl.question("kind (guide.skill/guide.template/sensor.rubric/guide.workflow/guide.command/guide.constraint): ")).trim() as AssetKind;
    const version = (await rl.question("version [0.1.0]: ")).trim() || "0.1.0";
    const status = ((await rl.question("status [draft]: ")).trim() || "draft") as AssetStatus;
    const stageRaw = (await rl.question("stage [dev]: ")).trim() || "dev";
    const taskRaw = (await rl.question("task (optional): ")).trim();
    const sourceInput = sourceDir ?? (await rl.question("source path (optional, directory or file containing original SKILL/template/rules): ")).trim();
    const root = path.resolve(outDir ?? id);
    return createAssetScaffold({
      rootDir: root,
      id,
      kind,
      version,
      status,
      stage: stageRaw as import("@harnessx/core").DeliveryStage,
      task: taskRaw || undefined,
      sourceDir: sourceInput || undefined
    });
  } finally {
    rl.close();
  }
}

export function registerHubCommands(program: Command, opts: RegisterHubCommandsOptions): void {
  const root = opts.mode === "hx" ? program.command("hub").description("Harness Hub (§11.5)") : program;
  const prefix = opts.mode === "hxhub" ? "hxhub" : "hx hub";

  root.command("golden").description("List built-in golden hub assets").action(() => {
    hubCtx({}, "hub.golden", false);
    for (const p of listGoldenHubPackages()) console.log(`package\t${p.id}@${p.version}`);
  });

  root
    .command("resolve")
    .description("Resolve hub assets for a workflow profile")
    .requiredOption("--profile <name>", "workflow profile (lite|standard|strict|enterprise)")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((cmdOpts: { profile: string; hub?: string }) => {
      let hubRef = cmdOpts.hub;
      if (!hubRef) {
        try {
          hubRef = hubConfigSource(ws().readConfig().hub);
        } catch {
          /* no config yet */
        }
      }
      if (!hubRef) throw new Error("--hub is required (or set config.yaml hub)");
      const { hubRoot } = resolveHubContext(ws(), { hubRef, action: "hub.search" });
      const resolution = resolveProfileAssets(hubRoot, cmdOpts.profile, ws());
      console.log(JSON.stringify(resolution, null, 2));
    });

  root
    .command("seed [path]")
    .description("Create a hub repo from built-in golden assets")
    .option("--profile <name>", `governance profile (${SEED_PROFILES.join("|")})`)
    .option("--scenario <names>", `domain scenarios, comma-separated (${SEED_SCENARIOS.join("|")})`)
    .option("--with <kinds>", "asset kinds to include (guides,sensors,rubrics,evals,commands,all)")
    .option("--exclude <refs>", "asset refs to skip (<id>@<version>, comma-separated)")
    .option("--full", "copy entire golden hub (legacy default when no selective flags)")
    .option("--dry-run", "print seed plan without writing files")
    .option("--submit", "commit and push seeded hub to a git remote")
    .option("--remote <git-url>", "remote repository URL used with --submit")
    .option("--branch <name>", "remote branch name (default: main)", "main")
    .option("--message <text>", "commit message used with --submit", "seed hub assets")
    .action((hubPath: string | undefined, seedOpts: SeedSubmitOptions) => {
      hubCtx({}, "hub.seed", false);
      const target = path.resolve(hubPath ?? "harness-hub");
      ensureDir(target);
      const options = seedOptionsFromCli(seedOpts);
      const result = seedHub(target, options);
      if (result.dryRun) {
        console.log(`dry-run seed plan for ${target}`);
        if (result.plan.profile) console.log(`profile: ${result.plan.profile}`);
        if (result.plan.scenarios.length) console.log(`scenarios: ${result.plan.scenarios.join(", ")}`);
        console.log(`assets (${result.plan.assets.length}):`);
        for (const ref of result.plan.assets) console.log(`  ${ref}`);
        if (result.plan.skipped.length) {
          console.log(`skipped (${result.plan.skipped.length}):`);
          for (const ref of result.plan.skipped) console.log(`  ${ref}`);
        }
        return;
      }
      console.log(`Seeded ${target} with ${result.seeded.length} asset(s):`);
      for (const p of result.seeded) console.log(`  ${p.id}@${p.version}`);
      submitSeededHub(target, seedOpts);
    });

  root
    .command("add <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((pkg: string, cmdOpts: { hub?: string }) => {
      const { workspace, hubRoot, requireApproved } = hubCtx(cmdOpts, "hub.add");
      const [id, version] = pkg.split("@");
      if (!version) throw new Error("use <id>@<version>");
      const res = hubAdd(workspace, hubRoot, { id, version }, { requireApproved });
      console.log(`installed ${id}@${version} → ${res.dir}`);
      console.log(
        "Note: hub add only updates .hub-cache. Run `hx harness lint --completeness` or `hx project sync-hub` to register in harness.yaml."
      );
    });

  root
    .command("sync")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--apply", "apply upstream updates with three-way merge")
    .option("--force", "apply merges even when conflicts occur")
    .option("--offline", "use local hub cache without remote fetch")
    .option("--refresh", "force refresh remote cache before operation")
    .option("--only <ids>", "comma-separated package ids to sync")
    .action((cmdOpts: { hub?: string; apply?: boolean; force?: boolean; only?: string; offline?: boolean; refresh?: boolean }) => {
      const { workspace, hubRoot } = hubCtx(cmdOpts, "hub.sync");
      if (cmdOpts.apply) {
        const only = cmdOpts.only?.split(",").map((s) => s.trim()).filter(Boolean);
        for (const r of hubSyncApply(workspace, hubRoot, { force: cmdOpts.force, only })) {
          console.log(`${r.id}\t${r.action}\t${r.detail ?? ""}${r.toVersion ? ` → ${r.toVersion}` : ""}`);
        }
        return;
      }
      for (const e of hubSync(workspace, hubRoot)) console.log(`${e.id}\tinstalled ${e.installed}\tlatest ${e.latest}\t${e.state}`);
    });

  root
    .command("promote <dir>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--by <name>")
    .option("--evidence <ref>", "metrics/report evidencing the asset's value")
    .option("--skip-policy", "skip policy check before publish")
    .option("--skip-eval", "skip pre-publish hub eval")
    .action((dir: string, cmdOpts: { hub?: string; by: string; evidence?: string; skipPolicy?: boolean; skipEval?: boolean }) => {
      const { workspace, hubRoot } = hubCtx(cmdOpts, "hub.promote");
      if (!cmdOpts.skipPolicy) {
        const report = hubGovernanceReport(hubRoot);
        if (!report.ok) throw new Error(`hub policy check failed before promote: ${report.issues[0]?.message ?? "unknown"}`);
      }
      const res = hubPromote(workspace, hubRoot, path.resolve(dir), {
        publishedBy: cmdOpts.by,
        evidence: cmdOpts.evidence,
        skipEval: cmdOpts.skipEval
      });
      console.log(`published to ${res.dest} (review pending)`);
    });

  root
    .command("submit <dir>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--evidence <ref>", "metrics/report evidencing the asset's value")
    .option("--actor <name>", "submitter identity (defaults to config hub.actor)")
    .option("--skip-eval", "skip pre-submit hub eval")
    .action((dir: string, cmdOpts: { hub?: string; evidence?: string; actor?: string; skipEval?: boolean }) => {
      const { workspace, hubRoot, actor } = hubCtx(cmdOpts, "hub.submit");
      const res = hubSubmit(workspace, hubRoot, path.resolve(dir), { actor, evidence: cmdOpts.evidence, skipEval: cmdOpts.skipEval });
      console.log(`submitted to ${res.dest} (pending maintainer review)`);
    });

  root
    .command("push-github [path]")
    .description("Commit and push a locally generated hub directory to GitHub (or any Git remote)")
    .requiredOption("--remote <git-url>", "Git remote URL (e.g. git@github.com:your-org/hx-hub.git)")
    .option("--branch <name>", "remote branch name (default: main)", "main")
    .option("--message <text>", "commit message", "chore: hub update")
    .option("--integrate <mode>", "how to integrate remote commits before push: rebase|merge|none (default: rebase)", "rebase")
    .action((hubPath: string | undefined, cmdOpts: { remote: string; branch?: string; message?: string; integrate?: string }) => {
      hubCtx({}, "hub.push-github", false);
      const target = path.resolve(hubPath ?? "harness-hub");
      const integrateRaw = (cmdOpts.integrate ?? "rebase").toLowerCase();
      if (!["rebase", "merge", "none"].includes(integrateRaw)) {
        throw new Error(`--integrate must be rebase|merge|none (got ${cmdOpts.integrate})`);
      }
      const result = pushLocalHubToRemote(target, {
        remote: cmdOpts.remote,
        branch: cmdOpts.branch ?? "main",
        message: cmdOpts.message ?? "chore: hub update",
        integrate: integrateRaw as "rebase" | "merge" | "none"
      });
      console.log(`Pushed ${target} → ${result.remote} (${result.branch}, committed=${result.committed})`);
    });

  root
    .command("push")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--message <text>", "commit message", "chore: hub update")
    .option("--branch <name>", "remote branch to push")
    .action((cmdOpts: { hub?: string; message?: string; branch?: string }) => {
      const { hubRoot } = hubCtx(cmdOpts, "hub.push");
      const result = hubGitPush(hubRoot, { message: cmdOpts.message ?? "chore: hub update", branch: cmdOpts.branch });
      console.log(`push complete (committed=${result.committed}, pushed=${result.pushed})`);
    });

  root
    .command("eval [pkg]")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--local <dir>", "evaluate a local asset directory")
    .option("--golden <name>", "evaluate a golden-repo eval set")
    .option("--list", "list golden eval sets in hub")
    .option("--out <file>", "write eval report json")
    .action((pkg: string | undefined, cmdOpts: { hub?: string; local?: string; golden?: string; list?: boolean; out?: string }) => {
      if (cmdOpts.local) {
        const res = hubEvalLocal(path.resolve(cmdOpts.local));
        for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
        if (cmdOpts.out) console.log(`report\t${writeHubEvalReport(path.resolve(cmdOpts.out), res)}`);
        if (!res.passed) process.exit(1);
        return;
      }
      const { hubRoot } = hubCtx(cmdOpts, "hub.eval");
      if (cmdOpts.list) return void listHubEvalSets(hubRoot).forEach((n) => console.log(n));
      const res = cmdOpts.golden
        ? hubEvalGoldenRepo(hubRoot, cmdOpts.golden)
        : (() => {
            if (!pkg) throw new Error("missing <id>@<version>; use --local <dir> to evaluate a local asset directory");
            const [id, version] = pkg.split("@");
            if (!version) throw new Error("use <id>@<version>");
            return hubEvalAsset(hubRoot, { id, version });
          })();
      for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}\t${c.name}${c.detail ? `\t${c.detail}` : ""}`);
      if (cmdOpts.out) console.log(`report\t${writeHubEvalReport(path.resolve(cmdOpts.out), res)}`);
      if (!res.passed) process.exit(1);
    });

  root
    .command("search [query]")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--kind <kind>", "filter by asset kind")
    .option("--phase <phase>", "filter by phase")
    .option("--category <cat>", "package")
    .option("--index", "write hub index.json")
    .action((query: string | undefined, cmdOpts: { hub?: string; kind?: string; phase?: string; category?: string; index?: boolean }) => {
      const { hubRoot } = hubCtx(cmdOpts, "hub.search");
      if (cmdOpts.index) return void console.log(`wrote ${writeHubIndex(hubRoot)}`);
      const results = searchHubCatalog(hubRoot, {
        query,
        kind: cmdOpts.kind,
        phase: cmdOpts.phase,
        category: cmdOpts.category as "package" | undefined
      });
      for (const e of results) console.log(`${e.category}\t${e.id}@${e.version}\t${e.kind}\t${e.description ?? ""}`);
    });

  root
    .command("catalog")
    .description("List hub catalog entries, or rebuild index.json")
    .argument("[action]", "list (default) | rebuild")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--kind <kind>", "filter by asset kind (list)")
    .option("--phase <phase>", "filter by phase (list)")
    .option("--category <cat>", "package (list)")
    .action((action: string | undefined, cmdOpts: { hub?: string; kind?: string; phase?: string; category?: string }) => {
      const resolved = action ?? "list";
      if (resolved === "rebuild") {
        const { hubRoot } = hubCtx({ ...cmdOpts, refresh: true }, "hub.catalog");
        console.log(`wrote ${writeHubIndex(hubRoot)}`);
        return;
      }
      if (resolved !== "list") throw new Error(`unknown hub catalog action: ${resolved} (use list | rebuild)`);
      // list is read-only browse — same actor rules as hub.search
      const { hubRoot } = hubCtx(cmdOpts, "hub.search");
      const results = searchHubCatalog(hubRoot, {
        kind: cmdOpts.kind,
        phase: cmdOpts.phase,
        category: cmdOpts.category as "package" | undefined
      });
      for (const e of results) console.log(`${e.category}\t${e.id}@${e.version}\t${e.kind}\t${e.description ?? ""}`);
    });

  const contrib = root.command("contributions").description("Contribution review queue (maintainer)");
  contrib
    .command("list")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--status <status>", "pending | approved | rejected")
    .option("--actor <name>", "filter by submitter")
    .action((cmdOpts: { hub?: string; status?: "pending" | "approved" | "rejected"; actor?: string }) => {
      const { hubRoot } = hubCtx(cmdOpts, "hub.contributions");
      for (const e of listHubContributions(hubRoot, { status: cmdOpts.status, actor: cmdOpts.actor })) {
        console.log(`${contributionRefKey(e.ref)}\t${e.reviewStatus}\t${e.kind ?? ""}`);
      }
    });
  contrib
    .command("show <ref>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((ref: string, cmdOpts: { hub?: string }) => {
      const { hubRoot, actor } = hubCtx(cmdOpts, "hub.contributions");
      const parsed = parseContributionRef(ref, actor);
      console.log(JSON.stringify(hubContributionInfo(hubRoot, parsed), null, 2));
    });
  contrib
    .command("accept <ref>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>")
    .action((ref: string, cmdOpts: { hub?: string; reviewer: string }) => {
      const { hubRoot, actor } = hubCtx(cmdOpts, "hub.contributions");
      const parsed = parseContributionRef(ref, actor);
      const res = hubAcceptContribution(hubRoot, parsed, cmdOpts.reviewer);
      console.log(`accepted ${ref} → ${res.dest}`);
    });
  contrib
    .command("reject <ref>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>")
    .requiredOption("--reason <text>")
    .action((ref: string, cmdOpts: { hub?: string; reviewer: string; reason: string }) => {
      const { hubRoot, actor } = hubCtx(cmdOpts, "hub.contributions");
      const parsed = parseContributionRef(ref, actor);
      hubRejectContribution(hubRoot, parsed, cmdOpts.reviewer, cmdOpts.reason);
      console.log(`rejected ${ref}: ${cmdOpts.reason}`);
    });

  const asset = root.command("asset").description(opts.mode === "hxhub" ? "Asset scaffolding and lifecycle" : "Hub asset lifecycle management");
  asset
    .command("create")
    .option("--kind <kind>", "asset kind")
    .option("--id <id>", "asset id")
    .option("--asset-version <ver>", "asset version", "0.1.0")
    .option("--status <status>", "draft|trial|enforced|deprecated", "draft")
    .option("--stage <stage>", "delivery stage: req|arch|dev|test", "dev")
    .option("--task <task>", "task within stage")
    .option("--out <dir>", "target directory")
    .option("--source-dir <dir>", "source path (directory or single file) for this asset scaffold")
    .option("--from-github <url>", "import guide.skill from a GitHub repository URL (clone + scaffold)")
    .option("--path <subdir>", "skill directory inside repo (with --from-github; overrides tree/blob URL path)")
    .option("--branch <name>", "git branch to clone (with --from-github)")
    .option("--offline", "use cached clone without fetching (with --from-github)")
    .option("--skip-eval", "skip hubEvalLocal after guide.skill import")
    .option("--interactive", "ask prompts interactively")
    .action(
      async (cmdOpts: {
        kind?: AssetKind;
        id?: string;
        assetVersion?: string;
        status?: AssetStatus;
        stage?: string;
        task?: string;
        out?: string;
        sourceDir?: string;
        fromGithub?: string;
        path?: string;
        branch?: string;
        offline?: boolean;
        skipEval?: boolean;
        interactive?: boolean;
      }) => {
        if (cmdOpts.fromGithub && cmdOpts.sourceDir) {
          throw new Error("use either --source-dir or --from-github, not both");
        }
        if (cmdOpts.fromGithub && cmdOpts.kind && cmdOpts.kind !== "guide.skill") {
          throw new Error("--from-github only supports guide.skill assets");
        }

        const workspace = ws();
        const stage = (cmdOpts.stage ?? "dev") as import("@harnessx/core").DeliveryStage;
        const isGuideSkillImport =
          cmdOpts.fromGithub || (cmdOpts.kind === "guide.skill" && !!cmdOpts.sourceDir);

        let result: { dir: string; files: string[]; id?: string; version?: string; source?: string; repoUrl?: string; eval?: { passed: boolean; checks: { name: string }[] } };

        if (cmdOpts.fromGithub) {
          const imported = installGuideSkillAsset({
            workspaceRoot: workspace.root,
            githubUrl: cmdOpts.fromGithub,
            id: cmdOpts.id,
            version: cmdOpts.assetVersion,
            status: cmdOpts.status,
            stage,
            task: cmdOpts.task,
            outDir: cmdOpts.out,
            subpath: cmdOpts.path,
            branch: cmdOpts.branch,
            skipEval: cmdOpts.skipEval,
            resolveSourceOpts: { offline: cmdOpts.offline }
          });
          result = imported;
          console.log(`imported ${imported.id}@${imported.version} from ${imported.repoUrl}`);
        } else if (isGuideSkillImport) {
          const imported = installGuideSkillAsset({
            workspaceRoot: workspace.root,
            sourceDir: cmdOpts.sourceDir,
            id: cmdOpts.id,
            version: cmdOpts.assetVersion,
            status: cmdOpts.status,
            stage,
            task: cmdOpts.task,
            outDir: cmdOpts.out ?? (cmdOpts.id ? path.resolve(cmdOpts.id) : undefined),
            skipEval: cmdOpts.skipEval
          });
          result = imported;
        } else if (cmdOpts.interactive || !cmdOpts.kind || !cmdOpts.id) {
          result = await interactiveCreateAsset(cmdOpts.out, cmdOpts.sourceDir);
        } else {
          result = createAssetScaffold({
            rootDir: path.resolve(cmdOpts.out ?? cmdOpts.id),
            id: cmdOpts.id,
            kind: cmdOpts.kind,
            version: cmdOpts.assetVersion,
            status: cmdOpts.status,
            stage,
            task: cmdOpts.task,
            sourceDir: cmdOpts.sourceDir
          });
        }

        console.log(`created ${result.dir}`);
        for (const f of result.files) console.log(`  + ${f}`);
        if (result.eval) console.log(`eval: PASS (${result.eval.checks.length} checks)`);
      }
    );

  asset
    .command("info <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .action((pkg: string, cmdOpts: { hub?: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx(cmdOpts, "hub.asset");
      console.log(JSON.stringify(hubAssetInfo(hubRoot, { id, version }), null, 2));
    });
  asset
    .command("promote <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--to <status>", "draft | trial | enforced | deprecated | archived")
    .action((pkg: string, cmdOpts: { hub?: string; to: "draft" | "trial" | "enforced" | "deprecated" | "archived" }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...cmdOpts, refresh: true }, "hub.asset");
      const meta = hubSetAssetStatus(hubRoot, { id, version }, cmdOpts.to);
      console.log(`${pkg} -> ${meta.status}`);
    });
  asset
    .command("deprecate <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reason <text>", "deprecation reason")
    .action((pkg: string, cmdOpts: { hub?: string; reason: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...cmdOpts, refresh: true }, "hub.asset");
      const meta = hubSetAssetStatus(hubRoot, { id, version }, "deprecated");
      console.log(`${pkg} -> ${meta.status} (${cmdOpts.reason})`);
    });

  const review = root.command("review").description("Hub review workflow");
  review
    .command("request <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--by <name>")
    .action((pkg: string, cmdOpts: { hub?: string; by: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...cmdOpts, refresh: true }, "hub.review");
      const rec = requestHubReview(hubAssetInfo(hubRoot, { id, version }).dir, cmdOpts.by);
      console.log(`${pkg}\t${rec.status}\trequested by ${cmdOpts.by}`);
    });
  review
    .command("approve <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>")
    .action((pkg: string, cmdOpts: { hub?: string; reviewer: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...cmdOpts, refresh: true }, "hub.review");
      const rec = approveHubReview(hubAssetInfo(hubRoot, { id, version }).dir, cmdOpts.reviewer);
      console.log(`${pkg}\t${rec.status}\tapproved by ${cmdOpts.reviewer}`);
    });
  review
    .command("reject <pkg>")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .requiredOption("--reviewer <name>")
    .requiredOption("--reason <text>")
    .action((pkg: string, cmdOpts: { hub?: string; reviewer: string; reason: string }) => {
      const [id, version] = pkg.split("@");
      if (!id || !version) throw new Error("use <id>@<version>");
      const { hubRoot } = hubCtx({ ...cmdOpts, refresh: true }, "hub.review");
      const rec = rejectHubReview(hubAssetInfo(hubRoot, { id, version }).dir, cmdOpts.reviewer, cmdOpts.reason);
      console.log(`${pkg}\t${rec.status}\trejected by ${cmdOpts.reviewer}: ${cmdOpts.reason}`);
    });

  root
    .command("policy")
    .argument("<action>", "check")
    .option("--hub <path>", "hub source (defaults to config.yaml hub)")
    .option("--strict", "fail on warnings")
    .action((action: string, cmdOpts: { hub?: string; strict?: boolean }) => {
      if (action !== "check") throw new Error(`unknown hub policy action: ${action}`);
      const { hubRoot } = hubCtx({ ...cmdOpts, refresh: true }, "hub.policy");
      const report = hubGovernanceReport(hubRoot);
      for (const i of report.issues) console.error(`${i.severity.toUpperCase()}\t${i.asset}\t${i.message}`);
      const hasWarn = report.issues.some((i) => i.severity === "warn");
      if (!report.ok || (cmdOpts.strict && hasWarn)) process.exit(1);
      console.log("hub policy check passed");
    });

  root
    .command("cache-gc")
    .option("--older-than-days <n>", "remove cache entries older than N days", "30")
    .action((cmdOpts: { olderThanDays: string }) => {
      const removed = gcHubRemoteCache(process.cwd(), parseInt(cmdOpts.olderThanDays, 10) * 24 * 3600_000);
      console.log(`removed ${removed.length} cache entries`);
      for (const d of removed) console.log(`  ${d}`);
    });

  if (opts.mode === "hxhub") {
    root
      .command("init [dir]")
      .description("Initialize lightweight hub operations workspace")
      .option("--hub <path>", "hub source to prefill in config")
      .option("--actor <name>", "default maintainer actor")
      .action((dir: string | undefined, cmdOpts: { hub?: string; actor?: string }) => {
        const res = initHubOpsProject({ targetDir: dir ?? process.cwd(), hubSource: cmdOpts.hub, actor: cmdOpts.actor, role: "maintainer" });
        console.log(`initialized ${res.root}`);
        for (const c of res.created) console.log(`  + ${c}`);
      });

    root
      .command("help")
      .description("Show AI-oriented hub asset suggestions")
      .argument("[topic]", "general | api | enterprise", "general")
      .option("--hub <path>", "hub source (defaults to config.yaml hub)")
      .option("--json", "print machine-readable JSON")
      .action((topic: string, cmdOpts: { hub?: string; json?: boolean }) => {
        const { hubRoot } = hubCtx(cmdOpts, "hub.search");
        const advice = hubAdvice(hubRoot, topic);
        if (cmdOpts.json) return void console.log(JSON.stringify(advice, null, 2));
        console.log(`Topic: ${advice.topic}`);
        for (const s of advice.suggestions) {
          console.log(`- ${s.title}`);
          console.log(`  why: ${s.why}`);
          for (const n of s.next) console.log(`  next: ${n}`);
        }
      });

    root
      .command("doctor")
      .description("Check hub configuration and asset health with fix suggestions")
      .option("--hub <path>", "hub source override")
      .option("--json", "print machine-readable JSON")
      .option("--fix-hints", "show fix command hints")
      .action((cmdOpts: { hub?: string; json?: boolean; fixHints?: boolean }) => {
        const report = runHubDoctor(ws(), { hubRef: cmdOpts.hub });
        if (cmdOpts.json) return void console.log(JSON.stringify(report, null, 2));
        for (const f of report.findings) {
          console.log(`${f.level.toUpperCase()}\t${f.code}\t${f.message}${f.suggestion ? `\n  -> ${f.suggestion}` : ""}`);
        }
        if (cmdOpts.fixHints) {
          console.log("\nFix hints:");
          for (const h of report.hints) console.log(`  - ${h}`);
        }
        if (!report.ok) process.exit(1);
      });

    root
      .command("fix")
      .description("Check and repair common hub repository problems")
      .option("--hub <path>", "hub source override")
      .option("--maintainer <name>", "maintainer name used when policy has none")
      .option("--json", "print machine-readable JSON")
      .action((cmdOpts: { hub?: string; maintainer?: string; json?: boolean }) => {
        const result = runHubFix(ws(), { hubRef: cmdOpts.hub, maintainer: cmdOpts.maintainer });
        if (cmdOpts.json) return void console.log(JSON.stringify(result, null, 2));
        console.log(`hub root: ${result.hubRoot}`);
        for (const action of result.actions) {
          console.log(`${action.status.toUpperCase()}\t${action.code}\t${action.message}`);
        }
        if (result.remainingIssues.length > 0) {
          console.log("\nRemaining issues:");
          for (const issue of result.remainingIssues) {
            console.log(`${issue.severity.toUpperCase()}\t${issue.asset}\t${issue.message}`);
          }
        } else {
          console.log("No remaining governance issues.");
        }
        if (!result.ok) process.exit(1);
      });
  }

  if (opts.mode === "hx") {
    root.command("approve <pkg>").description("Alias of review approve").option("--hub <path>").requiredOption("--reviewer <name>").action((pkg: string, o: { hub?: string; reviewer: string }) => {
      const [id, version] = pkg.split("@");
      const { hubRoot } = hubCtx(o, "hub.review");
      hubApproveReview(hubRoot, id!, version!, o.reviewer);
      console.log(`${pkg} review approved by ${o.reviewer}`);
    });
    root
      .command("cache")
      .description("Remote hub cache operations")
      .command("gc")
      .option("--older-than-days <n>", "remove cache entries older than N days", "30")
      .action((o: { olderThanDays: string }) => {
        const removed = gcHubRemoteCache(process.cwd(), parseInt(o.olderThanDays, 10) * 24 * 3600_000);
        console.log(`removed ${removed.length} cache entries`);
      });
  } else {
    root.addHelpText("afterAll", `\nTips:\n  - ${prefix} init . --hub <git-url> --actor <name>\n  - ${prefix} seed . --profile standard --scenario core,api\n  - ${prefix} doctor --fix-hints\n  - ${prefix} asset create --interactive\n`);
  }
}
