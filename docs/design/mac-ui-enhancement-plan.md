# Bark Mac UI enhancement plan

Date: 2026-10-29  
Status: proposed implementation roadmap; source audit and design concept complete  
Source baseline: `f97649a`  
Scope: `desktop/` Tauri shell, shared `web/` React UI, and the runtime contracts needed for truthful UI states

> **Working-tree snapshot (2026-10-29):** phases 1–4 are implemented and phase 5 is in progress. The left sidebar now leads with the project folder card and gates New thread until a folder is selected. The right-side Surfaces rail hosts only thread artifacts plus Board, Agents, and the Project hub; all project tools live in the searchable `#/hub` page. Thread actions (pin, rename, fork, settle/reopen, delete) and a server-side guard against empty-board overwrites are in the working tree. Latest local checks: 70 web tests, `tsc --noEmit`, `npm run build`, `cargo test -p barkcli-core -p barkcli-server`, and `cargo check --manifest-path desktop/Cargo.toml` (with the sidecar staged). Packaged Mac proof, live-provider proof, VoiceOver, and the pilot are still outstanding, so this is not a release claim.

## 1. Product decision

Make Bark the easiest place to **describe a change, let an agent build it, inspect the result, and merge verified work**.

Bark remains **the management layer for AI agents — intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes.** Its visible experience should follow that sequence. A person should understand the project, what is happening, and the next action without learning the internal board, agent, memory, or orchestration vocabulary.

The proposed default is **one sidebar, one conversation, and an optional right-side Surfaces panel**. Two persistent destinations, **Build** and **Review**, replace the seven equally prominent surface buttons. Project tools live in the Surfaces panel, grouped and searchable, instead of a left-side disclosure. This is a change to default presentation, not deletion of the existing capabilities.

Keep Tauri v2 and the shared React/Vite frontend. Preserve the warm charcoal/copper identity, native menus, local data, provider integrations, and external editor/terminal handoffs. Improve the building loop before adding more destinations.

Assumed primary audience: solo builders and small teams using installed coding agents on an existing repository. The secondary audience manages several agents or needs detailed specifications, memory, and reports. These are planning assumptions, not findings from user interviews.

## 2. Evidence and limits

Inspected the manifests, desktop source, main shell, composer and thread handlers, workbench, review queue, routing, appearance storage, runtime gate/merge logic, and existing specs 008–011. Read `AGENTS.md` first. Its referenced `project_context.md` is absent in this checkout; no context regeneration or project onboarding was run.

The Mac app is a thin Tauri shell around the shared browser UI, as documented in [desktop/README.md](../../desktop/README.md). This plan extends [native-ux.md](native-ux.md) and [SPEC-010](../../specs/SPEC-010-daily-driver.md). It proposes changing the earlier seven-button navigation while retaining its routes and product contracts.

**Proof boundary:** findings below are source observations. No installed Bark window was available in the app inventory, and no native launch, live provider turn, build, test suite, or usability study was performed for this planning task. Existing spec checkboxes are historical reports, not new verification. The [interactive concept](mac-ui-concept.html) uses labelled illustrative content and has no runtime connection.

Skills applied: Impeccable shape/distill/Operate guidance; Frontend Design; Web Design Guidelines; and Competitor Profiling evidence discipline for the focused UX research. The Impeccable launcher could not execute (`permission denied`); the project docs and source were read directly. Pricing, SEO metrics, paid tools, new dependencies, and unrelated skills are outside this UI study.

## 3. What needs to change first

