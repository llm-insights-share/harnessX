# Project Constitution

> Highest-priority Guide (FR-034). When guides or sensors conflict, this document arbitrates.
> Keep it short: 5–10 immutable principles. Everything else belongs in skills/rules.

## Principles

1. Specs are the source of truth. Code that disagrees with an archived spec is a bug in one of them — resolve explicitly via `hx sync`, never silently.
2. Every behaviour change goes through a change workspace (propose → … → archive). No drive-by spec edits on main specs.
3. Verification gates are fail-closed. A sensor that crashes blocks the gate; it never passes by accident.
4. Tests document behaviour. Every P0 scenario maps to at least one test or an explicit, expiring waiver.
5. Humans approve intent (specs), machines verify implementation. The spec→plan gate always requires a human approver.

## Core domains

<!-- Changes touching these domains are recommended the `strict` profile (FR-013). -->
core-domains: []
