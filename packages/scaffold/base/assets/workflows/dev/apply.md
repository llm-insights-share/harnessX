# /hx-dev-apply — implement tasks with fast suite

You are running the **dev** stage task `apply`.

## Input
- Change id; unchecked tasks in `tasks.md`.

## Steps
1. For each task: load `hx guide task-pack <change> <taskId>`; TDD (`Scenario:` in test titles); implement the slice.
2. After each task: `hx gate check <change> --stage dev --task apply`; mark `- [x]`.
3. Or: `hx apply <change> --runner "<agent>"`.

## Output
- Implemented code + tests for all tasks; tasks.md checked off.

## Guardrails
- Do not edit delta specs, meta.yaml, or approved fixtures.
- Stay within declared domains; use `fix_hint` / `hx fix` — never weaken tests to pass.

## Done when
All tasks checked and `hx gate check <change> --stage dev --task apply` is green.
