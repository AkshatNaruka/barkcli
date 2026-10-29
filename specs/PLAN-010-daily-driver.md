# PLAN-010 — Daily-driver Mac harness

## Phase 1 — Real local-agent chat

- [x] `runtime/chat.rs`: read-only prompt, `@file` mentions, bounded history,
      provider-session store.
- [x] Provider normalization: OpenCode `text` / `tool_use` / `step_finish`,
      nested provider errors, session ids.
- [x] OpenCode plan agent, Claude plan permission, Codex read-only sandbox.
- [x] `POST /api/threads/:id/chat` and `/chat/stop`; one active turn per thread.
- [x] Streaming deltas, final persistence, `chat_done`, stop/error states.
- [x] Ask/Build composer toggle; New Chat flow; model choice remembered.

## Phase 2 — Quick open and command runner

- [x] `⌘P` fuzzy file search over the real repo tree.
- [x] File preview with line numbers, copy path, external editor, Ask Bark.
- [x] `⌘⇧R` command runner with real command discovery and captured output.
- [x] Open system terminal; open server log.
- [x] File mentions from Quick Open are attached to the chat prompt.

## Phase 3 — Mac-native shell

- [x] Overlay titlebar and traffic-light inset.
- [x] Native File / Edit / View / Window / Help menus and `bark-menu` bridge.
- [x] Native notifications on hidden completion.
- [x] Settings shortcut routes to Operations → Settings.
- [ ] Manually verify every menu item in the final bundle.

## Phase 4 — Review and trust

- [x] Auto-open the Diff workbench tab when a run reaches a terminal state.
- [x] Merge-approval buttons in the thread.
- [x] Review action on the run summary.
- [ ] Hunk-level accept/reject (deferred).

## Phase 5 — Design and layout

- [x] Type scale and SF Pro-first stack.
- [x] Agent chips instead of human avatars on board cards.
- [x] Board columns flex to fit at 1440.
- [x] Quick open / command runner loading and empty states.
- [ ] Full light-mode visual pass.
- [ ] Manual 1040×680 pass on every surface.

## Phase 6 — Verification

- [x] Rust chat/session/command tests.
- [x] Web tests for Ask/Build, delta coalescing, quick open, command runner.
- [ ] Full workspace test on final tree.
- [ ] Rebuild `Bark.app`, verify bundle, smoke test.
- [ ] Commit with `project_context.md` / `dev.board.lock` excluded.

## Verification commands

```bash
cargo test --workspace
cargo check --manifest-path desktop/Cargo.toml
npm --prefix web test -- --run
npm --prefix web run build
bash desktop/scripts/build-macos-app.sh
bash desktop/scripts/smoke-app.sh
```
