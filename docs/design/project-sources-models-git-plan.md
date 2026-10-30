# Project sources, model picker, and git status

Date: 2026-10-30  
Status: proposed implementation plan  
Scope: shared `web/` UI, `desktop/` Tauri shell, `barkcli-server`, `barkcli-core`  
Reference: three product screenshots supplied on 2026-10-30 (project sources, model picker, project/git menu)

## 1. Decision

Bark should make three setup/context actions feel like one continuous workspace:

1. **Choose where work lives** — a searchable project switcher for a new repository, a local folder, a Git URL, or a GitHub repository.
2. **Choose how work runs** — a fast model picker with provider context, search, favorites, and honest readiness.
3. **See the project’s current state** — machine, editor, branch, working-tree changes, commit/push, and project scripts in one compact panel.

The reference screenshots are the interaction model. Bark keeps its own warm charcoal/copper visual language and only exposes actions that have a real backend.

**Rule for every row:** names, paths, models, branches, change counts, and readiness come from the server or the desktop shell. There are no sample projects, sample models, or placeholder branches.

## 2. What the references show

| Reference | Useful pattern | Bark adaptation |
| --- | --- | --- |
| Project sources | Search-first sheet; four labelled sources with one-line explanations; recent work is separate. | Project switcher dialog: New project, Local folder, Git URL, GitHub repository, then recent projects. |
| Model picker | Provider rail, model search, provider/model rows, shortcut hints, favorites, selected check. | Composer model popover backed by `providers` + `provider models`; favorites are a local preference; readiness stays visible. |
| Project/git menu | Machine, editor, project script, branch, commit & push, change totals. | Project status popover anchored under the project name. Reuses existing git status/commit/push APIs and editor detection. |

## 3. Current source evidence

Read from the working tree on 2026-10-30. Line references are intentionally symbolic; verify before implementation.

| Area | What exists now | Consequence |
| --- | --- | --- |
| Project picker | `web/src/shell/WorkspaceSidebar.tsx` renders a `<details>` with the current project, recent projects, `Open project…`, and a board selector. `desktop/src/main.rs` exposes `open_project_dialog`, `switch_project`, `recent_projects`, `reveal_project`. | Switching works, but there is no search, no create, and no clone. The control is visually a dropdown, not a route-level switcher. |
| Project setup | `POST /api/project/onboard`, `POST /api/project/init-git`, `auto_init()`, `build_prompt`; the desktop app calls onboarding after launch. | A new folder can be initialized safely; creation/cloning still needs an owning command. |
| Git state | `barkcli-core/src/repo.rs::git_status` returns branch, HEAD, upstream, ahead/behind, clean, and changed paths. `/api/git/status`, `/api/git/commit`, `/api/git/push` exist. `ProjectGitState` carries branch, head, upstream, ahead/behind, clean, changes count. | Branch and change count are available. There are no addition/deletion totals, no branch list, and no branch switch. |
| Git UI | `web/src/components/ShipView.tsx` already performs status refresh, commit, push, merge, PR, and recent commits. `detectEditors` and `openInEditor` exist. `web/src/lib/desktop.ts` opens Finder/Terminal/logs. | The large Ship surface should stay; the status panel should be a shortcut into it, not a second full implementation. |
| Models | `web/src/lib/useAgentSelection.ts` persists provider/model per project, probes `/api/providers`, and fetches `/api/providers/{id}/models`. `ProviderRegistry` returns live OpenCode models and curated Claude/Codex lists. | The data exists, but the composer picker is a `<details>` with `<select>` + datalist. No search, favorites, provider rail, or keyboard selection. |
| Provider readiness | `ProviderStatus` has `available`, `authenticated`, `auth_hint`, `capabilities`. `useAgentSelection` already distinguishes Ready, Sign-in needed, Installed but not confirmed. | The picker must preserve these distinctions. Never silently choose another provider. |
| Project commands | `barkcli-core/src/repo.rs::detect_commands` discovers Cargo, npm/pnpm/yarn, Make, Go, Python, and git commands. `CommandRunner` runs a command through `/api/exec`. | Discovered commands exist. There is no user-authored “project script” store. |
| Machine identity | No `hostname` field in `ProjectSnapshot` or the desktop bridge. | Add a read-only machine label; do not infer it from the project path. |
| Shortcuts | `⌘1`/`⌘2` navigate Build/Review; `⌘O` currently opens the native folder picker; `⌘P` opens files; `⌘K` opens the command palette. | The model picker cannot claim `⌘1..5` globally without a scoping rule. The project switcher should take `⌘O`. |

