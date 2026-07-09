import { Command } from "commander";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  initFromHub,
  listBundles,
  listHubBundles,
  applyBundle,
  resolveHubSource,
  createChange,
  scaffoldProposal,
  scaffoldExplore,
  importOpenspec,
  archiveChange,
  scaffoldFromIssue,
  scaffoldExtendedRequirements,
  readMeta
} from "@harnessx/core";

export const ws = () => Workspace.locate(process.cwd());

export function registerFoundationCommands(program: Command): void {
  program
    .command("init")
    .description("Initialize harnessX/ in the current repository")
    .option("--bundle <id>", "apply a topology bundle (api-service, frontend-2c, library-sdk, serverless-function, mobile-app, data-pipeline, …)")
    .option("--locale <id>", "scaffold locale: hx-cn for Chinese assets (default: English base)")
    .option("--from-hub <pkg>", "initialize from a hub bundle/blueprint/package (requires --hub)")
    .option("--hub <path>", "hub source: local path or GitHub URL (for --from-hub)")
    .option("--adapter <target>", "adapter target to record in config (cursor, codex, …)")
    .action((opts: { bundle?: string; locale?: string; fromHub?: string; hub?: string; adapter?: string }) => {
      if (opts.fromHub) {
        if (!opts.hub) throw new Error("--hub is required with --from-hub");
        const res = initFromHub(process.cwd(), { hubRef: opts.fromHub, hubRoot: opts.hub, locale: opts.locale, adapter: opts.adapter });
        console.log(`Initialized from hub ${opts.fromHub} → ${res.ws.base}`);
        for (const c of res.created) console.log(`  + ${c}`);
        console.log("\nNext steps:");
        for (const s of res.nextSteps) console.log(`  ${s}`);
        return;
      }
      const res = initWorkspace(process.cwd(), { bundle: opts.bundle, locale: opts.locale });
      console.log(`Initialized ${res.ws.base}`);
      for (const c of res.created) console.log(`  + ${c}`);
      console.log("\nNext steps:");
      for (const s of res.nextSteps) console.log(`  ${s}`);
    });

  program
    .command("bundle")
    .argument("<action>", "list | add")
    .argument("[bundleId]", "topology bundle id (required for add)")
    .option("--hub <path>", "list bundles from hub source (local path or GitHub URL)")
    .description("Manage topology bundles")
    .action((action: string, bundleId: string | undefined, opts: { hub?: string }) => {
      if (action === "list") {
        if (opts?.hub) {
          const hubRoot = resolveHubSource(process.cwd(), opts.hub, { updateRemote: true });
          for (const b of listHubBundles(hubRoot)) console.log(`${b.id}@${b.version}\t(hub)`);
        } else {
          for (const b of listBundles()) console.log(`${b.id}\t${b.description}`);
        }
        return;
      }
      if (action === "add") {
        if (!bundleId) throw new Error("bundle id required: hx bundle add <id>");
        const w = ws();
        applyBundle(w, bundleId);
        console.log(`Applied bundle "${bundleId}" — see harness.yaml and assets/bundles/${bundleId}/`);
        return;
      }
      throw new Error(`unknown bundle action: ${action}`);
    });

  const change = program.command("change").description("Manage change workspaces");
  change
    .command("create <id>")
    .option("--domains <list>", "comma-separated touched domains (FR-011); inferred from issue labels with --from-issue")
    .option("--profile <name>", "workflow profile override")
    .option("--from-issue <url>", "scaffold from a GitHub issue URL (v0.2)")
    .option("--prd <slug>", "link organization PRD slug (docs/prd/)")
    .option("--arch-modules <list>", "comma-separated arch module ids")
    .action(async (id: string, opts: { domains?: string; profile?: string; fromIssue?: string; prd?: string; archModules?: string }) => {
      if (opts.fromIssue) {
        const res = await scaffoldFromIssue(ws(), { issueUrl: opts.fromIssue, id, profile: opts.profile, domains: opts.domains?.split(",").map((s) => s.trim()).filter(Boolean) });
        console.log(`Created change "${res.changeId}" from issue #${res.issue.number}`);
        console.log(`  proposal: ${res.proposalFile}`);
        console.log(`  delta: ${res.deltaFile}`);
        for (const w of res.warnings)
          console.warn(`WARNING: overlaps with active change "${w.otherChange}" on domains: ${w.domains.join(", ")}`);
        return;
      }
      if (!opts.domains) throw new Error("--domains required (or use --from-issue)");
      const domains = opts.domains.split(",").map((s) => s.trim()).filter(Boolean);
      const archModules = opts.archModules?.split(",").map((s) => s.trim()).filter(Boolean);
      const res = createChange(ws(), id, domains, opts.profile, {
        prdRef: opts.prd,
        archModules: archModules?.length ? archModules : undefined
      });
      console.log(`Created change "${id}" (profile: ${res.meta.profile}, domains: ${domains.join(", ")})`);
      for (const w of res.warnings)
        console.warn(`WARNING: overlaps with active change "${w.otherChange}" on domains: ${w.domains.join(", ")}`);
    });
  change.command("list").action(() => {
    const w = ws();
    for (const id of w.listChanges()) {
      const meta = w.readMetaRaw(id);
      console.log(`${id}\t${meta.status}\t${meta.profile}\t[${meta.touchedDomains.join(",")}]`);
    }
  });

  program
    .command("propose <change>")
    .description("Scaffold proposal.md and an initial delta spec (FR-003)")
    .option("--title <title>", "proposal title", "Untitled")
    .action((changeId: string, opts: { title: string }) => {
      const w = ws();
      const res = scaffoldProposal(w, changeId, opts.title);
      console.log(`Wrote ${res.proposalFile}`);
      console.log(`Wrote ${res.deltaFile}`);
      try {
        const meta = readMeta(w, changeId);
        if (meta.profile === "enterprise-sdlc") {
          for (const f of scaffoldExtendedRequirements(w, changeId)) console.log(`Wrote harnessX/changes/${changeId}/${f}`);
        }
      } catch {
        /* ignore */
      }
    });

  program
    .command("explore <change>")
    .description("Read-only exploration notes (FR-002)")
    .option("--topic <topic>", "exploration topic", "unscoped")
    .action((changeId: string, opts: { topic: string }) => {
      console.log(`Wrote ${scaffoldExplore(ws(), changeId, opts.topic)}`);
      console.log("Read-only phase: do not modify code. Gate check will flag staged code edits.");
    });

  program
    .command("archive <change>")
    .description("Merge delta specs into main specs and archive the change (FR-009)")
    .option("--force", "skip verified-state requirement (lite profile)")
    .action((changeId: string, opts: { force?: boolean }) => {
      const res = archiveChange(ws(), changeId, { force: opts.force });
      if (!res.ok) {
        for (const p of res.problems) console.error(`BLOCKED: ${p}`);
        process.exit(1);
      }
      console.log(`Archived to ${res.archivedTo}`);
      console.log(`Merged capabilities: ${res.capabilities.join(", ")}`);
    });

  const openspec = program.command("openspec").description("OpenSpec interoperability (NFR-004)");
  openspec
    .command("import")
    .option("--from <dir>", "openspec directory", "openspec")
    .action((opts: { from: string }) => {
      const w = new Workspace(process.cwd());
      const res = importOpenspec(process.cwd(), path.resolve(process.cwd(), opts.from), w);
      console.log(`Imported specs: ${res.specs.join(", ") || "(none)"}`);
      console.log(`Imported changes: ${res.changes.join(", ") || "(none)"}`);
      for (const n of res.notes) console.log(`  note: ${n}`);
    });
}
