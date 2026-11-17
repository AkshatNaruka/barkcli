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

Bark has exactly one navigation surface: the rail on the left edge. There is no
top tab bar — the header above a surface only names it.

The rail ships with a few destinations and keeps the rest one click away:

| Destination | What It Does |
|-------------|-------------|
| **Build** | Threads — describe, plan, and build with an agent |
| **Review** | Changes and verification across every project |
| **Projects** | Every project on this machine |
| **Project tools** | Landing page for the current project's surfaces |
| **Board / Agents / Brain / Skills / Operations / History** | Project-scoped tools, hidden by default |

The rail footer holds **Docs**, **Search** (⌘K), **Usage**, and **Settings**.

Everything on the rail is yours to arrange:

1. Open **Settings → Appearance → Left navigation** (or ⌘,).
2. Use the arrows on a row to move that destination up or down.
3. Use the eye toggle to hide a destination you never open; hidden ones stay
   listed so you can bring them back. At least one destination always remains.

The same order drives the number shortcuts: `1`…`9` open the first nine
destinations on the rail, in the order shown. **Rail Style** switches between
icons only and icons with labels, and **Share this look** copies a link or JSON
preset carrying the theme, accent, rail style, and navigation order.

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

## Knowledge Graph (Brain)

The Brain surface renders everything barkcli knows about a project — subsystems,
modules, services, invariants, conventions, project facts and session memories —
as one graph. It has three modes:

| Mode | Best for |
|------|----------|
| **3D Orbit** | Spinning the whole corpus around to spot clusters |
| **2D Flow** | Reading the architecture, one neighbourhood at a time |
| **Contributions** | Tracing which sessions and runs produced a node |

### 2D Flow: overview → neighbourhood

A project can easily have sixty nodes and two hundred links. Drawn at once,
that is a texture, not a map, so 2D Flow opens on **Overview**: a small, evenly
spaced set of anchor nodes (up to 15) chosen by kind, not by raw degree — one
subsystem hub otherwise outranks every module and the view fills with
near-identical session memories. Only links between anchors are drawn.

- **Click any node** to open its **neighbourhood**: the node in the middle, its
  eight strongest connections around it, and the count of the rest
  (`8 of 38 connections`).
- **Click a neighbour** (on the canvas or in the details list) to make it the
  new focus and keep walking the graph.
- **Overview** in the breadcrumb (or a click on empty canvas) returns to the
  anchor map.
- **All (N)** draws every node on one canvas; select a node there to reveal
  just its links. This is the only mode with a minimap.

Search re-ranks the anchor map instead of dimming it: typed text selects the
matching nodes, so a search for `storage` shows that node on its own, ready to
expand. The **Layers** row filters by memory tier and **All Kinds** narrows by
node kind; filters apply before anchors are chosen.

Node cards stay deliberately small — kind icon, kind label, tier dot and the
node title. Importance, access count, description, tags, evidence file count
and the full connection list live in the details panel on the right, which
opens when you select a node.

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

**Agents → Orchestration** turns a plan into a pipeline. Two modes sit at the top:

- **Team work** — plans, their workflow, and merge approvals.
- **Live attempts** — the raw task queue currently being claimed and run.

The strip on the right always shows capacity (`active/maximum` slots, agent
count) and any gate-passed runs waiting on you.

### The Workflow Graph

Every plan renders as a left-to-right graph, not a wall of text:

```
intent ──▶ root step ──▶ dependent step ──▶ merge train
```

- **Intent** — the plan's title and source (card or thread), plus the step count.
- **Task nodes** — role, status, assigned agent, and a gate indicator.
- **Merge train** — how many steps landed, how many are in review or blocked.
- **Edges** — solid lines are dependencies; dashed lines are the intent and
  merge legs. Waiting edges fade, running edges animate, and edges from merged
  steps turn green.

Zoom, pan, and the fit-view control live on the canvas; a minimap appears once a
plan grows past eight nodes. Selecting a task opens a details panel on the right
with its acceptance criteria, agent assignment (including ranked recommendations
or **Auto assign**), **Why**, retry, merge, and reject actions. Screen readers
get the same information as an ordered text summary.

Use **List** to switch to the dense step list when you want to scan many rows at
once; **Workflow** returns to the graph.

### Planning a Card

1. Pick a card under **Plan a card** and press **Propose plan**.
2. The Product Owner proposes tasks, roles, dependencies, acceptance criteria,
   risks, and a first slice. Nothing runs yet.
3. Review the graph, answer any open questions, then **Approve plan** to
   dispatch. Each task becomes a child card in its own worktree.

### Merge Train

Gate-passed runs wait for a human. Approve to merge, or reject to send the task
back. A plan only completes once every step has merged.

## Rules

**Agents → Rules** shows the rules in `AGENTS.md` as a grid of cards — one card
per rule, with its title and a clamped preview. This keeps dozens of long rules
from turning the page into an endless scroll.

- Click a card to read the full text in a dialog; copy or remove the rule there.
- **Copy** on a card copies the rule body without opening it.
- **New rule** opens the composer only when you need it. Presets and a
  preview/edit toggle are inside.
- The filter box searches titles and bodies.

Rules are injected into every agent context pack, so an edit here changes what
agents are told on their next run. Larger edits can still be made directly in
`AGENTS.md`.

## Agent API

**Agents → Agent API** is the contract an external agent needs — scoped to the
project that is currently open, not a generic example.

**MCP config** — pick your client (Claude, Cursor, OpenCode, Windsurf) and copy
the generated JSON. Every snippet pins the project:

```json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"],
      "env": { "BARKCLI_PROJECT": "/absolute/path/to/your/project" }
    }
  }
}
```

`BARKCLI_PROJECT` is read before the working directory, so the MCP server always
serves this project's `.board/` even when the agent is launched elsewhere.

**This project's endpoints** lists absolute URLs you can copy one by one:
`/api/project`, `/api/boards`, `/api/board?name=<board>`, `/api/threads`,
`/api/threads/{id}/runs`, `/api/orchestra`, `/api/rules`, `/api/ping`, and the
`/ws` event stream. The note under the list says whether the server needs an
auth header.

Below both panels is the full agent contract — project context, the card
workflow, the completion rule (tests are the gate, not self-report), and the
copyable prompt.

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

### Worktrees

Settings → **Worktrees** shows every agent checkout under `.board/worktrees` with
its size on disk, branch, merge state, and age.

- **Merged** worktrees are removable once their branch is in the base branch.
- **Stale** worktrees (orphaned folders, finished runs, old untouched attempts)
  are removable too.
- Checkouts with a live run, uncommitted changes, or unmerged commits are kept,
  and the list says why.
- Selecting worktrees only opens a confirmation; nothing is deleted until you
  accept the exact number of worktrees and bytes that will be freed.

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
