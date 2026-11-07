# Release / CI / Upgrade / Rollback Checklist (F4)

**Date:** 2026-11-07 | **Status:** checklist scaffold

## Pre-merge gates (target CI)
- [ ] `cargo fmt --all --check` (resolve known TUI debt or scope)
- [ ] `cargo clippy --workspace --all-targets -- -D warnings` (phased; track debt)
- [ ] `cargo test --workspace` (required suites green; skipped tests documented)
- [ ] Server authz negative tests (N5–N13 coverage as implemented)
- [ ] Runtime lifecycle/merge/gate negative tests (B1–B4)
- [ ] MCP schema snapshot/conformance (D1/D2)
- [ ] `cd web && npm ci && npm run build && npm test` (known baseline debt resolved or tracked)
- [ ] Deterministic eval subset (F1) — no API keys/network
- [ ] Packaging smoke (CLI, web assets; desktop/Tauri job when deps available)

## Security/release review
- [ ] Sensitive route registry reviewed (`AUTHZ_MATRIX.md`)
- [ ] Exec/path/git surfaces audited; defaults safe for non-loopback/remote
- [ ] No secrets/tokens in logs, diagnostics bundles, or test fixtures
- [ ] Dependency audit (Rust/npm) reviewed for critical advisories

## Upgrade
- [ ] `.board`/runtime schema migrations versioned, idempotent, backup-first
- [ ] Backward-compat notes for MCP/API/event schema changes
- [ ] Desktop/web cache invalidation considered

## Rollback
- [ ] Previous artifacts/checksums retained
- [ ] Migration rollback or forward-fix procedure documented
- [ ] Durable run receipts preserved; never auto-delete evidence on rollback

## Support matrix
- [ ] Document Rust/Node/OS support + degraded optional providers (CK/Codanna/ACP/rmcp)
- [ ] Release notes: features, fixes, migrations, known issues, security defaults
