# Interfaces

barkcli provides multiple interfaces to work with your tasks. All interfaces read and write the same YAML files — choose whichever fits your workflow.

---

## Terminal UI

The terminal UI (TUI) is an interactive kanban board that runs in your terminal.

### Launch

```shell
barkcli tui
```

### Tabs

Switch between tabs using `1`–`8` or `Tab`:

| Tab | Key | Description |
|---|---|---|
| Board | `1` | Kanban columns view |
| List | `2` | Sortable backlog table |
| Tree | `3` | Parent-child hierarchy |
| Agenda | `4` | Overdue, today, next 7 days |
| Reports | `5` | Sprint burndown, effort charts |
| Code | `6` | Symbol search, context coverage |
| Agents | `7` | Registered coding agents |
| Orchestrate | `8` | Task queue, claim tasks |

### Keyboard Shortcuts

#### Board Tab

| Key | Action |
|---|---|
| `h` / `l` or `←` / `→` | Navigate between columns |
| `j` / `k` or `↑` / `↓` | Select card in column |
| `Enter` | View card details |
| `a` | Add new card |
| `e` | Edit selected card |
| `d` | Delete card (confirm `y`/`n`) |
| `H` / `L` or `m` | Move card left/right |
| `/` | Search/filter cards |
| `:` | Command palette |

#### List Tab

| Key | Action |
|---|---|
| `↑` / `↓` or `j`/`k` | Navigate cards |
| `p` | Sort by priority |
| `t` | Sort by title |
| `e` | Sort by effort |
| `u` | Sort by due date |
| `Enter` | View card details |

#### Detail View

| Key | Action |
|---|---|
| `l` | Link to another card |
| `u` | Unlink from card |
| `e` | Edit card |
| `q` | Close detail view |

### Customization

The TUI reads the board columns from your `.board/` configuration. Add or reorder columns in your board YAML to customize the layout.

---

## Web App

A browser-based kanban board with real-time collaboration.

### Launch

```shell
barkcli serve                    # localhost:4321
barkcli serve --open             # open in browser
barkcli serve --port 8080        # custom port
barkcli serve --board backend    # specific board
barkcli serve --host 0.0.0.0     # expose on LAN
```

### Features

- **Dashboard** — Overview of all boards, tasks, and recent activity
- **Board View** — Kanban, table, and list sub-views
- **Calendar** — Visualize due dates and sprints
- **Reports** — Sprint burndown, effort breakdown, priority charts
- **Code** — Symbol search and context coverage
- **Activity** — Merged history and session timeline
- **Sprints** — Start and end sprints from the UI
- **Settings** — Configure columns, theme, and AI provider

### Security

- Binds to `127.0.0.1` by default (localhost only)
- Use `--host 0.0.0.0` to expose on LAN (warning printed)
- Use `--token <t>` to require authentication

### API Endpoints

The server exposes a REST API:

| Endpoint | Method | Description |
|---|---|---|
| `/api/boards` | GET | List all boards |
| `/api/board` | GET/PUT | Get or update board |
| `/api/cards` | GET | List cards |
| `/api/history` | GET | Change history |
| `/api/sessions` | GET | Agent sessions |
| `/api/sprints` | GET/POST | Sprint management |
| `/api/context` | GET | Code context |
| `/ws` | WS | Live reload |

---

## VS Code Extension

A custom editor for `.board` files in VS Code.

### Install

1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X`)
3. Search for "barkcli"
4. Click Install

Or install from terminal:

```shell
code --install-extension barkcli.barkcli
```

### Features

- **Custom Editor** — `.board` files open in a visual kanban view
- **Real-time Sync** — Changes in the editor update the YAML file
- **Git Integration** — Track changes with git diff
- **Syntax Highlighting** — YAML files get proper highlighting

### Usage

1. Open a project with `barkcli init`
2. Double-click any `.board` file
3. The kanban view opens automatically
4. Drag and drop cards between columns
5. Click cards to edit details

---

## Integration with Git

All interfaces work with the same git-tracked YAML files. This means:

```shell
# Work in CLI
barkcli add "New feature" -p high
git add .board/main.board
git commit -m "feat: add new feature task"

# See changes in TUI
barkcli tui

# Review in web
barkcli serve --open

# Edit in VS Code
code .board/main.board
```

Everyone on your team sees the same tasks, regardless of which interface they use.
