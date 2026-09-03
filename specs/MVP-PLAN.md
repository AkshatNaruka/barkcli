# barkcli MVP Plan — Solo-First, Team-Ready

**Vision:** `MANAGEMENT_LAYER_VISION.md` (7 layers, 6 phases)  
**MVP Scope:** SPEC-001 + 002 + 003 = 10 days, CLI file-truth only  
**Tag:** `v0.3.0-mvp` after SPEC-003 green  
**Principles:** Offline-first, boring storage, TF-IDF now ONNX later, BMAD skills, milestones deferred

## Order

```
Week 1: SPEC-001 Harden (File Is Truth)
  → board_file lock+atomic, orchestrate persistence, dispatch context, stress test

Week 2: SPEC-002 Mind + Overview
  → MindSnapshot, mind sync/show, overview 4 panels, digest.md

Week 3-4: SPEC-003 Skills (BMAD)
  → registry/loader/builtin 4 md, CLI list/show, injection into intake/plan/listener + heuristic fallback

Post-MVP (Weeks 5-10): P3-P6 fast-follow (server /api/mind, TUI tabs, Web Mind, milestones) → YC Demo Day
```

## Branch Strategy

- `feat/spec-001-harden` → PR → merge to `main`
- `feat/spec-002-mind` branched from updated `main`
- `feat/spec-003-skills` branched from updated `main`

Each PR: `cargo test` + `cargo clippy` + offline smoke (`BARKCLI_API_KEY="" barkcli overview`).

## YC Video Script (CLI-only, 60s)

```bash
cargo install barkcli
barkcli init && barkcli create my-project
barkcli intake "Add Google OAuth login" --feature
barkcli context scan
barkcli plan add-google-oauth-login --tasks
barkcli skills list
barkcli mind sync && barkcli overview
barkcli dispatch && barkcli monitor
barkcli memory search "OAuth"
# git diff shows *.board + .board/mind/digest.md
```

## Done Definition for v0.3.0-mvp

- [ ] SPEC-001 AC all checked (grep with_lock, stress 0 flakes, queue persists)
- [ ] SPEC-002 AC (mind sync <100ms, overview offline, digest good for agent paste)
- [ ] SPEC-003 AC (4 skills, list/show, heuristic offline intake, injection max 2-3)
- [ ] `cargo test` green, `cargo clippy` 0 warnings, `cargo build --release` OK
- [ ] Fresh container: `cargo install barkcli` → demo script completes, `git push` syncs

## Risks

- Lock deadlock if nested `with_lock` on same path — avoid nesting, single save at end.
- Skill injection bloats prompt → cap 2-3, overflow note.
- Heuristic quality low — but ensures offline never fails; LLM path still primary.

## References

- `MANAGEMENT_LAYER_VISION.md` §6-16
- `specs/SPEC-001-harden-file-truth.md`
- `specs/SPEC-002-mind-overview.md`
- `specs/SPEC-003-skills.md`
