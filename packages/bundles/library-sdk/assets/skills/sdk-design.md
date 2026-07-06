# Skill: SDK / Library Design

- Public API surface is defined in `src/public` (or package `exports` map); internals stay out of barrel files.
- Breaking changes require semver major + `MODIFIED Requirements` delta on the capability spec.
- Every exported function/type needs a Scenario in specs when behaviour is user-visible.
- Avoid global mutable singletons; document thread/async safety in design.md.
- Optional peer dependencies must be declared and lazy-imported when possible.
