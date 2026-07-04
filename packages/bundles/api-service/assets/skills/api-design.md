# Skill: API Design

- Every endpoint has an explicit request/response schema; no untyped `any` payloads.
- Errors use RFC 7807 problem+json shape: `{ type, title, status, detail }`.
- Breaking API changes require a `MODIFIED Requirements` delta on the affected capability spec.
- Every list endpoint must be paginated with limit and cursor parameters; default limit 50, max 200.
