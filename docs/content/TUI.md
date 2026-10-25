# TUI Guide

The barkcli terminal UI is a full-screen, keyboard-first kanban. It is built on a token-based design system modeled after clean CLI conventions: borderless tables, Unicode box-drawing for confirmations, `>`-prefixed status lines, and spinner feedback in the status bar.

## Launch

```bash
barkcli tui                 # opens the default board
barkcli tui --board <name>  # explicit board (if supported)
```

With a single board you land straight in it; with multiple boards you get the board picker first:

| Key | Action |
|-----|--------|
| `j` / `k`, `↑` / `↓` | Select board |
| `Enter` | Open board |
| `q` / `Esc` | Quit |

Minimum terminal size is **60×12**; below that barkcli prints a friendly "terminal too small" message instead of rendering a broken layout.

## Tabs

Press `1`–`9` to switch tabs. The active tab is highlighted in the header; the bottom status line always tells you the current mode and the shortcuts that matter on the current tab.

| Tab | Key | Purpose |
|-----|-----|---------|
| Board | `1` | Board — columns × cards, drag-free card moves with `H`/`L` |
| List | `2` | Flat, sortable backlog table (priority / title / effort / due) |
| Tree | `3` | Parent → child hierarchy of linked cards |
| Agenda | `4` | Overdue, due-today, and next-7-days cards |
| Reports | `5` | Sprint burndown, effort by column and by area |
| Code | `6` | Symbol search mapped to cards (works with `context scan`) |
| Agents | `7` | Registered agent identities |
| Orchestrate | `8` | Task queue, run cycles, claim tasks |
| History | `9` | History Bundles from your git log (readable, read-only) |

## Global keys

These work everywhere (in their respective contexts):

| Key | Action |
|-----|--------|
| `1`–`9` | Switch tab |
| `T` | Cycle theme: Dark → Light → Minimal → Dark |
| `:` | Command palette |
| `q` | Quit |
| `Esc` | Close overlay / step back one level |

## Board tab

| Key | Action |
|-----|--------|
| `j` / `k`, `↑` / `↓` | Move between cards in a column |
| `h` / `l`, `←` / `→` | Move between columns |
| `Enter` | Open card detail |
| `a` | Add card in the current column |
| `e` | Edit selected card |
| `d` | Delete card (with confirmation) |
| `H` / `m` | Move card to the previous column |
| `L` | Move card to the next column |
| `/` | Filter cards (free text + `col:` `pri:` `label:` `assignee:` terms, with `Tab` autocomplete in filter mode) |
| `T` | Cycle theme |

## List tab

| Key | Action |
|-----|--------|
| `j` / `k`, `↑` / `↓` | Navigate rows |
| `p` | Sort by priority |
| `t` | Sort by title |
| `e` | Sort by effort |
| `u` | Sort by due date |
| `a` | Add card |
| `/` | Filter |
| `Enter` | Open card detail |

## Detail overlay

| Key | Action |
|-----|--------|
| `Esc` / `q` | Close |
| `e` | Edit card fields |
| `l` | Link to another card (choose related type next) |
| `u` | Unlink |

## Agenda / Tree tabs

| Key | Action |
|-----|--------|
| `j` / `k`, `↑` / `↓` | Navigate |
| `Enter` | Open card detail |
| `q` | Quit |

## Reports tab

Read-only dashboards: sprint burndowns with progress bars, effort by column, effort by area.

| Key | Action |
|-----|--------|
| `q` | Quit (nothing to navigate) |

## Code tab

| Key | Action |
|-----|--------|
| `/` | Focus symbol search |
| `j` / `k`, `↑` / `↓` | Navigate results |
| `Enter` | Open the first card mapped to the selected file |

Populate mappings with `barkcli context scan` (and `barkcli context sync` to keep them fresh against git).

## Agents tab

| Key | Action |
|-----|--------|
| `j` / `k`, `↑` / `↓` | Navigate agents |
| `Enter` | Agent detail (identity, provider, status) |
| `Esc` | Close detail |

## Orchestrate tab

| Key | Action |
|-----|--------|
| `j` / `k`, `↑` / `↓` | Navigate queued tasks |
| `r` | Run one orchestration cycle |
| `c` | Claim the selected task for an agent |
| `Enter` | Task detail |
| `Esc` | Close detail |

## History tab

Read-only view over History Bundles produced by `barkcli history scan` — grouped commits with kind, diffstats, and confidence. Bundles can be curated on the CLI or in the web app.

| Key | Action |
|-----|--------|
| `j` / `k`, `↑` / `↓` | Navigate bundles |
| `Enter` | Bundle overview |

## Status bar

The bottom line always shows:

```
 NORMAL │ ↑↓/jk sel · ←→/hl col · Enter detail · a add · e edit …
```

- Left segment: current mode — `NORMAL`, `FILTER`, `COMMAND`, `ADD`, `EDIT`, `DETAIL`, `CONFIRM`, `PICK`, `CODE`, `LINK`, `UNLINK`, `AGENT`, `TASK`
- Active spinner while a scan/orchestration runs in the background
- Transient feedback messages status messages lead the line so they are always visible, with key hints trailing behind

## Command palette

Press `:` and type a command. `Tab` autocompletes; `Enter` executes.

| Command | Action |
|---------|--------|
| `new` | Start adding a card |
| `move <column-id>` | Move the selected card |
| `filter <text>` | Set a filter and clear it |
| `sort priority` / `sort title` | Sort the List tab |
| `theme dark` / `theme light` / `theme minimal` | Set a specific theme |
| `theme` | Cycle themes |
| `help` | Show the shortcut help |
| `quit` | Quit |

Markup for filters: `col:`, `pri:`, `label:`, `assignee:`, e.g. `/ is:todo pri:high` → press `Enter`.

## Theming

Three built-in themes, all driven from one token set (colors, symbols, spacing):

| Theme | Look |
|-------|------|
| `dark` (default) | Deep navy palette, blue accent (`#60A5FA`), Unicode symbols (`▸ ● ✓ █`) |
| `light` | Near-white palette, blue accent, same Unicode symbols |
| `minimal` | Monochrome terminal-true colors, ASCII fallbacks (`> * x = -`) — ideal for screenshots, CI logs, and low-color terminals |

Switch with `T` (cycles), `:theme <name>`, or the command palette.

### CI / colorless terminals

barkcli detects non-TTY environments automatically and boots the `minimal` theme so output stays legible in CI, piped output, and editors without color support. You can force it too:

```bash
NO_COLOR=1 barkcli tui           # standard convention
BARKCLI_NO_COLOR=1 barkcli tui   # barkcli-specific flag
```

## Under the hood (for contributors)

- Tokens live in `barkcli-tui/src/theme/mod.rs` (`DARK`, `LIGHT`, `MINIMAL`) — change one place, applies everywhere.
- Reusable widgets live in `barkcli-tui/src/components/`: borderless tables, Unicode box-drawing (confirmations), and the status line.
- The whole UI is covered by render smoke tests: every tab × theme × terminal size, all modal modes, and content assertions run via `TestBackend` (see `barkcli-tui/src/ui.rs` tests).

## Related

- [COMMANDS.md](/docs/COMMANDS) — full CLI reference (every TUI action has a CLI equivalent)
- [WEB_APP_GUIDE.md](/docs/WEB_APP_GUIDE) — the browser interface
- [HISTORY.md](/docs/HISTORY) — History Bundles behind Tab 9
