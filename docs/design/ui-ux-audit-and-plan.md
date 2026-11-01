# Bark UI/UX audit and improvement plan

Date: 2026-10-31  
Status: working audit and prioritized roadmap  
Scope: shared `web/` UI, `desktop/` Tauri shell, and the runtime surfaces the UI exposes  
Evidence: source read of the shell, composer, review, board, project tools, settings, and native shell; screenshots at 1440×900, 1040×680, light/dark; no moderated usability study or timed benchmark was run.

## 1. Product frame

Bark is the management layer for AI agents: **intent → plan → isolated build → evidence → merge**. The UI should make that loop obvious and stay out of the way the rest of the time.

The design test for every screen:

1. What is happening?
2. What needs me now?
3. What is the next safe action?
4. What is optional detail?

If a control does not answer one of those, it belongs behind progressive disclosure, in the Project hub, or in Settings.

## 2. Current structure

```
Left                         Center                         Right
────────────────────────     ─────────────────────────      ─────────────────────
Project folder card          Build / thread conversation    Thread Surfaces rail
New thread                   Review surface                 (Plan, Changes, Checks,
Build / Review               Project hub / tool pages       Evidence, Diagnostics, Context)
Threads                                                     + Board, Agents, Project tools
Settings / Help
```

The Project hub at `#/hub` owns the full project directory. The rail is intentionally limited to thread surfaces plus three project shortcuts. Settings and Help are global utility entries.

## 3. What is working

- The left sidebar now begins with the project folder and gates thread creation until a project is resolved.
- The right rail is short (six thread surfaces + three project shortcuts) instead of a 20-tool directory.
- The Project hub gives every project tool a searchable, described home.
- The composer has a controlled model popover: one click toggles, outside click/Escape closes, provider rail, search, favorites, scoped `⌘1–5`.
- Provider marks are real brand SVGs for OpenCode, Claude, OpenAI/Codex, Cursor, xAI/Grok, Antigravity, and Kimi; Muse Code uses an honest monogram fallback.
- Review rows are honest about plan-only threads; board filters are one popover instead of four permanent chips.
- Thread actions (pin, rename, fork, settle/reopen, delete) are real and persisted.
- Verification outcomes and merge eligibility are server-authoritative.

## 4. Feature-by-feature audit

Priorities: **P0** blocks the daily loop or truthfulness, **P1** removes daily friction, **P2** improves specialist tools, **P3** polish.

### 4.1 Build, new thread, conversation

| Area | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Project start | Folder card first; New thread disabled without a project | The app usually restores a folder, so the "selection" is implicit | Keep restore, but show a small "Using <folder>" state and a clear Change action; first run shows the chooser | P1 |
| New thread | Clean H1 + composer + agent picker | A lot of empty vertical space; the right rail repeats project shortcuts | Keep the composer as the only focus; hide the rail's project note when a folder is ready; consider a compact project readiness line | P2 |
| Thread header | Title, status, actions | Status uses a dot plus "needs you" and can read as decorative | One status chip pattern across thread/run; include the card column only when meaningful | P1 |
| Composer | Auto-growing textarea, Ask/Build, model popover, submit | Build options and readiness are split between the popover and a hint below | Keep readiness next to the trigger; show one line "Ready · OpenCode · CLI default" rather than repeating it | P2 |
| Activity | Collapsible operation list | Raw tool/log events can dominate long turns | Show a one-line summary and expand on demand; group by run/turn; virtualize very long lists | P1 |
| Empty thread | "No messages" line | Does not teach the next step | One sentence plus a single "Describe a change" action, no sample prompts | P2 |
| Draft recovery | Drafts persist | Recovery is not visible after a reload | Show "Draft restored" only when a restored draft exists; keep the clear action | P3 |

### 4.2 Review

| Area | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Queue rows | Title, file totals, reason, action | Rows do not show check outcome or merge eligibility | Add latest check state and "Ready to merge / Not verified" to each row; keep the reason | P0 |
| Plan-only rows | "No build yet · plan only" | Correct, but the queue still lists them alongside finished work | Group "Ready to review" above "Plan only"; count only actionable work in the badge | P1 |
| Merge | Workbench shows checks and eligibility | Eligibility and evidence are only in the panel | Put the check command/exit/head summary beside the primary merge action | P1 |
| Request changes | In the workbench | Hard to find from the queue | Add a secondary "Request changes" action to eligible rows | P2 |
| Filtering | None | A long queue cannot be narrowed | Search + "Ready / Failing / Plan only" filter | P2 |

### 4.3 Board