| Priority | Current source evidence | User consequence | Planned response |
| --- | --- | --- | --- |
| P0 | `web/src/threads/ThreadPane.tsx:632`: Ask calls the chat API; Build calls `postThreadMessage`, which saves a note. `handleStartRun` starts the actual worktree separately. | “Build” does not start building. | Give each action its literal meaning; unify new-thread and follow-up submission behavior. |
| P0 | `barkcli-core/src/runtime/runner.rs:753` and `:890`: answer-only and missing-command gates can have `passed: true` with no command. `merge` checks the boolean. | A success badge can imply tests ran when they did not. | Introduce explicit verification outcomes and server-enforced merge eligibility before shipping the new success UI. |
| P1 | `web/src/shell/UniversalComposer.tsx:105` sends no model to thread creation; the model is sent only for chat. `barkcli-server/src/lib.rs:4796` has no model field on `CreateThreadRequest`. | The always-visible model choice suggests it controls every path. | Define which action consumes the selection; forward it through that path or show “Not used for this action.” Never silently ignore it. |
| P1 | `web/src/lib/surfaces.ts:7` defines seven surfaces; `AppRail.tsx` defaults to icons. `InboxPane.tsx:133` adds a separate 304px navigator. | Navigation consumes space and requires decoding several icons before building. | Combine app navigation and threads into one labelled sidebar. |
| P1 | `web/src/shell/OperationsView.tsx:36` renders twelve tabs in a scrolling row. | Files, maintenance, reports, settings, and docs have equal visual weight. | Give them named homes in Project tools, Settings, and Help. Remove the permanent tab strip from the default workflow. |
| P1 | `web/src/shell/InspectorPane.tsx:56` always declares Plan, Diff, Gate, Receipt, Eval, Context. | Empty or specialist panels compete with relevant work. | Make Plan, Changes, and Checks contextual; reveal provenance and diagnostics on request. |
| P1 | `web/src/components/CommandPalette.tsx:37` excludes hidden surfaces. | Simply hiding navigation would also make features harder to find. | Separate discoverability, route availability, and navigation prominence. Search all supported tools. |
| P1 | `web/src/lib/hashnav.ts:24` canonicalizes to a surface-only hash; thread selection and workbench selection are local component state. | Refresh and Back cannot reliably return to the exact work. | Preserve board, thread, run, panel, and file in validated route state. |
| P2 | `AppRail.tsx:126` and `InboxPane.tsx:298` advertise Appearance as `⌘,`; `App.tsx` and the native menu use that shortcut for Settings. The rail Settings button navigates to Operations without choosing its Settings tab. | Labels and destinations disagree. | One Settings entry, one command registry, Appearance inside Settings. |
| P2 | `web/src/lib/theme.tsx:47` and `web/src/index.css:71` define different light palette values; CSS at `index.css:341` globally remaps literal font-size classes. | The effective design system is harder to reason about and test. | Consolidate tokens and replace size overrides incrementally in touched components. Do not shrink text to make controls fit. |
| P2 | `UniversalComposer.tsx:115` starts the first chat without awaiting its result; its dialog declares modal semantics but implements no focus trap. | A failed first reply can be unclear, and keyboard focus can leave the dialog. | Show durable start/retry errors and use a shared accessible dialog where a dialog is still necessary. |

Do not treat the literal 9–10px classes as computed font-size evidence: the current CSS already increases many of them. Check computed styles during implementation QA.

## 4. Competitor lessons

Research checked on 2026-10-29. These are documented interaction patterns, not a claim that one product is easier or that another lacks a feature. Inferences and Bark decisions are separate from observations. No competitor was run through a timed benchmark.

