# ADR B1 — Canonical Run Launcher / Lifecycle Unification

**Status:** Proposed (scaffold, B1.4/B1.5 pending implementation)  
**Date:** 2026-11-07  
**Related:** `docs/engineering/RUN_LIFECYCLE_B1.md`, `CONTRACT_INVENTORY.md`, PLAN B1/B2/B4

## Context
Server, CLI, and MCP trigger agent runs through multiple paths (`RunService`, `commands::run_cmd::run`, `dispatch_backend_plan`). This creates drift in IDs, status/events, capability gating, SHA-bound gate proofs, and merge/approval semantics.

## Decision (target)
1. Introduce a **`RunLauncher` facade** (core or `barkcli-core/src/runtime/launcher.rs`) that accepts a normalized request: source (`cli`/`server`/`mcp`/`thread`/`race`), intent/card, backend/provider/model, worktree strategy, prompt, capability requirements, and idempotency key.
2. `RunLauncher` resolves capabilities (`ProviderCapabilities`), validates support (no probe-only start), creates/attaches the canonical `ManagedRun`/receipt/event stream, and delegates execution to the selected runtime implementation.
3. **Server:** migrate `dispatch_backend_plan`, thread plan-and-run, and race/task launches to `RunLauncher`/`RunService` one path at a time; preserve HTTP contracts and `BARKCLI_AGENT_CMD` semantics behind compatibility adapters.
4. **CLI:** wrap `commands::run_cmd::run` and parallel/merge-train modes around the same lifecycle; keep existing flags/exit behavior; emit compat fields where needed.
5. **MCP:** map tools to the same launcher with typed errors for unsupported capabilities.
6. **Gate/merge:** all paths use `RunService` gate verification/proof and SHA-bound merge eligibility (B4).

## Compat plan
- Add adapter layer before deleting old paths.
- Golden/fixture tests: same fixture intent via CLI/server/MCP paths => equivalent terminal state, receipts, and no duplicate agents.
- Feature-flag or phased rollout for server paths if needed.

## Tests required
- Lifecycle parity fixtures; dup-launch prevention; capability negative tests; `BARKCLI_AGENT_CMD`/backend compatibility; merge-train conflict/retry parity; request/response snapshots for existing API/MCP contracts.
- Restart/idempotency tests coordinate with B2.

## Risks
- Changing run IDs/events can break UI/thread consumers; preserve event schema or version.
- Parallel merge-train semantics are subtle; keep existing behavior unless explicitly fixed with tests.

## Blocker (session)
- Full migration is a multi-PR behavior refactor; only B1.1–B1.4a audit + probe conformance completed safely in this session.
