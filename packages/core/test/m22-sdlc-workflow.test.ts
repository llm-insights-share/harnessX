import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Workspace,
  initWorkspace,
  scaffoldPrd,
  createWorkOrder,
  submitWorkOrder,
  approveWorkOrder,
  listWorkOrders,
  createChange,
  scaffoldProposal,
  createChangeRequest,
  submitChangeRequest,
  approveChangeRequest,
  scaffoldExtendedRequirements,
  scaffoldTestCases,
  submitTestCaseReview,
  createBug,
  markBugFixed,
  closeBug,
  readRoles,
  writeRoles,
  recordPrephaseApproval,
  requirementsExtendedProblems
} from "@harnessx/core";
import YAML from "yaml";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m22-"));

function fillRequirements(ws: Workspace, change: string) {
  scaffoldExtendedRequirements(ws, change);
  const reqDir = ws.requirementsDir(change);
  for (const f of fs.readdirSync(reqDir)) {
    if (!f.endsWith(".md")) continue;
    const p = path.join(reqDir, f);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("<!-- Fill for enterprise-sdlc requirements analysis -->", "Completed for test."), "utf8");
  }
  const intDir = path.join(reqDir, "integrations");
  if (fs.existsSync(intDir)) {
    fs.writeFileSync(path.join(intDir, "index.md"), "# External Integrations\n\n| System | Protocol |\n|--------|----------|\n| CRM | REST |\n", "utf8");
  }
}

describe("M22-M27 enterprise SDLC workflow", () => {
  it("work order state machine: req-review → approve → change create", () => {
    const ws = initWorkspace(tmp()).ws;
    const roles = readRoles(ws);
    roles.members = { "pm.chen": "product-manager", "tm.zhang": "tech-manager" };
    writeRoles(ws, roles);

    const prdFile = scaffoldPrd(ws, "member-badge", "Member Badge");
    fs.writeFileSync(prdFile, fs.readFileSync(prdFile, "utf8") + "\n\n## Goals\nTest PRD\n", "utf8");

    const wo = createWorkOrder(ws, {
      type: "req-review",
      title: "Review PRD",
      scope: "prephase",
      ref: { prd: "member-badge" },
      assigneeRole: "tech-manager",
      createdBy: "pm.chen",
      artifacts: [{ path: "docs/prd/member-badge.md" }]
    });
    submitWorkOrder(ws, wo.id, "pm.chen");
    const { wo: approved } = approveWorkOrder(ws, wo.id, { by: "tm.zhang", note: "OK" });
    expect(approved.status).toBe("approved");

    recordPrephaseApproval(ws, "prd", "tm.zhang", "member-badge");
    const change = createChange(ws, "member-badge", ["member"], "enterprise-sdlc", { prdRef: "member-badge" });
    expect(change.meta.profile).toBe("enterprise-sdlc");
  });

  it("change request apply patches PRD and invalidates approval", () => {
    const ws = initWorkspace(tmp()).ws;
    scaffoldPrd(ws, "orders", "Orders");
    recordPrephaseApproval(ws, "prd", "tm", "orders");

    const cr = createChangeRequest(ws, {
      kind: "requirement-change",
      action: "add",
      target: { prd: "orders", version: "2.0" },
      payload: { revised: "New requirement paragraph." },
      createdBy: "pm"
    });
    submitChangeRequest(ws, cr.id, "pm");
    approveChangeRequest(ws, cr.id, "tm");

    const content = fs.readFileSync(ws.prdFile("orders"), "utf8");
    expect(content).toContain("New requirement paragraph");
    const store = YAML.parse(fs.readFileSync(path.join(ws.root, "docs", ".prephase-approvals.yaml"), "utf8"));
    expect(store.prd.orders).toBeUndefined();
  });

  it("bug lifecycle creates bug-fix and retest work orders", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "fix-bug", ["core"], "standard");
    const { bug, workorderId } = createBug(ws, "fix-bug", { title: "Login fails", createdBy: "qa" });
    expect(bug.status).toBe("open");
    expect(workorderId).toMatch(/^WO-/);

    const { retestWoId } = markBugFixed(ws, "fix-bug", bug.id, "abc123", "dev");
    expect(retestWoId).toMatch(/^WO-/);
    closeBug(ws, "fix-bug", bug.id, "qa");
    expect(fs.readFileSync(ws.bugFile("fix-bug", bug.id), "utf8")).toContain("closed");
  });

  it("test case review work order", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "tc-flow", ["member"], "enterprise-sdlc");
    scaffoldTestCases(ws, "tc-flow");
    const overview = path.join(ws.testCasesDir("tc-flow"), "overview.md");
    fs.writeFileSync(
      overview,
      `# Test Cases\n\n| Case ID | Scenario | Priority | Steps | Expected | Status |\n|---------|----------|----------|-------|----------|--------|\n| TC-001 | happy path | P1 | step | ok | ready |\n`,
      "utf8"
    );
    const woId = submitTestCaseReview(ws, "tc-flow", "qa");
    const pending = listWorkOrders(ws, { type: "test-case-review", change: "tc-flow" });
    expect(pending.some((w) => w.id === woId)).toBe(true);
  });

  it("extended requirements scaffold on enterprise-sdlc propose path", () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "ext-req", ["member"], "enterprise-sdlc");
    scaffoldProposal(ws, "ext-req", "Extended");
    const created = scaffoldExtendedRequirements(ws, "ext-req");
    expect(created.length).toBeGreaterThan(0);
    fillRequirements(ws, "ext-req");
    expect(requirementsExtendedProblems(ws, "ext-req")).toHaveLength(0);
  });
});
