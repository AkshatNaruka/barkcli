# barkcli MVP Specs

> Solo-first, team-ready. CLI is truth. TF-IDF now, ONNX later. 4 BMAD skills.

This directory holds the authoritative build specs for the YC MVP. Specs 001–005 shipped on **`feat/mvp-all-specs`**; later specs use dedicated branches.

| Spec | Name | Status | PR |
|------|------|--------|----|
| [001](./SPEC-001-harden-file-truth.md) | Harden: File Is Truth | ✅ done | #8 |
| [002](./SPEC-002-mind-overview.md) | Mind + Overview | ✅ done | #8 |
| [003](./SPEC-003-skills.md) | Skills Registry (mvp/planning/scrum-master/test) | ✅ done | #8 |
| [004](./SPEC-004-server-mcp-team.md) | Team Protocol (Card.spec_id + /api/mind + /api/skills + MCP) | ✅ done | #8 |
| [005](./SPEC-005-polish-release.md) | Polish & Release v0.3.0 | ✅ done | #8 |
| [006](./SPEC-006-fleet.md) | Fleet: sessions, worktrees, leases | ✅ done | — |
| [007](./SPEC-007-trust-layer.md) | Trust Layer: receipts, guard, risk-ranked review | ✅ done | #32 |
| [008](./SPEC-008-mac-parity.md) | macOS app parity: same UI, same server, verifiable bundle | ✅ done | — |
| [009](./SPEC-009-real-product.md) | Real product: project setup, providers, skills, brain loop | ✅ done | — |
| [010](./SPEC-010-daily-driver.md) | Daily-driver Mac harness: local-agent chat, quick open, native shell | ✅ done | — |
| [011](./SPEC-011-collective-memory.md) | Collective memory: Agora-style contribution DAG, verification, analyze | ✅ done | — |

**Trust Layer plan:** [PLAN-007](./PLAN-007-trust-layer.md) · research: [TRUST_LAYER_RESEARCH](../docs/internal/TRUST_LAYER_RESEARCH.md)

**macOS parity plan:** [PLAN-008](./PLAN-008-mac-parity.md)

**Real product plan:** [PLAN-009](./PLAN-009-real-product.md)

**Daily-driver plan:** [PLAN-010](./PLAN-010-daily-driver.md)

**Mac UI enhancement proposal:** [Minimal building flow and phased roadmap](../docs/design/mac-ui-enhancement-plan.md) · [Interactive concept](../docs/design/mac-ui-concept.html) (2026-10-29; planning complete, implementation proposed)

**Collective-memory plan:** [PLAN-011](./PLAN-011-collective-memory.md)

**Branch:** `feat/mvp-all-specs` → `master` via #8. Tags `v0.3.0-mvp` + `v0.3.1-mvp` (web).

**Web bonus:** `MindView` + `SkillsView` + `mind/skills` API complete.

**Verification:** `cargo test:86 passed`, `vite build` 526 modules, offline smoke `intake→plan→mind→overview→dispatch`.

**Principles (from `MANAGEMENT_LAYER_VISION.md`):**

- Offline-first, boring storage (YAML `*.board` + JSON `.board/**`), file-is-truth
- `cargo test` + `cargo clippy` + offline `barkcli overview` smoke before merge
- BMAD skills are markdown in repo, injected into every agent prompt
