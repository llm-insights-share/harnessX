# Scenario 15: Enterprise requirements → HLD/LLD → AI coding handoff (enterprise profile)
| | |
| --- | --- |
| **Journey** | Enterprise |
| **Roles** | BA/Architect |
| **Prerequisites** | Scenario 01; req/arch stages in [Scenario 19](19-org-prd-and-architecture.md) |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

A SaaS team uses the **enterprise** profile. Full enterprise journey: **first** complete Scenario 19 (`docs/prd/` + `docs/architecture/`), **then** build the change artifact chain:

1. **Requirements analysis**: `requirements/` (PRD distillation)
2. **HLD**: `design/overview.md`
3. **LLD**: `design/ui/`, `design/api/`, `design/data/`
4. **Behaviour specs**: delta spec + `delivery-trace.yaml`
5. **Coding handoff**: `tasks.md` with `@design=` / `@files=`, `hx guide task-pack` per task

Roles: **Chen (PM)** — PRD/propose; **Lin (architect)** — HLD/LLD; **Zhao (frontend)** — apply.

## 0. Init and change creation

```console
$ hx init --bundle frontend-dashboard
$ hx adapter sync
```

**Prerequisite**: Scenario 19 completed `docs/prd/member-badge.md` and `docs/architecture/modules/member/lld.md` with human approval.

```console
$ hx change create member-badge \
    --domains member \
    --profile enterprise \
    --prd member-badge \
    --arch-modules member
```

`hx guide pack member-badge --stage dev --task propose` Context Pack already includes **Org PRD** and **Org module LLD** (M20 auto-injection).

## 1. dev:propose — requirements + proposal

```text
Cursor ▸ /hx-propose member-badge
         PRD: @docs/prd/member-badge.md
```

```console
$ hx propose member-badge --title "Member badge display"
wrote harnessX/changes/member-badge/proposal.md
wrote harnessX/changes/member-badge/requirements/prd-summary.md
wrote harnessX/changes/member-badge/traces/delivery-trace.yaml
```

Fill `requirements/user-stories.md`; set **PRD Reference** in `proposal.md`.

```console
$ hx gate check member-badge --stage dev --task propose
GATE PASS (dev/propose)
```

## 2. dev:design — HLD + LLD

```console
$ hx design member-badge
wrote harnessX/changes/member-badge/design/overview.md
```

Lin reads **Org architecture HLD** and **module LLD** from the Context Pack and adds change-level design:

- `design/overview.md` — API surface, ADR, design tokens
- `design/ui/pages.md` — badge page routes and `PortalShell`
- `design/ui/components/member-badge.md` — props, states, a11y

```console
$ hx gate check member-badge --stage dev --task design
GATE PASS (dev/design)
```

Enterprise design suite includes **`arch-approved`** (global HLD must be `hx approve arch`) and **`arch-change-align`** (touched domains map to module LLD).

## 3. design-to-plan approval → dev:plan

Chen finalizes delta spec via `/hx-spec` (still within dev:propose); terminal approval then plan:

```console
$ hx gate approve member-badge --gate design-to-plan --approver chen.pm
$ hx plan member-badge
wrote harnessX/changes/member-badge/tasks.md (4 tasks)
```

`tasks.md` example:

```markdown
- [ ] 01a [test] (member / Requirement: Member badge display) ... @design=design/overview.md @files=tests/member/badge.test.ts
- [ ] 01b [impl] (member / Requirement: Member badge display) ... @design=design/ui/components/member-badge.md @depends=01a
```

## 4. Apply — task-pack driven coding

```console
$ hx guide task-pack member-badge 01b
wrote harnessX/changes/member-badge/tasks/01b-pack.md (6 sections)
```

Zhao implements in Cursor `/hx-apply`, or:

```console
$ hx apply member-badge --runner '<agent>'
# Sets HX_TASK_PACK=.../01b-pack.md per task
```

## 5. Verify

```console
$ hx verify member-badge
$ hx gate check member-badge --stage dev --task verify
```

Enterprise `verification-enterprise` suite includes `design-drift` and `arch-drift` (warns if not promoted).

## 6. Promote and archive

```console
$ hx arch promote member-badge --by lin.arch
promoted change "member-badge" → modules [member]

$ hx rebase check member-badge
$ hx archive member-badge
```

Without `hx arch promote`, enterprise **archive is blocked** (use `hx waiver add --target arch-drift` to waive).

## Key mechanisms

| Capability | Where |
| --- | --- |
| `requirements/` | PRD distillation + propose gates |
| HLD / LLD split | `design/overview.md` + `design/ui|api|data/` |
| End-to-end trace | `traces/delivery-trace.yaml` |
| Task handoff | `@design=` / `@files=` in `tasks.md` |
| Scoped apply context | `hx guide task-pack <change> <taskId>` → `HX_TASK_PACK` |
| Org artifact injection | `hx guide pack` propose/design Context Pack |
| Design沉淀 | `hx arch promote` → `docs/architecture/modules/<id>/lld.md` |

See also: [Scenario 19 — Org PRD and architecture](19-org-prd-and-architecture.md) · [Chinese walkthrough](../15-企业级需求到交付交接.md)
