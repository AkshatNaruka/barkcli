# Threat Model & Negative Test Matrix (A4)

**Date:** 2026-11-07  
**Baseline:** `80afdb5` / `plan/upgrade-a1-baseline`  
**Method:** source inspection of `barkcli-server/src/lib.rs` (auth_layer/routes) + `docs/engineering/CONTRACT_INVENTORY.md`. **Not a penetration test.** Labels describe observed code behavior; verify with tests before treating as guaranteed.

## 1. System overview
BarkCLI is the management layer for coding agents (CLI/TUI/web/desktop) backed by a local server (`barkcli serve`) exposing REST + WebSocket (`/ws`) + thread streams. It can read/write repo files and board state, run git operations, spawn/steer/stop agent runs/sessions, execute commands (e.g. `/api/exec`), and coordinate isolated worktrees/merge gates.

## 2. Trust boundaries
| Boundary | Trusted side | Untrusted / less-trusted side | Notes |
|---|---|---|---|
| Browser/UI ↔ daemon | Authenticated local app/session (when token+origin satisfied) | Remote browser, malicious web page, stale tab | CSRF/drive-by risk mitigated by Origin check when Origin present; `/api/ping` public exact literal. |
| Local ↔ remote network | Loopback bind | LAN/internet clients when bound externally (`--host 0.0.0.0` etc.) | Server warns on non-loopback without token; **external bind must be paired with strong auth + transport controls** (B5/B1S/P4-04). |
| Human ↔ agent | Human approval/policy | Agent output, tool results, retrieved context, model claims | Never merge on agent claim alone; gates/guard/review/receipt evidence required. |
| Project files ↔ executable instructions | Explicit user intent + policy | Repo text, comments, retrieved context, plugin/tool output | Treat as untrusted information (prompt injection/supply-chain). |
| Core ↔ plugins/extensions | Core permission/policy engine | Third-party provider/context/tool integrations | Future extensions must be capability-scoped, consented, sandboxed/child-process (B/P3). |
| Worktree/repo scope | Current authorized project/worktree | Other projects, symlink/traversal targets, cross-project IDs | Canonical path enforcement required (B6). |

## 3. Assets
- Source code, git history, credentials/secrets in env/files, SSH/gh auth context.
- Board/spec/memory/context/run/receipt data under `.board/` and project files.
- Local execution capability (`/api/exec`, git commands, agent subprocesses/worktrees).
- Tokens/session identifiers, provider auth state, raw transcripts/logs.

## 4. Entry points & observed controls (source-inspected)
| Surface | Examples | Observed control | Gap / risk |
|---|---|---|---|
| Public API (exact) | `GET /api/ping` | Exempt from token middleware; uncached | Intentional; must remain exact literal (tests exist). |
| Protected data/WS | `/api/*` except `/api/ping`, `/ws` | `auth_layer`: when `--token` configured, requires `Authorization: Bearer` or `?token=` (constant-time compare); rejects 401 on missing/invalid. Origin check when `Origin` header present (rejects 403 on disallowed cross-origin). | Token in URL query can leak via logs/history/referrers — prefer header; B5 should deprecate/limit query token for sensitive ops. If no token configured, API protection depends on deployment; avoid exposing non-loopback without token. |
| Command execution | `POST /api/exec` | Protected by auth_layer (when token used) | **High impact**: arbitrary/controlled command execution risk; needs scope, allow/deny policy, cwd/root confinement, output caps, audit, explicit permission (B5/B6). |
| Filesystem read | `GET /api/repo/file`, `/api/repo/tree` | Protected | Path traversal/symlink escape/cross-project read risk (B6). |
| Git operations | `/api/git/*`, worktrees | Protected | Can mutate repo state/push/merge/PR; requires scoped authz + SHA/approval checks (B4/B5). |
| Run/session control | `/api/runs/*`, `/api/sessions/*`, `/api/tasks/*`, `/api/threads/*` chat/stop/fork | Protected | Stop/merge/approve/steer are privileged actions; need idempotency, revision binding, per-action scopes (B1/B2/B4/B5). |
| Streams | `/ws`, `/api/threads/{id}/stream` | `/ws` protected by middleware; stream under `/api/*` protected | Reconnect/replay must not leak cross-project data or replay stale privileged actions (B2/E). |
| Hooks/install/import/open | `/api/hooks/install`, `/api/import`, `/api/open`, project init | Protected | Supply-chain/local execution/UI open risks; validate inputs and scope. |
| MCP tools | `barkcli mcp` (97 tools observed) | Separate transport; tool handlers must enforce permissions | Protocol access != authorization to perform high-impact actions (A2/B1S-02/P3-02). |

## 5. Threats & mitigations (prioritized)

