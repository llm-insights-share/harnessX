# Scenario 02: Add "Partial Refund" to Order Service (Standard Profile Full Flow)

## Background

Order service (order-service) already uses HarnessX. Main spec `harnessX/specs/order-refund/spec.md` has existing "full refund" requirements. Product now wants **partial refund**: multiple refunds per order, cumulative refund amount must not exceed paid amount.

Roles:

- **Li** (backend dev): owns this change, uses Cursor agent daily for code;
- **Zhang** (architect): human approver for spec→plan (CODEOWNERS owner of `harnessX/changes/**/specs/`).

## Steps

### 1. Create change and draft proposal (Cursor dialog driven)

Li creates the change workspace in the terminal:

```console
$ hx change create partial-refund --domains order-refund
Created change "partial-refund" (profile: standard, domains: order-refund)
```

Then in Cursor Agent dialog, drive the propose phase with a slash command:

```text
Cursor ▸ /hx-propose partial-refund
         Requirement: support partial refund. Multiple refunds per order;
         cumulative refund must not exceed paid amount.
         Product doc: @docs/prd/partial-refund.md
```

The `/hx-propose` body (compiled from `harnessX/assets/commands/propose.md`) directs the agent to:

1. Run `hx propose partial-refund --title "Support partial refund"` to scaffold (proposal.md + delta spec skeleton);
2. Fill proposal.md Why / What Changes / Impact / Out of Scope from the PRD — remove template placeholders — **incomplete proposal blocks the design gate**;
3. Read existing "full refund" text in `harnessX/specs/order-refund/spec.md`, then write the delta spec (spec-writing Skill auto-mounts for EARS phrasing and scenario naming);
4. Run `hx gate check partial-refund --phase spec` — do not finish until green.

Guardrails in the command prompt: no implementation code in this phase; do not invent requirements absent from the PRD (put in Out of Scope); list ambiguities at the top of proposal.md for humans, do not decide for Li.

### 2. Write delta spec (EARS phrasing)

Agent output in `harnessX/changes/partial-refund/specs/order-refund/spec.md` (Li reviews section by section in Cursor diff):

```markdown
# Delta for order-refund

## ADDED Requirements

### Requirement: Partial refund
WHEN a refund request for amount X is received and X + total refunded <= order paid amount, THE SYSTEM SHALL create a refund of amount X and return 201.

#### Scenario: partial refund accepted
- GIVEN an order paid 100, already refunded 30
- WHEN requesting refund of 50
- THEN create refund record, cumulative refund 80

#### Scenario: refund exceeding paid amount rejected
- GIVEN an order paid 100, already refunded 30
- WHEN requesting refund of 80
- THEN return 422, error code REFUND_EXCEEDS_PAID

## MODIFIED Requirements

### Requirement: Full refund
WHEN a full refund request is received, THE SYSTEM SHALL treat it as partial refund for the remaining refundable amount.

#### Scenario: full refund reuses partial path
- GIVEN an order paid 100, already refunded 30
- WHEN requesting full refund
- THEN create 70 refund record
```

Bad format is blocked immediately. If the agent's first draft omits a second Scenario for "partial refund" or uses untestable wording like "refund promptly", self-check hits:

```console
$ hx gate check partial-refund --phase spec
BLOCKER  spec-validate: 1 spec problem(s) across 1 delta file(s)
GATE BLOCKED (spec)
```

Each finding in the sensor report (written to `runs/telemetry.jsonl`, input for `hx fix`) includes `fix_hint`. Agent fixes and re-runs — the write→check→fix loop happens in one Cursor session without Li intervening.

### 3. Phase advancement: design → spec → human approval → plan

Design phase is also Cursor-driven:

```text
Cursor ▸ /hx-design partial-refund
```

The agent runs `hx design partial-refund` (internally checks propose completeness first), then fills design.md: Context, ADR (key decision: "full refund reuses partial refund path", with rejected alternatives and reasons), architecture constraints mechanically checkable by sensors. After Li reviews, terminal advances phases (gate advancement is control plane — audit trail):

```console
$ hx gate advance partial-refund        # → designed (prerequisite: complete proposal)
GATE PASS (design)
advanced: proposed → designed

$ hx gate advance partial-refund        # → specified (fast suite: spec-validate)
GATE PASS (spec)
advanced: designed → specified
```

Direct advance to plan is blocked by human approval gate:

```console
$ hx gate advance partial-refund
BLOCKER  spec→plan requires human approval: hx gate approve <change> --gate spec --approver <name> (FR-012)
GATE BLOCKED (plan)
```

