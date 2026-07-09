#!/usr/bin/env node
/**
 * One-shot generator for hub-golden first-batch seed assets.
 * Run: node scripts/generate-hub-golden-seed-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = path.join(ROOT, "packages/hub-golden/packages");
const REVIEW = `status: approved
reviewer: harnessx-golden
at: "2026-07-09T00:00:00.000Z"
`;

const ASSETS = [
  {
    id: "requirements-template",
    kind: "guide.template",
    phase: ["propose"],
    file: "template.md",
    content: `# Requirements: {{change}}

## Goals

## In Scope

## Out of Scope

## Acceptance Criteria

| ID | Given | When | Then |
|----|-------|------|------|
| AC-1 | | | |
`
  },
  {
    id: "design-template",
    kind: "guide.template",
    phase: ["design"],
    file: "template.md",
    content: `# Design: {{change}}

## Context

## Decisions

## API / Interfaces

## Data Model

## Risks & Rollback
`
  },
  {
    id: "api-change-template",
    kind: "guide.template",
    phase: ["design", "spec"],
    file: "template.md",
    content: `# API Change: {{change}}

## Endpoints

| Method | Path | Change type | Compatibility |
|--------|------|-------------|---------------|

## Error Codes

## Migration / Rollout
`
  },
  {
    id: "rollback-template",
    kind: "guide.template",
    phase: ["plan", "verify"],
    file: "template.md",
    content: `# Rollback Plan: {{change}}

## Trigger Conditions

## Rollback Steps

## Data Repair

## Verification After Rollback
`
  },
  {
    id: "coding-conventions",
    kind: "guide.skill",
    phase: ["apply"],
    file: "SKILL.md",
    content: `# Coding Conventions

- Prefer small modules; avoid files over ~400 lines.
- Validate inputs at system boundaries.
- Never modify approved fixtures without a waiver.
- Name tests after scenarios: \`it("Scenario: ...", ...)\`.
`
  },
  {
    id: "error-handling-playbook",
    kind: "guide.skill",
    phase: ["apply", "verify"],
    file: "SKILL.md",
    content: `# Error Handling Playbook

- Map domain errors to stable API error codes.
- Fail closed on unknown errors; log correlation IDs.
- Document retryable vs non-retryable failures.
`
  },
  {
    id: "test-strategy",
    kind: "guide.skill",
    phase: ["spec", "apply", "verify"],
    file: "SKILL.md",
    content: `# Test Strategy

- Every requirement scenario maps to at least one test or waiver.
- Prefer behavior tests over implementation details.
- Add regression tests for every fixed bug.
`
  },
  {
    id: "observability-basics",
    kind: "guide.skill",
    phase: ["design", "verify"],
    file: "SKILL.md",
    content: `# Observability Basics

- Add structured logs with request/correlation IDs.
- Define SLIs for latency, error rate, and saturation.
- Ensure alerts are actionable and tied to runbooks.
`
  },
  {
    id: "risk-review-rubrics",
    kind: "sensor.rubric",
    phase: ["verify"],
    file: "rules.yaml",
    content: `rules:
  - id: data-migration-risk
    status: enforced
    check: Data migrations include rollback and validation steps
    pattern: "\\b(rollback|backfill|validation)\\b"
    severity: warn
  - id: authz-change
    status: trial
    check: Permission changes mention affected roles
    pattern: "\\b(role|permission|authz)\\b"
    severity: info
`
  },
  {
    id: "api-contract-template",
    kind: "guide.template",
    phase: ["design", "spec"],
    file: "template.md",
    content: `# API Contract

## OpenAPI Summary

## Pagination

## Idempotency

## Error Shape
`
  },
  {
    id: "db-migration-template",
    kind: "guide.template",
    phase: ["plan", "apply"],
    file: "template.md",
    content: `# DB Migration

## Forward Migration

## Rollback

## Backfill Strategy

## Verification Queries
`
  },
  {
    id: "async-job-template",
    kind: "guide.template",
    phase: ["design", "apply"],
    file: "template.md",
    content: `# Async Job Design

## Queue / Topic

## Retry Policy

## Idempotency Key

## Dead Letter Handling
`
  },
  {
    id: "idempotency-keys",
    kind: "guide.skill",
    phase: ["design", "apply"],
    file: "SKILL.md",
    content: `# Idempotency Keys

- Require idempotency keys for create/pay side effects.
- Store key + response with TTL for replay safety.
`
  },
  {
    id: "transaction-boundary",
    kind: "guide.skill",
    phase: ["design", "apply"],
    file: "SKILL.md",
    content: `# Transaction Boundaries

- Keep transactions short; avoid external I/O inside DB transactions.
- Use outbox pattern for cross-service consistency.
`
  },
  {
    id: "cache-consistency",
    kind: "guide.skill",
    phase: ["design", "apply"],
    file: "SKILL.md",
    content: `# Cache Consistency

- Define cache invalidation on writes.
- Document stale-read tolerance and TTL policy.
`
  },
  {
    id: "resilience-patterns",
    kind: "guide.skill",
    phase: ["design", "apply", "verify"],
    file: "SKILL.md",
    content: `# Resilience Patterns

- Apply timeouts, bounded retries, and circuit breakers.
- Provide graceful degradation paths for dependency failures.
`
  },
  {
    id: "api-breaking-change-rubric",
    kind: "sensor.rubric",
    phase: ["verify"],
    file: "rules.yaml",
    content: `rules:
  - id: breaking-endpoint-change
    status: enforced
    check: Breaking API changes are called out explicitly
    pattern: "\\b(BREAKING|breaking change|major version)\\b"
    severity: block
`
  },
  {
    id: "backward-compat-rubric",
    kind: "sensor.rubric",
    phase: ["verify"],
    file: "rules.yaml",
    content: `rules:
  - id: compat-note
    status: trial
    check: Compatibility strategy is documented for API/library changes
    pattern: "\\b(backward compatible|deprecat|version)\\b"
    severity: warn
`
  },
  {
    id: "query-budget-rules",
    kind: "guide.constraint",
    phase: ["verify"],
    file: "rules.yaml",
    content: `budgets:
  - id: query-latency-p95
    metric: db_query_p95_ms
    max: 200
  - id: payload-size
    metric: response_bytes_p95
    max: 65536
`
  },
  {
    id: "ui-page-spec-template",
    kind: "guide.template",
    phase: ["design"],
    file: "template.md",
    content: `# UI Page Spec

## Page Goal

## States (loading/empty/error)

## Components

## Navigation
`
  },
  {
    id: "component-contract-template",
    kind: "guide.template",
    phase: ["design"],
    file: "template.md",
    content: `# Component Contract

## Props / Inputs

## Events / Outputs

## Accessibility

## Test Cases
`
  },
  {
    id: "tracking-events-template",
    kind: "guide.template",
    phase: ["design", "verify"],
    file: "template.md",
    content: `# Tracking Events

| Event | Trigger | Properties | Owner |
|-------|---------|------------|-------|
`
  },
  {
    id: "a11y-checklist-template",
    kind: "guide.template",
    phase: ["design", "verify"],
    file: "template.md",
    content: `# Accessibility Checklist

- [ ] Keyboard navigation
- [ ] Focus order and visible focus
- [ ] Color contrast
- [ ] Screen reader labels
`
  },
  {
    id: "state-management-patterns",
    kind: "guide.skill",
    phase: ["design", "apply"],
    file: "SKILL.md",
    content: `# State Management Patterns

- Keep server state and UI state separate.
- Avoid duplicated source of truth across layers.
`
  },
  {
    id: "frontend-performance",
    kind: "guide.skill",
    phase: ["apply", "verify"],
    file: "SKILL.md",
    content: `# Frontend Performance

- Budget bundle size and critical path assets.
- Lazy-load non-critical routes and components.
`
  },
  {
    id: "design-token-governance",
    kind: "guide.skill",
    phase: ["design", "apply"],
    file: "SKILL.md",
    content: `# Design Token Governance

- Use design tokens for color, spacing, and typography.
- Avoid hard-coded visual constants in components.
`
  },
  {
    id: "ux-consistency-rubric",
    kind: "sensor.rubric",
    phase: ["verify"],
    file: "rules.yaml",
    content: `rules:
  - id: empty-state-defined
    status: trial
    check: UI changes mention empty/error states
    pattern: "\\b(empty state|error state|loading state)\\b"
    severity: warn
`
  },
  {
    id: "a11y-rubric",
    kind: "sensor.rubric",
    phase: ["verify"],
    file: "rules.yaml",
    content: `rules:
  - id: a11y-mention
    status: trial
    check: Accessibility considerations are documented
    pattern: "\\b(a11y|accessibility|keyboard|contrast)\\b"
    severity: info
`
  },
  {
    id: "bundle-size-budget-rules",
    kind: "guide.constraint",
    phase: ["verify"],
    file: "rules.yaml",
    content: `budgets:
  - id: main-bundle-kb
    metric: main_bundle_kb
    max: 350
  - id: route-chunk-kb
    metric: route_chunk_kb
    max: 120
`
  },
  {
    id: "test-cases-template",
    kind: "guide.template",
    phase: ["test-design"],
    file: "template.md",
    content: `# Test Cases

| Case ID | Scenario | Steps | Expected | Priority |
|---------|----------|-------|----------|----------|
`
  },
  {
    id: "bug-record-template",
    kind: "guide.template",
    phase: ["verify"],
    file: "template.md",
    content: `# Bug Record

## Reproduction Steps

## Expected vs Actual

## Severity

## Fix Verification
`
  },
  {
    id: "change-request-template",
    kind: "guide.template",
    phase: ["design", "plan"],
    file: "template.md",
    content: `# Change Request

## Reason

## Impact

## Approval

## Rollout Plan
`
  },
  {
    id: "release-readiness-checklist",
    kind: "guide.skill",
    phase: ["verify", "archive"],
    file: "SKILL.md",
    content: `# Release Readiness

- Gates green, waivers documented, rollback tested.
- Monitoring dashboards and alerts updated.
`
  },
  {
    id: "risk-tiering",
    kind: "guide.skill",
    phase: ["propose", "plan"],
    file: "SKILL.md",
    content: `# Risk Tiering

- Classify changes as low/medium/high risk.
- High-risk changes require extra reviewers and rollout controls.
`
  },
  {
    id: "compliance-evidence-collection",
    kind: "guide.skill",
    phase: ["verify", "archive"],
    file: "SKILL.md",
    content: `# Compliance Evidence

- Capture audit logs, approvals, and test evidence for regulated changes.
`
  },
  {
    id: "uat-quality-rubric",
    kind: "sensor.rubric",
    phase: ["verify"],
    file: "rules.yaml",
    content: `rules:
  - id: uat-signoff
    status: enforced
    check: UAT sign-off is recorded
    pattern: "\\b(UAT|sign-?off|accepted)\\b"
    severity: warn
`
  },
  {
    id: "change-risk-rubric",
    kind: "sensor.rubric",
    phase: ["verify"],
    file: "rules.yaml",
    content: `rules:
  - id: risk-tier-documented
    status: trial
    check: Risk tier is documented for the change
    pattern: "\\b(risk tier|high risk|low risk)\\b"
    severity: info
`
  }
];

function executionForKind(kind) {
  if (kind.startsWith("guide.")) return kind === "guide.template" || kind === "guide.constraint" ? "computational" : "inferential";
  if (kind.startsWith("sensor.")) return kind === "sensor.rubric" ? "inferential" : "computational";
  return "computational";
}

for (const asset of ASSETS) {
  const dir = path.join(GOLDEN, asset.id, "1.0.0");
  if (fs.existsSync(dir)) {
    console.log(`skip existing ${asset.id}`);
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  const yaml = `id: ${asset.id}
kind: ${asset.kind}
version: 1.0.0
origin: hub
status: enforced
execution: ${executionForKind(asset.kind)}
phase: [${asset.phase.join(", ")}]
provenance:
  - type: golden-package
    ref: harnessx/hub-golden
metrics: {}
`;
  fs.writeFileSync(path.join(dir, "asset.yaml"), yaml);
  fs.writeFileSync(path.join(dir, asset.file), asset.content);
  fs.writeFileSync(path.join(dir, ".review"), REVIEW);
  console.log(`created ${asset.id}@1.0.0`);
}