| ID | Threat | Impact | Likelihood (current) | Mitigation / owner |
|---|---|---|---|---|
| T1 | Unauthenticated/weakly protected remote access when bound externally | Critical | Med if misconfigured | Loopback default; require token+TLS/SSH/Tailscale for remote; centralized scopes (B5). |
| T2 | CSRF/drive-by from malicious origin to localhost server | High | Med | Origin checks enforced when Origin present; require non-GET protections and per-action confirmation for privileged ops; validate WS upgrade. |
| T3 | Token leakage (query param, logs, screenshots, browser history) | High | Med | Prefer `Authorization` header; redact tokens; short-lived/revocable tokens for remote (B5/P1S-03). |
| T4 | Path traversal/symlink escape via repo/file/context APIs | High | Med | Canonicalize within workspace/worktree roots; deny symlink escapes; negative tests (B6). |
| T5 | Command injection / unrestricted exec | Critical | Med | Policy-guarded exec, cwd/root allowlist, explicit confirmation, audit, output caps, no shell interpolation from untrusted input (B5/B6). |
| T6 | Unsafe merge/approval race (changed SHA, stale UI, duplicate actions) | High | Med | Bind approve/merge to exact diff SHA/commit; recheck before promotion; idempotent state machine/cursors (B2/B4/E). |
| T7 | Cross-project/cross-worktree data leakage | High | Low/Med | Scope every ID/file/memory/context lookup by project/worktree; negative tests (B6/A4). |
| T8 | Prompt injection via repo/context/tool/plugin output | High | High | Treat retrieved/external text as untrusted; instruction separation; redact secrets before prompts/logs/exports (B6/C/P3). |
| T9 | Plugin/extension permission escalation | High | Future | Capability-scoped manifests, consent, child-process/MCP/IPC, no arbitrary in-process code/network/exec without grant (P3). |
| T10 | Denial of service / resource exhaustion | Med | Med | Output/timeout caps, bounded retries, backpressure on event streams, concurrency limits (B3/E). |

## 6. Negative test matrix (required; implement progressively)

| ID | Case | Expected | Current status |
|---|---|---|---|
| N1 | `GET /api/ping` without token | 200, public payload, `Cache-Control: no-store` | **Covered** (`ping_route_is_public_and_uncacheable`) |
| N2 | Protected API (`/api/config` representative) without token when token configured | 401 unauthorized | **Covered** (`ping_exemption_does_not_leak_to_other_api_routes`) |
| N3 | `/api/ping/`, `/api/ping/extra`, `/api/pingx` without token | 401 (exact exemption only) | **Covered** (`ping_exemption_is_exact_literal_not_a_prefix`) |
| N4 | `/api/ping?token=stale` | 200 (public) | **Covered** (`ping_ignores_a_bogus_token_query_param`) |
| N5 | Protected route with invalid Bearer token | 401 | **Covered (B5.1)** `protected_route_rejects_invalid_bearer_token` |
| N6 | Protected route with valid Bearer token | 200 | **Covered (B5.1)** `protected_route_accepts_valid_bearer_token` |
| N7 | Protected route with valid `?token=` (transitional) | 200; document leak risk | **Covered (B5.2, transitional)** `protected_route_accepts_valid_query_token_transitional` — prefer `Authorization: Bearer` |
| N8 | Cross-origin `Origin` not allowed | 403 | **Partial** `cross_origin_csrf_rejected_on_localhost` exists; expand matrix (B5) |
| N9 | `/ws` upgrade without auth | rejected/401 | **Covered (B5.5, auth-layer path)** `ws_upgrade_rejects_without_token`; `/ws` is in protected path set. Add full WS upgrade/message-action authz tests in follow-up. |
| N10 | `/api/exec` unauthorized | 401/403 | **Covered (B5.4, auth-layer)** `sensitive_exec_rejects_without_token` (dummy handler; verifies middleware on exec path) |
| N11 | `/api/exec` authorized but path/cmd violates policy | rejected (after B5/B6 policy) | **TODO (B5/B6)** — handler-level policy/cwd/allowlist |
| N12 | `repo/file` path traversal (`../`, symlink escape) | rejected | **Covered at core API (B6.1)** `repo::tests::repo_paths_reject_traversal`, `repo::tests::repo_paths_reject_symlink_escape` (unix) pass; server handler delegates to `repo::read_file/safe_join`. Add HTTP-level negative tests (B6). |
| N13 | Cross-project run/session/file ID access | 404/403, no leak | **TODO (B6)** |
| N14 | Approve/merge with stale SHA or changed diff | rejected | **TODO (B4)** |
| N15 | MCP/tool call attempts privileged action without permission | rejected, audited | **TODO (P3-02)** |

## 7. Residual risks / assumptions
- No token configured => local trust model; dangerous on non-loopback networks.
- Granular RBAC/scopes and per-action approval are not fully implemented (planned B5).
- Query-string token support increases leakage risk; acceptable only as transitional compatibility.
- Origin enforcement depends on `Origin` header presence; non-browser clients need token/scope controls.
- This document is not a substitute for crash/security conformance tests (B2/B5/B6) or external review.

## 8. Next actions
1. Add N5–N9 server negative tests (auth/origin/ws) — B5 start.
2. Add N10–N14 path/exec/git/run negative tests with disposable fixtures — B5/B6/B4.
3. Implement centralized authz scopes and sensitive-route registry — B5.
4. Canonicalize filesystem roots and harden exec — B6.
5. Re-run threat model after B5/B6/E (streams/reconnect/remote).