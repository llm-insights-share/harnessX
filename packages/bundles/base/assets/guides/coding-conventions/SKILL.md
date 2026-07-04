# Skill: Coding Conventions

Apply these conventions when writing or modifying code in this repository.

- Prefer small, single-purpose modules; avoid files over ~400 lines.
- Validate inputs at system boundaries only; trust internal invariants.
- Never modify approved test assertions or fixtures without a waiver (`hx waiver add`).
- Reference the requirement/scenario you are implementing in the test name, e.g. `it("Scenario: rejects expired token", ...)`.
- When a sensor fails, read its `fix_hint` and `agent_instruction` before editing code.
