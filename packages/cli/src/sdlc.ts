import { Command } from "commander";
import fs from "node:fs";
import {
  Workspace,
  createWorkOrder,
  submitWorkOrder,
  approveWorkOrder,
  rejectWorkOrder,
  doneWorkOrder,
  cancelWorkOrder,
  listWorkOrders,
  readWorkOrder,
  inboxWorkOrders,
  buildWorkOrderExtract,
  approveChangeRequest,
  readChangeRequest,
  createChangeRequest,
  submitChangeRequest,
  showChangeRequestDiff,
  listChangeRequests,
  createBug,
  listBugs,
  markBugFixed,
  closeBug,
  scaffoldTestCases,
  submitTestCaseReview,
  runSensor
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const ws = () => Workspace.locate(process.cwd());

export function registerWorkOrderCommands(program: Command): void {
  const wo = program.command("wo").description("Work orders (enterprise SDLC)");

  wo
    .command("create")
    .requiredOption("--type <type>", "work order type")
    .requiredOption("--title <title>", "title")
    .requiredOption("--assignee-role <role>", "assignee role")
    .requiredOption("--by <name>", "creator")
    .option("--scope <scope>", "prephase|change", "prephase")
    .option("--prd <slug>", "PRD slug ref")
    .option("--change <id>", "change id ref")
    .option("--module <id>", "module ref")
    .action((opts: {
      type: string;
      title: string;
      assigneeRole: string;
      by: string;
      scope: "prephase" | "change";
      prd?: string;
      change?: string;
      module?: string;
    }) => {
      const order = createWorkOrder(ws(), {
        type: opts.type as never,
        title: opts.title,
        scope: opts.scope,
        ref: { prd: opts.prd, change: opts.change, module: opts.module },
        assigneeRole: opts.assigneeRole,
        createdBy: opts.by
      });
      console.log(`created ${order.id} (${order.type}) status=${order.status}`);
    });

  wo
    .command("submit <id>")
    .requiredOption("--by <name>")
    .action((id: string, opts: { by: string }) => {
      const order = submitWorkOrder(ws(), id, opts.by);
      console.log(`submitted ${order.id} status=${order.status}`);
    });

  wo
    .command("approve <id>")
    .requiredOption("--by <name>")
    .option("--note <text>")
    .action((id: string, opts: { by: string; note?: string }) => {
      const { wo: order, spawned } = approveWorkOrder(ws(), id, { by: opts.by, note: opts.note });
      console.log(`approved ${order.id}`);
      for (const s of spawned) console.log(`  spawned ${s.id} (${s.type})`);
      const crRef = order.ref.changeRequest;
      if (crRef && (order.type === "req-change" || order.type === "arch-change")) {
        approveChangeRequest(ws(), crRef, opts.by);
        console.log(`  applied change request ${crRef}`);
      }
    });

  wo
    .command("reject <id>")
    .requiredOption("--by <name>")
    .requiredOption("--reason <text>")
    .action((id: string, opts: { by: string; reason: string }) => {
      const { wo: order, revise } = rejectWorkOrder(ws(), id, opts.by, opts.reason);
      console.log(`rejected ${order.id}`);
      if (revise) console.log(`  spawned revise ${revise.id}`);
    });

  wo
    .command("done <id>")
    .requiredOption("--by <name>")
    .action((id: string, opts: { by: string }) => {
      const order = doneWorkOrder(ws(), id, opts.by);
      console.log(`done ${order.id}`);
    });

  wo
    .command("cancel <id>")
    .requiredOption("--by <name>")
    .option("--reason <text>")
    .action((id: string, opts: { by: string; reason?: string }) => {
      const order = cancelWorkOrder(ws(), id, opts.by, opts.reason);
      console.log(`cancelled ${order.id}`);
    });

  wo
    .command("list")
    .option("--status <status>")
    .option("--type <type>")
    .option("--role <role>")
    .option("--change <id>")
    .option("--prd <slug>")
    .action((opts: { status?: string; type?: string; role?: string; change?: string; prd?: string }) => {
      const orders = listWorkOrders(ws(), {
        status: opts.status as never,
        type: opts.type as never,
        assigneeRole: opts.role,
        change: opts.change,
        prd: opts.prd
      });
      for (const o of orders) console.log(`${o.id}\t${o.status}\t${o.type}\t${o.assigneeRole}\t${o.title}`);
    });

  wo.command("show <id>").action((id: string) => {
    const o = readWorkOrder(ws(), id);
    console.log(JSON.stringify(o, null, 2));
  });

  wo
    .command("inbox")
    .option("--role <role>", "assignee role", "tech-manager")
    .action((opts: { role: string }) => {
      for (const o of inboxWorkOrders(ws(), opts.role)) {
        console.log(`${o.id}\t${o.status}\t${o.type}\t${o.title}`);
      }
    });

  wo
    .command("extract <id>")
    .option("--out <file>")
    .action((id: string, opts: { out?: string }) => {
      const text = buildWorkOrderExtract(ws(), id);
      if (opts.out) {
        fs.writeFileSync(opts.out, text);
        console.log(`wrote ${opts.out}`);
      } else console.log(text);
    });
}

export function registerChangeRequestCommands(program: Command): void {
  const cr = program.command("cr").description("Change requests (requirement/design)");

  cr
    .command("create")
    .requiredOption("--kind <kind>", "requirement-change|design-change")
    .requiredOption("--action <action>", "add|modify|delete")
    .requiredOption("--by <name>")
    .option("--prd <slug>")
    .option("--module <id>")
    .option("--version <ver>")
    .option("--original <text>")
    .option("--change-note <text>")
    .option("--revised <text>")
    .option("--deleted <text>")
    .option("--linked-change <id>")
    .action((opts: {
      kind: string;
      action: string;
      by: string;
      prd?: string;
      module?: string;
      version?: string;
      original?: string;
      changeNote?: string;
      revised?: string;
      deleted?: string;
      linkedChange?: string;
    }) => {
      const request = createChangeRequest(ws(), {
        kind: opts.kind as never,
        action: opts.action as never,
        target: { prd: opts.prd, module: opts.module, version: opts.version },
        payload: {
          original: opts.original,
          changeNote: opts.changeNote,
          revised: opts.revised,
          deleted: opts.deleted
        },
        linkedChange: opts.linkedChange,
        createdBy: opts.by
      });
      console.log(`created ${request.id} status=${request.status}`);
    });

  cr
    .command("submit <id>")
    .requiredOption("--by <name>")
    .action((id: string, opts: { by: string }) => {
      const { cr: request, workorderId } = submitChangeRequest(ws(), id, opts.by);
      console.log(`submitted ${request.id} work order ${workorderId}`);
    });

  cr.command("show <id>").action((id: string) => {
    console.log(showChangeRequestDiff(readChangeRequest(ws(), id)));
  });

  cr.command("list").action(() => {
    for (const r of listChangeRequests(ws())) {
      console.log(`${r.id}\t${r.status}\t${r.kind}\t${r.action}`);
    }
  });
}

export function registerBugCommands(program: Command): void {
  const bug = program.command("bug").description("Bug tracking (enterprise SDLC)");

  bug
    .command("create <change>")
    .requiredOption("--title <title>")
    .requiredOption("--by <name>")
    .option("--severity <level>", "critical|major|minor|trivial", "major")
    .option("--scenario <name>")
    .option("--steps <text>")
    .option("--expected <text>")
    .option("--actual <text>")
    .action((change: string, opts: { title: string; by: string; severity?: string; scenario?: string; steps?: string; expected?: string; actual?: string }) => {
      const { bug: b, workorderId } = createBug(ws(), change, {
        title: opts.title,
        severity: opts.severity as never,
        scenario: opts.scenario,
        steps: opts.steps,
        expected: opts.expected,
        actual: opts.actual,
        createdBy: opts.by
      });
      console.log(`created ${b.id} work order ${workorderId}`);
    });

  bug
    .command("list <change>")
    .option("--status <status>")
    .action((change: string, opts: { status?: string }) => {
      const statuses = opts.status ? [opts.status] : undefined;
      for (const b of listBugs(ws(), change, statuses as never)) {
        console.log(`${b.id}\t${b.status}\t${b.severity}\t${b.title}`);
      }
    });

  bug
    .command("fix <change> <bugId>")
    .requiredOption("--commit <sha>")
    .requiredOption("--by <name>")
    .action((change: string, bugId: string, opts: { commit: string; by: string }) => {
      const { bug: b, retestWoId } = markBugFixed(ws(), change, bugId, opts.commit, opts.by);
      console.log(`bug ${b.id} → retest, work order ${retestWoId}`);
    });

  bug
    .command("close <change> <bugId>")
    .requiredOption("--by <name>")
    .action((change: string, bugId: string, opts: { by: string }) => {
      const b = closeBug(ws(), change, bugId, opts.by);
      console.log(`closed ${b.id}`);
    });
}

export function registerTestCasesCommands(program: Command): void {
  const tc = program.command("test-cases").description("Test case design (enterprise SDLC)");

  tc.command("init <change>").action((change: string) => {
    console.log(`wrote ${scaffoldTestCases(ws(), change)}`);
  });

  tc.command("check <change>").action(async (change: string) => {
    const w = ws();
    const def = w.readHarness().sensors.find((s) => s.id === "test-cases-complete");
    if (!def) throw new Error("test-cases-complete sensor not registered");
    const report = await runSensor(w, def, change, { builtins: builtinSensors });
    console.log(`${report.status.toUpperCase()}  ${report.summary}`);
    if (report.status !== "pass") process.exit(1);
  });

  tc
    .command("submit <change>")
    .requiredOption("--by <name>")
    .action((change: string, opts: { by: string }) => {
      const woId = submitTestCaseReview(ws(), change, opts.by);
      console.log(`submitted test-case-review work order ${woId}`);
    });
}

export function registerSdlcCommands(program: Command): void {
  registerWorkOrderCommands(program);
  registerChangeRequestCommands(program);
  registerBugCommands(program);
  registerTestCasesCommands(program);
}
