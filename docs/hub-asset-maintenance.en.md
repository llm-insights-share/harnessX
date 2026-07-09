# Harness Hub Asset Maintenance Guide

**Audience**: chief architect, platform Hub maintainers, asset authors, repo owners  
**Version**: HarnessX v0.4+  
**Related**: [Scenario 08](examples/en/08-hub-asset-sharing-supply-chain.md) · [Scenario 16](examples/en/16-v0.3-hub-blueprint-init.md)

> **中文完整版**：[hub-asset-maintenance.zh-CN.md](hub-asset-maintenance.zh-CN.md)

---

## 1. Overview

**Harness Hub** is an org-level asset registry (usually a Git repo) for **Guides**, **Sensors**, **topology bundles**, and **delivery blueprints**. Consumer repos reference Hub via `config.yaml` → `hub:`, install packages into `harnessX/.hub-cache/`, and pin hashes with `harness.lock`.

Trust model: immutable versions · review (`.review`) · bidirectional injection scan · consumer lock verify.

Resolution priority: `change` > `local` > `team` > `hub` > `builtin`

### Dual-role connection

```yaml
hub:
  source: git@github.com:your-org/hx-hub.git
  role: consumer    # or maintainer
  actor: wang.dev
```

- **consumer**: search, add, sync, `hx hub submit` → `contributions/`
- **maintainer**: `hx hub promote`, `hx hub contributions accept`, `hx hub push`

Hub repo `hub-policy.yaml` lists maintainers and `installRequiresApproval`. See [Scenario 21 (zh)](examples/21-hub-双角色与贡献审核.md).

---

## 2. Hub layout

```
harness-hub/
├── packages/<id>/<version>/     # asset.yaml + content + .review
├── bundles/<id>/<version>/      # bundle.yaml + assets/
├── blueprints/<id>/<version>/   # blueprint.yaml
└── evals/golden-repos/<name>/   # checks.yaml
```

---

## 3. Asset categories

| Category | kind | Install |
| --- | --- | --- |
| Package | `guide.skill`, `guide.template`, `sensor.rubric`, … | `hx hub add id@ver` |
| Bundle | `harness.bundle` | `hx init --from-hub bundle@ver` |
| Blueprint | `harness.blueprint` | `hx init --from-hub blueprint@ver` |
| Eval | golden checks | `hx hub eval --golden name` |

---

## 4. Golden inventory (`hx hub seed`)

### Packages

| ID | kind | Purpose |
| --- | --- | --- |
| `api-conventions@1.0.0` | guide.skill | Shared REST conventions |
| `common-review-rubrics@1.0.0` | sensor.rubric | Starter review rules |
| `prd-writing@1.0.0` | guide.skill | PRD distillation |
| `prd-authoring@1.0.0` | guide.skill | Org PRD authoring |
| `arch-authoring@1.0.0` | guide.skill | Global HLD authoring |
| `requirements-research-outline@1.0.0` | guide.skill | Explore research outline |
| `prototype-wireframe@1.0.0` | guide.skill | Wireframe guidance |
| `uat-checklist@1.0.0` | guide.template | UAT sign-off template |

### Bundles & blueprints

| ID | Purpose |
| --- | --- |
| `api-service@1.0.0` | API service topology |
| `frontend-2c@1.0.0` | Consumer web topology |
| `enterprise-delivery@1.0.0` | Enterprise delivery blueprint |
| `enterprise-sdlc@1.0.0` | Enterprise SDLC + work orders |

```bash
hx hub golden
```

---

## 5. Builtin topology bundles (`hx bundle list`)

`api-service`, `api-service-cn`, `frontend-2c`, `frontend-dashboard`, `library-sdk`, `serverless-function`, `event-consumer`, `event-consumer-cn`, `data-pipeline`, `mobile-app`

Publish to Hub via `hx hub promote` after packaging under `bundles/<id>/<version>/`.

---

## 6. Lifecycle

`draft` → `trial` → `enforced` → `deprecated` → `archived`

Hub review: `pending` → `approved` / `rejected`

```bash
hx asset promote <dir> --to trial
hx hub promote <dir> --hub <path> --by <name> --evidence "<ref>"
hx hub approve <id>@<ver> --hub <path> --reviewer <name>
hx hub asset promote <id>@<ver> --hub <path> --to enforced
```

---

## 7. Maintainer workflow (publish Skill)

```bash
hx asset backfill harnessX/assets/guides/my-skill
hx asset scan harnessX/assets/guides/my-skill
hx hub promote harnessX/assets/guides/my-skill \
  --hub git@github.com:org/hx-hub.git --by author --evidence "ci://runs/123"
hx hub review approve my-skill@1.0.0 --hub <hub> --reviewer reviewer
hx hub policy check --hub <hub> --strict
```

---

## 8. Consumer workflow

```bash
hx hub add prd-writing@1.0.0 --hub <hub>
hx lock write && hx lock verify
hx hub sync --hub <hub> --apply
hx adapter sync
```

Local customization: use `overrides` in `harness.yaml` with a documented `reason`.

---

## 9. Command reference

See [Chinese guide §11](hub-asset-maintenance.zh-CN.md#11-命令速查) for the full table (`hx hub seed/add/sync/promote/approve/search/eval/policy/cache`, `hx asset *`, `hx lock *`, `hx steer publish`).

---

## 10. CI

- Hub repo: `hx hub policy check --strict`, `hx hub eval … --golden`
- Consumer repo: `hx lock verify`, `hx adapter drift`

---

## 11. Further reading

- [operation-guide.en.md §9.1](operation-guide.en.md)
- [hub-golden README](../packages/hub-golden/README.md)