Zhang reviews the delta spec (GitHub CODEOWNERS enforces review), confirms "full refund reuses partial path" is sound, then approves:

```console
$ hx gate approve partial-refund --gate spec --approver zhang.arch
approved gate "spec" by zhang.arch at 2026-07-04T09:12:33.201Z (artifact 3f6b1c9a02d4)
```

Note the **artifact hash** in output: approval binds to spec content at approval time. Silent delta edits afterward fail CI `meta verify`.

```console
$ hx plan partial-refund
wrote harnessX/changes/partial-refund/tasks.md (6 tasks)

$ hx gate advance partial-refund
GATE PASS (plan)
advanced: specified → planned
```

tasks.md is dual-track — each Requirement gets a test task (a) and impl task (b):

```markdown
- [ ] 01a [test] (order-refund / Requirement: Partial refund) Write failing test(s) for scenarios of "Partial refund"
- [ ] 01b [impl] (order-refund / Requirement: Partial refund) Implement "Partial refund" until its tests pass
- [ ] 02a [test] (order-refund / Requirement: Full refund) ...
```

After generation, the agent can review via `/hx-plan partial-refund` prompt rules: foundation tasks first, split oversized tasks, every ADR consequence in design.md has a task, **never delete any [test] task**.

### 4. apply: task-by-task drive + fast suite self-correction

Two equivalent ways to drive apply.

**Option A: Cursor dialog interactive** (good for watching progress):

```text
Cursor ▸ /hx-apply partial-refund
```

`/hx-apply` prompt has the agent work tasks.md in order: each `[test]` task writes failing tests (names include `Scenario:` verbatim); each `[impl]` task implements until scenarios pass; **after each task run `hx gate check partial-refund --phase apply` (fast suite), read `fix_hint` on failure, never pass by weakening tests or deleting assertions**; check off task in tasks.md before next. Li sees diffs per task and can interrupt.

**Option B: Terminal headless loop** (good for batch runs). Hook Cursor CLI (`cursor-agent`) into apply loop; `$HX_TASK_*` env carries task context, `$HX_FIX_HINTS` carries prior failure hints:

```console
$ hx apply partial-refund --runner 'cursor-agent --prompt-file <(hx guide pack partial-refund --phase apply --out /dev/stdout) --task "$HX_TASK_TITLE"'
(runner output to terminal; 01b fails lint first round, passes second round via $HX_FIX_HINTS self-correction)
completed tasks: 01a, 01b, 02a, 02b, 03a, 03b; remaining: 0
```

Either way, fast suite (lint/typecheck/spec-validate per `harness.yaml`) runs after each task; agent self-corrects with `fix_hint`, max N retries (`--max-retries`, default 3), then stops for human. Cursor `.cursor/hooks.json` also watches: touching `tests/fixtures/` triggers `hx fixture verify` on save.

Tests use `Scenario:` naming for traceability:

```typescript
it("Scenario: refund exceeding paid amount rejected", async () => { ... });
```

### 5. verify → archive

```console
$ hx verify partial-refund
VERIFIED

$ hx archive partial-refund
Archived to harnessX/archive/2026-07-04-partial-refund
Merged capabilities: order-refund
```

If a Scenario lacks a test, verify pinpoints it:

```console
BLOCKER  uncovered scenario "full refund reuses partial path" (order-refund/Full refund) — add a test containing "Scenario: full refund reuses partial path" or a waiver
NOT VERIFIED
```

Return to Cursor — `/hx-verify partial-refund` prompt teaches two cases (test exists but missing scenario string → add reference; test truly missing → add test), then re-run `hx verify`. archive merges delta into main spec — Li runs in terminal.

archive does three things: MODIFIED "full refund" replaces old main spec text; ADDED "partial refund" appended; change directory moves to `archive/2026-07-04-partial-refund/`; generates `retro.md` (sensor failure distribution for Steering input, see scenario 07).

## Key mechanisms

- **Spec-first meaning**: before code, agent Context Pack (`hx guide pack --phase apply`) contains only this change's design/tasks/delta spec + constitution + apply Skills — **no noise from other changes** — feedforward for context quality.
- **Human approval approves intent**: machines verify implementation (tests, lint, architecture); humans confirm "we are building this" only at spec→plan. Approval carries artifact hash; post-hoc spec edits are detected.
- **Self-correction cap**: unlimited retries let agents drift wrong. Cap + `hx fix --change partial-refund --sensor lint` for focused repair packs is a cheaper recovery path.
