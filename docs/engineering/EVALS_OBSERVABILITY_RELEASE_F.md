# Routing, Memory, Evals, Observability, Release (F scaffold)

**Date:** 2026-11-07 | **Status:** design/plans

## F1 Deterministic eval harness (spec)
- **Bench types:** code localization/retrieval (C4), plan quality, patch correctness (gated tests), gate accuracy, merge safety, context efficiency (tokens vs outcome).
- **Datasets:** pinned fixtures under `fixtures/evals/` (or tests/fixtures) with task prompt, repo snapshot/ref, expected files/symbols/checks, optional paraphrases. No external benchmark downloads by default.
- **Runner:** `barkcli eval --suite <name> --format json|md` (future) produces machine-readable results: pass/fail, latency, approx tokens, retrieval hits/provenance, diffs to baseline.
- **Gate:** CI runs deterministic subset (no LLM/API keys). Model-backed evals are opt-in/manual/nightly with redaction.
- **Current evidence:** A5 deterministic context benchmark proxy committed.

## F2 Routing memory + policies
- Record run outcome by repo/task type/provider/model/context profile/cost/latency (local, opt-in).
- Policy engine inputs: provider capabilities, health, budget, task class. Output: selected profile + rationale (typed, auditable).
- No hidden model/provider changes; show “why this route”.

## F3 Observability, metrics, audit, diagnostics
- Local structured logs/events (redacted). Metrics: run success, retries, gate/merge blocks, context sizes/tokens, p95 durations, reconciliation actions.
- `barkcli doctor`/diagnostics bundle: include version, config (redacted), recent run receipts/events, health checks; exclude secrets/tokens.
- Provenance in UI/details: context sources, provider/model, SHAs, gate/check evidence.

## F4 Packaging, CI, release, upgrade, rollback
- CI matrix (target): Rust fmt/clippy/test (workspace, OS matrix phased), web lint/typecheck/build/tests, schema snapshot/conformance tests, deterministic eval subset, packaging smoke.
- Artifacts: CLI binaries, web assets, desktop shell checks (Tauri build in dedicated job if deps available), checksums.
- Upgrade: migration steps for `.board`/runtime schema changes (versioned, idempotent, backup first).
- Rollback: keep previous binary/assets; document how to revert config/schema migrations; never corrupt durable run receipts.
- **Blocker:** hosted CI runners/OS matrix/Tauri deps and release signing infrastructure are environment-specific; provide scripts/checklists.

## F5 Support matrix and docs
- Supported: Rust toolchain per `rust-toolchain.toml`/lockfiles, Node for `web/`, OS targets as CI proves.
- Degraded: optional providers (CK/Codanna/ACP/rmcp adapters) disabled by default with typed errors.
- Docs required per release: migration notes, known issues, security defaults, remote mode warnings.