| Area | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Toolbar | View modes, Review queue, search, Filters popover | Now compact; still two review entry points (topbar and Board) | Keep the Board-level Review queue; remove duplicate topbar review count on tool pages | P2 |
| Cards | Title, priority, labels, countdown, spec | Metadata can be noisy on dense boards | Show title + one status signal + one count; move labels/spec into details | P1 |
| Columns | Four fixed-width columns | Horizontal scroll is inevitable at 1040 with the rail | Keep horizontal scroll; add a column jump/overview; never shrink text | P2 |
| Filters | One popover with four checks | No saved filters | Add a "Clear" and remember the last filter per project | P3 |
| Empty columns | "No cards / Add card" | Fine | Keep | — |

### 4.4 Agents and orchestration

| Area | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Team cards | Name, role, provider, status, load, tasks, skills, pause/retire | Too much per card; "Load 0/1" and skills compete with status | Card shows name/role/status/provider; load and skills move into a disclosure; one primary action | P1 |
| Hiring | "Hire agent" in the header | Good | Keep; add an empty-team explanation and a single recommended default | P1 |
| Orchestra | Queue and run detail | Specialist vocabulary ("orchestra", "race", "fork") is exposed | Rename the visible surface "Running agents"; keep technical actions in a details menu | P2 |
| Active runs | Inline in threads | Board/Agents duplicate status | Use one status vocabulary and one source of truth | P1 |

### 4.5 Planning tools

| Tool | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Specs | Full list/detail in Operations | Separate tab strip competes with hub | Keep inside Project hub; deep-link from cards | P2 |
| Sprints | Agents/Sprints tab | Lives under Agents, which is surprising | Move to Planning group only; remove duplicate internal tab | P1 |
| Calendar | Operations tab | Fine for occasional use | Keep; make due-date creation the primary action | P2 |
| Reports | Dense metrics | Dashboard-like density conflicts with the calm shell | Show three key numbers first; move the rest into a report detail | P2 |

### 4.6 Context, memory, and knowledge

| Tool | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Context & memory | Brain surface | Three hub entries (Memory, Graph, Project context) open the same surface | Make one "Context" tool with Memory/Graph/Project context tabs; keep the three hub rows as shortcuts if needed | P1 |
| Contribution graph | Brain graph | Specialist visualization | Keep as a secondary view; explain what an edge means in one line | P2 |
| Project context | Living file | Useful but buried | Surface a "Context is stale" badge on the project card when relevant | P1 |
| Skills | Long lists | Installed vs available blur | Group installed first, add search, show enabled state | P1 |
| Rules | Simple form/list | Good | Keep; add a short "what this injects" preview | P2 |

### 4.7 History, checkpoints, code, ship

| Tool | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| History | Dense runs/diffs/sessions | Many filters and rows; no clear default | Default to recent runs; split Runs / Events; add search and pagination | P1 |
| Checkpoints | Timeline/restore | Destructive actions sit beside browsing | Separate browse and restore; confirm restore with a diff preview | P1 |
| Code search | Symbols/files | Fine; no recents | Add recent files and a "copy path" affordance | P2 |
| Ship | Commit/push/merge/PR in one dense page | Too many primaries; auth/error states vary | State-driven primary action (Commit → Push → Merge → PR); move the rest under "More" | P1 |
| Automations | Schedule form/list | Jargon and power-user only | Keep in History & maintenance; explain "runs a thread on a schedule" | P2 |

### 4.8 Settings, help, global

| Area | Current | Issue | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Settings | Board, columns, appearance, local agents on one page | Project and global settings are mixed | Split into Project / Appearance / Agents / Diagnostics with a section nav | P1 |
| Appearance | Themes + accents | Fine | Keep; preview at real surfaces | P2 |
| Help | Keyboard shortcuts | Does not explain the product loop | Add a short "How Bark works" section above shortcuts | P2 |
| Command palette | Search tools/threads/actions | Good | Add "Project tools" hub and "Open folder" commands | P1 |
| Toasts/errors | Inline statuses and toasts | Inconsistent recovery copy | One error component with a title, cause, and action | P1 |

## 5. Global design system

### Typography

- Keep the system sans; mono only for ids, commands, paths, and numbers.
- Raise the smallest secondary text from 9–10px to **11px** where it is content; 9–10px only for non-essential metadata.
- Body 13–14px; controls 12–13px; page title 20px; section label 11–12px.
- Avoid all-caps labels; use sentence case with a weight/color step.

### Color and surfaces

- Copper remains the single accent for primary action and selection.
- State colors are always paired with text; never a colored dot alone.
- Sidebars use the neutral surface; content uses the canvas; cards are raised only when interactive.
- Borders, not shadows, define structure; shadows belong to overlays.

