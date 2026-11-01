# Complete the daily thread workflow

Date: 2026-11-01. Scope: shared Bark web/Mac UI and the existing local agent runtime.

## Reference and intent

Inspected the running T3 Code (Beta) app and its official [thread guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md) and [composer guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/composer.md). Relevant patterns: a task stays in one thread, explicit provider/model selection, direct prompt submission, streamed activity and replies, follow-up continuity, Stop, preserved drafts, searchable threads, and contextual changes. This is behavioral guidance; Bark retains its own UI and its management-layer contract.

The requested daily flow is: open project → New thread → prompt → agent works → see result → follow up in the same task → inspect changes/checks → explicitly merge. Plan is an optional deliberate action. Ask stays read-only. Build is an explicit execution action; ordinary prose never silently approves a saved plan or merges anything.

## Findings to repair

- New-thread Build currently requests `plan_first`; it does not run an agent. Existing threads default to Ask, so a coding follow-up can unexpectedly become read-only.
- The run API helper omits the board query and drops detailed errors. A failed initial start can leave a saved thread that a retry duplicates.
- `parent_run_id` records ancestry but worktree acquisition starts at main HEAD, so a follow-up may lose the previous attempt's unmerged code.
- Thread streaming subscribes after reading the snapshot, leaving an event gap. Old `chat_done` replay can also clear a newer chat's busy indicator.
- Sidebar routes have been reorganized repeatedly. Every registered tool needs an explicit route/render contract and fixture-backed API coverage, including Rules, Orchestration, and all Brain destinations.

## Delivery sequence

1. Lock down the failures with focused component and runtime regressions.
2. Make Ask / Plan / Build explicit in one composer. Default to direct Build, preserve explicit Plan entry points, retain the provider/model/test command, show actionable failures, and keep one saved thread when retrying an initial start. Enter sends, Shift+Enter adds a line, and Cmd/Ctrl+Enter remains available; IME composition never submits.
3. Continue builds from the previous task's work, while retaining a fresh run record, isolated branch, cumulative diff, and fresh test evidence. Refuse cross-thread parents and active attempts. Checkpoint partial edits in the task's managed worktree before branching a continuation; this invalidates old checks and never changes the main checkout.
4. Repair stream recovery/busy-state handling and cover draft and choice restoration. Show actual failed starts rather than a success message or empty page.
5. Audit every sidebar entry against its renderer and backend. Add route contract tests, exercise local CRUD in an isolated fixture, and fix concrete failures.
6. Run web and Rust checks, real fixture thread lifecycle (prompt, reply, follow-up, stop/retry, diff/checks), browser/native inspection, packaged build/verify/smoke, then install the verified app. Record unavailable provider and platform proof separately.

## Sidebar acceptance matrix

| Tools | Destination | Required behavior |
| --- | --- | --- |
| Build, Review | chat, review | Create/open/search a thread; inspect queue and current run evidence |
| Board | board | Load cards; create/edit/move in a fixture |
| Specs, Calendar, Reports | operations with tool id | Correct tool opens and uses the selected board |
| Sprints | agents?sprints | Sprint view, never Team fallback |
| Agents, Orchestration | agents?team / orchestra | Provider/team data and orchestration queue load; errors are visible |
| Rules, Automations | operations?rules / automations | Rules persist in fixture AGENTS.md; schedules load without starting paid work |
| Skills, Agent API | skills / operations?agent | Installed capabilities and local integration instructions load |
| Context & memory, Contribution graph, Project context | brain?memory / graph / context | Distinct renderers; memory/facts and context data load |
| Project setup, History, Checkpoints, Code search, Ship | matching operations tool or history | Correct tool loads; no commit/push/restore/merge is triggered by navigation |

## Proof boundaries

Passing a mock-provider lifecycle proves Bark's runtime and UI wiring, not an authenticated external model. Live provider smoke is a separate result. Remote machines, voice input, multi-model fan-out, provider rewind, and T3's full attachment/queue feature set are separate capabilities; this work must not describe them as implemented unless their actual paths are built and checked.

## Delivered and checked — 2026-11-02

The daily Build path now dispatches the selected agent directly. Ask / Plan / Build are explicit, and mode, provider choices, and unsent drafts persist by project/board. Follow-ups preserve prior work and bounded conversation context in a new isolated attempt. Build API errors remain visible; retrying a failed initial start within the mounted composer reuses its saved thread. Stream recovery serializes snapshot refreshes and polls only during active work.

Live Codex testing exposed three additional faults, all repaired: the JSON adapter did not recognize Codex replies, real CLI processes did not emit the Running transition, and long thread titles could truncate the unique worktree suffix. Provider output now drains before completion. Codex models come from its installed model cache; providers without a catalog retain a selectable CLI default and custom model entry.

Rules errors no longer appear as an empty list, Orchestration load failures are visible, and Contribution graph opens its own graph rather than the memory view. All 21 registered sidebar destinations were opened in a fixture. Route contracts and 40 fixture API checks cover the destination wiring and selected CRUD, not every operation inside every tool.

The verified Mac app was installed at `/Applications/Bark.app`. Native quit/reopen restored an unsent draft and Ask mode on a different sidecar port. The test draft was then cleared and Build restored. Detailed results, commands, logs, rollback path, and remaining limits are in [the QA record](../qa/2026-11-02-thread-workflow.md).
