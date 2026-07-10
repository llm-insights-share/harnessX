# Scenario 14: Enterprise Full-Stack — Member Points Center (Multi-Role E2E)
| | |
| --- | --- |
| **Journey** | Enterprise |
| **Roles** | Full-stack TL |
| **Prerequisites** | Scenario(s) 01; [Scenario 19](19-org-prd-and-architecture.md) (req/arch stages) |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

Retail company **RetailCo** delivers a **member points center** in one monorepo:

| Subsystem | Path | Topology bundle |
| --- | --- | --- |
| Points API (backend) | `apps/api/` | `api-service` |
| Ops admin (B2B) | `apps/admin-web/` | `frontend-dashboard` |
| Member portal (B2C) | `apps/portal-web/` | `frontend-2c` |

**Goals**: members view balance and ledger in the portal; ops configure earn rules in admin; backend exposes REST APIs with layered architecture.

**Role roster (5 people)**

| Role | Person | Primary responsibility | Typical entry |
| --- | --- | --- | --- |
| Product Manager | **Chen (PM)** | Scope, proposal, delta specs, approval | Cursor `/hx-propose` `/hx-spec`; terminal `hx gate approve` |
| Designer | **Lin (Design)** | IA, API surface, ADRs, observability | Cursor `/hx-design` |
| Frontend Developer | **Zhao (FE)** | `admin-web` + `portal-web` implementation | Cursor `/hx-apply` (FE tasks) |
| Backend Developer | **Li (BE)** | `apps/api` implementation + API tests | Cursor `/hx-apply` (BE tasks) |
| QA Engineer | **Zhou (QA)** | Test review, traceability, verify sign-off | `hx testfirst approve`; `/hx-verify` |

**Profile**: `standard` (design, human approval, verify).

---

## Execution timeline (in order)

| Step | stage/task | Lead | Collaborators | Artifacts | Gate |
| --- | --- | --- | --- | --- | --- |
| 0 | Repo onboarding (once) | Li + Zhao | All | `harnessX/`, multi-bundle | — |
| 1 | dev:propose | Chen (PM) | Lin (Design) | `proposal.md`, draft deltas | `hx gate check --stage dev --task propose` |
| 2 | dev:design | Lin | Chen, Li | `design.md` | `hx gate check --stage dev --task design` |
| 3 | dev:propose (finalize) | Chen | Li, Zhou | EARS delta specs | `hx gate check --stage dev --task propose` |
| 4 | Human approval | Chen | Zhou | approval in `meta.yaml` | design→plan |
| 5 | dev:plan | Li | Zhao, Zhou | dual-track `tasks.md` | `hx gate check --stage dev --task plan` |
| 6 | dev:apply | Zhao + Li | Zhou | code, tests, traceability | apply fast suite |
| 7 | dev:verify | Zhou | All | full verification green | `hx gate check --stage dev --task verify` |
| 8 | dev:archive | Chen | Li | merged main specs | archive |

> **Rule**: agent work (proposals, design, specs, code, lint fixes) in **Cursor**; human-only actions (approval, sign-off) in the **terminal `hx`** for audit trails.

---

## 0. Onboarding (once)

```console
$ hx init --bundle api-service
$ hx bundle add frontend-dashboard
$ hx bundle add frontend-2c
$ hx adapter sync
$ hx hooks install && hx ci init
```

---

## 1. Propose — Chen (PM)

```console
$ hx change create member-points --domains member,points
```

```text
Cursor ▸ /hx-propose member-points
         PRD: Member points v1 — portal balance/ledger; admin earn rules; shared API.
```

```console
$ hx gate advance member-points
GATE PASS (dev/propose)
```

> After `change create`, `meta.yaml` starts at `stage: dev`, `task: propose`.

---

## 2. Design — Lin (Designer)

```text
Cursor ▸ /hx-design member-points
         Fill design-template: API table, data model, ADRs, metrics, rollback.
```

Li reviews API/layering; Chen confirms scope.

```console
$ hx gate advance member-points    # → dev/design
GATE PASS (dev/design)
advanced: dev/propose → dev/design
```

---

## 3. dev:propose — delta spec finalize (Chen, Li, Zhou)

```text
Cursor ▸ /hx-spec member-points
         Complete member + points deltas; ≥2 scenarios per requirement including errors.
```

Zhou requires every scenario to map to a test title containing `Scenario: <name>`.

---

## 4. Approval — Chen (PM)

```console
$ hx gate approve member-points --gate design-to-plan --approver chen.pm
```

---

## 5. Plan — Li (BE lead), reviewed by Zhao & Zhou

```console
$ hx plan member-points
```

Example `tasks.md` with parallel groups:

```markdown
- [ ] 01a [test] (...) API balance tests @group=be-tests
- [ ] 03a [test] (...) Portal E2E @group=fe-portal-tests
- [ ] 01b [impl] (...) Implement balance API @depends=01a @group=be-impl
- [ ] 03b [impl] (...) Portal page @depends=03a
```

```console
$ hx gate advance member-points
GATE PASS (dev/plan)
advanced: dev/design → dev/plan
```

---

## 6. dev:apply — Zhao (FE) + Li (BE) in parallel

**Zhou (QA)** — optional test-first approval:

```console
$ hx testfirst approve member-points --files tests/api/points.test.ts --by zhou.qa
```

**Li (BE)** — Cursor `/hx-apply` for `apps/api/` tasks.

**Zhao (FE)** — Cursor `/hx-apply` for `apps/admin-web/` and `apps/portal-web/`.

Or terminal:

```console
$ hx apply member-points --parallel 2 --runner '<agent>'
```

Each task runs the **fast suite** (typecheck, lint, unit-changed). Verify layering per app bundle.

---

## 7. dev:verify — Zhou (QA)

```console
$ hx verify member-points
$ hx trace check member-points
$ hx gate advance member-points
advanced: dev/apply → dev/verify
```

---

## 8. dev:archive — Chen + Li

```console
$ hx archive member-points
```

---

## Key takeaways

1. **One change, two clients**: single `member-points` change; specs split by capability.
2. **Bundle per app**: `api-service`, `frontend-dashboard`, `frontend-2c` enforce the right arch sensors.
3. **Parallel apply**: `@group` / `--parallel` for FE/BE without splitting specs.
4. **QA early**: Zhou joins at spec and plan; traceability blocks at verify.
5. **Approval hash**: post-approval spec edits are caught by `meta verify` in CI.

## See also

- [Scenario 02](02-standard-feature-development.md) — backend-focused standard flow
- [Scenario 13](13-v0.2-orchestration-parallel-delivery.md) — parallel apply details
- [Scenario 09](09-multi-tool-collaboration-ci-enforcement.md) — multi-tool same repo