### Controls

- One button vocabulary: primary, secondary, quiet, danger; heights 30/32px desktop, 44px touch.
- One field vocabulary; consistent focus ring; visible disabled state.
- Popovers: portal, fixed, outside-click close, Escape, focus return, viewport clamp.
- Empty, loading, error, and disabled states are specified per component.

### Motion

- 150–200ms for state changes; no page-load choreography.
- Reduced motion respected.

## 6. Navigation and placement rules

- **Global**: project selection, Settings, Appearance, Help, provider auth, logs. Left project card/footer or Settings only.
- **Project**: all 19 tools in `#/hub` with search and descriptions. The rail only shortcuts Board, Agents, and the hub.
- **Thread**: Plan, Changes, Checks, Evidence, Diagnostics, Context. Right rail only.
- **No duplicate primary action** between a page header, rail, and composer.
- Hidden navigation must not disable deep links; the command palette indexes everything.

## 7. Prioritized roadmap

### P0 — truth and daily loop

1. Review queue check outcome + merge eligibility on rows.
2. One run/thread status vocabulary across Build, Review, Board, Agents.
3. Provider icons and controlled model picker (done).
4. Board toolbar declutter with one Filters popover (done).
5. Project-first sidebar and gated New thread (done).

### P1 — remove daily friction

1. Thread header status chip and activity summary.
2. Review grouping and row actions.
3. Agents card simplification.
4. Settings split: Project / Appearance / Agents / Diagnostics.
5. Context consolidation (Memory/Graph/Project context).
6. History default view and pagination.
7. Ship state-driven primary action.
8. Shared error/empty/loading components.

### P2 — specialist polish

1. Board card metadata and column navigation.
2. Sprints placement cleanup.
3. Reports summary-first.
4. Skills grouping/search.
5. Checkpoints restore confirmation.
6. Help product overview.
7. Code search recents.

### P3 — finish

1. Accessibility audit with VoiceOver and keyboard-only passes.
2. 1040×680 / 1440×900 / 390px browser verification.
3. Long-transcript and large-repo performance.
4. Packaged app/TCC/native menu proof.
5. Pilot with five builders.

## 8. Acceptance for the next slice

- A reviewer can see check evidence and merge eligibility from the Review queue without opening a specialist panel.
- The Board toolbar has one view switch, one search, one Filters control, and one Review entry.
- Settings has a clear Project/Global split.
- Agents show one primary action and one status per card; capacity/skills are one disclosure away.
- Every popover closes on outside click and Escape and returns focus.
- No new hardcoded data enters the UI.
- 77+ web tests, `tsc --noEmit`, `npm run build`, Rust tests, and the packaged app pass.

## 9. Non-goals

- A second frontend or a fork of the native shell.
- New cloud services, accounts, or remote execution.
- Replacing board/task storage or weakening merge checks.
- Hunk-level accept/reject, embedded editor, or PTY in this pass.
- Snooze/unread state, provider marketplace, or GitHub OAuth.
- Replacing the product's existing warm charcoal/copper identity.

## 9.5 Multi-project workspace

Bark's first screen is now the workspace overview at `#/projects`. It answers
three questions before a thread starts: which projects exist, which one needs
attention, and what is safe to open.

- **Project cards** show the real repository name, path, active board, branch,
  dirty state, latest commit, open cards, review count, agent count, and last
  activity.
- **Workspace pulse** totals projects, open cards, reviews, and hired agents,
  then lists attention items (reviews, uncommitted work, missing agents or
  folders). Each item opens the project; review items ask the new project to
  land on Review.
- **Grid and list views** cover scanning and large workspaces. Search matches
  names, paths, branches, and commit subjects; filters cover review,
  uncommitted, and setup.
- **Sidebar global mode** replaces the project-scoped thread list while on
  Projects, with recent projects, Open folder, Settings, and Help. Project
  routes keep the existing Build/Review/threads sidebar plus an All projects
  link.
- **Switching** uses a focused dialog instead of `window.confirm`. The active
  project remains on disk; active agents keep their worktrees.

Data comes from `project_summaries`, a read-only desktop command. It scans the
current project plus `app.json` recents (up to 12), reading board YAML, agent and
thread files, file mtimes, and git status. It never starts another server and
never invents a project that Bark has not opened. On first access macOS may ask
for folder permission; `desktop/Info.plist` explains why.

## 9.6 Tool-first shell

The app shell now follows the tool model instead of a project sidebar plus a
global right rail.

