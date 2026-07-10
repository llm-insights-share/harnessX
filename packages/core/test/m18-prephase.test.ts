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
  resolvePrdSlug,
  readArchRegistry,
  buildPrdPack,
  buildArchPack,
  writeArchRegistry
} from "@harnessx/core";
import { prdComplete, archHldComplete, archLldComplete, archChangeAlign } from "@harnessx/sensors";
import { collectCommands } from "@harnessx/adapters";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m18-"));

describe("M18 pre-phase PRD and arch", () => {
  it("scaffolds PRD and passes prd-complete when filled", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldPrd(ws, "member-badge", "Member badge");
    const file = ws.prdFile("member-badge");
    const body = fs.readFileSync(file, "utf8");
    fs.writeFileSync(
      file,
      `${body}
## 用户故事
| US-001 | user | see badge | motivation | P0 |
## 验收标准
| AC-001 | GIVEN logged in | WHEN open profile | THEN badge shows | US-001 |
### In Scope
- badge display
## Out of Scope
- none
## 非功能需求
### 性能
p99 < 200ms
## 评审结论
- 评审结果：通过
`
    );
    const report = prdComplete({ ws, prdSlug: "member-badge", def: { id: "prd-complete" } as never });
    expect(report.status).toBe("pass");
  });

  it("scaffolds global HLD and registry", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    const res = scaffoldArchHld(ws, "Shop");
    expect(fs.existsSync(res.overview)).toBe(true);
    expect(fs.existsSync(res.registry)).toBe(true);
    fs.writeFileSync(
      res.overview,
      `# HLD
## 系统边界与上下游
boundary
## 架构方案与模块划分
arch
### 模块职责
| m | r | i | o | c |
| shop | shop | api | db | none |
## 数据流与关键流程
flow
## 非功能设计
nfr
## ADR
### ADR-001
- Decision: modular
- Alternatives: none
- Consequences: ok
## 风险清单
low
`
    );
    const report = archHldComplete({ ws, def: { id: "arch-hld-complete" } as never });
    expect(report.status).toBe("pass");
  });

  it("scaffolds module LLD and resolves for change domains", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldArchHld(ws, "Shop");
    const reg = readArchRegistry(ws);
    reg.modules = [{ id: "order", lld: "modules/order/lld.md", capabilities: ["order-refund"], status: "active" }];
    writeArchRegistry(ws, reg);
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
    const lldReport = archLldComplete({ ws, archModule: "order", def: { id: "arch-lld-complete" } as never });
    expect(lldReport.status).toBe("pass");
    createChange(ws, "partial-refund", ["order-refund"], "enterprise", { archModules: ["order"] });
    const align = archChangeAlign({ ws, change: "partial-refund", def: { id: "arch-change-align" } as never });
    expect(align.status).toBe("pass");
  });

  it("resolvePrdSlug uses meta.prdRef", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    createChange(ws, "feat-a", ["core"], "standard", { prdRef: "my-prd" });
    expect(resolvePrdSlug(ws, "feat-a")).toBe("my-prd");
  });

  it("collectCommands includes req/arch stage commands", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    const cmds = collectCommands(ws);
    expect(cmds.some((c) => c.name === "hx-req-prd-writing")).toBe(true);
    expect(cmds.some((c) => c.name === "hx-arch-subsystem-division")).toBe(true);
    expect(cmds.some((c) => c.name === "hx-arch-internal-interface")).toBe(true);
  });

  it("buildPrdPack and buildArchPack assemble guides", () => {
    const { ws } = initWorkspace(tmp(), { bundle: "api-service" });
    scaffoldPrd(ws, "x", "X");
    const prdPack = buildPrdPack(ws, "x");
    expect(prdPack.sections.some((s) => s.title.includes("prd-authoring"))).toBe(true);
    scaffoldArchHld(ws, "Sys");
    const archPack = buildArchPack(ws);
    expect(archPack.stage).toBe("arch");
  });
});
