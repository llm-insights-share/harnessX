# Scenario 18: Minimal Harness Config and Headless Agent Delivery (MCP L1)

| | |
| --- | --- |
| **Journey** | Onboarding · Tools & automation |
| **Roles** | Codex/OpenCode/script users, platform effectiveness |
| **Prerequisites** | [Scenario 01](01-new-project-onboarding.md) recommended |
| **Outcome** | Short `harness.yaml` via `imports:`; headless `hx apply --runner`; MCP `apply_task` / `fix_session` |
| **Related** | [09 Multi-tool](09-multi-tool-collaboration-ci-enforcement.md), [02 Standard feature](02-standard-feature-development.md) |

## Background

The **metrics export API** team does not use Cursor UI; developers run **Codex CLI** headless. Tech lead **Sun** wants:

1. A **minimal** `harness.yaml` (topology via `imports:` at read time);
2. Apply loop via **`hx apply --runner`** with standard `HX_TASK_*` env vars;
3. Trae MCP tools (`apply_task`, `fix_session`) aligned to the same L1 contract.

## Steps

### 1. Init: bundle or imports

**Option A — traditional bundle (same as scenario 01):**

```console
$ hx init --bundle api-service
```

**Option B — minimal harness + imports (v0.5+ recommended):**

```console
$ hx init
```

Edit `harnessX/harness.yaml`:

```yaml
version: "1.0"
constitution: constitution.md

imports:
  - api-service

profiles:
  standard:
    stages: [dev]
    dev_tasks: [propose, design, plan, apply, verify, archive]
    suites:
      dev.propose: fast
      dev.apply: fast
      dev.verify: verification

guides: []
sensors: []
dependencies: []
overrides: []
```

The on-disk file stays short; `readHarness()` merges `api-service` guides/sensors/suites at runtime.

### 2. Weak IDE adapter and tier compensation

```console
$ hx adapter sync --targets codex,generic
codex (Tier 2): 1 file(s)
  + AGENTS.md

$ cat .harnessx-adapter-tier
2
```

Optional `config.yaml`:

```yaml
profile: standard
adapter:
  target: codex
compensation:
  enabled: true
  escalate_warn_to_block: true
```

Tier 2 adds extra verify sensors when hooks are unavailable.

### 3. Create change through plan

```console
$ hx change create export-csv --domains metrics
$ hx propose export-csv --title "Export metrics CSV"
$ hx gate approve export-csv --gate design-to-plan --approver sun
$ hx gate advance export-csv
$ hx plan export-csv
```

### 4. Headless apply: `HX_TASK_*` contract

```console
$ hx apply export-csv --runner 'codex exec --prompt "$HX_TASK_TITLE"' --max-retries 2
```

Per-iteration env (see `schemas/l1/agent-env-contract.json`):

| Variable | Meaning |
| --- | --- |
| `HX_TASK_ID` | Task id (e.g. `01b`) |
| `HX_TASK_TITLE` | Task title for prompts |
| `HX_TASK_PACK` | Path to scoped context pack |
| `HX_FIX_HINTS` | Prior failure hints for self-correction |

```console
$ hx guide task-pack export-csv 01b
wrote harnessX/changes/export-csv/tasks/01b-pack.md (5 sections, 12ms)
```

### 5. MCP L1 bridge

Configure MCP: `hx mcp` (stdio). v0.5 tools include `apply_task`, `fix_session`, `drift_check`.

Sample `apply_task` response (excerpt):

```json
{
  "env": {
    "HX_CHANGE": "export-csv",
    "HX_TASK_ID": "01b",
    "HX_TASK_PACK": ".../01b-pack.md"
  },
  "contractSchema": "https://harnessx.dev/schemas/l1/agent-env-contract.json"
}
```

Inject `env` into the child process — same as `hx apply --runner`.

### 6. Fix session

```console
$ hx fix --change export-csv --sensor spec-trace --runner 'codex exec --prompt-file "$HX_FIX_PACK"'
```

MCP equivalent: `fix_session { "change": "export-csv", "sensor": "spec-trace" }`.

### 7. Verify and archive

```console
$ hx verify export-csv
$ hx archive export-csv
```

## Mechanisms

- **`imports:` vs `--bundle`**: bundle materializes at init; imports expand at read time — commit a short harness file.
- **L1 contract**: terminal apply, MCP, and third-party runners share `HX_TASK_*` / `HX_FIX_*` schema.
- **Tier 2**: stronger sensors + headless apply, not weaker gates.

## Next

- Org Hub: [16 Hub blueprint](16-v0.3-hub-blueprint-init.md)
- Parallel apply: [13 Orchestration](13-v0.2-orchestration-parallel-delivery.md)
