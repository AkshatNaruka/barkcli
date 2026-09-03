# barkcli MVP Specs

> Solo-first, team-ready. CLI is truth. TF-IDF now, ONNX later. 4 BMAD skills.

This directory holds the authoritative build specs for the YC MVP. Each spec is one PR, independently shippable.

| Spec | Name | PR | Status | Days |
|------|------|----|--------|------|
| [001](./SPEC-001-harden-file-truth.md) | Harden: File Is Truth | `feat/spec-001-harden` | planned | 3 |
| [002](./SPEC-002-mind-overview.md) | Mind + Overview | `feat/spec-002-mind` | planned | 3 |
| [003](./SPEC-003-skills.md) | Skills Registry (mvp/planning/scrum-master/test) | `feat/spec-003-skills` | planned | 4 |

**Execution order:** 001 → 002 → 003. Tag `v0.3.0-mvp` after 003 green.

**Principles (from `MANAGEMENT_LAYER_VISION.md`):**

- Offline-first, boring storage (YAML `*.board` + JSON `.board/**`), file-is-truth
- `cargo test` + `cargo clippy` + offline `barkcli overview` smoke before merge
- BMAD skills are markdown in repo, injected into every agent prompt