## 4. Design principles

- **One entry, one job.** Project name opens the source switcher. The branch/status chip opens the project status panel. They must not fight over the same click target.
- **Search first.** Every list longer than five rows gets a filter field focused on open.
- **Real states only.** Missing Git, detached HEAD, no upstream, auth required, no models, and missing folders are explicit states with a recovery action.
- **No destructive defaults.** Never auto-stash, auto-commit, auto-push, auto-clone over an existing folder, or switch branches with a dirty tree.
- **Keep the conversation primary.** These are popovers and dialogs; they do not become new persistent destinations.
- **Keyboard parity.** Every action has a visible keyboard path. Existing global shortcuts remain unless a popover is open and explicitly claims a key.
- **Bark visual language.** Warm surfaces, 1px rules, 6–10px radii, 16px line icons, copper only for selection/primary action. No gradients, no dashboard cards, no brand logos without assets.

## 5. Pattern 1 — Project switcher

### 5.1 Entry points

- Click the project name in the sidebar.
- `⌘O` and the native `Open Project…` menu item.
- Command palette: “Open project”.
- First run with no project: open the switcher instead of an empty conversation.

### 5.2 Layout

A centered dialog (not a tiny dropdown), max width **560px**, max height **min(640px, 80dvh)**.

```text
┌────────────────────────────────────────────────────┐
│ ←  Search projects and sources…                    │
├────────────────────────────────────────────────────┤
│ SOURCES                                            │
│  [folder+] New project                             │
│            Start a Git repository from a name       │
│  [folder]  Local folder                            │
│            Browse a folder on disk                  │
│  [link]    Git URL                                  │
│            Clone from a remote URL                  │
│  [branch]  GitHub repository                        │
│            Clone github.com/owner/repo              │
├────────────────────────────────────────────────────┤
│ RECENT                                             │
│  barkcli                         /Users/…/barkcli  │
│  monkihere-os                    /Users/…/monki…   │
│  Missing folder                  /Volumes/old/…    │
├────────────────────────────────────────────────────┤
│ Current: barkcli · Reveal · Open in editor          │
└────────────────────────────────────────────────────┘
```

Behavior:

- Search filters sources by label/keywords and recent projects by name/path.
- `↑`/`↓` moves the active row, `Enter` activates, `Esc` closes, focus returns to the project button.
- Source rows are always present; recent projects appear only when they exist.
- The current project is marked “Current” and is not re-opened.
- Missing recent paths stay visible with a “Missing folder” state and a **Remove from recents** action; never silently delete the entry.
- In the browser build, source actions that need the desktop shell are disabled with “Available in the Bark app”; recents come from the desktop bridge only.

### 5.3 New project

1. Name field (required, slug preview from the name).
2. Parent folder via native folder picker (desktop) or a server-local absolute path (browser, advanced).
3. Toggle **Initialize Git** (default on).
4. Submit → create an empty directory, `git init` when enabled, then `barkcli init`/onboarding (board, config, profiles, context). Switch to it through the existing desktop `switch_project` path, which restarts the sidecar.
5. Refuse if the target exists and is non-empty. Do not overwrite or merge.

### 5.4 Local folder

Reuse `openProjectDialog()` / `switchProject(path)`. Validate that the folder exists and is a directory. If it has no Git repository, show the existing onboarding “Initialize Git” step; do not block Ask.

### 5.5 Git URL and GitHub repository

