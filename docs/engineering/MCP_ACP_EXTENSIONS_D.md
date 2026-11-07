# MCP / ACP / Extensions Plan (D scaffold)

**Date:** 2026-11-07 | **Status:** design/inventory; implementation follow-up

## D1 MCP tool inventory and contract tests
- Source: `barkcli-core/src/mcp/mod.rs` (97 tools; A2 inventory). Known drift: runtime header and README counts stale.
- **Deliverables:** generated tool catalog (name/args schema/result schema/scope/idempotency/sensitive flag), JSON schema snapshots in `docs/engineering/mcp/` or test fixtures, conformance tests for core tools, and versioned error model.
- **Scopes:** map each tool to B5 scopes (read/operate/maintain/exec); reject over-broad tokens.
- **Idempotency:** start/claim/merge/approve tools must be idempotent or conflict-typed (B2).

## D2 MCP conformance in CI
- Snapshot tests for tool schemas; golden calls for safe read tools; negative tests for authz/unknown IDs/invalid state transitions.
- Run in CI as non-flaky, no network/provider deps.

## D3 ACP / `agent-client-protocol` evaluation
- **Goal:** optional ACP-facing adapter for editor/agent interop; do not destabilize canonical `ManagedRun`/runtime.
- **Evaluation criteria:** protocol fit for run lifecycle/events/approvals/diffs, transport/auth model, Rust SDK maturity (`agent-client-protocol`/`sacp`), mapping to `ProviderCapabilities`, migration cost.
- **Decision gate:** adopt only with parity tests and no regression to existing MCP/CLI/server contracts. Record ADR when evaluated.

## D4 Optional `rmcp` evaluation
- **Current:** hand-rolled MCP JSON-RPC server in core.
- **Evaluation:** schema generation/validation, handler ergonomics, transport options, binary size/deps, compatibility with existing 97 tools and error shapes.
- **Rule:** no forced migration. If adopted, keep wire compatibility or versioned migration with snapshots.

## D5 Extension/plugin system hardening
- Manifest: id, version, permissions (read files, run commands, access runs, network — default deny), tool contributions, UI contributions (future), config schema.
- Lifecycle: install/enable/disable/uninstall; compatibility with Bark version.
- Isolation/trust: local process boundaries as minimum; explicit consent for sensitive permissions; signed/curated sources out of scope unless decided.
- Security tests: plugin cannot access exec/git/secrets without declared permission; audit log.
- **Blocker:** needs product/UX decisions and implementation work beyond scaffold.
