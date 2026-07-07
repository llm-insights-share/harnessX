import { Command } from "commander";
import { Workspace, remotePull, remotePush } from "@harnessx/core";

const ws = () => Workspace.locate(process.cwd());

export function registerRemoteCommands(program: Command): void {
  const remote = program.command("remote").description("Harness-aware git pull/push for team collaboration");

  remote
    .command("pull")
    .description("git pull with post-pull meta verify and rebase checks")
    .option("--remote <name>", "git remote (default: origin)")
    .option("--branch <name>", "branch to pull (default: current)")
    .option("--no-rebase", "use merge instead of rebase")
    .option("--change <id>", "limit rebase checks to one change")
    .action((opts: { remote?: string; branch?: string; rebase?: boolean; change?: string }) => {
      const res = remotePull(ws(), {
        remote: opts.remote,
        branch: opts.branch,
        rebase: opts.rebase,
        change: opts.change
      });
      if (res.output) console.log(res.output);
      for (const m of res.metaVerify) {
        console.log(`${m.change}: ${m.ok ? "meta ok" : "meta TAMPERED"}`);
        for (const p of m.problems) console.error(`  - ${p}`);
        if (!m.ok) process.exit(1);
      }
      let rebaseFailed = false;
      for (const { change, report } of res.rebaseChecks) {
        if (report.clean) {
          console.log(`${change}: rebase check ok`);
          continue;
        }
        rebaseFailed = true;
        for (const c of report.conflicts) {
          console.error(`CONFLICT ${change} ${c.capability}/"${c.requirement}" (${c.op}): ${c.reason}`);
          console.error(`  → ${c.guidance}`);
        }
      }
      if (rebaseFailed) process.exit(1);
      console.log(`pulled ${res.remote}/${res.branch}`);
    });

  remote
    .command("push")
    .description("preflight meta verify, stage change workspace, commit, and push")
    .option("--remote <name>", "git remote (default: origin)")
    .option("--branch <name>", "branch to push (default: current)")
    .option("--change <id>", "stage only this change workspace")
    .option("--message <msg>", "commit message")
    .option("--stage-only", "stage harness paths without commit or push")
    .action((opts: { remote?: string; branch?: string; change?: string; message?: string; stageOnly?: boolean }) => {
      const res = remotePush(ws(), {
        remote: opts.remote,
        branch: opts.branch,
        change: opts.change,
        message: opts.message,
        stageOnly: opts.stageOnly
      });
      for (const p of res.staged) console.log(`staged ${p}`);
      for (const m of res.metaVerify) console.log(`${m.change}: meta ok`);
      if (res.committed) console.log(`committed ${res.commitHash}`);
      if (res.pushed) {
        if (res.output) console.log(res.output);
        console.log(`pushed ${res.remote}/${res.branch}`);
      } else if (opts.stageOnly) {
        console.log("staged only — review with git diff --cached, then commit and push");
      }
    });
}
