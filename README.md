# HarnessX

HarnessX is an **outer harness** for AI coding agents: it constrains the full AI delivery
process — requirements → design → coding → testing — with spec-driven artifacts,
feedforward **Guides**, feedback **Sensors**, fail-closed **Gates**, and a **Steering loop**
that continuously improves the harness itself.

Design document: [`docs/harness-delivery-system-design.html`](docs/harness-delivery-system-design.html)
· Build plan & status: [`docs/build-plan.csv`](docs/build-plan.csv)
· **Usage scenario examples**: [`docs/examples/en/`](docs/examples/en/README.md) (English) · [`docs/examples/`](docs/examples/README.md) (中文) — 10 end-to-end scenarios (new project onboarding, standard development flow, strict test-first, concurrent conflicts, emergency hotfix, legacy migration, Steering governance, Hub sharing, multi-tool collaboration, custom sensors)

## Quick start

```bash
npm install
node bin/hx.js init --bundle api-service   # scaffold harnessX/ in your repo
node bin/hx.js change create add-auth --domains auth
node bin/hx.js propose add-auth --title "Session expiry"
node bin/hx.js gate advance add-auth       # gates advance only when sensors pass
node bin/hx.js plan add-auth               # dual-track tasks (test + impl per requirement)
node bin/hx.js apply add-auth --runner "<your agent command>"
node bin/hx.js verify add-auth             # verification suite + traceability
node bin/hx.js archive add-auth            # merge delta specs into main specs
node bin/hx.js adapter sync                # compile to .cursor/ .trae/ .qoder/ CLAUDE.md AGENTS.md
```

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/core` | Schemas (Zod), artifact store & delta merge, gate state machine, sensor runner (fail-closed), guide engine, traceability, fixtures, waivers, steering, assets/lock/hub, triggers, plugin API |
| `packages/sensors` | Built-in sensors: spec-validate (EARS), spec-trace, fixture-hash, approved-tests, arch-boundary, budget, rubric |
| `packages/adapters` | Single-source → multi-target compiler with capability tiers (Cursor / Trae / Qoder / Claude Code / generic `AGENTS.md`) |
| `packages/cli` | `hx` command-line interface (Commander) |
| `packages/bundles` | Built-in `base` scaffold and the `api-service` topology bundle |
| `docs/` | Design document (HTML) and build plan (CSV) |

## Key enforcement properties

- **Fail-closed gates** — a sensor that crashes, times out or emits garbage blocks the gate (FR-053).
- **meta.yaml exclusive writes** — gate state is hash-chained to sensor logs; manual edits are detected by `hx meta verify` in CI (FR-050).
- **Human approval gate** — spec→plan always requires a recorded approver with an artifact hash (FR-012).
- **Approved fixtures & test-first** — human-approved fixtures/tests are hash-locked; drift blocks (FR-025/026).
- **Supply chain** — `harness.lock` pins asset content hashes; hub packages pass an instruction-injection scan before installation (NFR-009).

## Development

```bash
npm run verify     # typecheck + all 86 tests (unit + milestone acceptance + full-cycle E2E)
npm test           # tests only
```
