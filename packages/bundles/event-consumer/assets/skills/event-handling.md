# Skill: Event Handling

- Every consumer handler must be idempotent: document the idempotency key and dedup store in design.md.
- Handlers parse/validate messages only; business rules live in processors/domain layers.
- Poison messages go to a dead-letter path with structured logging — never silent drop.
- Retries use exponential backoff with a max attempt budget declared in the delta spec.
- Side effects (DB writes, outbound calls) happen in processors, not in thin handlers.
