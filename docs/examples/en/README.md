# HarnessX Usage Scenario Examples (English)

This directory collects end-to-end scenarios that mirror real work. Each scenario includes: **background and roles**, **step-by-step commands with expected output**, and **key mechanism notes**. Command output matches actual `hx` CLI behavior and can be reproduced in a real repository.

| # | Scenario | Primary capabilities covered |
| --- | --- | --- |
| [01](01-new-project-onboarding.md) | Onboard a new backend API project to HarnessX | `init --bundle` / hooks / CI replay / adapter compile |
| [02](02-standard-feature-development.md) | Add "partial refund" to order service (standard profile) | propose→design→spec→human approval→plan→apply self-correction→verify→archive |
| [03](03-core-domain-strict-test-first.md) | Payment core-domain change, strict profile + test-first | profile recommendation / testfirst / approved-assertion protection / waiver |
| [04](04-concurrent-change-conflicts.md) | Two teams modify the same capability concurrently | domain overlap warning / rebase check / conflict resolution |
| [05](05-emergency-hotfix-lite.md) | Production bug hotfix via lite fast lane | profile downgrade audit trail / `archive --force` / post-hoc spec catch-up |
| [06](06-legacy-migration-openspec.md) | Migrate existing OpenSpec project + backfill specs for legacy code | `openspec import` / `sync` drift detection / spec backfill |
| [07](07-steering-quality-governance.md) | AI delivery quality governance: from repeated failures to rule assets | failure catalog / `steer distill` / rubric lifecycle / janitor |
| [08](08-hub-asset-sharing-supply-chain.md) | Platform team distributes normative assets to business repos via Hub | hub promote/review/add/sync / lock / injection scan |
| [09](09-multi-tool-collaboration-ci-enforcement.md) | Team members use Cursor/Trae/Qoder/Claude Code | adapter single-source compile / manual-edit drift detection / Quest export / CI blocks hook bypass |
| [10](10-custom-sensors-triggers.md) | Security team integrates custom scanner + event/schedule triggers | plugin API (Node/command protocol) / file-save trigger / schedule / `hx fix` |
| [11](11-custom-requirements-output-template.md) | Customize proposal template and delta spec norms before delivery | `guide.template` / spec-writing Skill / Gate mandatory sections / `overrides` |
| [12](12-custom-design-output-template.md) | Customize design.md structure and design-phase command before delivery | design-template asset / customized `/hx-design` / api-design Skill / Context Pack |

**中文**: [docs/examples/](../README.md)

## Prerequisites

- Complete `npm install` per the repository root `README.md`. Examples use `hx` as shorthand for `node bin/hx.js` (or globally installed `hx`).
- Fictional names (Wang, Li, Zhang the architect, etc.) and domains (orders, payments, inventory) illustrate role division: **who writes specs, who approves, who implements, who reviews**.

## Two kinds of entry points

Operations in the examples fall into two categories:

1. **Terminal commands** (`$ hx ...` in console code blocks): run directly in the shell — repo management, gate advancement, human approval, and other "control plane" actions.
2. **Cursor dialog operations** (blocks labeled `Cursor ▸`): type into Cursor's Agent dialog to drive the agent. Requires prior `hx adapter sync` (scenario 01). Then:
   - Type `/` to see eight slash commands (`hx-explore`, `hx-propose`, … `hx-archive`). **Each command body is the full workflow prompt for that phase** (steps, guardrails, done criteria); the agent follows it and calls `hx` CLI for self-checks;
   - `.cursor/rules/harnessx.mdc` (`alwaysApply: true`) keeps the constitution and HarnessX discipline in **every** conversation (no hand-editing meta.yaml/fixtures, read fix_hint on failure, etc.);
   - `.cursor/skills/*/SKILL.md` (coding conventions, EARS spec writing, etc.) are mounted by Cursor by relevance;
   - `.cursor/hooks.json` runs `hx gate hook-check` before commit prompts and `hx fixture verify` after editing fixtures/meta.yaml (L2 enforcement).

  Equivalent entry points for other tools (Trae/Qoder/Claude Code) are in scenario 09; this directory defaults to Cursor.

A useful rule of thumb: **what the agent can do** (proposals, specs, code, fixes) goes through the Cursor dialog; **what only humans can do** (approval, waivers, release review) goes through the terminal — that is also where audit trails land.

## Core mental model (1-minute version)

1. All behavior changes live in a **change workspace** (`harnessX/changes/<id>/`), described by delta specs as "incremental spec changes".
2. Phase advancement uses **Gates**: `hx gate advance` proceeds only when that phase's sensor suite is green and prerequisites are met (e.g. human approval). Sensor crashes block (fail-closed).
3. AI agent input is assembled by **Guide/Context Pack** (`hx guide pack`); output is checked by **Sensors**. Failure reports include `fix_hint`/`fix_command` for direct repair loops (`hx fix`).
4. After delivery, `hx archive` merges deltas into main specs; main specs are the single source of truth for current system behavior.
5. Recurring failures are distilled via **Steering** into new Guide/Rubric assets, promoted to enforced after trial validation, then shared to other repos via **Hub** — the harness evolves continuously.
