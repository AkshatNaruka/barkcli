# barkcli MVP Specs

> Solo-first, team-ready. CLI is truth. TF-IDF now, ONNX later. 4 BMAD skills.

This directory holds the authoritative build specs for the YC MVP. All specs built in **single branch `feat/mvp-all-specs`**.

| Spec | Name | Status | PR |
|------|------|--------|----|
| [001](./SPEC-001-harden-file-truth.md) | Harden: File Is Truth | ✅ done | #8 |
| [002](./SPEC-002-mind-overview.md) | Mind + Overview | ✅ done | #8 |
| [003](./SPEC-003-skills.md) | Skills Registry (mvp/planning/scrum-master/test) | ✅ done | #8 |
| [004](./SPEC-004-server-mcp-team.md) | Team Protocol (Card.spec_id + /api/mind + /api/skills + MCP) | ✅ done | #8 |
| [005](./SPEC-005-polish-release.md) | Polish & Release v0.3.0 | ✅ done | #8 |

**Branch:** `feat/mvp-all-specs` → `master` via #8. Tags `v0.3.0-mvp` + `v0.3.1-mvp` (web).

**Web bonus:** `MindView` + `SkillsView` + `mind/skills` API complete.

**Verification:** `cargo test:86 passed`, `vite build` 526 modules, offline smoke `intake→plan→mind→overview→dispatch`.

**Principles (from `MANAGEMENT_LAYER_VISION.md`):**

- Offline-first, boring storage (YAML `*.board` + JSON `.board/**`), file-is-truth
- `cargo test` + `cargo clippy` + offline `barkcli overview` smoke before merge
- BMAD skills are markdown in repo, injected into every agent prompt
