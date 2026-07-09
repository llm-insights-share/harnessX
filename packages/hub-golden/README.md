# Harness Hub — golden packages

Built-in example packages for `hx hub seed`. Teams can publish this directory as an org hub repo or copy packages into their own hub.

## Packages (`packages/`)

| Package | Kind | Purpose |
|---------|------|---------|
| `api-conventions@1.0.0` | guide.skill | Shared REST/error-shape conventions |
| `common-review-rubrics@1.0.0` | sensor.rubric | Starter inferential review rules |
| `prd-writing@1.0.0` | guide.skill | PRD → Harness distillation |
| `requirements-research-outline@1.0.0` | guide.skill | Explore-phase research outline |
| `prototype-wireframe@1.0.0` | guide.skill | Low-fidelity wireframe guidance |
| `prd-authoring@1.0.0` | guide.skill | Org PRD authoring (Pre-phase) |
| `arch-authoring@1.0.0` | guide.skill | Global HLD authoring |
| `uat-checklist@1.0.0` | guide.template | User acceptance testing sign-off |

## Bundles (`bundles/`)

| Bundle | Kind | Purpose |
|--------|------|---------|
| `api-service@1.0.0` | harness.bundle | API service topology harness |

| `frontend-2c@1.0.0` | harness.bundle | Consumer-facing web topology |

## Blueprints (`blueprints/`)

| Blueprint | Purpose |
|-----------|---------|
| `enterprise-delivery@1.0.0` | Full enterprise path with hub deps |
| `enterprise-sdlc@1.0.0` | Enterprise SDLC profile + work orders |

Packages ship with `.review` status `approved` so they are consumable immediately after seeding.

**Maintenance guide**: [docs/hub-asset-maintenance.zh-CN.md](../../docs/hub-asset-maintenance.zh-CN.md) (中文) · [docs/hub-asset-maintenance.en.md](../../docs/hub-asset-maintenance.en.md) (English)

**Ops project init** (remote Hub already exists): [§9.2 Plan A](../../docs/hub-asset-maintenance.zh-CN.md#92-已有远程-hub运维项目初始化方案-a推荐)
