# barkcli Web App Guide

> The web app provides a full-featured browser interface for managing your boards.

## Getting Started

### Start the Web App

```bash
# From your project directory
barkcli serve --open

# Or start as a background daemon
barkcli serve --daemon --open
```

The app opens at `http://localhost:4321`.

### First Time Setup

If no `.board/` directory exists, barkcli automatically:
1. Creates `.board/` with `config.json`
2. Adds `.gitignore` for metadata files
3. Creates a default board (`my-project.board`)

## Navigation

The app has 12 navigation tabs:

| Tab | What It Does |
|-----|-------------|
| **Dashboard** | Overview with card stats, sprint progress, recent activity, due-soon cards |
| **Board** | Kanban board with drag-and-drop (switch between board/table/list views) |
| **Calendar** | Cards organized by due date |
| **Reports** | Effort by column/area, priority breakdown, sprint burndown charts |
| **Code** | Search code symbols, see which cards are linked to which files |
| **Activity** | Combined timeline of history entries and agent sessions |
| **Sprints** | Start/end sprints, see sprint progress |
| **Memory** | Cross-session knowledge base, project facts |
| **Specs** | Specifications with requirements, status tracking, coverage |
| **Orchestrate** | Agent registry, task queue, run orchestration cycles |
| **Timeline** | Checkpoints, undo, diff, blame, validate/doctor, import/export |
| **Settings** | Board config, columns, theme |

## Board Management

### View Modes

Switch between three views on the Board tab:
- **Board** — Classic kanban columns with drag-and-drop
- **Table** — Spreadsheet-like view with sortable columns
- **List** — Compact list sorted by priority

### Adding Cards

1. Click **+** on any column header, or
2. Press **N** on the keyboard, or
3. Use Command Palette (**Cmd/Ctrl + K**) and type "new card"

### Editing Cards

Click any card to open the edit form with tabs:
- **Details** — Title, description, priority, labels, assignee, effort, area
- **Checklist** — Add checklist items with progress tracking
- **Links** — Connect cards (parent/child/related/blocked-by)
- **Comments** — Add comments with author attribution
- **Due Date** — Set due date and reminders
- **Acceptance Criteria** — Define completion criteria

### Quick Actions

- **Move** — Drag card to another column
- **Pin** — Pin card to top of column
- **Copy Commit Message** — Copy `[card-id] Title` format
- **View History** — See change history for a card
- **View Activity** — See all activity (history + sessions)

## Memory System

The Memory tab manages cross-session knowledge:

### Memory Tiers

| Tier | Purpose | Max Entries |
|------|---------|-------------|
| **Working** | Current context, recent decisions | 20 |
| **Short-term** | Session-level info | 100 |
| **Long-term** | Project patterns, conventions | 500 |
| **External** | Archive of all past sessions | 10,000 |

### Adding Memories

1. Type your memory in the text area
2. Select a tier
3. Add optional tags (comma-separated)
4. Click **Add**

### Searching

Use the search bar to find memories by text (BM25 search). Filter by tier using the dropdown.

### Project Facts

Switch to the **Facts** tab to manage project-level knowledge:
- **Conventions** — Code style, naming patterns
- **Patterns** — Architecture decisions
- **Decisions** — Why certain choices were made
- **Preferences** — Team preferences

## Specs System

The Specs tab manages specifications and requirements:

### Creating a Spec

1. Click **+ New** in the sidebar
2. Enter title, description, priority
3. Click **Create**

### Adding Requirements

1. Select a spec
2. Click **+ Add** under Requirements
3. Enter requirement title
4. Set status (Pending → In Progress → Implemented → Verified)

### Coverage

The sidebar shows overall coverage:
- Total requirements
- Implemented count
- Verified count
- Stale requirements (linked code changed)

### Traceability

Requirements can link to:
- **Code files** — Which files implement this requirement
- **Tests** — Which tests verify this requirement
- **Tasks** — Which tasks are working on this requirement

## Orchestration

The Orchestrate tab manages AI agents and task queues:

### Agent Registry

Register agents that can work on tasks:
1. Click **+ Register**
2. Enter Agent ID, Name, select Role
3. Roles: Scrum Master, Product Owner, Tech Lead, Project Manager

### Task Queue

View and manage tasks:
- **Pending** — Not yet assigned
- **Assigned** — Agent claimed it
- **In Progress** — Agent working on it
- **Completed** — Done
- **Failed** — Failed

### Running Cycles

Click **Run Cycle** to run an orchestration cycle that:
1. Reviews pending tasks
2. Assigns tasks to available agents
3. Dispatches work

## Timeline & Tools

The Timeline tab provides board history and utilities:

### Checkpoints

Save and restore board states:
1. Enter a label (or leave blank for auto-generated)
2. Click **Save Checkpoint**
3. Restore any checkpoint later

### Undo

Revert the last change:
1. Click **Undo** or press **Cmd/Ctrl + Z**
2. The board reverts to its previous state

### Snapshots

Save named snapshots for milestones:
1. Enter a name
2. Click **Save**

### Blame

See who changed what and when:
1. Enter a card ID
2. Click **Show**
3. View the change history

### Diff

See what changed since the last operation:
- **Added** — New cards (green)
- **Removed** — Deleted cards (red)
- **Moved** — Cards that changed columns (yellow)

### Validate & Doctor

- **Validate** — Check all boards for structural errors
- **Doctor** — Auto-fix common issues (missing title, empty columns)

### Import/Export

- **Export YAML** — Download board as YAML file
- **Export JSON** — Download board as JSON file
- **Import** — Upload a YAML or JSON board file

## Settings

Manage board configuration:
- **Board Title** — Edit the board name
- **Description** — Add board description
- **Columns** — Add, rename, or remove columns
- **Theme** — Switch between dark/light/system

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + Z` | Undo last change |
| `N` | New card (on Board view) |
| `?` | Show keyboard shortcuts |

## Command Palette

Press **Cmd/Ctrl + K** to open the command palette. Available commands:

- **Search cards** — Find cards by title
- **New card** — Add card to first column
- **Add to [column]** — Add card to specific column
- **Theme** — Switch theme (black/light/system)
- **Undo** — Revert last change
- **Export** — Download board

## Real-time Updates

The app uses WebSocket for live reload:
- Board file changes → all open tabs update instantly
- No need to refresh the page
- Works across multiple browser tabs

## Authentication

If the server was started with `--token`:
- The token is passed via URL: `http://localhost:4321/?token=mysecret`
- Stored in sessionStorage for the tab's lifetime
- Sent on all API requests automatically

## Tips

1. **Use keyboard shortcuts** — They're faster than clicking
2. **Pin important cards** — They stay at the top of columns
3. **Add labels** — Filter cards by label in the board view
4. **Set due dates** — See cards on the Calendar tab
5. **Use specs** — Track requirements alongside cards
6. **Save checkpoints** — Before major changes
7. **Check the Dashboard** — Quick overview of project health
