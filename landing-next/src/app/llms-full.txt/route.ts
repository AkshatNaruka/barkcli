const llmsFull = `# barkcli — Complete Documentation

> Git-native task management for developers. Tasks are YAML files in your git repo.

barkcli is a local-first project management tool. Tasks are stored as YAML files in your repository. No cloud. No accounts. Open source. MIT licensed. Built in Rust.

---

## Getting Started

### Installation

\`\`\`bash
# macOS / Linux
curl -fsSL https://barkcli.vercel.app/install.sh | sh

# cargo
cargo install barkcli

# homebrew
brew tap AkshatNaruka/barkcli && brew install barkcli
\`\`\`

### Quick Start

\`\`\`bash
barkcli init
barkcli create my-project
barkcli add "Set up CI/CD" -p high -l devops
barkcli list
barkcli move set-up-cicd doing
barkcli serve --open
\`\`\`

> Board-agnostic by default (uses default board). Legacy per-board form
> \`barkcli <board> add/list/...\` still works.

---

## Core Concepts

### Tasks

Tasks are the fundamental unit of work. Each task has:
- **id**: Auto-generated from title (e.g., "Implement OAuth" → implement-oauth)
- **title**: Human-readable task name
- **column**: Current workflow stage (todo, doing, review, done)
- **priority**: high, medium, low
- **description**: Detailed description
- **labels**: Tags for categorization
- **assignee**: Person responsible
- **due**: Due date
- **effort**: Story points
- **checklist**: Subtasks with completion status
- **comments**: Discussion threads
- **links**: Relationships to other tasks (parent, child, related, blocked-by)

### Boards

Boards are collections of columns and cards. Each board is a separate .board YAML file.

\`\`\`bash
barkcli create my-project
barkcli boards
barkcli switch my-project
\`\`\`

Board configuration in .board/config.json:
\`\`\`json
{
  "default_board": "my-project",
  "columns": [
    { "id": "todo", "name": "Todo" },
    { "id": "doing", "name": "Doing" },
    { "id": "review", "name": "Review" },
    { "id": "done", "name": "Done" }
  ]
}
\`\`\`

### Projects

A project is any codebase with a .board/ directory.

\`\`\`bash
barkcli init  # Creates .board/ directory
\`\`\`

### Code Context

Links tasks to source code files.

\`\`\`bash
barkcli context scan
barkcli context status
barkcli context link implement-auth src/auth/handler.ts
barkcli code "AuthService"
\`\`\`

---

## Commands

### Setup
- \`barkcli init\` — Initialize .board/ directory
- \`barkcli create <name>\` — Create a board

### Task Management (board-agnostic; legacy \`barkcli <board> <cmd>\` also works)
- \`barkcli add <title>\` — Add task (-p, -l, -a, -c, -d, --due, --effort)
- \`barkcli list\` — List tasks (-c, -p, -l filters)
- \`barkcli show <id>\` — View task details
- \`barkcli move <id> <column>\` — Move task
- \`barkcli done <id>\` — Mark as done
- \`barkcli update <id>\` — Update fields
- \`barkcli remove <id>\` — Delete task

### Board Management
- \`barkcli boards\` — List boards
- \`barkcli switch <name>\` — Set default board
- \`barkcli status\` — Summary per column

### Links & Hierarchy
- \`barkcli link <id> <target> --as parent|child|related|blocked-by\`
- \`barkcli tree\` — View hierarchy

### History & Undo
- \`barkcli log\` — View history
- \`barkcli undo\` — Revert last change
- \`barkcli diff\` — Show changes
- \`barkcli blame <id>\` — Card change history

### Code Context
- \`barkcli code <query>\` — Search symbols
- \`barkcli context scan\` — Auto-map cards
- \`barkcli context status\` — Coverage
- \`barkcli context sync\` — Git refresh

### Interfaces
- \`barkcli tui\` — Terminal UI
- \`barkcli serve [--open] [--port 4321] [--board] [--host] [--token] [--daemon|--status|--stop|--kill]\` — Web server

### Management layer
- \`barkcli intake "<text>" [--feature|--bug] [--dry-run]\` — Classify intent → card + spec
- \`barkcli plan <card> [--tasks] [--auto]\` — Spec + decomposition
- \`barkcli dispatch\` — Run orchestration cycle
- \`barkcli review [--all] [--auto]\` — Validate completed work
- \`barkcli mind sync|show\` + \`barkcli overview\` — Project health
- \`barkcli skills list|show\` — BMAD skills
- \`barkcli memory add|search|list|stats\` — 4-tier memory

### Advanced
- \`barkcli session list/show/resume\` — Agent sessions
- \`barkcli checkpoint list/save/restore\` — State snapshots
- \`barkcli sprint start/end/list\` — Sprint management
- \`barkcli hooks install/status\` — Git hooks

### Pro Commands (free, included in MIT)
- \`barkcli ai "<prompt>"\` — AI task breakdown
- \`barkcli report\` — Weekly report
- \`barkcli changelog\` — Release notes
- \`barkcli stats\` — Velocity
- \`barkcli template list/install\` — Templates
- \`barkcli sync --push/--pull\` — GitHub sync

---

## Interfaces

### CLI
Full-featured command-line interface for scripts and automation.

### Terminal UI
Interactive kanban board with vim-style navigation.
\`\`\`bash
barkcli tui
\`\`\`

### Web App
Browser-based kanban with drag-and-drop.
\`\`\`bash
barkcli serve --open
\`\`\`

### VS Code Extension
Visual editor for .board files.
\`\`\`bash
barkcli vscode-install
\`\`\`

---

## API Reference

Base URL: http://localhost:4321

### Board Endpoints
- GET /api/boards — List boards
- POST /api/boards/create — Create board
- DELETE /api/boards/:name — Delete board
- GET /api/board?name= — Get board YAML
- PUT /api/board — Save board

### Task Management
- GET /api/tasks — List tasks
- POST /api/tasks — Create task
- GET /api/tasks/:id — Get task
- PUT /api/tasks/:id — Update task
- DELETE /api/tasks/:id — Delete task
- POST /api/tasks/:id/claim — Claim task
- POST /api/tasks/:id/complete — Complete task
- POST /api/tasks/:id/fail — Fail task

### Agents
- GET /api/agents — List agents
- POST /api/agents — Register agent
- GET /api/agents/:id — Get agent
- DELETE /api/agents/:id — Remove agent

### Orchestration
- POST /api/orchestrate/cycle — Run cycle
- GET /api/orchestrate/status — Status

### Memory
- GET /api/memory — List/search
- POST /api/memory — Add
- DELETE /api/memory/:id — Delete
- GET /api/memory/stats — Stats
- POST /api/memory/fact — Add fact
- GET /api/memory/facts — List facts

### Specs
- GET /api/specs — List
- POST /api/specs — Create
- GET /api/specs/:id — Get
- PUT /api/specs/:id — Update
- DELETE /api/specs/:id — Delete
- POST /api/specs/:id/requirements — Add requirement
- GET /api/specs/:id/trace — Traceability
- GET /api/specs/coverage — Coverage

### History & Checkpoints
- GET /api/history — History
- GET /api/sessions — Sessions
- GET /api/checkpoints — List checkpoints
- POST /api/checkpoints — Save checkpoint
- POST /api/checkpoints/:id/restore — Restore
- POST /api/undo — Undo
- GET /api/diff — Diff
- GET /api/blame/:card_id — Blame

### Import/Export
- GET /api/export?name=&format= — Export
- POST /api/import — Import

### Validation
- GET /api/validate — Validate boards
- POST /api/doctor — Auto-fix

### Code Context
- GET /api/context — Get context
- POST /api/context/sync — Sync
- GET /api/code?q= — Search symbols

### Other
- GET /api/config — Configuration
- WS /ws — WebSocket live reload

### Authentication
When using --token, pass via ?token= or Authorization: Bearer header.

---

## Advanced Features

### Sessions
Capture agent activity — prompts, files touched, commits.
\`\`\`bash
barkcli session list
barkcli session show <id>
\`\`\`

### Checkpoints
Save board state for recovery.
\`\`\`bash
barkcli checkpoint save "before-refactor"
barkcli checkpoint restore <id>
\`\`\`

### Sprints
Time-boxed planning with velocity tracking.
\`\`\`bash
barkcli sprint start sprint-1
barkcli sprint end
barkcli sprint list
\`\`\`

### Hooks
Git hooks for validation and session capture.
\`\`\`bash
barkcli hooks install
barkcli hooks status
\`\`\`

### MCP Server
JSON-RPC 2.0 server for AI coding agents.
\`\`\`bash
barkcli mcp
\`\`\`

Configure with Claude Code:
\`\`\`json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
\`\`\`

### AI Features (free, included in MIT)
\`\`\`bash
barkcli ai "Implement JWT auth"
barkcli agent propose <id>
barkcli agent watch
\`\`\`

---

## Guides

### Team Workflow
1. Initialize barkcli in your repo
2. Commit .board/ directory
3. Team members git pull
4. Make changes, commit, push

### Git Integration
- Pre-commit hook validates board files
- Commit-msg template: [card-id] message
- barkcli log/diff/blame for history

### CI/CD
\`\`\`yaml
# GitHub Actions
- run: cargo build --release
- run: ./target/release/barkcli validate
\`\`\`

### AI Agents
Configure MCP server for Claude Code, OpenCode, or Cursor:
\`\`\`json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
\`\`\`

---

## Configuration

### Project Config
.board/config.json:
\`\`\`json
{
  "default_board": "my-project",
  "columns": [
    { "id": "todo", "name": "Todo" },
    { "id": "doing", "name": "Doing" },
    { "id": "review", "name": "Review" },
    { "id": "done", "name": "Done" }
  ]
}
\`\`\`

### Environment Variables
- BARKCLI_BOARD — Default board name
- BARKCLI_TOKEN — API auth token
- OPENAI_API_KEY — OpenAI API key
- ANTHROPIC_API_KEY — Anthropic API key

---

## Pricing

Free and open source (MIT license). No subscriptions, no per-seat pricing.

## Source Code

- GitHub: https://github.com/AkshatNaruka/barkcli
- License: MIT
- Version: 0.3.0
`;

export async function GET() {
  return new Response(llmsFull, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
