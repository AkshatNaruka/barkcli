# Live Workbench / Reconnect / PWA (E scaffold)

**Date:** 2026-11-07 | **Status:** design

## E1 Live run workbench state model (UI contract)
- Entities: thread, plan, run, attempt, task, event, artifact, diff, check, gate, approval, merge.
- Event stream: monotonic sequence per run/thread where possible; typed events; reconnect uses `after_seq`/cursor.
- UI states: `queued|preparing|running|collecting|checks|awaiting_review|approved|merging|merged|failed|cancelled|stale`; never infer success from process exit alone.

## E2 UI/UX overhaul (T3-inspired graphite, scoped)
- Extend existing `web/REDESIGN_T3.md`/`DESIGN.md` tokens; calm detail views, progressive disclosure.
- Workbench surfaces: run header/status, live transcript/events, changed files/diff, checks/gate, approvals, merge receipt, errors/recovery actions.
- Keep CLI parity for critical actions where feasible.
- **Blocker:** large frontend refactor; needs component inventory and Playwright coverage.

## E3 Streaming/reconnect
- Server: SSE/WS cursor (`after_seq`, `Last-Event-ID` semantics for SSE if used), backpressure, bounded buffers, heartbeat.
- Client: resume from cursor after reload/network loss; dedupe by event id/seq; show “reconnecting/stale” state.
- Tests: simulated disconnect/reconnect, out-of-order/duplicate delivery handling.

## E4 Safe remote + PWA
- Default localhost binding remains.
- Remote mode requires explicit enable + strong auth (scoped token/device), TLS/reverse-proxy guidance, CSWS/origin hardening.
- PWA installable only in safe mode; no silent exposure.
- **Blocker:** security review + deployment UX + E2E tests.
