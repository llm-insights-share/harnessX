# Package boundaries (v0.5)

HarnessX splits responsibilities so third parties can extend without forking core.

## Modules

| Boundary | Entry | Owns |
|----------|-------|------|
| `@harnessx/orchestration` | `import { orchestration } from "@harnessx/core"` | Gates, apply loop, context/task packs, L1 env contract, MCP orchestration tools |
| `@harnessx/hub` | `import { hub } from "@harnessx/core"` | Hub sync/promote, blueprints, `imports:` expansion, layered asset resolution |
| `@harnessx/adapters` | `import { ... } from "@harnessx/adapters"` | Capability model, tier, compile-to-IDE emitters |

## Extension recipes

1. **Custom sensor** — add under `packages/sensors`, register in builtin map; reference in `harness.yaml`.
2. **Hub package** — `asset.yaml` + content under `hub/packages/<id>/<version>/`; `hx hub add`.
3. **Topology bundle** — `bundle.yaml` + `assets/`; reference via `imports: [my-bundle@1.0.0]`.
4. **New IDE target** — implement `TargetEmitter` in `packages/adapters` with capability declaration.

## Related docs

- [Concept glossary](./glossary.md)
- [L1 agent env JSON Schema](../schemas/l1/agent-env-contract.json)
