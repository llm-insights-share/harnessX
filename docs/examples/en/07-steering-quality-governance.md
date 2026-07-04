# Scenario 07: AI Delivery Quality Governance — From Repeated Failures to Rule Assets (Steering Loop)

## Background

Order team ran HarnessX for six weeks; throughput up, but tech lead Wang sees two hidden costs:

1. Agent repeats **the same class of mistakes** (e.g. `new Date()` directly in service layer causing flaky tests) — sensors catch and retry each time; retries cost tokens and time;
2. Human code review repeats **the same comments** ("errors swallowed without classification") — some quality goals not yet machine rules.

Steering loop goal: **distill both signal types into harness assets** — prevent next time, not just intercept every time.

## Steps

### 1. Failure report: who fails repeatedly

```console
$ hx steer report
PATTERN 11x unit-changed::flaky time-dependent assertion in <file> expected <n> to be <n> (changes: partial-refund, refund-notify, order-split)
PATTERN 5x arch-boundary::layer "services" may not import layer "routes" (<file> -> <file>) (changes: order-split, bulk-cancel)
        2x lint::no-floating-promises in <file>
```

Failure catalog (`harnessX/runs/failure-catalog.jsonl`) accumulates automatically from Sensor Runner; messages normalized (file names/line numbers/hashes stripped) so "same class of error" clusters into one signature. **≥3 occurrences marked PATTERN** — governance candidates.

Top item: time-related flaky assertions failed 11 times across 3 changes.

### 2. Distill into Guide (feedforward: agent does not repeat)

```console
$ hx steer distill "flaky time-dependent" --kind guide.skill
draft asset written: harnessX/assets/guides/distilled-flaky-time-dependent-assertion-in-file
review and promote it via: hx asset promote <id> --to trial
```

Draft includes evidence chain (provenance points to failure signature + 3 source changes). Wang rewrites Guidance section as executable rules:

```markdown
## Guidance
- Service layer MUST NOT call `new Date()` / `Date.now()` directly; inject `Clock` interface, use `FixedClock` in tests.
- When asserting time fields, compare business semantics (e.g. `expiresInSeconds`), not absolute timestamps.
```

After review, promote to trial and attach to apply phase guides in `harness.yaml`:

```console
$ hx asset promote harnessX/assets/guides/distilled-flaky-time-dependent-assertion-in-file --to trial
distilled-flaky-time-dependent-assertion-in-file → trial
```

Apply phase Context Pack now carries this Skill — **problem moves from "feedback intercept" to "feedforward prevention"**.

Do not skip: re-run `hx adapter sync` so new Skill compiles to `.cursor/skills/distilled-.../SKILL.md` (and Claude/Trae/Qoder equivalents). Cursor users need do nothing — agent writing tests in apply phase auto-gets "inject Clock, don't compare absolute timestamps". Quick verification in Cursor:

```text
Cursor ▸ Write a test for coupon expiry logic
Agent  ▸ (per Skill uses FixedClock injection not new Date(), asserts expiresInSeconds
          not absolute timestamp)
```

### 3. Harvest human review comments → Rubric rules (feedback: machine watches)

Export last 30 days PR review comments (`gh api` → JSON `[{pr, author, body}]`), feed to harvester for clustering:

```console
$ hx steer harvest-pr --from /tmp/review-comments.json
draft rubric rule rule-001 (topic: error-handling, 9 comments) → harnessX/assets/rubrics/team-review/rules.yaml
draft rubric rule rule-002 (topic: naming, 4 comments) → harnessX/assets/rubrics/team-review/rules.yaml
```

9 comments cluster on error-handling — the "swallow errors" problem. Wang refines draft into judgeable rules (heuristic patterns for heuristic judge; no pattern → LLM judge):

```yaml
rules:
  - id: rule-001
    status: trial          # trial first: info only, no block
    check: catch blocks must not silently swallow errors — rethrow classified (DomainError) or log with context
    pattern: "catch\\s*(\\([^)]*\\))?\\s*\\{\\s*\\}"
    severity: block        # effective as block only after enforced promotion
```

Daily ad-hoc checks:

```console
$ hx rubric add "Refund code must log structured logs with orderId" --pattern "refund(?![\\s\\S]{0,200}orderId)" --severity warn
added rule-003 (draft) to harnessX/assets/rubrics/team-review/rules.yaml
```

Semantic rules can use local LLM judge (redaction middleware replaces suspected secrets with `[REDACTED]`, `budget_tokens` limits review content):

```console
$ export HX_JUDGE_CMD="ollama-judge --model qwen3"      # stdin: {rule, content} → stdout: {violation, note}
$ hx verify order-split      # verification suite ai-spec-review uses this judge
```

### 4. Data-driven rule lifecycle (trial → enforced / retire)

During trial, rules produce info-level findings only. Feed false positives back:

```console
$ hx rubric feedback harnessX/assets/rubrics/team-review/rules.yaml rule-001 --false-positive
rule-001: 1/12 false positives (8%)
```

Two weeks later — 12 evaluations, 8% false positive rate, below 20% threshold, promote allowed:

```console
$ hx asset promote harnessX/assets/rubrics/team-review --to enforced
team-review → enforced
```

Conversely, `rule-002` (naming) 45% false positive rate — naming does not judge well as rules — set `status: deprecated` — **rule library evolves by data, not loudest voice**.

### 5. janitor: nightly patrol backstop

CI cron (`hx schedule run` same scheduler) runs nightly:

```console
$ hx janitor run
expired waivers: 2
drift findings: 3
dead assets: 1
report (PR-body ready): harnessX/runs/janitor-report.md
```

Report is ready PR body (checkbox list): expired waiver nag (bank sandbox waiver from scenario 03 expired), spec/code drift, sensors never referenced by any suite. On-call opens cleanup PR from report.

### 6. Quarterly review: coverage report

```console
$ hx steer coverage
sensor runs: 1847
first-attempt pass rate: 78.3%
recurrent patterns (>=3): 4, uncovered: 1
  11x unit-changed::flaky time-dependent ... — covered by: distilled-flaky-time-dependent-assertion-in-file
  5x arch-boundary::layer "services" ... — covered by: layering-rules
  3x lint::unused-import ... — covered by: (nothing)
```

`covered by: (nothing)` recurrent patterns are next quarter's governance backlog; first-attempt pass rate trend answers "did harness actually make agents easier to work with?"

## Key mechanisms

- **Intercept is cost, prevention is asset**: every sensor intercept consumes retry budget. Steering distills high-frequency intercepts into Guides (feedforward), high-frequency human comments into Rubrics (auto feedback) — bidirectional compression of repeat cost.
- **Evidence chain makes governance credible**: distilled asset provenance records failure pattern, source changes, PR comments. Six months later "why does this rule exist?" — traceable data, not "someone felt like it".
- **Trial lifecycle prevents bureaucracy**: rules trial first, false positive counts, enforced when good, retired when bad. Without this gate, rule libraries become unread "ancestral law".
