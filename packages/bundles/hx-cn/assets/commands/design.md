# /hx-design — 概要设计（HLD）+ 详细设计（LLD）

你正在执行 **design** 阶段。前置：proposal 完整。

## 步骤

1. `hx design <change>` — 渲染 design-template 到 `design/overview.md` 及 LLD 目录。
2. 阅读 Context Pack 中的**组织级 HLD** 与**模块 LLD**（`docs/architecture/`）。
3. 填写 **HLD**（design-template）：Context、API Surface、Data Model、ADR 等。
4. 填写 **LLD**：
   - `design/ui/pages.md` — 页面清单；
   - `design/ui/components/<slug>.md` — 组件级设计；
   - `design/api/*.yaml`、`design/data/*.sql` 按需。
5. 遵循 **fe-layout**、**design-tokens** Skill；API 与 delta spec 对齐。
6. `hx gate check <change> --phase design`（enterprise：`arch-approved`、HLD/LLD/align 传感器）。
7. `hx gate advance <change>`。

## 护栏

- 不写生产代码；设计产物仅在 `design/` 下。

## 完成标准

HLD 章节齐全，新 UI/API 有 LLD，design 门禁通过。
