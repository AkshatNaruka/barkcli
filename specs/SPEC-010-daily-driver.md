# SPEC-010 — Daily-driver Mac harness

> Status: implementing · Branch: `master` · Scope: macOS app, shared web UI, local server

## Thesis

Bark is the management layer for AI agents, not a Kanban clone. To replace a
terminal harness for daily work, it must do three things well in one window:

1. **Talk to the local agent** — a real read-only conversation with the same
   `opencode` / `claude` / `codex` CLIs that install the user's models.
2. **Move quickly through the repo** — quick open, file preview, command
   runner, external editor, and a native terminal handoff.
3. **Stay trustworthy** — plan mode, worktree isolation, streaming tool calls,
   visible gates, reviewable diffs, merge approvals, native notifications.

## Non-goals

- A full IDE editor or embedded PTY in this pass.
- Cloud sync, mobile clients, multi-window projects.
- Replacing the existing board/brain/receipt system.
- Demo data inside `Bark.app`.

## Architecture

```
Tauri shell
  ├─ native menu / titlebar / notifications / terminal / logs
  └─ WKWebView (same React UI as browser)
        ├─ Chat: Ask (read-only) | Build (worktree)
        ├─ Workbench: Plan / Diff / Gate / Receipt / Eval / Context
        ├─ Quick Open sheet + Command Runner sheet
        └─ existing Board / Agents / Brain / Operations
Rust server
  ├─ /api/threads/:id/chat   → local provider in plan/read-only mode
  ├─ /api/chat/stop          → SIGINT the active turn
  ├─ /api/exec               → bounded project command runner
  ├─ /api/project            → setup + discovered commands
  └─ existing runtime / board / memory / receipts
```

### Chat turn

- Runs in the project root, never a worktree.
- Provider mapping:
  - OpenCode: `run --format json --agent plan`
  - Claude Code: `--print --output-format stream-json --permission-mode plan`
  - Codex: `exec --json --sandbox read-only`
- The prompt contains a read-only contract, recent user/assistant history, and
  bounded excerpts of `@file` attachments.
- Partial assistant text is broadcast as ephemeral deltas and coalesced into a
  single UI bubble; the final assistant message is persisted.
- The provider session id is stored in `.board/chat_sessions.json` and resumed
  on the next turn.
- A turn ends with a persisted `chat_done` event; the UI uses it to clear the
  waiting state. Failures are persisted as `run_failed`.
- The server enforces one active chat per thread.

### Command runner

- Discovers real commands from `Cargo.toml`, `package.json`, `Makefile`,
  `go.mod`, and `pyproject.toml`; adds `git status` only when `.git` exists.
- Runs `sh -lc` in the project root with a 120s default timeout and 200k output
  cap. The endpoint is behind the same local token as every other write route.

### Native shell

- Overlay titlebar with traffic-light inset; content is padded so it never
  collides.
- Native menu: Open Project, New Chat, New Intent, Quick Open, Run Command,
  Command Palette, Settings, Open Terminal, Reveal Project, toggle workbench,
  Help.
- Native notifications when a chat or run completes while the app is hidden.
- Server log and project terminal are one click from Settings.
- Native menu commands are emitted as `bark-menu` and handled by the web app.

### Design

- Keep warm charcoal + copper; no gradients, no new accent families.
- Raise the micro type scale: 9–10.5px → 11–12px, body 14px, SF Pro-first,
  SF Mono/JetBrains Mono for code and IDs.
- Keep controls at 6px, cards at 10px, dialogs at 14px; stop adding new radii.
- Board columns flex between 250–340px so four columns fit at 1440 with the
  inspector open; narrow windows scroll.
- Agent providers are shown as an icon+label chip, not a human avatar.
- Full loading / empty / error states for quick open, command runner, and chat.

## Acceptance criteria

- `Bark.app` can ask a question with the local agent and stream text/tool calls.
- The next turn resumes the same provider session.
- `@file` from Quick Open attaches the file to the chat prompt.
- Build mode still creates a worktree, runs the gate, and only merges after
  approval.
- `⌘P` opens a file preview; `⌘⇧R` runs a discovered project command.
- Menu commands and native notifications work in the built app.
- No demo provider or synthetic assistant reply is reachable in the app.
- `cargo test --workspace`, web tests, the packaged smoke test, and the bundle
  verifier pass.
