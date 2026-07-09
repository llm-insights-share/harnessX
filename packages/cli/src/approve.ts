import { Command } from "commander";
import { recordPrephaseApproval } from "@harnessx/core";
import { Workspace } from "@harnessx/core";

const ws = () => Workspace.locate(process.cwd());

/** Shorthand aliases for org-level pre-phase approvals (P2 UX). */
export function registerApproveAliases(program: Command): void {
  const approve = program.command("approve").description("Shorthand for org-level pre-phase approvals");

  approve
    .command("prd <slug>")
    .requiredOption("--approver <name>")
    .description("Approve org PRD (alias for hx gate approve --gate prd --prd <slug>)")
    .action((slug: string, opts: { approver: string }) => {
      const rec = recordPrephaseApproval(ws(), "prd", opts.approver, slug);
      console.log(`approved PRD "${slug}" by ${rec.approver} (artifact ${rec.artifactHash.slice(0, 12)})`);
    });

  approve
    .command("arch")
    .requiredOption("--approver <name>")
    .description("Approve global architecture HLD (alias for hx gate approve --gate arch)")
    .action((opts: { approver: string }) => {
      const rec = recordPrephaseApproval(ws(), "arch", opts.approver);
      console.log(`approved global arch by ${rec.approver} (artifact ${rec.artifactHash.slice(0, 12)})`);
    });
}
