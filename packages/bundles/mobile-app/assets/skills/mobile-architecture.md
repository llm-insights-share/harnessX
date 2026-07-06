# Skill: Mobile App Architecture

- Screens compose UI only; navigation and side effects live in feature/domain layers.
- Offline-first flows document cache/sync strategy in design.md (Scenario-level).
- Platform APIs (camera, push) accessed through adapters in `src/domain` or `src/shared/platform`.
- Accessibility: interactive controls need labels and focus order (verify in scenarios).
- Deep links map to screens via a single routing table — no ad-hoc string routes in components.
