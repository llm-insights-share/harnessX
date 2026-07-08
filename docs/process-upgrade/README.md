# AI编程过程升级资产

本目录提供可直接落地的过程控制资产，覆盖需求分析、设计、编码评审、测试与度量闭环。

## 目录说明

- `templates/requirements-template.md`：需求分析模板（含验收标准与追踪矩阵）。
- `templates/hld-template.md`：概要设计模板（架构、ADR、风险）。
- `templates/lld-template.md`：详细设计模板（接口、数据、异常、测试输入）。
- `templates/pr-template.md`：PR说明模板（需求/设计/测试证据强制项）。
- `templates/test-report-template.md`：测试报告模板（分层结果与发布结论）。
- `release-gate-policy.md`：编码后测试与发布门禁/退出准则。
- `ai-pilot-plan.md`：AI辅助需求与测试试点方案（1-2条业务线）。
- `metrics-dashboard.md`：过程度量看板指标定义与复盘机制。

## 使用建议

1. 需求评审通过后，先建立 `requirements-template` 文档并分配需求ID。
2. 概要设计、详细设计文档均需引用需求ID并回填追踪矩阵。
3. 开发提交PR时，强制使用PR模板并附测试证据。
4. 测试结束后产出测试报告，按发布门禁进行放行决策。
