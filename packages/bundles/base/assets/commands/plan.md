# /hx-plan — generate and review the dual-track task list

You are running the **plan** phase. The output is `tasks.md`: for every scenario a `[test]` task and an `[impl]` task, in dependency order.

## Steps

1. Generate: `hx plan <change>`. This derives tasks from the approved delta specs — one test task and one impl task per scenario.
2. Review the generated `harnessX/changes/<change>/tasks.md` and edit where needed:
   - reorder tasks so foundations (schemas, data access) come before consumers;
   - split any impl task you estimate above ~1 file × ~200 lines into smaller tasks (keep the scenario reference on each);
   - add setup tasks (migrations, config) that scenarios imply but do not state — mark them `[impl]` with the nearest scenario reference.
3. Do NOT delete test tasks. In strict profiles the apply gate refuses to start if a scenario has an impl task but no test task.
4. Sanity-check against design.md: every ADR consequence that requires work must appear as a task.

## Guardrails

- Tasks must reference scenario names verbatim — traceability scanning matches on the exact `Scenario:` string.
- No implementation in this phase; `tasks.md` is the only file you touch.

## Done when

`tasks.md` is ordered, complete, and each task is small enough to implement and self-correct within one apply iteration. Then `hx gate advance <change>`.