- Git URL: accept `https://…`, `ssh://…`, `git@host:owner/repo.git`, and `git://` (read-only warning). Reject arbitrary local paths, `file://`, and shell metacharacters.
- GitHub repository: accept `owner/repo` or a full GitHub URL and normalize to `https://github.com/owner/repo.git`.
- Destination: parent folder + target name (defaulted from the repository name). Refuse if the target exists.
- Run `git clone --progress -- <url> <target>` with `GIT_TERMINAL_PROMPT=0` and `GIT_SSH_COMMAND="ssh -oBatchMode=yes"` so a missing credential fails instead of hanging. Never construct a shell string.
- Clone is a **job**, not a blocking request: `POST /api/project/clone` returns a job id, progress is polled (or streamed), and cancel kills the child. The dialog remains responsive.
- On auth failure, show “Authentication required” with **Open terminal** and the exact command. Do not print credentials; redact `https://user:token@`.
- On success, run the same onboarding path as New project, then switch.
- Optional, explicit “Use GitHub CLI” path only if `gh` is installed and authenticated; it must not be required.

### 5.6 API and data

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/project/create` | `{ parent, name, init_git }` | `{ ok, root, board, steps[] }` |
| `POST /api/project/clone` | `{ parent, name?, url }` | `{ job_id }` |
| `GET /api/project/clone/{job_id}` | — | `{ status, progress[], root?, error? }` |
| `POST /api/project/clone/{job_id}/cancel` | — | `{ ok }` |
| `GET /api/project` | — | Add `hostname`; existing snapshot otherwise |
| Desktop `switch_project` | existing | existing |

Core additions:

- `barkcli-core/src/commands/project.rs` (new): `create_project`, `clone_project`, path/name validation, onboarding handoff.
- `barkcli-core/src/repo.rs`: URL validation and `git clone` argument builder with tests.
- `barkcli-server/src/lib.rs`: route + handlers; reuse `auto_init`/onboarding.
- `desktop/src/main.rs`: keep the native folder picker; the switcher calls it for parent/destination selection. No new shell execution in the webview.

## 6. Pattern 2 — Model picker

### 6.1 Entry point

The composer’s current agent/model summary becomes a button that opens a **model popover**:

```text
┌────────────────────────────────────────────────────────────┐
│ ★  │  Search models…                                       │
│ ◉  ├───────────────────────────────────────────────────────┤
│ ◯  │  GPT-5                         Codex        ⌘1   ★ ✓  │
│ ◯  │  DeepSeek V4.1 Flash           OpenCode Go  ⌘2   ☆    │
│ ◯  │  MiMo-V2.6-Flash Free          OpenCode     ⌘3   ☆    │
│ ◯  │  Gemini 3.8 Flash (High)       Antigravity  ⌘4   ☆    │
│    │  Claude Sonnet 4.6             Claude Code  ⌘5   ☆    │
│    ├───────────────────────────────────────────────────────┤
│    │  CLI default                                           │
│    │  Use a custom model id…                                │
│    └───────────────────────────────────────────────────────┘
```

Width **520–560px**; left rail **52–56px**; rows **48px**; search **38px**. The rail filters by provider; the star at the top means “all providers”. Provider marks are neutral 18px glyphs/initials unless official assets are added later.

### 6.2 Behavior

- Open from the composer summary or the current agent text. Do not add a global shortcut in this phase: `⌘M` is macOS Minimize.
- Search matches model id, display label, and provider name. Typing filters immediately; empty query shows favorites first, then the selected provider’s models, then other available providers.
- Favorite star toggles locally. Favorites are keyed by `provider/model` and never imply availability.
- Selected row has a check; clicking or `Enter` selects and closes.
- `↑/↓` moves, `Esc` closes, `⌘1..5` select the first five visible rows **only while the popover is open**. A capture-phase handler stops those keys from reaching the shell. When closed, `⌘1`/`⌘2` keep their current Build/Review behavior.
- “CLI default” is an explicit row. “Use a custom model id…” opens an inline input; it must not be hidden inside a `<datalist>`.
- Unavailable provider: row is visible but disabled with “Install” / “Sign in” and the existing `auth_hint`; selecting it never falls back to another provider.
- Installed but unauthenticated: selecting is allowed for Build (planning is offline) but Ask remains blocked by the existing readiness rule; the hint states which action consumes the choice.
- If `/api/providers/{id}/models` returns an empty list, show “CLI default” plus the custom-id row and a “The CLI does not advertise models” note; do not invent model names.
- Provider source labels are honest: “OpenCode” models may come from the CLI; Claude/Codex lists are curated aliases. The row may show a small “curated” label in the provider subline.

### 6.3 Data

- `GET /api/providers` already returns readiness. Keep it.
- `GET /api/providers/{id}/models` already returns `string[]`. For the picker, fetch all providers in parallel on open, cache for the session, and revalidate on “Recheck”.
- Optionally add `GET /api/models` to aggregate:
  ```json
  { "providers": [{ "id": "opencode", "name": "OpenCode", "available": true,
    "authenticated": true, "models": ["…"], "source": "cli" }] }
  ```
  This avoids N requests and gives one failure boundary. Prefer this if the provider count grows.
- Favorites: `localStorage["bark:model-favorites:v1"] = ["opencode/deepseek-v4.1-flash", …]`.
- Selected provider/model stays per project via `useAgentSelection`’s existing `bark:agent:v1:<scope>` key.
- No server-side favorites in this release.

### 6.4 Files

- `web/src/threads/ModelPicker.tsx` (new)
- `web/src/lib/model-catalog.ts` (new: fetch/cache/filter/favorites)
- `web/src/lib/useAgentSelection.ts` (expose catalog + favorites)
- `web/src/threads/ThreadComposer.tsx` (replace `<details>` with trigger)
- `web/src/shell/UniversalComposer.tsx` (no separate behavior)
- `web/src/index.css` (popover, rail, row, shortcut badge)
- Tests: `ModelPicker.test.tsx`, `model-catalog.test.ts`

## 7. Pattern 3 — Project status panel

### 7.1 Entry point and layout

Add a compact **project status row** under the project name in the sidebar:

```text
[branch] master          +2,314 −1,661
```

Clicking it opens a popover, max width **360px**, anchored under the row:

```text
┌──────────────────────────────────────────────┐
│ [laptop] Akshat’s MacBook Pro          [open]│
│          Open in VS Code                 ▾   │
│          + Add project script…               │
├──────────────────────────────────────────────┤
│ [branch] master                           ▾  │
│ [upload] Commit & push…                      │
│ [file+]  Changes            +2,314 −1,661    │
├──────────────────────────────────────────────┤
│ 3 changed files · 2 ahead · clean tree       │
└──────────────────────────────────────────────┘
```

The closed row is the sum of truth: branch + change totals. The popover is the action surface.

### 7.2 Actions and states

- **Machine**: `hostname -s` from the server; read-only label, not an editable setting.
- **Reveal / Open in editor**: existing `reveal_project`, `detectEditors`, `openInEditor`. Show the preferred editor and a small dropdown of detected editors; no fake editor names.
- **Add project script**: name + command; stored in `.board/config.json` under a new `scripts` array; listed in `ProjectSnapshot.commands` alongside detected commands. Show the exact command and a “runs in the project root” note. Never auto-run.
- **Branch dropdown**: local branches from `GET /api/git/branches`; current branch checked. Selecting another branch asks for confirmation when the tree is dirty; never auto-stash. “Create branch” validates with `git check-ref-format --branch` and creates with `git switch -c`.
- **Commit & push**: opens a compact form with changed files, message, and two explicit actions: **Commit** and **Commit & push**. Push requires `confirm: true` (existing API). Show ahead/behind and auth errors. Full review stays in Ship.
- **Changes**: click opens Ship / review; the row shows additions/deletions plus untracked count.
- **Not a Git repository**: show “Initialize Git” using the existing endpoint; hide branch/commit rows.
- **Detached HEAD / conflict / no upstream**: explicit labels and recovery hints; do not pretend a branch is current.
- **Active work**: if a build or chat is running, the panel still reads state but disables branch/commit actions with “Stop active work first”. Switching projects already prompts; keep that.

### 7.3 Git diff totals

Extend `barkcli-core/src/repo.rs`:

```rust
pub struct GitDiffTotals {
    pub additions: u32,
    pub deletions: u32,
    pub untracked: u32,
    pub files: u32,
}
```

Implementation:

- Sum `git diff --numstat` and `git diff --cached --numstat`.
- Count untracked entries separately from `git status --porcelain` (`??`).
- Exclude Bark-generated paths (`project_context.md`, `.board.lock`) consistently with `git_status`.
- Add `additions`, `deletions`, `untracked` to `GitStatus` and `ProjectGitState`.
- Compute on demand when the popover opens or `/api/git/status` is called; do not poll a full diff on every `/api/project` request.
- Add tests against a temporary repo: tracked edit, staged edit, untracked file, binary file, generated paths ignored.

### 7.4 API additions

| Endpoint | Purpose |
| --- | --- |
| `GET /api/git/branches` | `{ current, branches: [{ name, current, upstream? }] }` |
| `POST /api/git/checkout` | `{ branch, create? }`; refuses dirty/conflicted trees |
| `GET/POST/DELETE /api/project/scripts` | List/add/remove project scripts |
| `GET /api/git/status` | existing; add diff totals + untracked |
| `GET /api/project` | existing; add `hostname` and `git.additions/deletions/untracked` |

Core: `repo::git_branches`, `repo::git_checkout`, `repo::git_diff_totals`; config `scripts`; server handlers; tests.

## 8. Shared UI primitives

Extract only what is reused:

- `Popover` — fixed-position, portal, outside click, Escape, focus restore, viewport clamping. `ThreadActionsMenu` already proves the pattern; extract a shared primitive rather than copy it.
- `SearchableList` — input, grouped rows, active index, keyboard, empty state.
- `SourceRow` / `MenuRow` — icon, title, subtitle, trailing hint/check.
- `ShortcutBadge` — `⌘1` style; only shown when the owning surface is open.
- `StatusDot` — ready / needs sign-in / unavailable, always paired with text.

Keep these in `web/src/components/` and use tokens from `index.css`. No new radius or color family.

## 8.1 Accessibility and performance

- Popovers use `role="dialog"`/`role="menu"` as appropriate, an accessible name, focus on the first field/row, `Esc` to close, and focus restoration to the trigger.
- Arrow keys move the active row; `Enter` activates; `Home`/`End` jump; shortcuts are announced only when active.
- Every status uses text plus a dot/icon; color is not the only signal.
- Respect `prefers-reduced-motion`; no automatic focus theft from the conversation.
- Diff totals and branch lists are computed on open, not on every project poll. Model catalogs are cached for the session and revalidated on explicit Recheck. Recents are capped at 8.

## 9. Security and correctness

- **Clone**: validate URL; no shell; destination must not exist; run with `GIT_TERMINAL_PROMPT=0`; redact credentials in errors; offer terminal auth. Never clone into a non-empty folder.
- **Create**: sanitize name; parent must exist and be writable; no overwrite; do not create a Git repo unless requested.
- **Scripts**: user-authored shell commands are inherently powerful. Show the exact command, require an explicit Run click, run in the project root, show stdout/stderr, never auto-run, never interpolate model/project text into the command.
- **Branch switch / commit / push**: confirm destructive or publishing actions; refuse dirty/conflicted trees; no auto-stash; no auto-push; existing server confirmations remain authoritative.
- **Models**: readiness is truth. A saved unavailable provider stays visible; no invisible fallback. Free-form model ids are allowed only where the provider accepts them.
- **Switching projects**: stop the current sidecar, keep drafts, and warn about active work (existing behavior). Never copy state between projects.
- **No hardcoded data**: source rows are actions; projects/models/branches/change counts are fetched. Empty states explain what is missing.

## 10. Delivery phases

| Phase | Deliverable | Exit criteria |
| --- | --- | --- |
| 0 — Baseline | Capture current project picker, composer model picker, Ship status; inventory shortcuts and APIs; create temp projects/repos for QA. | Every row/action in the references is mapped to an existing API or a listed gap. |
| 1 — Project switcher shell | Searchable dialog, recents, current/missing states, local folder, `⌘O`; native menu parity; focus/keyboard. | Open/switch works from mouse and keyboard; browser shows desktop-only actions as unavailable. |
| 2 — Create and clone | `POST /api/project/create`, clone job endpoints; new-project/clone dialogs; validation, progress/cancel, auth error, onboarding, switch. | A temp folder and a local bare repo can be created/cloned and opened; no overwrite; failures recover; clone progress is visible and cancelable. |
| 3 — Model picker | Provider rail, search, rows, favorites, custom id, scoped shortcuts, readiness. | Selected model persists per project; unavailable providers cannot be mistaken for ready; no fabricated models. |
| 4 — Status panel | Hostname, editor, diff totals, branch display, changes row, Ship link. | Real branch/stats match `git status`; not-a-repo and detached states are explicit. |
| 5 — Git actions and scripts | Branch list/switch, compact commit/push, project scripts, active-work guards. | Dirty-tree refusal, push confirm, script run/output, and error recovery are tested. |
| 6 — Polish and proof | 1040×680/1440×900 light/dark, focus/VoiceOver, reduced motion, packaged Mac proof. | No layout clipping; keyboard-only path works; packaged app exercises each flow. |

Phases 1–2 are desktop-first. The browser build keeps the current project and shows a clear “Available in the Bark app” state for source actions; it must not pretend to switch projects.

## 11. Testing

**Web**

- Project switcher: search, keyboard, current/missing recent, desktop/browser gating.
- Model picker: filter, favorites persistence, custom id, readiness, scoped `⌘1..5`, Escape/focus restore.
- Status panel: loading/error/no-git/detached/clean/dirty, stats formatting, commit/push confirmation, branch refusal.
- Regression: existing Build/Review shortcuts, composer submission, thread actions, workbench.

**Rust**

- Create project: empty/non-empty target, invalid name, init on/off.
- Clone validation: https/ssh/scp-like accepted; file/shell rejected; destination guard.
- Git totals: tracked, staged, untracked, binary, generated paths.
- Branches: list, create validation, checkout refusal on dirty/conflict.
- Scripts: CRUD in config, merge with discovered commands, execution still explicit.

**Packaged Mac**

- Native folder pickers for parent/destination.
- Clone a local bare repository (no network) and open it.
- TCC/Finder permissions, project switch restart, sidecar cleanup.
- Editor detection and Open in VS Code.
- Commit to a temp repo; push dry-run or a temp remote; auth failure message.
- 1040×680 and 1440×900, light/dark, keyboard and VoiceOver.

## 12. Acceptance

- A ready user can open the project switcher with `⌘O`, search, create a project, open a local folder, or clone a repository without editing config by hand.
- Every project row shows a real path; missing paths are explained; no sample rows appear in a fresh install.
- The model picker shows only providers/models the backend reports; favorites persist; “CLI default” and custom ids are available; the selected agent/model is what the next action uses.
- The status panel’s branch and change totals match `git status`; commit/push/branch actions refuse unsafe states and never run implicitly.
- The three surfaces work at 1040×680 and 1440×900, light/dark, keyboard-only, with visible focus and no document-level horizontal scroll.
- No new persistent navigation destination is created; the conversation remains primary.
- Tests pass, the bundle verifies, and the packaged app is exercised on a temp project.

## 13. Non-goals

- GitHub OAuth/device flow, organization browsing, or PR creation inside the switcher (Ship owns PRs).
- Live model entitlement or account discovery beyond each CLI’s advertised list.
- Auto-stash, auto-commit, auto-push, auto-clone, or silent provider fallback.
- A full branch/merge UI inside the popover; complex operations stay in Ship.
- Multi-window orchestration, cloud sync, remote machines, snooze, unread, or archive state.
- Brand logos or provider artwork without a licensed asset set.

## 14. Open decisions

1. **Model shortcut scope**: use `⌘1..5` only while the picker is open (recommended) or switch to `⌥1..5` everywhere. The former matches the reference; the latter avoids any ambiguity. Pick one before phase 3.
2. **Script storage**: `.board/config.json` (local, recommended) versus a committed `.barkcli/scripts.json`. Do not do both.
3. **Clone execution**: server-side `git clone` (recommended for browser/desktop parity) versus desktop-side. Server-side keeps one implementation; auth fallback opens Terminal.
4. **GitHub CLI**: optional only; `git clone` is the source of truth.
