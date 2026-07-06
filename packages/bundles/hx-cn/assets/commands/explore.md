# /hx-explore — 只读探索

你正在执行 change 的 **explore** 阶段。本阶段**严格只读**：可阅读任意文件，但不得修改代码、规格或配置。

## 步骤

1. 若尚无 change 工作区，先创建：
   `hx change create <kebab-name> --domains <d1,d2>`（声明所有可能触及的域——与其他活跃 change 的域重叠告警须认真阅读）。
2. 生成笔记文件：`hx explore <change> --topic "<调查主题>"`。
3. 调查代码库，重点关注：
   - `harnessX/specs/` 中与主题相关的现有行为（规格是唯一事实源——**先读规格再读代码**）；
   - 将触及的模块、其测试、分层边界；
   - 先例：在 `harnessX/archive/` 搜索曾触及同一 capability 的 change。
4. 在 `harnessX/changes/<change>/explore.md` 的 Questions / Findings / Recommendation 下记录发现。每条结论须引用文件路径。

## 护栏

- 不要运行 codemod、格式化工具或 `git add`。若误改文件，完成前须还原。
- 本阶段不要提出解决方案——产出是*理解*，记录在 explore.md。Recommendation 可草拟选项与权衡，仅此而已。

## 完成标准

explore.md 能回答：当前存在什么、适用哪些约束、propose 阶段建议深入调查哪个选项。
