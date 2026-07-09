# Skill: API Conventions (Hub)

- Every endpoint documents request/response schema; no untyped payloads.
- Errors use RFC 7807 problem+json: `{ type, title, status, detail }`.
- Breaking API changes require a `MODIFIED Requirements` delta on the affected capability.
- List endpoints must paginate with `limit` + `cursor`; default limit 50, max 200.
