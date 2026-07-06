# /hx-plan — 生成并审阅双轨任务列表

你正在执行 **plan** 阶段。产出为 `tasks.md`：每个场景一条 `[test]` 任务和一条 `[impl]` 任务，按依赖排序。

## 步骤

1. 生成：`hx plan <change>`。从已批准的 delta spec 派生任务——每个场景一条测试任务、一条实现任务。
2. 审阅并编辑 `harnessX/changes/<change>/tasks.md`：
   - 将基础任务（schema、数据访问）排在消费方之前；
   - 将超过约 1 文件 × 200 行的 impl 任务拆分（每条仍引用场景）；
   - 补充场景隐含但未写明的准备任务（迁移、配置）——标为 `[impl]` 并引用最近场景。
3. **不要**删除测试任务。strict profile 下若某场景有 impl 无 test，apply 门禁拒绝启动。
4. 对照 design.md：每个需要工作的 ADR 后果须体现为任务。

## 护栏

- 任务须字面引用场景名——traceability 按精确 `Scenario:` 字符串匹配。
- 本阶段不写实现；仅修改 `tasks.md`。

## 完成标准

`tasks.md` 已排序、完整，每条任务足够小，可在一次 apply 迭代内实现并自校正。然后 `hx gate advance <change>`。