| Product | Observed in an official source | Design inference | Bark decision |
| --- | --- | --- | --- |
| T3 Code | Its [thread guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md) describes project/model defaults, explicit worktree choice, searchable work, and undoable thread organization. | Continuity and predictable thread management reduce setup repetition. | Remember safe per-project choices; show isolation at the point of execution; retain drafts and provide recoverable organization. |
| Claude Code desktop | Its [desktop docs](https://code.claude.com/docs/en/desktop#arrange-your-workspace) describe resizable panes, a hideable session panel, and some panels appearing only when there is content. | Artifact panels can earn their space instead of occupying it permanently. | Start with the conversation; open the relevant artifact deliberately; preserve the user's layout and reading position. |
| Google Antigravity IDE | Its [product page](https://www.antigravity.google/product/antigravity-ide) and [official codelab](https://codelabs.developers.google.com/getting-started-agy-ide) describe plans, diffs, walkthroughs, and artifact feedback. | Feedback is easier to act on when attached to specific work. | Put request-changes beside the diff and plan feedback beside the plan; link the resulting attempt to the reviewed revision. |

Competitive hypothesis to test: Bark can distinguish itself through a calm, explicit **plan → isolated build → evidence → merge** sequence across its supported local agents. The repo already contains much of this mechanism. Better presentation and reliable semantics matter more than adding a full IDE, more dashboards, or a second frontend.

## 5. Information architecture

### Default sidebar

1. **Project selector:** project name, recent folders, Open project. Make the actual repository visible; show the full path on demand. Board selection is secondary and appears only when multiple boards exist.
2. **New thread:** one labelled entry; keyboard `⌘N` opens the same inline draft. No separate New intent and New chat buttons.
3. **Build** and **Review:** Build contains the thread navigator; Review lists actionable review work. A badge counts actionable items, never all cards or every running process.
4. **Search threads:** title first. Group nonempty work by Needs you, Working, Recent; completed work is a collapsed, searchable group. Keep grouping stable while the person is interacting.
5. **Project tools:** live in the right-side Surfaces panel, not the left sidebar. Groups: Planning (Board, Specs, Sprints, Calendar, Reports), Agent setup (Rules, Agents, Orchestration, Skills, Context & memory, Contribution graph, Project context, Project setup, Agent API), History & maintenance (Automations, History, Checkpoints, Code search, Ship). Existing subviews remain reachable within these named homes.
6. **Settings** and **Help:** quiet utility entries. Native menu and `⌘,` also open Settings. Do not put a critical error or review action only at the bottom of the sidebar.

The Surfaces panel is reachable with `⌘J` or the panel button in the top bar/thread header. It is searchable and grouped; single-letter badges activate rows only while the list has focus. On chat it docks beside the conversation and also contains the thread artifacts (Plan, Changes, Checks, Evidence, Diagnostics, Context). On full-page tools it opens as a right drawer so the tool keeps its width, then closes after a surface is chosen. Never hide blockers, failures, or pending approvals as part of simplification.

### Tool taxonomy and placement

The right rail must stay short. Tools are assigned by scope, not by frequency alone.

| Scope | Tools | Placement | Why |
| --- | --- | --- | --- |
| **Global** | Choose/open project folder, recent folders, Settings, Appearance, Help, provider sign-in, diagnostics/logs | Left project card, left footer, Settings | Applies to the machine or the shell, not to one project's work. Never in the thread rail. |
| **Project** | Board, Specs, Sprints, Calendar, Reports, Agents, Orchestration, Rules, Skills, Context & memory, Contribution graph, Project context, Project setup, Agent API, Automations, History, Checkpoints, Code search, Ship | **Project hub** at `#/hub`, with search and one-line descriptions | The full directory is too large for a rail. A hub keeps every tool findable without crowding the conversation. |
| **Project shortcuts** | Board, Agents, Project tools (hub) | Bottom of the thread rail; compact project drawer on tool pages | The three destinations used while building. Everything else stays one click away in the hub. |
| **Thread** | Plan, Changes, Checks, Evidence, Diagnostics, Context | Right rail when a thread is selected | Only meaningful for the current conversation. |

Placement rules:

- The left sidebar leads with the **project folder card**. New thread, Build, and Review are unavailable until a real folder is selected. The card shows the current folder, a Change action, and recent folders.
- The right rail shows at most six thread surfaces plus three project shortcuts. It does not list the full project directory.
- The Project hub is the only surface that lists every project tool. It has a search field, grouped sections, and a real one-line description per tool; no empty rows and no fake entries.
- Global settings never appear in the thread rail. Settings and Help stay in the left footer.
- The project hub replaces the old left-side "Project tools" disclosure. The command palette still indexes every tool.

### Feature placement

| Capability | Default location | Visibility rule |
| --- | --- | --- |
| Thread, prompt, next action | Build | Always available |
| Pending code review | Review | Label always available; count only when nonzero |
| Current plan | Conversation; Surfaces panel → Thread → Plan | After a plan exists |
| Diff and file review | Surfaces panel → Changes; full-width Review | After changes exist or explicitly requested |
| Test result and logs | Surfaces panel → Checks; one summary in conversation | After checks run or when verification needs setup |
| File preview and attachments | `⌘P`, clickable file paths, composer attachment action | On demand; identify project versus run worktree |
| Command output and terminal | Run command; Open terminal actions | On demand; state execution directory explicitly |
| Agents and orchestration | Surfaces panel → Agent setup | Show active workers inline with their run; full management on request |
| Board, specs, sprint, calendar, reports | Surfaces panel → Planning | No default dashboard metrics or planning tabs |
| Brain graph, contribution DAG, memory, context | Surfaces panel → Agent setup | Relevant context summary available from the current run |
| Receipt and provenance | Surfaces panel → Thread → Evidence | Retain a clear entry; no permanent Receipt tab |
| Evaluation, raw events, token manifests, hashes | Surfaces panel → Thread → Diagnostics | Available to experts; actionable findings are promoted automatically |
| Appearance | Settings → Appearance | Follow OS for new installs; preserve existing saved themes/accents |
| Server connection details and logs | Settings → Diagnostics | Healthy status stays quiet; connection failures surface in place |

## 6. Main building flow

### Start and ask

Opening a configured project restores its last thread or shows an inline draft with “What do you want to build?” The composer shows the installed agent and an **Ask / Build** choice. Build is the new-thread default; its primary button says **Plan changes**, with the short explanation “Review the plan before building.” Ask says **Ask** and displays “Read-only.” No feature type, role, permissions, test command, or skill list is required to send a normal prompt.

Keep agent and selected model identifiable in one compact picker. The popover contains available models and provider readiness. “CLI default” is an explicit option. Role, task type, skills, execution policy, and custom model IDs move into named advanced options. Only display settings that the selected action actually consumes. Remember a ready provider; a missing or signed-out remembered provider gets a recovery choice, never an invisible fallback.

`⌘Return` submits in every composer. Return inserts a newline by default. If an Enter-to-send preference is offered, apply it consistently. Support IME composition. Do not let a global shortcut interfere with editing, copying, or text undo.

### Plan and execute

The plan is an editable/readable artifact with outcome, affected areas, acceptance checks, and a single **Approve plan & build** action. An alternative **Request plan changes** stays adjacent. Do not show every planner step or make people edit card metadata first.

The existing `plan_first` path can provide a Bark-generated proposal; label its origin accurately. If a provider-generated planning turn is used, it must be read-only and carry the chosen provider/model explicitly. Planning and execution may use separate calls, but must feel like one thread and must not dispatch twice.

Before building, show the effective repository, base branch, isolated worktree policy, selected agent/model, and verification command in a compact execution summary. A missing test command is a visible verification setup requirement, not a silent success. A dirty checkout produces a precise explanation and a return path; Bark does not auto-stash, auto-commit, or discard work.

Once approved, create one run through `startThreadRun`. Show the worktree branch as secondary context. Keep the conversation as the primary surface, with one active operation summary and an obvious **Stop build**. Completed reads and commands collapse into an expandable activity group. An approval or blocker expands immediately. Preserve scroll position when the user reads earlier output; offer “Jump to latest.”

### Follow up and recover

In an existing thread, Ask sends a read-only question. Build prepares a new plan/change instruction for a subsequent run; the button again says **Plan changes**, never merely “Send” while saving a note. A note-only action, if retained, must be named **Save note** in a secondary menu.

While a run is active, preserve the draft and show **Stop build** plus the current operation. The first release does not promise live steering or queuing unless the chosen provider path actually supports it. Stop preserves the worktree and recorded output; retry creates an identifiable new attempt. Switching projects must preserve drafts and state what happens to active work before the sidecar is restarted.

## 7. Review and verification

Review is a first-class destination built from the existing risk-ranked queue and run diff APIs. Default rows show title, changed-file count, check outcome, and the reason attention is needed. Detailed risk scores belong in the row disclosure. A risk score is not a probability that code is correct.

Selecting a row opens its exact thread/run, with the diff and file list in a wider workbench. Offer **Request changes** and, only when eligible, **Approve & merge**. Put check evidence beside the merge action: actual command, exit result, time, tested revision, and unresolved blockers. If the reviewed head or target branch changes, refresh eligibility and require fresh evidence under the defined merge policy. The server is authoritative.

| Actual condition | User-facing state | Primary action |
| --- | --- | --- |
| Proposal awaiting approval | Plan ready | Approve plan & build |
| Queued / starting / running | Queued / Starting / Building | Stop build when cancellation is supported |
| Agent asks for an answer or permission | Needs you | Answer or review the specific request |
| Gate has not run, has no command, or was skipped | Not verified | Choose checks or run checks |
| Actual checks failed | Checks failed | Inspect failure / Request changes |
| Checks passed, reviewed revision still current | Ready to review | Review changes |
| Worktree stopped or provider interrupted | Stopped / Interrupted | Review partial work / Retry |
| Merge conflict or moved revision | Merge blocked | Inspect conflict / Reverify |
| Merge confirmed by server | Merged | View result or start the next thread |

The current boolean gate cannot encode all these distinctions. Add a backward-compatible verification outcome (`not_run`, `skipped`, `running`, `passed`, `failed`, `error`, `stale`) or equivalent structured evidence, retain legacy reads, and map records without a real command/evidence to **Not verified**. Bind evidence to run ID and tested head. Merge must reject missing, skipped, failed, or stale verification in the default policy. Answer-only runs are not eligible for code merge. Do not infer success from an agent's prose or a card's column.

The right-side Surfaces panel lists the thread artifacts **Plan**, **Changes**, and **Checks** when relevant, alongside the project tools. File/context evidence is available through the same list (Evidence, Diagnostics, Context). User-opened empty panels explain what is missing; no six-tab empty toolbar by default. Opening a surface never changes threads or steals focus. Background run completion adds a Review badge and compact notification; it does not switch the user's thread or replace the document they are reading.

Do not promise hunk-level accept/reject in this release. Applying partial patches requires its own revision, gate, and review invalidation contract.

## 8. First-run and failure states

| Situation | Visible UI and recovery |
| --- | --- |
| No project | Open project, with recent folders if available; no fake conversation or metrics |
| Folder has no Git repository | Explain why isolation needs Git; explicit Initialize Git action; Ask can remain available where supported |
| No installed agent | Inline setup with supported install documentation and Recheck; keep the draft |
| Agent installed, auth unknown or missing | Distinguish Installed, Checking, Sign-in needed, Ready; open the existing login handoff |
| Missing verification command | “Choose how to verify this project”; real detected commands plus an explicit custom command |
| First ready project | Composer and one useful example prompt; optional read-only repo analysis; setup checklist collapses after completion |
| No threads or no reviews | One sentence and the appropriate next action; no placeholder dashboards |
| First chat starts unsuccessfully | Keep the thread and prompt, expose retry, and do not pretend a reply is pending forever |
| Disconnected server / stale stream | In-place reconnect status with retry and last known state; disable unsafe duplicate submissions |
| Very long names, logs, or diff | Preserve copy access to full content; wrap prose; scroll code horizontally within its pane |

Setup details are available on demand. New repo analysis remains opt-in; the UI must not install tools, sign in, alter permissions, run arbitrary commands, or generate code merely because a screen was opened.

## 9. Layout and visual specification

Use the incumbent Bark world: warm neutral surfaces, copper for the primary action and selection, flat panes separated by rules, no decorative gradients, no dashboard card grid. One text-based operation summary is the characteristic element: **what is being built, what was verified, and what needs the person next**.

| Token / role | Proposed rule |
| --- | --- |
| Base dark palette | Existing `#0a0908` canvas, `#100e0c` sidebar, `#16130f` raised surface, `#272119` divider, `#efe9e1` text, `#c2703d` copper |
| Light/system | Consolidate the current competing light palettes; preserve saved preference; verify contrast in computed colors |
| Typography | System SF-first sans for UI/prose; SF Mono/JetBrains Mono for actual code, paths, and identifiers |
| Type roles | 14px body, 13px navigation/control, 12px secondary text, 16px main title; line-height 1.45–1.65; support zoom/text enlargement |
| Spacing and radii | 4px spacing grid; 6px controls, 8–10px composer, 12–14px dialogs; no new radius family |
| Targets | Aim for 32px desktop controls; minimum 24px hit area with spacing; 44px on touch surfaces |
| Motion | 120–180ms user-triggered transitions; reduced motion; no decorative scanning or pulsing while idle |
| Contrast | Text at least 4.5:1; large text and non-text UI boundaries/focus at least 3:1 where applicable; state is also expressed in text |

Sidebar: default **248px**, resizable within 220–300px. Conversation: flexible; readable prose about 65–75 characters per line. Right **Surfaces** panel: list **320px**; thread workbench default **420px**, resizable 360–560px, with a full-width review option and keyboard-accessible resize controls. On full-page tools the Surfaces panel is a **320px right drawer** that closes after a surface is chosen, so the tool keeps its width.

Three panes require approximately `248 + 600 + 320 = 1168px` before dividers. Use **1280px as the initial default-width breakpoint** for docking the list, then calculate available content width when people resize panes or zoom. Between 900 and 1279px, the chat Surfaces list overlays the conversation and thread artifacts use the focused full-width workspace, with a clear All surfaces action. Below 900px, use an accessible navigation drawer and a single content pane. Do not squeeze the conversation between two fixed sidebars.

At the existing **1040×680** Mac minimum, the main thread remains usable with no document-level horizontal scrollbar. At **1440×900**, side-by-side review fits comfortably. The titlebar keeps the traffic-light inset; interactive controls must never be inside the draggable hit area. Preserve window geometry restoration and native Edit/Window commands.

The companion concept adapts to the narrow inline viewer and inherits its semantic colors; it illustrates hierarchy, not a pixel-perfect native capture. The Bark palette above governs the app implementation.

## 10. Technical plan and file ownership

| Area | Existing files / proposed extraction | Implementation constraint |
| --- | --- | --- |
| App navigation | `web/src/App.tsx`, `shell/WorkspaceSidebar.tsx`; `shell/SurfacesPanel.tsx`, `lib/workbench.ts` | Left sidebar keeps Build/Review/threads; project tools and thread artifacts live in the right Surfaces panel; keep old route entries available |
| Routing and actions | `lib/surfaces.ts`, `lib/hashnav.ts`, `components/CommandPalette.tsx`, `lib/desktop.ts`; proposed shared command registry | One command dispatch path for native menu, shortcuts, and buttons; no hidden-tools search regression |
| Composer | `shell/UniversalComposer.tsx`, `threads/ThreadPane.tsx`; proposed `threads/ThreadComposer.tsx` | Share behavior, provider/model handling, pending state, draft recovery, and labels |
| Run presentation | `lib/types.ts`, `lib/threads.ts`, `threads/ThreadPane.tsx`, `shell/ThreadsShell.tsx`; proposed pure run-state selector | Select exact run/revision; server events update all panes consistently; cancel obsolete loads |
| Review | `components/ReviewQueuePanel.tsx`, `components/UnifiedDiff.tsx`, `shell/InspectorPane.tsx`; proposed `shell/ReviewSurface.tsx` | Reuse existing queue and diff logic; separate Plan, Changes, Checks panels rather than growing the current large component |
| Tool homes | `shell/OperationsView.tsx`, `BrainSurface.tsx`, `AgentsSurface.tsx`, `components/WorkspaceView.tsx`, `SettingsView.tsx` | Consolidate access without deleting functionality or changing board/storage semantics |
| Visual tokens | `lib/theme.tsx`, `index.css`, `tailwind.config.*`, shared controls | Preserve appearance migration; consolidate only touched surface tokens; no global CSS cleanup |
| Runtime truth | `barkcli-core/src/runtime/{event,runner,store}.rs`, receipt mapping, `barkcli-server/src/lib.rs`, `web/src/lib/api.ts` | Add explicit verification and eligibility; maintain old serialized record reads and CLI/MCP compatibility |
| Native behavior | `desktop/src/main.rs`, `web/src/lib/desktop.ts` | Keep loopback token, bundled assets, sidecar lifecycle, recent-project handling, native menus, notifications |

Route IDs and visible navigation are separate concepts. Initially keep `#/chat`, `#/board`, `#/agents`, `#/brain`, `#/skills`, `#/operations`, and `#/history`; display Chat as Build. Add a Review route without invalidating existing appearance data. Preserve legacy aliases and Operations subtab bookmarks.

Extend hash parsing to retain validated state such as `#/chat?board=dev&thread=<id>&run=<id>&panel=changes&file=<path>`. Never place local auth tokens in shareable state. A missing thread/run/file shows a recovery state. Back/Forward restores selection. Project identity scopes local drafts and layout; a board name alone is not globally unique.

Keep appearance v1 data readable. Navigation visibility must not make routes or command results inaccessible. Migrate preferences once, preserve existing choices, and offer a reversible layout reset. Avoid a full rewrite of the 1,812-line ThreadPane and 1,576-line InspectorPane in one patch: extract shared state and panels along the slices below.

## 11. Delivery phases

Implement in dependency order. The plan is not a claim these phases have shipped. Small source changes and test authoring may happen within a phase; execute the validation suite once the release slice is assembled, then fix and rerun affected checks.

| Phase | Scope and concrete deliverable | Dependencies | Exit criteria |
| --- | --- | --- | --- |
| 0 — Baseline and contracts | Read the latest worktree state; capture current Build/Review/Setup in dark and light; document action payloads, route migration, verification outcomes, and capability support. Use temporary fixture repositories. | None | Every displayed action has an owner/API; missing runtime support is labelled; baseline artifacts identify exact source/bundle. |
| 1 — Truthful core loop | Correct Build/note semantics, effective provider/model handling, first-reply errors, explicit verification outcomes, and server merge eligibility. Add focused contract tests. | 0 | No Build action silently saves a note; no skipped/missing check appears passed; defaults cannot merge unverified or moved work. |
| 2 — Minimal shell | One labelled sidebar, inline new thread, Build/Review entries, right-side Surfaces panel for thread artifacts and project tools, Settings/Help, command registry, deep links, draft scoping, reversible preferences. | 1 | A ready user reaches a draft with `⌘N`; all existing tools remain findable by mouse and search; `⌘J` opens the Surfaces panel; refresh restores exact work. |
| 3 — Working thread | Shared composer; clear plan approval; compact live activity; truthful Stop/Retry; stable scroll; no automatic focus theft. | 1–2 | Prompt → plan → approval → one isolated run works through one thread; start/stop/retry keep recoverable evidence. |
| 4 — Review and checks | Dedicated Review surface; contextual workbench; readable diff; request changes; explicit checks; evidence/provenance disclosure; merge confirmation. | 1–3 | Reviewer can identify what changed, what ran, and whether merge is eligible without opening specialist tools. |
| 5 — Mac finish and setup | First-run recovery, accessibility primitives, token consolidation, responsive panes, native menus/titlebar/notifications, project-switch behavior. | 2–4 | Keyboard and VoiceOver paths work; 1040px minimum and light/dark layouts stay readable; closing the shell stops its sidecar. |
| 6 — Final validation and pilot | Run the checks below; fix failures; bundle and verify; collect structured usability observations; update evidence and release checklist. | 1–5 | Required checks pass on final source and packaged app; no material task blocker; observations and limitations recorded. |

Recommended first release contains phases 0–6. Phase 1 is the first implementation slice; it prevents a cleaner UI from making inaccurate promises. Keep the existing shell available behind a temporary internal rollout switch during development, then remove the switch once the final acceptance gate passes. Do not add permanent “simple/pro” modes that duplicate the product.

## 12. Acceptance and measurement

These are release targets, not measured results:

- A ready user can start a draft with one click or `⌘N`, with no mandatory card type, role, skill, board, or model configuration.
- A new user can identify the project, active agent, current state, and next action within 10 seconds in a moderated task.
- Only Build and Review are persistent product destinations by default. Project selection, tool access, Settings, and Help remain visible and labelled.
- No empty specialist workbench appears on a fresh thread; no duplicate primary action exists in the header and composer.
- Every persisted existing feature has a documented mouse and command-search path. Hidden navigation does not disable deep links.
- Plan approval starts exactly one intended run. A retry is distinguishable from the prior attempt. The selected provider/model is either forwarded or explicitly inapplicable.
- No test command, skipped checks, stale evidence, failed checks, missing auth, and disconnected state each have a distinct recoverable presentation.
- Merge requires current server eligibility plus explicit human approval. A successful assistant response or “passed” legacy boolean alone is insufficient.
- Every core flow works at 1040×680 and 1440×900, light/dark, with keyboard-only input. Focus remains visible at zoom and returns correctly after dialogs/drawers.
- A warm action responds visually within 100ms as a target. Measure shell responsiveness with a representative large repository, 500 threads, a long transcript, and a large diff; use pagination/windowing where needed. Do not invent a provider response-time target.

Pilot with at least five representative builders using these tasks: open a project and configure an installed agent; ask a code question; plan and build a small change; inspect failing checks and request a correction; review and merge the corrected change. Record completion, navigation detours, misinterpreted controls, recovery failures, and task time. Aim for at least four of five participants to finish each task without navigation coaching. Compare against the captured Bark baseline; do not publish a superiority claim from this small pilot.

## 13. Validation and release evidence

Before final execution, re-read relevant `AGENTS.md` and confirm package scripts. Keep tests focused on consequential behavior rather than mirroring markup.

1. **Runtime tests:** skipped/missing/error/stale checks; legacy gate reads; tested-head binding; merge refusal; duplicate dispatch prevention; provider/model propagation; stopping and retrying.
2. **Web tests:** old and new route state, native-command parity, project-scoped drafts, failed initial chat, composer actions, hidden-tool search, contextual panels, keyboard/focus behavior, review eligibility.
3. **Static/build checks:** `npm --prefix web test`, `npm --prefix web run build`, `cargo test --workspace`, and `cargo check --manifest-path desktop/Cargo.toml`. Check formatting on changed Rust files and `git diff --check`.
4. **UI acceptance:** real temporary project and deterministic fixtures; fresh/working/review/failure/setup states at 1440×900 and 1040×680; browser fallback at 390px; light/dark/system; keyboard, VoiceOver, IME, reduced motion, zoom, long names/logs, disconnect/reconnect, switch-project and restore.
5. **Provider proof:** real Ask and Build through each supported installed/authenticated provider available for testing. Report unsupported or unavailable combinations explicitly; fixtures do not count as provider evidence.
6. **Packaged Mac proof:** `bash desktop/scripts/build-macos-app.sh`, `bash desktop/scripts/verify-app.sh`, `bash desktop/scripts/smoke-app.sh`; launch the built app, exercise native menu, traffic lights, titlebar drag, notifications, minimum window, actual thread/review flow, and clean quit. The existing smoke test opens no window and cannot prove visual behavior.
7. **Evidence:** save screenshots, command results, source SHA, app bundle identity, and pilot observations under a dated QA folder. Redact tokens, credentials, and private source content. Stop only servers started for QA.

Planning-task checks completed: source/manifest inspection, official-source research, cross-check of file references and feature destinations, concept rendering, local artifact/link validation, and final diff review. No application test/build/native/provider acceptance is claimed by this plan.

Concept validation on 2026-10-29: JavaScript syntax passed; all 27 local Markdown links resolved; HTML IDs were unique; no external assets or dependencies were required. The concept rendered at 1440px dark, 728px dark, and 390px light without console errors or document-width overflow in the inspected states. A temporary in-page harness exercised all six sample screens, plan submission, simulated approval/start/stop, retained draft text, artifact open/back, and the explicit unverified state; its assertions passed at 1440px and 390px. These checks apply only to the illustrative HTML artifact.

## 14. Deferred work and scope control

Defer a full embedded editor/PTY, browser automation/preview runtime, cloud sync, remote machines, schedules, analytics dashboards, a plugin marketplace, split hunk acceptance, and multi-window orchestration until the core loop passes acceptance. File preview, discovered commands, and existing external editor/terminal handoffs cover the immediate path.

A later preview feature needs explicit process ownership, trusted local URL handling, worktree-aware execution, stop/cleanup, and captured validation evidence. A later editor needs revision-safe writes and stale-check invalidation. Their absence in this release is a scoped choice, not a claim they do not matter to builders.

Do not change the product position, fork SwiftUI, replace the board/task storage model, copy competitor branding, delete advanced capabilities, auto-approve plans, weaken merge checks, silently select a different provider, or migrate unrelated repository code as part of the UI work.

The highest-value order is **truthful actions and checks → minimal shell → coherent building flow → fast review → native finish**. Visual polish follows that structure.

## 15. Sources

- [Bark native UX plan](native-ux.md), [Mac parity](../../specs/SPEC-008-mac-parity.md), [Daily-driver Mac harness](../../specs/SPEC-010-daily-driver.md), and [desktop architecture/build guide](../../desktop/README.md).
- [Project sources, model picker, and git status](project-sources-models-git-plan.md) — the follow-on plan for the project switcher, model picker, and project status panel.
- [T3 Code official thread guide](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md), checked 2026-10-29. Only thread continuity, discoverability, isolation, and organization patterns inform this plan.
- [Claude Code official desktop guide](https://code.claude.com/docs/en/desktop#arrange-your-workspace), checked 2026-10-29. Pane arrangement and contextual detail visibility inform the workbench proposal.
- [Google Antigravity IDE](https://www.antigravity.google/product/antigravity-ide) and [official IDE codelab](https://codelabs.developers.google.com/getting-started-agy-ide), checked 2026-10-29. Artifact review and feedback inform the plan/diff workflow.
- [Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), Markdown source read 2026-10-29. Labelled grouping, limited hierarchy, hide/show support, and keeping critical actions out of the sidebar footer inform navigation.
- [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), fetched 2026-10-29. Accessibility, focus, state, content overflow, and interaction rules inform acceptance. Bark's sentence-case product copy is preserved.
