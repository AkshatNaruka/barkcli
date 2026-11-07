# Orchestra 2.0 — Phase 4–6 Implementation Notes (next steps)

**Status:** Phases 1–3 core implemented and tested on `feat/orchestra-2.0-phase1`; Phase 4/5 type scaffolds added. Phase 4 O4.5 milestone is the critical validation gate.

## Phase 4 (P0) — do before UI polish
1. **O4.1 Runtime manager:** introduce `RuntimeManager`/OpenCode session adapter (server API preferred, CLI fallback). Keep loopback-only, unique creds, explicit ownership; reuse compatible server only when safe. Integrate behind existing `ProviderAdapter`/`StartRun` without breaking fake/claude/codex adapters.
2. **O4.2 Explicit model refs:** extend `StartRun`/run receipts/events to carry `ModelRef` + variant + selection reason (additive serde). Pass `--model`/server model fields from resolved assignment. Preserve legacy `model: Option<String>` compatibility.
3. **O4.3 Reconciliation:** coordinate with ADR B2 (durable state machine, monotonic seq, idempotent reservations). On restart, reconcile OpenCode sessions/PIDs/worktrees; never duplicate claims.
4. **O4.4 Handoffs:** use `HandoffArtifact` when switching model/provider after failure; new session receives files/tests/criteria/branch/worktree, not full prior chat by default.
5. **O4.5 Milestone test (required):** prove one OpenCode runtime can run distinct sessions with different models/worktrees; cover failure, restart, recovery, no duplicate claims. Use mocked OpenCode server/CLI fixtures in CI; document real `opencode` validation commands.

## Phase 5 (P1)
- Persist `ModelPerformanceRecord` from **verified** outcomes only (gate/tests/approval/merge evidence). No self-reported success.
- Add `barkcli orchestra benchmark` (or `barkcli model benchmark`) for 5–10 inexpensive tasks, fixed commit/worktree/limits; opt-in, no auto expensive probes.
- Feed confidence-adjusted priors into `router::Candidate.quality_prior/history_prior`; bound exploration (never high-risk/unproven).

## Phase 6 (P1)
- **Model Hub:** expose discovery report/catalog, availability, capabilities, source/confidence, measured perf, enable/disable/pin (server API + web/desktop UI).
- **Team Builder:** edit `AgentProfile.model_policy`/pins with presets.
- **Orchestra Canvas/Inspector:** show task DAG, selected `ModelRef`, `selection_reason`, score, rejected candidates (progressive disclosure), worktree, events, diff, verification, handoff/reassign actions.
- **Review/Delivery:** include model history and receipts in merge evidence.
- Follow `web/REDESIGN_T3.md` (graphite, no purple AI chrome), a11y, and existing T3 thread/details patterns.

## Guardrails checklist
- No auto probes; no surprise paid escalation; Free Only/Local Only enforced.
- `ModelAvailability::Ready` (or explicit policy) required for auto execution; catalog presence != access.
- All model switching/handoffs recorded; independent review with same model labeled as procedural only.
- Quotas tracked at machine/runtime/provider/model/account/task levels.
- Authz scopes for sensitive model/provider/config/exec endpoints (B5 patterns).