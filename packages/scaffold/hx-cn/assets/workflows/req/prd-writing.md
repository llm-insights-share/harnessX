# /hx-req-prd-writing — 组织级 PRD

你正在执行 **req** 阶段任务 `prd-writing`。

## Input
- PRD slug 与标题；可用的调研/分析/原型。

## Steps
1. 缺失时：`hx req prd init <slug> --title "<title>"`。
2. 按 **prd-authoring** / **prd-writing** 填写故事、GWT、范围与 NFR。
3. `hx req check --task prd-writing --prd <slug>`。
4. 人工：`hx gate approve --gate prd --prd <slug> --approver <name>`。

## Output
- PRD 文档 + 人工批准。

## Guardrails
- 仅组织级；不虚构需求，歧义写入 Open Questions。

## Done when
PRD 检查绿灯且已记录人工批准。
