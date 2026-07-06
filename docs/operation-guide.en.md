# HarnessX Operation Guide

**中文**: [操作说明（中文）](operation-guide.zh-CN.md)

This guide explains how to use HarnessX (`hx` CLI) with AI coding agents in day-to-day delivery. For end-to-end walkthroughs tied to real scenarios, see [`docs/examples/en/`](examples/en/README.md).

## 1. Prerequisites

```bash
git clone <your-repo>
cd <your-repo>
npm install
```

Examples use `hx` as shorthand for `node bin/hx.js` (or a globally installed `hx`).

## 2. Initialize a project

### English scaffold (default)

```bash
hx init --bundle api-service
```

### Chinese scaffold (hx-cn)

```bash
hx init --locale hx-cn --bundle api-service-cn
```

`--locale hx-cn` installs Chinese assets:

| Asset | Description |
| --- | --- |
| `constitution.md` | Project constitution in Chinese |
| `assets/commands/*.md` | Eight phase workflow prompts for `/hx-*` slash commands |
| `assets/guides/proposal-template/` | Chinese proposal template and example |
| `assets/guides/design-template/` | Chinese design template and example |
| `assets/guides/spec-writing/` | Chinese EARS spec-writing skill |
| `assets/guides/coding-conventions/` | Chinese coding conventions skill |
| `harness.yaml` | Chinese `fix_hint` strings and asset registry |

`config.yaml` sets `locale: zh-CN`. Scaffolds from `hx propose`, `hx design`, and `hx explore` are also localized.

After init, run:

```bash
hx hooks install    # local git hooks
hx ci init          # GitHub Actions workflow
hx adapter sync     # compile to .cursor/ and other tool dirs
```

## 3. Two operation entry points

HarnessX separates the **control plane** from the **execution plane**:

| Entry | Use for | Examples |
| --- | --- | --- |
| **Terminal** | human approval, gate advance, waivers, archive | `hx gate approve`, `hx gate advance` |
| **Cursor dialog** | agent drafts proposals, specs, code, self-correction | `/hx-propose`, `/hx-apply` |

Rule of thumb: **let the agent do what it can in Cursor; reserve the terminal for human-only actions** — those are also the audit trail.

Run `hx adapter sync` before using slash commands in Cursor. Type `/` to see `hx-explore` … `hx-archive`; each command body is the full workflow for that phase.

## 4. Standard delivery loop

Using the `standard` profile (`lite` / `strict` — see scenarios 03 and 05):

```
explore → propose → design → spec → [human approval] → plan → apply → verify → archive
```

### 4.1 Create a change

```bash
hx change create add-refund --domains orders,payments
```

Declare `touched domains`; overlaps with other active changes produce warnings.

### 4.2 Propose — proposal and initial delta spec

**Terminal** (scaffold only):

```bash
hx propose add-refund --title "Support partial refunds"
```

**Cursor**: run `/hx-propose` and follow the workflow prompt to fill `proposal.md` and delta specs.

Validate:

```bash
hx gate check add-refund --phase spec
```

### 4.3 Design — technical design

```bash
hx design add-refund          # writes design.md (hx-cn uses design-template)
hx gate advance add-refund    # advance after design gate passes
```

Or use `/hx-design` in Cursor.

### 4.4 Spec — finalize specs and human approval

Use `/hx-spec` in Cursor to tighten EARS requirements and scenario coverage.

**Human only** (agents must not run this):

```bash
hx gate approve add-refund --gate spec --approver alice
hx gate advance add-refund
```

### 4.5 Plan — task breakdown

```bash
hx plan add-refund
```

Produces `tasks.md`: one `[test]` and one `[impl]` task per scenario. Review ordering with `/hx-plan` in Cursor.

### 4.6 Apply — implementation

```bash
hx apply add-refund --runner "<your agent command>"
# v0.2: parallel and best-of-N
hx apply add-refund --parallel 2 --runner "<agent>"
hx apply add-refund --fan-out 3 --runner "<agent>"
```

Or `/hx-apply` in Cursor, one task at a time. Fast sensor suite must pass after each task.

### 4.7 Verify — full verification

```bash
hx verify add-refund
```

Runs the full sensor suite and scenario→test traceability. On failure, use `hx fix add-refund` for a focused repair pack.

### 4.8 Archive — merge specs

```bash
hx rebase check add-refund   # pre-flight against other changes
hx archive add-refund        # merge deltas into main specs and archive
```

## 5. Command quick reference

| Command | Purpose |
| --- | --- |
| `hx status` | Active changes and gate state |
| `hx gate check <id> [--phase <p>]` | Run sensor suite for a phase |
| `hx gate advance <id>` | Advance to next phase (sensors green + preconditions) |
| `hx gate approve <id> --gate spec --approver <name>` | Record human spec approval |
| `hx guide pack <id> --phase <p>` | Assemble Context Pack for a phase |
| `hx harness lint` | Detect constitution vs skill conflicts |
| `hx bundle list` | List topology bundles (`api-service`, `frontend-dashboard`, `frontend-2c`, `library-sdk`, `serverless-function`, `mobile-app`, `data-pipeline`, plus `*-cn`) |
| `hx bundle add <id>` | Apply an additional topology bundle after init |
| `hx waiver add <id> --sensor <s> --reason "..." --expires YYYY-MM-DD` | Time-boxed waiver |
| `hx adapter sync` | Compile harnessX assets to AI tool directories |
| `hx steer report` | Recurring failures → candidate new guides |
| `hx hub golden` | List built-in golden Hub packages |
| `hx hub seed [path]` | Create a hub repo from golden packages |

## 6. Core mental model

1. All behaviour changes live in a **change workspace** (`harnessX/changes/<id>/`), described by delta specs.
2. Progress uses **Gates**: `hx gate advance` only when sensors pass and preconditions hold (e.g. human approval); sensor crashes block (fail-closed).
3. Agent input comes from **Guides/Context Packs**; output is checked by **Sensors**; failures include `fix_hint` for the `hx fix` loop.
4. `hx archive` merges deltas into main specs — the single source of truth for system behaviour.
5. Recurring failures feed **Steering** → new guides, shared via **Hub** — the harness evolves.

## 7. Further reading

- [13 usage scenario walkthroughs](examples/en/README.md)
- [System design document](harness-delivery-system-design.html) (Chinese)
- [Build plan & status](build-plan.csv)
- Repository [README.md](../README.md)
