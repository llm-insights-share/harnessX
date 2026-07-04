# /hx-apply — implement task-by-task with self-correction

You are running the **apply** phase. Work through `tasks.md` strictly in order, one task at a time, running the fast sensor suite after each.

## Steps

For EACH unchecked task in `harnessX/changes/<change>/tasks.md`:

1. Load context: `hx guide pack <change> --phase apply` — obey the skills and constraints in the pack; they outrank your defaults.
2. **[test] tasks**: write a failing test for the referenced scenario. Name it so the scenario string appears verbatim (e.g. `it("Scenario: 部分退款金额校验", ...)`). Run it, confirm it fails for the right reason.
3. **[impl] tasks**: implement the minimal code to make the referenced scenario's tests pass. Follow layer constraints (`guide.constraint` assets) — the arch-boundary sensor will block violations at verify.
4. After the task: run `hx gate check <change> --phase apply` (fast suite). If it fails, read each finding's `fix_hint`, fix, and re-run — up to the configured retry budget. Never weaken a test or delete an assertion to get past a sensor.
5. Mark the task done in tasks.md (`- [x]`), then move to the next task.

Alternatively drive the whole loop with `hx apply <change> --runner "<agent command>"` — the loop feeds failures back via `$HX_FIX_HINTS`.

## Guardrails

- Approved fixtures (`harnessX/fixtures/`) and human-approved test files are hash-locked; modifying them fails the gate. If a fixture is genuinely wrong, stop and tell the human to re-approve.
- Do not touch delta specs during apply. If implementation reveals a spec problem, stop, report it, and ask the human — spec changes require re-approval.
- Stay within the declared domains of the change; if you must edit files in an undeclared domain, stop and say so.

## Done when

All tasks checked, fast suite green: `hx gate advance <change>`.
