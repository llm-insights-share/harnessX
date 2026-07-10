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
  buildContextPack,
  archPromoteProblems,
  recordPrephaseApproval,
  extractPromotableContent,
  mergePromotedIntoLld,
  promoteArchFromChange,
  gateCheck,
  setStageTask,
  readMeta
} from "@harnessx/core";
import { archApproved, builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-p012-"));

function fillPrd(file: string) {
  fs.writeFileSync(
    file,
    `# PRD
## 用户故事
| US-001 | u | g | m | P0 |
## 验收标准
| AC-001 | GIVEN x | WHEN y | THEN z | US-001 |
### In Scope
- a
## Out of Scope
- n
## 非功能需求
### 性能
ok
## 评审结论
- 通过
`
  );
}

describe("P0-P2 integration", () => {
  it("buildContextPack injects org PRD on propose and module LLD on design", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldPrd(ws, "feat", "Feat");
    fillPrd(ws.prdFile("feat"));
    scaffoldArchHld(ws, "Sys");
    fs.writeFileSync(
      ws.archOverviewFile(),
      `# HLD\n## 系统边界与上下游\nb\n## 架构方案与模块划分\na\n### 模块职责\n| m | r | i | o | c |\n| order | o | i | o | c |\n## 数据流与关键流程\nf\n## 非功能设计\nn\n## ADR\n### ADR-001\n- Decision: x\n## 风险清单\nr\n`
    );
    scaffoldArchLld(ws, "order", "Order");
    fs.writeFileSync(
      ws.archModuleLld("order"),
      `# LLD\n## 组件与职责\n| c | r | i | d |\n## 接口契约\n| IF-001 | API | in | out | E1 | yes |\n## 数据模型与存储\nx\n## 核心流程与状态机\nx\n## 异常处理与降级\nx\n## 安全与权限控制\nx\n`
    );
    createChange(ws, "c1", ["order"], "enterprise", { prdRef: "feat", archModules: ["order"] });
    const proposePack = buildContextPack(ws, "c1", "dev", "propose");
    expect(proposePack.sections.map((s) => s.title).join()).toContain("Org PRD: feat");
    const pack = buildContextPack(ws, "c1", "dev", "design");
    const titles = pack.sections.map((s) => s.title).join("\n");
    expect(titles).not.toContain("Org PRD: feat");
    expect(titles).toContain("Org architecture HLD");
    expect(titles).toContain("Org module LLD: order");
  });

  it("enterprise design gate requires arch-approved", async () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldArchHld(ws, "Sys");
    fs.writeFileSync(
      ws.archOverviewFile(),
      `# HLD\n## 系统边界与上下游\nb\n## 架构方案与模块划分\na\n### 模块职责\n| m | r | i | o | c |\n## 数据流与关键流程\nf\n## 非功能设计\nn\n## ADR\n### ADR-001\n- Decision: x\n## 风险清单\nr\n`
    );
    createChange(ws, "c1", ["order"], "enterprise");
    fs.writeFileSync(path.join(ws.changeDir("c1"), "proposal.md"), "## Why\nx\n## What Changes\ny\n## Impact\nz\n");
    const blocked = await gateCheck(ws, "c1", { task: "design" }, { builtins: builtinSensors });
    expect(blocked.blockers.join()).toMatch(/not approved/);
    recordPrephaseApproval(ws, "arch", "architect");
    const ok = await gateCheck(ws, "c1", { task: "design" }, { builtins: { "arch-approved": archApproved } as never });
    expect(ok.blockers.join()).not.toMatch(/arch-approved.*not approved/);
  });

  it("structured promote merges API rows into module LLD interface table", () => {
    const design = `## API Surface\n| POST | /v1/orders/refund | refund | auth |\n`;
    const content = extractPromotableContent(design, []);
    const lld = `# LLD\n## 接口契约\n| IF-001 | API | in | out | E1 | yes |\n`;
    const merged = mergePromotedIntoLld(lld, "partial-refund", content, "2026-07-09");
    expect(merged).toContain("IF-002");
    expect(merged).toContain("/v1/orders/refund");
    expect(merged).toContain("Promoted from change `partial-refund`");
  });

  it("enterprise archive blocks without arch promote", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldArchLld(ws, "order", "Order");
    fs.writeFileSync(
      ws.archModuleLld("order"),
      `# LLD\n## 组件与职责\n| c | r | i | d |\n## 接口契约\n| IF-001 | API | in | out | E1 | yes |\n## 数据模型与存储\nx\n## 核心流程与状态机\nx\n## 异常处理与降级\nx\n## 安全与权限控制\nx\n`
    );
    createChange(ws, "c1", ["order"], "enterprise", { archModules: ["order"] });
    setStageTask(ws, "c1", "dev", "verify");
    fs.mkdirSync(ws.designDir("c1"), { recursive: true });
    fs.writeFileSync(ws.designOverviewFile("c1"), "| POST | /v1/x |\n");
    const meta = readMeta(ws, "c1");
    expect(archPromoteProblems(ws, "c1", meta).length).toBeGreaterThan(0);
    promoteArchFromChange(ws, "c1");
    expect(archPromoteProblems(ws, "c1", readMeta(ws, "c1")).length).toBe(0);
  });
});
