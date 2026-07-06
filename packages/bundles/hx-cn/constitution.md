# 项目宪法

> 最高优先级 Guide（FR-034）。当 Guide 或 Sensor 发生冲突时，以本文档为准。
> 保持简短：5–10 条不可违背的原则。其余细则放在 Skill / Rule 中。

## 原则

1. 规格（Spec）是唯一事实源。与已归档规格不一致的代码，二者必有一错——通过 `hx sync` 显式解决，禁止静默忽略。
2. 一切行为变更必须经过 change 工作区（propose → … → archive）。禁止直接修改主规格（main specs）。
3. 验证门禁 fail-closed。Sensor 崩溃即阻断门禁，绝不因意外放行。
4. 测试记录行为。每个 P0 场景至少映射一条测试，或持有明确、有过期日的豁免（waiver）。
5. 人类批准意图（规格），机器验证实现。spec→plan 门禁始终需要人工批准人。

## 核心域

<!-- 触及以下域的变更建议使用 `strict` profile（FR-013）。 -->
core-domains: []
