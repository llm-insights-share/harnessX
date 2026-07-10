# Scenario 11: Customize requirements output templates before delivery (proposal + delta spec)
| | |
| --- | --- |
| **Journey** | Customize |
| **Roles** | BA |
| **Prerequisites** | Scenario(s) 01 |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

A fintech team's **account-service** already uses HarnessX. Compliance requires every behavior change proposal to include **compliance impact** and **data classification** sections. Product also wants delta spec requirement titles in `REQ-<DOMAIN>-<NNN>` form for Jira traceability.

Platform engineer **Chen** must configure requirement-phase output templates and norms **before** the team opens its first change — not reformat agent output by hand after the fact.

Roles:

- **Chen**: maintains `harnessX/assets/` control assets;
- **Zhao (PM)**: later drafts changes via Cursor `/hx-propose`, filling business content only — not re-explaining section structure each time.

## Steps

### 1. Copy and extend the proposal template

The default template lives at `harnessX/assets/guides/proposal-template/template.md`. Chen keeps the three Gate-mandatory sections (`## Why`, `## What Changes`, `## Impact`) and adds compliance fields:

```markdown
# Proposal: {{title}}

<!-- Delete this line and all instruction comments before submitting -->

## Why

<!-- 1–3 sentences: problem or opportunity. Link tickets/incidents. -->

## What Changes

<!-- Observable behavior changes; each bullet maps to one delta spec Requirement -->

- ...

## Impact

- Affected capabilities:
- Affected code:
- Breaking change: no
- Data classification: <!-- public | internal | confidential | restricted -->
- Compliance impact: <!-- or "none" -->

## Out of Scope

<!-- What this change deliberately does NOT do -->

## Open Questions

<!-- List ambiguities for humans; delete if none -->
```

Add a gold-standard example under `examples/` for agent few-shot reference:

```console
$ cp harnessX/assets/guides/proposal-template/examples/add-rate-limiting.md \
     harnessX/assets/guides/proposal-template/examples/fintech-account-change.md
# Edit fintech-account-change.md with Data classification / Compliance impact samples
```

### 2. Customize the spec-writing Skill (delta spec naming + EARS)

Edit `harnessX/assets/guides/spec-writing/SKILL.md`. Add team naming at the top (**without** changing OpenSpec Delta structure or EARS validation rules):

```markdown
## Requirement naming (account-service)

- ADDED/MODIFIED titles: `Requirement: REQ-<DOMAIN>-<NNN> <short title>`
  e.g. `Requirement: REQ-ACCT-001 Frozen balance query`
- Map `<DOMAIN>` to `hx change create --domains` values (document mapping in constitution or this Skill).
- Scenario names stay English kebab-case; tests match `Scenario: <name>` verbatim — do not rename casually.
```

EARS phrasing, Scenario blocks, and MODIFIED full-replace discipline stay unchanged — enforced by the `spec-validate` sensor, not bypassable via Skill edits alone.

### 3. Confirm harness.yaml registration (usually seeded by init)

```yaml
guides:
  - id: proposal-template
    kind: guide.template
    execution: computational
    phase: [propose]
    source: assets/guides/proposal-template/template.md
  - id: spec-writing
    kind: guide.skill
    execution: inferential
    phase: [propose, spec]
    source: assets/guides/spec-writing/SKILL.md
```

If the team pulls `@org/base-harness` from Hub, point `overrides` at the local customized template (with `reason` for audit):

```yaml
overrides:
  - id: proposal-template
    source: assets/guides/proposal-template/template.md
    reason: "Fintech compliance: data classification and compliance impact fields"
```

### 4. Static lint + compile to Cursor

```console
$ hx harness lint
no conflicting guide directives found

$ hx adapter sync
cursor (Tier 1): 13 file(s)
  + .cursor/skills/spec-writing/SKILL.md
  ...
```

`hx harness lint` checks new Skill entries against constitution and Bundle constraints. `adapter sync` compiles templates and Skills into `.cursor/skills/` and slash commands — **no per-developer rule copying**.

### 5. Verify: `hx propose` uses the new template

Zhao creates a change and scaffolds the proposal:

```console
$ hx change create freeze-balance-query --domains account-balance
Created change "freeze-balance-query" (profile: standard, domains: account-balance)

$ hx propose freeze-balance-query --title "Query frozen balance"
wrote harnessX/changes/freeze-balance-query/proposal.md
wrote harnessX/changes/freeze-balance-query/specs/account-balance/spec.md
```

Generated `proposal.md` includes **Data classification**, **Compliance impact**, and **Open Questions** skeletons; `{{title}}` is replaced with "Query frozen balance".

In Cursor:

```text
Cursor ▸ /hx-propose freeze-balance-query
         Requirement: users can query frozen balance. PRD: @docs/prd/freeze-balance.md
```

The agent follows the compiled `/hx-propose` prompt: fill all sections, write delta specs with `REQ-ACCT-*` titles, run `hx gate check --stage dev --task propose` until green.

### 6. Gate behavior: what you can and cannot change

**Customizable:**

- Any proposal sections beyond the three mandatory ones (compliance, open questions, risk tables, etc.);
- Inline instruction comments in the template;
- Good/bad examples under `examples/`;
- Naming and coverage notes in the spec-writing Skill.

**Cannot remove or rename (Gate blocks otherwise):**

```text
$ hx gate check freeze-balance-query --stage dev --task design
BLOCKER  proposal.md missing section "## Why"
GATE BLOCKED (design)
```

Gate hard-checks that `## Why`, `## What Changes`, and `## Impact` exist and that no `{{title}}` placeholder remains. `## Out of Scope` is in the default template but **not** Gate-mandatory — keep it for scope control.

For delta specs: `spec-validate` still requires EARS + Scenarios on ADDED/MODIFIED requirements regardless of template customization.

## Key mechanisms

- **Feedforward**: `guide.template` (`proposal-template`) is **deterministically** rendered into `proposal.md` by `hx propose`; `guide.skill` (`spec-writing`) enters the Context Pack in propose/spec phases to constrain how agents write delta specs.
- **Feedback**: section completeness via `proposalProblems()`; delta format via `spec-validate` — templates do not replace Sensors.
- **Single source**: edit only `harnessX/assets/`, then `hx adapter sync`; do not hand-edit GENERATED files under `.cursor/` (see scenario 09).
- **Layering**: org Hub template → team `overrides` → repo-local `assets/` — closer to the business repo wins (design doc §11.2).

## Relation to later phases

Custom proposals affect readability and compliance traceability in **propose/design/spec** only. **Human design→plan approval**, traceability, and archive merge rules are unchanged. In design, agents still read the filled `proposal.md` from the Context Pack — compliance fields in the proposal template naturally become inputs for high-level design.
