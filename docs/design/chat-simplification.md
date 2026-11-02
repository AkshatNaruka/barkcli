# Conversation-first chat

2026-11-02. Refine the existing shared Mac/web chat. The user wants the simplicity of the T3 conversation: relevant messages and an easy prompt, with implementation first and testing at the end.

## Scope

Keep the existing palette, Inter typography, provider/runtime contracts, and project navigation. Center the conversation and composer on the same readable measure. Use plain message text, a quiet user bubble, and properly formatted assistant Markdown. No new branding, dependencies, or backend behavior.

The default thread shows its title, messages, and composer. A single contextual status row shows current work or check outcome and a Changes action when files exist. Stop lives only in the composer. Failed starts, failed checks, unanswered questions, and explicit approvals remain visible and actionable.

Technical data belongs in a collapsed Details section after the conversation: attempt, provider/model, branch/worktree, logs, usage, tool operations, historical lifecycle events, and advanced run actions. The right panel opens only by request or an explicit panel URL; prior automatic-open preferences do not reopen it. Thread management stays in its existing menu.

The composer uses a single current-mode selector, one agent/model selector, and a send/stop button. It keeps Enter to send, Shift+Enter newline, IME handling, draft recovery, provider readiness, and the actual Ask/Plan/Build semantics. Routine help text is available to assistive technology without occupying space beneath every prompt.

## Implementation sequence

1. Simplify thread chrome, message rendering, status and details placement.
2. Compact the shared composer/new-thread state and make auxiliary panels opt-in.
3. Add focused regressions, then run the web suite and production/Mac build in final validation. Inspect the installed native UI once, fix concrete failures together, and record the result.

## Acceptance

- A normal conversation has no branch/path/token/operation-count block above its messages.
- User and assistant content is readable; code fences, inline code, and lists render correctly.
- Exactly one Stop control exists during work; a pending draft remains editable.
- Failed checks and errors stay visible; technical evidence and advanced actions remain reachable in Details or Review.
- Mode/provider selection, prompt submission, plan approval, follow-up continuity, and draft storage retain their contracts.
- Panels are closed on a fresh/default chat, including large windows; explicit detail routes still work.
- Tests, builds, and UI checks run after implementation.

## Delivered

The normal thread now contains conversation, a compact composer, and one contextual outcome row. Technical activity and run information moved below the conversation into Details. Duplicate completion messages, the board breadcrumb/status, provider/avatar/date decorations, and the persistent keyboard/worktree hint were removed from the visible chat. The agent/model selector displays only the selected model or provider; its full identity remains accessible in the selector.

Ask / Plan / Build now share one mode menu. The send/stop action is one accessible icon button. Replies use Markdown with code, lists, links, and tables; raw HTML and remote Markdown images do not execute/load. Errors, check failures, pending questions, plan approval, and merge approvals remain contextual. The old worker-session transcript/steer/fork/race controls were removed from the chat; they no longer compete with the prompt workflow. This change does not alter provider dispatch, worktree isolation, or review gates.

## Final validation — 2026-11-02

Implementation and regression edits were completed before running checks. The first final test pass found three outdated mode-menu selectors in tests; those selectors were corrected and the complete web suite rerun.

- `npm --prefix web test`: **170 passed across 33 files**. Log: `/tmp/bark-simple-chat-tests.log`. Regressions include hidden details with working disclosure, contextual Changes, visible failed checks/errors, one Stop even with Details expanded, draft editing during work, Markdown safety/formatting, Enter/newline/IME handling, and existing Ask/Plan/Build contracts.
- `bash desktop/scripts/build-macos-app.sh`: passed TypeScript, Vite, Mac packaging, bundled-UI freshness, and signature verification. Log: `/tmp/bark-simple-chat-mac-build.log`.
- `bash desktop/scripts/smoke-app.sh`: passed packaged API/assets checks and sidecar shutdown. Log: `/tmp/bark-simple-chat-smoke.log`.
- `bash desktop/scripts/verify-app.sh /Applications/Bark.app`: passed after installation. Log: `/tmp/bark-simple-chat-installed.log`.
- `git diff --check`: passed. Existing/concurrent `dev.board` edits were preserved. No repository commit was made by this task.

Native inspection of the installed app covered the new-thread composer and an existing real thread in the dark theme. The thread showed a user bubble, formatted assistant reply, a closed Details section, a visible failed-build outcome/error, and the compact composer. Details disclosed attempt/model/worktree/activity when opened; the mode menu exposed all three choices; the optional thread panel opened and closed. Both were closed afterward. No provider prompt was sent by the QA automation, and the user's existing drafts were retained. The app was being used concurrently during the check; user-originated thread submissions were not counted as QA proof.

Installed artifact: `/Applications/Bark.app` 0.4.0, ad-hoc signed. UI SHA-256: `05719b978901e732667f61e1f85d5c704cb1a9d0cebd900adf90421c5d4039ba`. Previous app: `/tmp/Bark-before-chat-simplification-20261102.app`. Source baseline: `de1feb3` plus this uncommitted UI change.

The earlier live provider acceptance remains recorded separately in `docs/qa/2026-11-02-thread-workflow.md`; it was not repeated for this frontend-only change. Browser/mobile and light-theme visual checks were not repeated in this pass. Existing compiler and bundle-size warnings remain; the UI build and tests passed.
