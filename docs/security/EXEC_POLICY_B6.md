# Exec/Path/Prompt Hardening (B6 scaffold)

**Status:** Partial implementation + design.  
**Date:** 2026-11-07

## Implemented
- **B6.1:** Core `repo::safe_join`/`read_file` reject absolute/`..`/symlink escapes (tests pass: `repo_paths_reject_traversal`, `repo_paths_reject_symlink_escape` on unix).
- **B5:** Auth layer protects `/api/exec`, `/api/repo/*`, git mutation surfaces when token configured; N10 covered with representative tests.

## Current risk
- `POST /api/exec` (`exec_handler`) executes `sh -lc <command>` in project root with timeout/output cap. Protected by auth/origin when configured, but **no command allowlist, cwd policy beyond project root, audit event, or per-scope token**. Local-trusted default; unsafe if exposed beyond trusted local boundary.

## Required hardening (incremental, compat-aware)
1. **Policy model:** `ExecPolicy = { enabled, scope, cwd: project_root|run_worktree, allowed_prefixes? | deny_patterns, max_timeout, max_output, audit: always }`. Default local: preserve behavior only for trusted local config; remote/non-loopback default deny or require explicit admin scope.
2. **Scope gate:** require `exec` scope/token (B5.5) before handler executes.
3. **Cwd confinement:** resolve and verify cwd is within project root or authorized run worktree; reject arbitrary paths.
4. **Command controls:** prefer structured commands (`argv`) for known operations; for shell form, apply deny-by-default in strict mode or explicit allowlist/prefix checks; never interpolate untrusted values into shell strings in new code.
5. **Audit:** append redacted exec request/result metadata to local audit/event log (no secrets in args/env by default).
6. **Prompt/output redaction:** sanitize agent/provider output before display/export where it may contain secrets/tokens/paths; add redaction tests/fixtures (coordinate with F3).
7. **HTTP repo negative tests:** add tests against real `repo_file_handler`/router with temp project roots to prove traversal/symlink rejection over HTTP (N12 end-to-end).

## Blockers
- Enforcing strict exec policy may break existing local workflows; needs config flag/ADR and migration notice.
- Full redaction requires catalog of secret patterns and careful false-positive handling.
