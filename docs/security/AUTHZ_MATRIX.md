# AuthZ Matrix — Sensitive Route Scope Registry (B5.2, design)

**Date:** 2026-11-07  
**Status:** design/inventory for B5 centralized enforcement. Current server enforces a coarse check (`auth_layer`: token when configured + Origin check on protected routes; `/api/ping` public). **No granular RBAC scopes are implemented yet.**

## Proposed scopes (least privilege)
| Scope | Intent | Typical examples |
|---|---|---|
| `public` | No project data, safe for monitors | `GET /api/ping` (exact) |
| `read` | View project/board/run state, no mutations/exec | boards/cards/threads/runs read, context/code search read, reports/history, diffs/views (as applicable) |
| `operate` | Non-destructive workflow actions scoped to runs/tasks | claim/heartbeat/notes, start chat/run requests where policy allows, stop/steer/fork with audit (review) |
| `maintain` | Mutating project/review/release actions | create/update/delete cards/tasks/boards/specs, approve/merge/gate/verify, checkpoints, import/export, hooks install, project init/onboard |
| `exec` | Local command/process/git push/PR/open | `/api/exec`, `/api/open`, git commit/push/merge/pr/assign where it triggers tools, terminal/PTY (future) — **highest risk** |
| `admin` (future remote) | Token/device/policy/config changes | server config, remote device revoke, plugin permissions — not exposed today as a unified API |

## Sensitive route classification (from A2; implement as registry)

> **Rule:** default deny for unclassified sensitive mutations until explicitly scoped. Prefer allowlist per method+path pattern.

| Group | Method/Path (examples) | Proposed scope | Risk | Notes |
|---|---|---|---|---|
| Liveness | `GET /api/ping` | `public` | low | exact literal only (covered). |
| Execution | `POST /api/exec` | `exec` + explicit confirmation/policy | **critical** | cwd/root allowlist, arg policy, output/time caps, audit (B6). |
| OS open | `GET/POST /api/open` (as implemented) | `exec`/`maintain` | high | can trigger local apps/URLs; validate target. |
| Repo filesystem | `GET /api/repo/file`, `GET /api/repo/tree` | `read` (scoped to workspace root) | high | path canonicalization, symlink/traversal block (B6). |
| Git read | `GET /api/git/status`, `worktrees`, `commits`, `diff/{sha}` | `read` | med | scope to project/worktree. |
| Git mutate | `POST /api/git/commit/push/merge/pr/assign`, init | `exec`/`maintain` | **high** | protect credentials; SHA/approval integrity; no silent push/force. |
| Runs/sessions control | `POST /api/runs/{id}/stop|merge|verify|ask|answer|approve|request-changes|gate`, `/api/sessions/{id}/stop|steer|fork`, `/api/tasks/{id}/race`, plan-and-run/chat start | `operate`/`maintain` (merge/approve=`maintain`) | high | idempotent; bind approve/merge to exact revision (B4). |
| Threads/chat | `POST /api/threads*` create/messages/chat/stop/fork/delete | `operate`/`maintain` (destructive) | med/high | audit; rate/cost controls later. |
| Board/task/spec mutations | `PUT /api/board`, create/delete/import/export, task CRUD, specs edits, checkpoints restore | `maintain` | med/high | validate names/paths (`sanitize_name` patterns exist; extend). |
| Context/memory/rules mutations | clear/sync/digest writes, memory add/delete/fact, rules add | `maintain` (or `operate` for safe appends) | med | redaction/secrets handling. |
| Streams | `GET /ws`, `GET /api/threads/{id}/stream` | same as underlying data/action scope (min `read`; actions over WS need checks) | high | per-message/action authz, not just upgrade (B5). |
| Providers/hooks/config | probe/models, hooks install, config changes | `operate`/`maintain` | med | hooks install can execute scripts. |
| Review/receipt/guard/contributions | mutations/verify/link | `operate`/`maintain` | med | preserve evidence integrity. |

## Enforcement plan (B5 increments)
1. **B5.2 (this):** matrix/registry design + N7 transitional test.
2. **B5.3:** implement central route-scope registry (method+path pattern → scope) and middleware hook that *logs/annotates* decisions (shadow mode) or enforces only for explicitly high-risk routes (`/api/exec`, git mutate, repo file) behind compatible behavior.
3. **B5.4:** add per-action authz checks inside handlers for WS messages and privileged operations (merge/approve/exec).
4. **B5.5:** introduce token scopes/roles (read/operator/maintainer/exec) once config/UI supports them; keep single-token backward compat.
5. **B5.6:** complete N8–N13 + cross-project negative tests; remote defaults.

## Backward compatibility
- No token configured: preserve current local behavior but **never** recommend on non-loopback; document.
- Existing single token: map to full legacy scope or `maintain`+`exec` only for trusted local setups? (decide in ADR; default safe).
- `?token=` query: transitional; emit deprecation warning path later; prefer `Authorization: Bearer`.

## Test hooks
- Extend `test_router` to cover `/api/exec`, `/api/repo/file`, `/api/git/*` mock/guarded handlers and WS upgrade auth cases.
- Table-driven tests: `(method,path,token,origin,expected_status,scope)`.