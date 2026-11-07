# OpenAI-Compatible Wrapper Stubs (B7 scaffold)

**Status:** design/reference only — **not wired into default runtime**.  
**Date:** 2026-11-07

## Scope
Optional local/reference adapters for OpenAI-compatible APIs (e.g., Codex-compatible endpoints) may be used for **chat/reasoning** experiments. They must **not** gain implicit repo mutation, merge, or privileged exec authority.

## Rules
- Explicit opt-in config and capability declaration (`ProviderCapabilities`).
- Repo mutation/commands run only through canonical Bark run/gate/approval/merge path (B1/B4).
- No provider path may bypass `GateSummary` verification, SHA-bound merge checks, or authz (B5).
- API keys/tokens stored via approved secret/config mechanism; never logged.
- Conformance tests: wrapper cannot start privileged actions without capability+policy; merge still requires verified gate + approval.

## Blocker
- Requires provider adapter implementation and security review; external API compatibility varies. Keep as reference until implemented with tests.
