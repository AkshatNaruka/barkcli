# SPEC-009 — Real product: project setup, providers, skills, brain loop

> Bark is the management layer for AI agents. This spec removes the remaining
> demo-shaped seams and makes project onboarding, local agent readiness,
> skills, delegation, and the living brain work from real repository state.

**Status:** approved, in progress
**Branch:** `feat/real-product`
**Depends on:** SPEC-004 (team/skills), SPEC-006 (fleet), SPEC-007 (trust), SPEC-008 (mac shell)

## Product decisions

1. **No demo data in the app.** The static GitHub Pages showcase may keep the
   demo API. `Bark.app` hard-disables demo and replay mode, even with
   `?demo=1` or `?replay=1`.
2. **Project load performs basic setup automatically.** Opening a folder
   ensures a board, indexes code context, generates the living context file,
   hires the default team when empty, installs session hooks, and probes local
   providers. AI is not allowed to create cards or code during automatic setup.
3. **AI onboarding is plan-first.** After basic setup, the user can ask the
   selected local agent to analyze the repository read-only and propose the
   first slice. Nothing is auto-approved or auto-merged.
4. **One runtime, no new JS dependency.** The web app talks to the Tauri shell
   through the injected `window.__TAURI__` bridge (`withGlobalTauri`), never a
   new package.
5. **No synthetic fallbacks.** Missing AI, missing providers, and empty data
   produce explicit empty/error states, not fabricated assistant messages or
   “all providers available” rows.

## Scope

### Project lifecycle

- `GET /api/project` returns the real project root, boards, git state, context
  state, setup checklist, and counts.
- `Workspace` is a real project home, not a second Context view.
- Desktop: open-folder dialog, recent projects, sidecar restart on the same
  port/token, and window reload. Browser: read-only current project.
- Non-git folders are a visible blocker; “Initialize Git” is explicit.
- `project_context.md` remains the central, file-is-truth context surface.

### Automatic setup

On project load the app may run the idempotent setup pipeline:

1. ensure `.board` and a board;
2. index the repository (`/api/context/sync`);
3. generate `project_context.md` (`/api/context/file/digest`);
4. hire the default team when no profiles exist;
5. install `opencode` / `claude-code` session hooks;
6. probe local providers.

Every step is skippable, reports its real result, and is safe to re-run.
Triggers: `--onboard` on the desktop shell and a Workspace “Run setup” action
for browser use. Setup failures do not block opening the project.

### Providers and authentication

- Provider status includes `authenticated`, `auth_command`, and `auth_hint`.
- Real checks: `opencode auth list --format json`, `claude auth status`, and
  Codex auth-file/login status when available.
- `GET /api/providers/{id}/models` returns real models where the CLI supports
  listing them.
- Desktop “Sign in” opens the official login command in Terminal; the browser
  shows a copyable command.
- Composer, agent forms, and Settings use live provider state. Unavailable or
  unauthenticated providers are disabled with a reason.

### Chat, skills, agents, delegation

- New-intent and thread run controls choose agent/profile, provider, model,
  role, permission mode, and skills.
- Explicit skills are merged with the selected agent profile’s skills and
  passed to the context engine.
- Skills are persisted on the card as `skill:<id>` labels and shown as
  “attached”; Inspector continues to show matched context skills.
- Board “Delegate” opens a real dispatch panel (agent/profile, model, mode,
  skills, permission) and navigates to the run.
- Agents tab offers the built-in role gallery plus custom profiles with a
  multi-select skill picker and provider readiness.
- Skills tab supports attach-to-chat and attach-to-agent from the real
  built-in/discovered/project/user registry.

### Living brain

- Every terminal app run appends exactly one `SessionEntry` keyed by run id.
  The entry contains prompt, summary, provider/model, status, commit, and files.
- The append feeds `memory::ingest` and `context_file::digest::refresh_after_session`.
- Interrupted runs are not logged. Failed and gate-failed runs are logged
  truthfully.
- Existing hooks remain the path for external CLI sessions.

### Operations

Tabs: **Workspace, Ship, Code, Timeline, Specs, Calendar, Reports, Agent API,
Docs, Settings, Context, History**.

- Context and History are first-class tabs.
- Agent API shows the live local API/MCP connection details plus the existing
  prompt contract.
- Settings includes project, providers, board, theme, context, and hooks.

## Acceptance criteria

1. Opening any folder in Bark either opens it or shows a real blocker; switching
   projects restarts the sidecar and preserves the UI.
2. The app can never enter demo or replay mode. No synthetic assistant text or
   provider availability is shown.
3. Setup checklist steps perform real writes and can be re-run idempotently.
4. Provider rows show installed/authenticated truth for opencode, Claude Code,
   and Codex; sign-in opens the official command.
5. A thread can attach skills, select a model, start a run, and show the skills
   in the context manifest.
6. A completed run appears in sessions, memory, and the refreshed
   `project_context.md` without a second manual command.
7. Board delegation selects an agent and skills and lands on the run thread.
8. All Operations tabs load real data; History is the last tab.
9. `cargo test --workspace`, web tests/build, desktop tests, bundle verification,
   and app smoke pass.

## Non-goals

- native SwiftUI iOS app
- cloud accounts or hosted sync
- a public skill marketplace
- automatic merge or automatic card/code creation during setup
- Developer ID signing/notarization
- new runtime JS dependencies