- **Left rail:** the current project and New thread stay fixed, then the full
  tool set is unfolded into workflow groups:
  - Build: Build, Review (with queue count)
  - Plan: Board, Specs, Sprints, Calendar, Reports
  - Agents: Agents, Orchestration, Skills, Rules, Automations, Agent API
  - Knowledge: Context & memory, Contribution graph, Project context
  - Code & delivery: Project setup, Checkpoints, Code search, History, Ship

  There is no aggregate “Project tools” tab. The Project hub route remains
  deep-linkable for old bookmarks, but the left rail is the source of truth.
  Settings and Help stay in the footer.
- **Center:** the selected tool owns the content area, from Board and Review to
  Ship, Checkpoints, and Agent API.
- **Build:** the docked thread list occupies the center-left column. The
  conversation sits beside it, and thread surfaces (Plan, Changes, Checks,
  Evidence, Diagnostics, Context) sit on the right and can be closed. A new
  thread uses the remaining center width; the thread list stays visible.
  Project shortcuts no longer appear in that panel.
- **Threads are part of Build:** there is no separate Threads tab or floating
  switcher. The docked list is grouped by state and searchable; the project-level
  New thread action is the single creation entry point.
- **Projects:** the workspace overview remains the landing screen; selecting a
  project opens its Build surface.

This keeps one navigation model at every width: tools stay left, the active
tool owns the center, and the conversation is a center-left workspace rather
than a competing sidebar.

### 9.7 One navigation model, one control system

- **Build and Threads are one surface.** There is no Threads tab and no
  floating switcher. The thread list is docked at center-left inside Build.
- **No duplicate tab strips.** Team, Orchestra, and Sprints no longer repeat as
  top tabs; the left rail selects them. The same applies to graph, memory, and
  project context.
- **One icon system.** The hand-drawn icon set was replaced with Lucide through
  the shared `Icon` component. Provider marks remain real brand SVGs because
  they are identities, not UI icons.
- **One dropdown.** `SelectMenu` replaces native selects and the old
  `QuietSelect` implementation: keyboard navigation, type-safe options,
  outside-click/Escape close, focus return, viewport clamping, and a selected
  checkmark. All project selects now use it.
- **No decorative Unicode.** Close, pin, warning, check, and polish affordances
  use icons or plain labels instead of emoji.

## 10. Implemented in this pass

- Real provider marks and provider-aware model rows/trigger.
- Controlled agent/model popover with outside-click/Escape, provider rail, search, favorites, scoped `⌘1–5`, and custom ids.
- Board filters moved into one popover; toolbar reduced to view switch, review queue, search, and Filters.
- Compact right rail and Project hub taxonomy.
- Project-first left sidebar and explicit no-project state.
- Thread actions and the empty-board save guard.

### 10.1 Native menu and desktop bridge

The webview is served by the local sidecar, which Tauri treats as a remote
origin. Custom commands were reachable from the native menu's event channel but
not from `invoke`, so Open Project, Open Terminal, and Reveal in Finder silently
did nothing. `desktop/build.rs` now declares the app commands and
`desktop/capabilities/main.json` grants them to the local remote origin.

Verified from the packaged app:

- Open Project… (`⌘O`) opens the native folder picker.
- New Read-Only Question (`⇧⌘N`) opens the composer in Ask mode and labels the
  header “New question”.
- New Thread (`⌘N`) opens the composer in Build mode.
- Quick Open…, Run Command…, Command Palette…, and Settings… (`⌘,`) open.
- Open Terminal (`⇧⌘T`) and Reveal Project in Finder reach the OS.
- Toggle Sidebar (`⇧⌘B`) and Toggle Workbench (`⌘J`) change the shell.
- Bark Help opens the product loop plus shortcuts.

Settings moved to the Bark app menu (macOS convention), and the duplicate
Close Window item was removed from the Window menu.

### 10.2 Settings and review

- Settings is split into Project, Appearance, Agents, and Diagnostics with a
  stable section nav. Duplicate Diagnostics/Remote access sections are gone.
- The board editor no longer remounts its fields on each keystroke; focus and
  typed text stay intact. Changes save explicitly, and removed columns move
  their cards to the first column.
- Provider sign-in is offered whenever a local CLI is installed but not known
  to be signed in; availability and auth are never invented.
- Review rows show the last recorded gate outcome, guard errors, and receipt
  verification. Missing receipts read “No checks yet”, skipped gates read
  “Checks skipped”, and plan-only threads are grouped below built work.
- Agent cards hide the load bar when idle, show capacity in text, and use the
  real provider mark. The agent editor is now a focus-trapped dialog that
  closes on Escape and outside click.
