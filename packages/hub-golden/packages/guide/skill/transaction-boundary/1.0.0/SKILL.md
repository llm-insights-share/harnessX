# Transaction Boundaries

- Keep transactions short; avoid external I/O inside DB transactions.
- Use outbox pattern for cross-service consistency.
