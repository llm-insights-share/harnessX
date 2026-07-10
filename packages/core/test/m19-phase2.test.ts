import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  createChange,
  scaffoldPrd,
  scaffoldArchHld,
  scaffoldArchLld,
  recordPrephaseApproval,
  isPrephaseApproved,
  promoteArchFromChange,
  gateCheck,
  readMeta
} from "@harnessx/core";
import { prdApproved, archApproved, archDrift, builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m19-"));

function fillPrd(file: string) {
  const body = fs.readFileSync(file, "utf8");
  fs.writeFileSync(
    file,
    `${body}
## 用户故事
| US-001 | user | goal | motivation | P0 |
## 验收标准
| AC-001 | GIVEN x | WHEN y | THEN z | US-001 |
### In Scope
- feature
## Out of Scope
- none
## 非功能需求
### 性能
p99 ok
## 评审结论
- 评审结果：通过
`
  );
}

function fillArchOverview(file: string) {
  fs.writeFileSync(
    file,
    `# HLD
## 系统边界与上下游
boundary
## 架构方案与模块划分
arch
### 模块职责
| m | r | i | o | c |
| order | orders | api | db | none |
## 数据流与关键流程
flow
## 非功能设计
nfr
## ADR
### ADR-001
- Decision: use modular monolith
- Alternatives: microservices
- Consequences: simpler ops
## 风险清单
low
`
  );
}

describe("M19 pre-phase phase 2", () => {
  it("records and validates PRD human approval", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldPrd(ws, "feat-a", "Feat A");
    fillPrd(ws.prdFile("feat-a"));
    expect(isPrephaseApproved(ws, "prd", "feat-a")).toBe(false);
    recordPrephaseApproval(ws, "prd", "pm", "feat-a");
    expect(isPrephaseApproved(ws, "prd", "feat-a")).toBe(true);
    const report = prdApproved({ ws, prdSlug: "feat-a", def: { id: "prd-approved" } as never });
    expect(report.status).toBe("pass");
  });

  it("records and validates global arch approval", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldArchHld(ws, "Shop");
    fillArchOverview(ws.archOverviewFile());
    recordPrephaseApproval(ws, "arch", "architect");
    expect(isPrephaseApproved(ws, "arch")).toBe(true);
    const report = archApproved({ ws, def: { id: "arch-approved" } as never });
    expect(report.status).toBe("pass");
  });

  it("enterprise propose blocks without prd-approved", async () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldPrd(ws, "badge", "Badge");
    fillPrd(ws.prdFile("badge"));
    createChange(ws, "member-badge", ["member"], "enterprise", { prdRef: "badge" });
    fs.writeFileSync(
      path.join(ws.changeDir("member-badge"), "proposal.md"),
      "# Proposal\n\n## Problem\nx\n\n## Approach\ny\n\n## Scope\nz\n"
    );
    const res = await gateCheck(ws, "member-badge", { task: "propose" }, { builtins: builtinSensors });
    expect(res.passed).toBe(false);
    expect(res.blockers.join()).toMatch(/not approved/);
    recordPrephaseApproval(ws, "prd", "pm", "badge");
    const ok = await gateCheck(ws, "member-badge", { task: "propose" }, { builtins: builtinSensors });
    expect(ok.blockers.join()).not.toMatch(/not approved/);
  });

  it("promotes change design into module LLD", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldArchHld(ws, "Shop");
    fillArchOverview(ws.archOverviewFile());
    scaffoldArchLld(ws, "order", "Order");
    const lld = ws.archModuleLld("order");
    fs.writeFileSync(
      lld,
      `# LLD
## 组件与职责
| c | r | i | d |
## 接口契约
| IF-001 | API | in | out | E1 | yes |
## 数据模型与存储
x
## 核心流程与状态机
x
## 异常处理与降级
x
## 安全与权限控制
x
`
    );
    createChange(ws, "partial-refund", ["order-refund"], "enterprise", { archModules: ["order"] });
    const designDir = ws.designDir("partial-refund");
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, "overview.md"),
      "# Design\n\n| POST | /v1/orders/refund |\n|---|---|\n| POST | /v1/orders/refund | refund endpoint |\n"
    );
    const result = promoteArchFromChange(ws, "partial-refund", { by: "architect" });
    expect(result.modules).toEqual(["order"]);
    const text = fs.readFileSync(lld, "utf8");
    expect(text).toContain("Promoted from change `partial-refund`");
    const meta = readMeta(ws, "partial-refund");
    expect(meta.archPromoted?.modules).toEqual(["order"]);
  });

  it("arch-drift warns when design not promoted", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldArchHld(ws, "Shop");
    scaffoldArchLld(ws, "order", "Order");
    fs.writeFileSync(
      ws.archModuleLld("order"),
      `# LLD
## 组件与职责
| c | r | i | d |
## 接口契约
| IF-001 | API | in | out | E1 | yes |
## 数据模型与存储
x
## 核心流程与状态机
x
## 异常处理与降级
x
## 安全与权限控制
x
`
    );
    createChange(ws, "c1", ["order"], "enterprise", { archModules: ["order"] });
    fs.mkdirSync(ws.designDir("c1"), { recursive: true });
    fs.writeFileSync(path.join(ws.designDir("c1"), "overview.md"), "| POST | /v1/orders/new |\n");
    const report = archDrift({ ws, change: "c1", def: { id: "arch-drift" } as never });
    expect(report.findings.some((f) => f.message.includes("not promoted"))).toBe(true);
  });
});
