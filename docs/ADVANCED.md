# Advanced Features

This guide covers advanced barkcli features: sessions, checkpoints, hooks, sprints, and Pro capabilities.

---

## Sessions

barkcli captures agent sessions — when you or an AI agent works on a task, the session is recorded.

### What's Captured

- **Prompt** — What you asked the agent
- **Files touched** — Which files were modified
- **Commit** — The git commit created
- **Duration** — How long the session took
- **Matched cards** — Which tasks were affected

### Commands

```shell
# List recent sessions
barkcli session list

# Show full session detail
barkcli session show session-abc

# Print context to hand to your agent
barkcli session resume session-abc

# Record a session from JSON on stdin (used by hooks)
echo '{"agent":"opencode","prompt":"..."}' | barkcli session log
```

### Session File Format

Sessions are stored in `.board/sessions/<board>.jsonl`:

```json
{
  "id": "session-abc",
  "agent": "opencode",
  "model": "claude-3",
  "board": "main",
  "prompt": "Implement JWT login",
  "commit_sha": "abc1234",
  "files_touched": ["src/auth/login.ts", "src/auth/jwt.ts"],
  "summary": "Added JWT authentication with refresh tokens",
  "at": "2024-07-30T14:00:00Z",
  "duration_ms": 120000,
  "matched_card_ids": ["jwt-login"]
}
```

---

## Checkpoints

Checkpoints save your board state at a point in time. You can restore to any checkpoint.

### Types

- **Manual** — You save explicitly
- **Auto** — Created automatically when git commits touch `.board` files

### Commands

```shell
# List checkpoints
barkcli checkpoint list

# Save a checkpoint
barkcli checkpoint save "before refactor"

# View checkpoint details
barkcli checkpoint show checkpoint-abc

# Restore from checkpoint
barkcli checkpoint restore checkpoint-abc
```

### Checkpoint Files

Checkpoints are stored in `.board/snapshots/`:

```
.board/snapshots/
├── manual/
│   └── checkpoint-abc.yaml
└── auto/
    └── main-abc1234def5678.yaml
```

---

## Hooks

Hooks let barkcli integrate with your coding agent (opencode, claude-code, etc.).

### Install

```shell
# Install for all supported agents
barkcli hooks install

# Install for specific agent
barkcli hooks install --agent opencode
barkcli hooks install --agent claude-code

# Check status
barkcli hooks status
```

### What Hooks Do

When installed, hooks:

1. **Post-session** — Record the agent session automatically
2. **Post-commit** — Save a checkpoint if `.board` files changed

### Hook Locations

| Agent | Hook Location |
|---|---|
| opencode | `.opencode/plugins/barkcli.ts` |
| claude-code | `.claude/settings.json` |

---

## Sprints

Sprints let you group tasks into time-boxed iterations.

### Commands

```shell
# Start a sprint
barkcli sprint start "Sprint 1" --ends 2024-12-31

# End a sprint
barkcli sprint end "Sprint 1"

# List all sprints
barkcli sprint list
```

### Sprint Labels

Cards in a sprint are tagged with `sprint:<name>` labels. You can filter by sprint:

```shell
barkcli list -l sprint:Sprint 1
```

### Sprint Data

Sprint metadata is stored in `.board/sprints/<board>.json`:

```json
[
  {
    "name": "Sprint 1",
    "start": "2024-12-01",
    "end": "2024-12-15",
    "status": "completed"
  }
]
```

---

## Pro Features

These features require a license. Run `barkcli` to check your license status.

### AI Task Breakdown

Use AI to break down complex tasks:

```shell
barkcli ai "Break down the authentication feature"
barkcli ai "Create subtasks for the API redesign"
```

### AI Acceptance Criteria

Generate acceptance criteria and child tasks:

```shell
barkcli agent propose jwt-login
```

### Reporting

Generate reports from your task data:

```shell
# Weekly report
barkcli report

# Sprint burndown
barkcli report --sprint "Sprint 1"

# Auto-generate changelog from git
barkcli changelog

# Progress analytics
barkcli stats
```

### Templates

Use pre-built task templates:

```shell
# List available templates
barkcli template list

# Install a template
barkcli template install feature
barkcli template install bugfix
```

### GitHub Sync

Sync tasks with GitHub Issues:

```shell
# Push tasks to GitHub
barkcli sync --push

# Pull GitHub Issues as tasks
barkcli sync --pull
```

---

## Management Layer

barkcli includes a management layer for coding agent orchestration via MCP.

### MCP Server

Start an MCP server for coding agents:

```shell
barkcli mcp
```

This exposes 25+ tools via JSON-RPC 2.0 over stdout, including:

- `board_list`, `card_list`, `card_create`, `card_update`
- `code_search`, `callgraph_get`, `metrics_get`
- `task_create`, `task_assign`, `task_complete`
- `agent_register`, `orchestrate_next`

### Orchestration

Manage task assignment and agent coordination:

```shell
# Start orchestration loop
barkcli orchestrate start

# Run single cycle
barkcli orchestrate cycle

# Check status
barkcli orchestrate status
```

### Agent Listener

Run a listener that waits for tasks:

```shell
barkcli listener
```

---

## Secret Redaction

barkcli automatically redacts secrets from history and session logs:

- API keys (`sk-...`, `ghp_...`)
- Bearer tokens
- Database URLs
- Environment variable assignments

Redacted values are replaced with `[REDACTED]` before writing.

---

## File Structure

A typical `.board/` directory:

```
.board/
├── config.json          # Board configuration
├── main.board           # Your tasks (YAML)
├── history/
│   └── main.log         # Change history (JSONL)
├── sessions/
│   └── main.jsonl       # Agent sessions
├── snapshots/
│   ├── manual/          # Manual checkpoints
│   └── auto/            # Auto-checkpoints
├── context/
│   └── main.json        # Code context
├── sprints/
│   └── main.json        # Sprint metadata
└── .gitignore           # Ignores everything except *.board
```
