# Skill: Serverless Function Design

- Handlers parse events and map responses only; business rules live in `src/services`.
- Functions must be stateless between invocations; externalize state to DynamoDB/S3/etc.
- Cold-start sensitive: defer heavy imports; document init budget in design.md.
- Idempotency keys required for async/event handlers that cause side effects.
- Configuration via environment variables — never hard-code secrets or ARNs.
