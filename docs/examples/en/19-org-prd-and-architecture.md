# Scenario 19: Organization PRD and global architecture (/hx-prd, /hx-arch)

| | |
| --- | --- |
| **Journey** | Enterprise · Pre-phase |
| **Roles** | Product (PM), Architect |
| **Prerequisite** | [Scenario 01](01-new-project-onboarding.md) |
| **Next** | [Scenario 15](15-enterprise-delivery-handoff.md) |

## Background

Before each **enterprise** change, **RetailCo** maintains org-level truth under the repo root:

| Layer | Path | Owner |
| --- | --- | --- |
| PRD | `docs/prd/<slug>.md` | Product |
| Global HLD | `docs/architecture/overview.md` + `registry.yaml` | Architect |
| Module LLD | `docs/architecture/modules/<module>/lld.md` | Architect |

Per-change `requirements/` and `design/` **distill and extend** these artifacts; after verify, `hx arch promote` **writes back** to module LLD.

## 1. PRD — `/hx-prd`

```console
$ hx prd init member-badge --title "Member badge"
$ hx prd check member-badge
PASS  prd-complete: PRD complete
```

Human sign-off (terminal only):

```console
$ hx approve prd member-badge --approver chen.pm
```

Record stored in `docs/.prephase-approvals.yaml` with content hash binding.

## 2. Global architecture — `/hx-arch`

```console
$ hx arch init --title "Member commerce"
$ hx arch check
$ hx approve arch --approver lin.arch
```

## 3. Module LLD — `/hx-arch-lld`

```console
$ hx arch lld init member --title "Member module"
$ hx arch lld check member
```

Map `capabilities: [member]` in `registry.yaml` for `--domains member`.

## 4. Create change (hand off to scenario 15)

```console
$ hx change create member-badge \
    --domains member \
    --profile enterprise \
    --prd member-badge \
    --arch-modules member
```

Context Pack for propose/design **automatically includes** org PRD and module LLD.

## 5. Promote before archive

```console
$ hx arch promote member-badge --by lin.arch
$ hx archive member-badge
```

Enterprise **blocks archive** until promote completes (unless waived).

## Gates (enterprise)

- propose: `prd-complete`, `prd-approved`, `requirements-complete`
- design: `arch-approved`, `arch-change-align`, `design-enterprise` suite
- verify: `arch-drift` (warn if not promoted)

## See also

- [Scenario 15 walkthrough](15-enterprise-delivery-handoff.md) · [Chinese full version](../19-组织级PRD与架构设计.md)
- [Operation guide §4.3 Pre-phase](../operation-guide.en.md)
