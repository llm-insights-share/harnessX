# Skill: UI Architecture

- Pages compose components; they do not embed data-fetching or business rules directly.
- Shared UI primitives live in `src/components`; cross-page logic in `src/hooks`.
- Route-level code splitting is required for new pages; note lazy boundaries in design.md.
- Accessibility: interactive components need keyboard focus and aria labels (verify in scenarios).
