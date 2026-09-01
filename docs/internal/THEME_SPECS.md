# Theme & UI Specs — Professional Board

> Status: [DONE] Complete | [WIP] In Progress | [ ] Not Started
> Decisions: Accent = Blue (#3B82F6) · Themes = Black/Light/System · Labels = auto-assign by name hash · CLI = full styling

---

## Spec T1: Theme System (web/) — Foundation

> Status: [DONE] COMPLETE (verified: web build passes)

### Tasks
- [x] **T1.1**: `web/src/index.css` — define `:root` (Black: bg #000, surface #111, border #262626, text #FFF, muted #A1A1AA), `.theme-light` overrides, `[data-theme=system]` media-query handling
- [x] **T1.2**: Add tokens: `--accent` #3B82F6, `--accent-hover`, `--success` #10B981, `--warning` #F59E0B, `--danger` #EF4444, priority colors, 10-label palette (`--label-0`…`--label-9`)
- [x] **T1.3**: `web/tailwind.config.js` — map `bg-surface`, `bg-card`, `text-muted`, `border-border`, `text-accent`, `bg-accent` to CSS vars
- [x] **T1.4**: `web/index.html` — Google Fonts: Inter (400/500/600/700) + JetBrains Mono (400/500); body default `bg-[var(--bg)] text-[var(--text)]`
- [x] **T1.5**: Theme context/store — `web/src/lib/theme.tsx`: `ThemeProvider` + `useTheme()`; theme = `"black" | "light" | "system"`, persisted `localStorage["barkcli-theme"]`; applies `data-theme` on `<html>`
- [x] **T1.6**: Theme dropdown in App header (replaces light/dark toggle button): Black / Light / System, syncs with system via `matchMedia` listener
- [x] **T1.7**: Convert `App.tsx` shell (header, main, modals, loading, error) from hardcoded `gray-*` → tokens
- [x] **T1.8**: Convert `KanbanColumn.tsx` → tokens (column bg, border, header, count badge, drop highlight)
- [x] **T1.9**: Convert `KanbanCard.tsx` → tokens (card bg, border, text, muted, priority border via var)
- [x] **T1.10**: Convert `CardForm.tsx` → tokens (scrim, panel, inputs, focus ring, buttons)
- [x] **T1.11**: Convert `TableView.tsx`, `CalendarView.tsx`, `ListView.tsx` → tokens
- [x] **T1.12**: Convert `CommandPalette.tsx`, `Toast.tsx`, `SortableCard.tsx` (any colors) → tokens
- [x] **T1.13**: Fix CommandPalette `theme dark/light` commands → set theme store values (black/light), remove direct class mutation

**Acceptance**: App renders in pure black (#000) with white text by default. Toggling Light/System changes all surfaces. No hardcoded `gray-*` classes remain in components.

---

## Spec T2: Professional Board UI (Jira/Azure-like)

> Status: [DONE] COMPLETE (verified: web build passes)

### Tasks
- [x] **T2.1**: Label color system — `web/src/lib/labels.ts`: `labelColor(name)` → hash to 10-color palette (via CSS vars), returns bg/text/border classes; export `LABEL_COLORS` for reference
- [x] **T2.2**: Avatars — `web/src/components/Avatar.tsx`: initials circle, deterministic hue from name, size prop; used for assignee
- [x] **T2.3**: Priority badge — pill badge (not just border): high=red bg/10 red text, med=amber, low=gray; replace border-only styling
- [x] **T2.4**: KanbanCard layout v2 — mono muted ID line, title, badges row (priority + labels), footer row (avatar+assignee, due-date chip, checklist [x] n/m, comment count, pin)
- [x] **T2.5**: KanbanColumn header — count badge + total WIP hint; drop highlight uses `--accent` at low opacity
- [x] **T2.6**: App header — breadcrumb `project / <board title>`, card count, view tabs (board/table/calendar/list), theme dropdown, Cmd+K button — all token-based
- [x] **T2.7**: Empty states — professional: icon + "No cards yet" + "+ Add card" button (column + board level)
- [x] **T2.8**: TableView v2 — use Avatar in assignee col, Priority badge, label colors, mono IDs
- [x] **T2.9**: CalendarView v2 — label colors on pills, due-date emphasis, today highlight
- [x] **T2.10**: ListView v2 — priority badge + avatar + label colors

**Acceptance**: Board looks like a professional tool (Jira/Azure-grade). Labels have distinct colors, assignees show as avatars, priorities are obvious badges.

---

## Spec T3: Vercel-CLI-Like CLI Styling

> Status: [DONE] COMPLETE (verified: cargo build + 22 tests pass, UTF8 tables render)

### Tasks
- [x] **T3.1**: Add `owo-colors` to `barkcli-core/Cargo.toml`
- [x] **T3.2**: `barkcli-core/src/util/style.rs` — helpers: `muted()`, `ok()`, `err()`, `accent()`, `priority(p)` (high=red bold, med=yellow, low=dim), `col_name()`; TTY-aware (owo-colors auto-disables)
- [x] **T3.3**: `barkcli-core/src/util/display.rs` — table factory v2: UTF8_FULL preset, `Dynamic` content arrangement, header bold + accent, subtle footer/separators
- [x] **T3.4**: `commands/card/list.rs` — priority-colored cells, muted IDs, accent column headers
- [x] **T3.5**: `commands/list.rs` (boards) + `commands/status.rs` — muted board names, done columns green, doing amber, headers styled
- [x] **T3.6**: `commands/git_ops.rs` (log) — dim timestamps, accent op badges, old→new values muted→text, styled diff output
- [x] **T3.7**: `commands/card/show.rs` — dim labels, accent values, priority colored, checklist done/undone
- [x] **T3.8**: `commands/export.rs`, `import.rs`, `validate.rs`, `doctor.rs`, `clean.rs`, `init.rs` — ok/err coloring on feedback
- [x] **T3.9**: Pro commands — `stats.rs` (accent progress bar, green done, red blocked), `sprint.rs` (green checkmark completed), `sync.rs` (green checkmark / red cross), `license.rs` (green checkmark), `version.rs` import
- [x] **T3.10**: CLI tests still pass (22 tests — colors auto-disable when piped)

**Acceptance**: `barkcli list`, `status`, `log`, `stats`, `sprint end` etc. all show colored, aligned, professional output. Colors auto-disable when piped.

---

## Spec T4: TUI Theme Completeness

> Status: [DONE] COMPLETE (verified: cargo build + 22 tests pass)

### Tasks
- [x] **T4.1**: `barkcli-tui/src/app.rs` — extend `Theme` struct: `accent`, `danger`, `success`, `selection`, `border` (RGB per Dark/Light)
- [x] **T4.2**: `barkcli-tui/src/ui.rs` — replace hardcoded `Color::Cyan/Yellow/Red/Green/Blue/DarkGray` with `app.theme_*()` calls
- [x] **T4.3**: Status bar — subtle `theme_col_bg` + accent mode indicator (replaces white-on-blue)
- [x] **T4.4**: Board picker + overlays — use theme tokens (accent borders, selection bg)
- [x] **T4.5**: Keybinding for theme toggle (`T`) in addition to `:theme` palette command

**Acceptance**: Light theme no longer shows neon cyan/yellow — everything follows theme tokens. Toggle works via key + palette.

---

## Spec T5: Sync & Ship

> Status: [DONE] COMPLETE

### Tasks
- [x] **T5.1**: `cargo build` + `cargo test` (22 tests pass)
- [x] **T5.2**: Rebuild web (`npm run build`) → sync to `vscode-extension/dist/`
- [x] **T5.3**: Repackage VSIX + reinstall via `code --install-extension` (95.91 KB, 12 files)
- [x] **T5.4**: Verify `dev.board` opens with new theme in VS Code
- [x] **T5.5**: Update SHIPPING_SPECS.md + README with new UI (THEME_SPECS.md linked)
- [x] **T5.6**: Commit + push to master
