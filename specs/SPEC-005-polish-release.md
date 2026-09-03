# SPEC-005 — Polish & Release v0.3.0-mvp

**Status:** planned  
**Branch:** `feat/mvp-all-specs` (same branch)  
**Depends:** SPEC-001, SPEC-002, SPEC-003, SPEC-004  
**Days:** 2  
**Type:** Docs, version, polish (no milestones — deferred per decision)

## Goal

Make `feat/mvp-all-specs` merge-ready and YC-presentable. Update docs, prompts, version, and tag `v0.3.0-mvp`. Keep milestones deferred.

## Requirements

### R1 — Version bump

- `barkcli-core/Cargo.toml: version = "0.3.0"` (was 0.2.0)
- `barkcli-cli/Cargo.toml`, `barkcli-server`, `barkcli-tui` sync to 0.3.0
- `Cargo.lock` regenerated via `cargo build`

### R2 — Docs

- `README.md`: update Interfaces table (add `barkcli mind`, `overview`, `skills`), Management Layer table (intake/plan/memory/monitor/review → add mind/overview/skills/dispatch)
- `docs/AI_AGENT_PROMPT.md`: add new MCP tools (`mind_snapshot, overview, skill_list, skill_get, intake`) + mind context (`digest.md` paste)
- `MANAGEMENT_LAYER_VISION.md`: add footer "Implemented in v0.3.0-mvp on feat/mvp-all-specs"
- `landing-next/`: no change for MVP (defer marketing)

### R3 — Smoke & clippy

- `cargo clippy -- -D warnings` 0 warnings (allow dead_code for plan `PlanRequirement.description` if needed via `#[allow(dead_code)]`)
- `cargo test` 86+ passed
- Offline smoke script in `specs/MVP-PLAN.md: Demo script` runs green on clean `mktemp`

### R4 — Tag

```bash
git tag v0.3.0-mvp -m "MVP mind+skills+hardening+team protocol"
git push origin feat/mvp-all-specs --tags
```

Merge: PR `feat/mvp-all-specs → master` after human review.

## Out of Scope

- Milestones/Roadmap (deferred)
- Web MindView / TUI tabs (deferred to post-YC)
- ONNX embeddings

## File Impact

```
modified:
  barkcli-core/Cargo.toml
  barkcli-cli/Cargo.toml
  barkcli-server/Cargo.toml
  barkcli-tui/Cargo.toml
  README.md
  docs/AI_AGENT_PROMPT.md
  MANAGEMENT_LAYER_VISION.md
  specs/SPEC-005-polish-release.md (this file)
  Cargo.lock
```

## Verification

```bash
cargo clippy
cargo test | grep passed
grep "0.3.0" barkcli-core/Cargo.toml
cat README.md | grep -E "mind|overview|skills"
BARKCLI_API_KEY="" /tmp/smoke/mvp.sh
```
