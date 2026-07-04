# Scenario 10: Security Team Integrates Custom Scanner — Plugins, Event Triggers, and Fix Loop

## Background

Security group maintains internal sensitive-data scanner (Python `secscan`: hardcoded secrets, internal URLs, ID number regex, etc.). They want:

1. secscan as Sensor in each repo's verification suite, **structured report output** not log dumps;
2. **scan on save** for high-risk paths like `config/` and `*.env.example` (not wait for verify);
3. one-click fix session with context when issues found.

## Steps

### 1. Integrate Python scanner via command protocol (no Node code)

Plugin command protocol: stdin JSON context, stdout JSON report. Thin adapter around secscan:

```python
#!/usr/bin/env python3
# harnessX/plugins/secscan_adapter.py
import json, sys, subprocess

ctx = json.load(sys.stdin)                      # {root, base, change, sensor:{id,kind,execution}}
raw = subprocess.run(["secscan", "--json", ctx["root"]], capture_output=True, text=True)
issues = json.loads(raw.stdout or "[]")

print(json.dumps({
    "status": "fail" if issues else "pass",
    "summary": f"{len(issues)} secret-like finding(s)",
    "findings": [{
        "severity": "block",
        "file": i["path"], "line": i["line"],
        "rule": i["rule"],
        "message": i["message"],
        "fix_hint": "Remove hardcoded value; use env vars or secret manager; for false positives add waiver"
    } for i in issues],
    "fix_command": f"hx fix --change {ctx.get('change') or '<change>'} --sensor secscan"
}))
```

Register in `harness.yaml` (`plugin: cmd:` prefix = command protocol; Node plugin = module path, host validates `api` major version):

```yaml
sensors:
  - id: secscan
    kind: sensor.script
    execution: computational
    phase: [verify]
    plugin: "cmd:python3 harnessX/plugins/secscan_adapter.py"
    on_fail: block
    timeout_ms: 180000

suites:
  verification: [spec-validate, spec-trace, arch-boundary, secscan]
```

**Fail-closed semantics inherited automatically**: adapter crash, timeout, invalid JSON — all error, gate blocks, never "scanner down = no problems".

### 2. Scan on save for high-risk paths (file-save trigger)

Register event-driven instance with glob scope on risky paths:

```yaml
  - id: secscan-hot
    kind: sensor.script
    execution: computational
    trigger: file-save
    scope: ["config/**", "**/*.env.example", "deploy/**"]
    plugin: "cmd:python3 harnessX/plugins/secscan_adapter.py"
    on_fail: block
```

Start daemon on dev machine (or equivalent via editor hooks):

```console
$ hx watch
watching for file-save triggered sensors (ctrl-c to stop)
[fail] secscan-hot ← config/redis.yaml: 1 secret-like finding(s)
```

Li saves test Redis password in `config/redis.yaml` — flagged two seconds later — **feedback closer to error, lower fix cost**. Nightly CI cron runs `hx schedule run` for all `trigger: schedule` sensors (full deep secscan, janitor share this scheduler).

### 3. One-click fix loop: hx fix

After verify secscan blocks 3 hardcoded values, run `fix_command` from report:

```console
$ hx fix --change fee-recalc --sensor secscan
fix pack: harnessX/changes/fee-recalc/fix-pack.md (3 finding(s))
```

`fix-pack.md` is focused Context Pack for fix session: each finding (with fix_hint) + on-site code snippets + change delta spec + discipline "do not delete checks to pass". Feed agent two ways — Cursor dialog reference:

```text
Cursor ▸ Fix all 3 findings per @harnessX/changes/fee-recalc/fix-pack.md,
         then run hx gate check fee-recalc to re-verify
```

Or headless with runner:

```console
$ hx fix --change fee-recalc --sensor secscan --runner 'cursor-agent --prompt-file "$HX_FIX_PACK"'
```

vs dumping whole repo context "find secrets somewhere" — fix pack targeted context saves tokens and reduces drift.

### 4. False positive governance: waiver not disable rule

Test ID numbers in `deploy/seed-data.sql` trigger false positive. Correct response is not removing secscan from suite — targeted waiver + expiry review:

```console
$ hx waiver add fee-recalc --target secscan \
    --reason "Fake ID numbers in seed-data.sql for test data, confirmed with security (SEC-1142)" \
    --requested-by li.dev --approved-by security.zhao \
    --expires 2026-10-01T00:00:00Z
waiver 8c2d91af added for secscan, expires 2026-10-01T00:00:00.000Z
```

During waiver, sensor failure downgrades to warning (gate outputs `warning secscan: ... (waived)`); auto-restores block after expiry; janitor nags nightly. Security also records pattern in secscan whitelist — **waiver data drives scanner evolution**.

### 5. Plugin version discipline

When security upgrades secscan output format quarterly, treat adapter as real software: plugin protocol evolves with host `PLUGIN_API_VERSION` (SemVer); host promises backward compatibility within same major version; Node plugins declare `api: "1.x"`, major mismatch rejected at load, not silent field mismatch mid-run.

## Key mechanisms

- **Two integration styles**: command protocol (any language, stdin/stdout JSON) for quick wrapping existing tools; Node plugin (`{api, id, execute}` module) for deep workspace access. Both produce same SensorReport, transparent to gates.
- **Three trigger tiers not one**: phase (at gate), file-save (on save, scope limits cost), schedule (nightly full scan). Same scan capability deployed by cost and timeliness.
- **Structured report enables fix loop**: `findings[].file/line/fix_hint` + `fix_command` makes "find → assemble context → targeted fix → re-verify" end-to-end without human transcription. Log dumps cannot do this.
