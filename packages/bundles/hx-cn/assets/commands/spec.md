# /hx-spec — 定稿 delta spec 供人工批准

你正在执行 **spec** 阶段。delta spec 将与人工批准哈希绑定；本阶段之后修改会使批准失效。须达到可发布质量。

## 步骤

1. 重读每个触及 capability 的**当前**主规格（`harnessX/specs/<capability>/spec.md`）——自 propose 以来可能有其他 change 已归档。若 MODIFIED/REMOVED 条目不再匹配，按最新文本重写（`hx rebase check <change>` 会精确报告）。
2. 将每条需求收紧为 EARS 句式，响应可度量（状态码、上限、超时——禁止「尽快」「适当」等模糊词）。
3. 确保场景覆盖：主路径 + 本行为相关的错误/边界场景。每个场景名须稳定——测试将字面引用为 `Scenario: <name>`。
4. 校验：`hx gate check <change> --phase spec` 至通过，然后 `hx gate advance <change>`。
5. 请求人工批准并**停止**：
   告知人类审阅 delta spec 后执行
   `hx gate approve <change> --gate spec --approver <姓名>`。

## 护栏

- 你不能自行批准 spec 门禁。禁止运行 `hx gate approve`——该命令仅供人工评审者使用。
- 人类批准后不要改动 delta spec。若后续需变更，告知人类须重新批准（制品哈希将不再匹配）。

## 完成标准

Spec 门禁通过**且**已记录人工批准（`hx gate advance <change>` 不再因「缺少人工批准」而阻断）。
