import { useState, useCallback, useRef, useEffect } from "react";

const AGENT_PROMPT = `# AI Agent Prompt for barkcli

> Copy this entire document into your AI agent's context to teach it how to use barkcli.

---

## System Prompt

You are an AI coding agent working on a project that uses **barkcli** — a git-native project management tool. Tasks are stored as YAML files in the repository. Your job is to help manage tasks, write code, and keep the project board up to date.

---

## What is barkcli?

barkcli is a CLI tool for task tracking inside any project. Like \`.git\` but for Kanban boards.

- **No cloud** — Tasks are YAML files in \`.board/\` directory
- **No accounts** — Works offline, no sign-ups
- **Git-native** — Diff tasks like code, merge with teammates
- **AI-ready** — MCP server for agent integration

---

## Installation

\`\`\`bash
# macOS / Linux
curl -fsSL https://barkcli.vercel.app/install.sh | sh

# Homebrew
brew tap AkshatNaruka/barkcli && brew install barkcli

# Cargo
cargo install barkcli

# Windows
irm https://barkcli.vercel.app/install.ps1 | iex
\`\`\`

---

## Project Setup

When starting work on a new project, always check if barkcli is initialized:

\`\`\`bash
# Check if barkcli is initialized
ls -la .board/

# If not initialized, initialize it
barkcli init

# Create a board (optional - init creates a default)
barkcli create <board-name>
\`\`\`

---

## Core Commands Reference

### Project Commands

| Command | Description | Usage |
|---------|-------------|-------|
| \`barkcli init\` | Initialize barkcli | Creates \`.board/\` directory |
| \`barkcli create <name>\` | Create a new board | \`barkcli create backend\` |
| \`barkcli list\` / \`ls\` | List all tasks | \`barkcli list\`, \`barkcli list -c doing\` |
| \`barkcli status\` | Cross-board summary | \`barkcli status\` |
| \`barkcli validate\` | Validate board files | \`barkcli validate\` |
| \`barkcli doctor\` | Validate + auto-fix | \`barkcli doctor\` |
| \`barkcli today\` | Agenda view | \`barkcli today\` |
| \`barkcli calendar\` | Month calendar | \`barkcli calendar\` |

### Card Operations

| Command | Description | Usage |
|---------|-------------|-------|
| \`barkcli add <title>\` | Add a task | \`barkcli add "Fix bug" -p high\` |
| \`barkcli show <id>\` | Show task details | \`barkcli show fix-bug\` |
| \`barkcli move <id> <col>\` | Move task | \`barkcli move fix-bug doing\` |
| \`barkcli done <id>\` | Mark as done | \`barkcli done fix-bug\` |
| \`barkcli update <id>\` | Update task | \`barkcli update fix-bug -t "New title"\` |
| \`barkcli remove <id>\` | Delete task | \`barkcli remove fix-bug\` |
| \`barkcli comment <id> <text>\` | Add comment | \`barkcli comment fix-bug "Started work"\` |
| \`barkcli block <id> --on <id>\` | Mark blocked | \`barkcli block test --on build\` |
| \`barkcli pin <id>\` | Pin to top | \`barkcli pin fix-bug\` |
| \`barkcli unpin <id>\` | Unpin task | \`barkcli unpin fix-bug\` |

### Linking Tasks

| Command | Description | Usage |
|---------|-------------|-------|
| \`barkcli link <id> <target>\` | Link tasks | \`barkcli link child parent --as child\` |
| \`barkcli unlink <id> <target>\` | Remove link | \`barkcli unlink child parent\` |
| \`barkcli tree\` | Show hierarchy | \`barkcli tree\` |

**Link types:** \`parent\`, \`child\`, \`related\`, \`blocked-by\`

### Code Context

| Command | Description | Usage |
|---------|-------------|-------|
| \`barkcli code <query>\` | Search code | \`barkcli code "login"\` |
| \`barkcli context scan\` | Auto-map cards to code | \`barkcli context scan\` |
| \`barkcli context link <card> <path>\` | Pin file to card | \`barkcli context link fix-bug src/auth.rs\` |
| \`barkcli context status\` | Coverage report | \`barkcli context status\` |
| \`barkcli context show <card>\` | Card context | \`barkcli context show fix-bug\` |
| \`barkcli context sync\` | Git-aware refresh | \`barkcli context sync\` |

### Board Management

| Command | Description | Usage |
|---------|-------------|-------|
| \`barkcli boards\` | List all boards | \`barkcli boards\` |
| \`barkcli boards create <name>\` | Create board | \`barkcli boards create frontend\` |
| \`barkcli switch <name>\` | Set default board | \`barkcli switch backend\` |
| \`barkcli export <name>\` | Export board | \`barkcli export main yaml\` |
| \`barkcli import <name>\` | Import board | \`barkcli import backend tasks.yaml\` |

### Interfaces

| Command | Description |
|---------|-------------|
| \`barkcli tui\` | Terminal kanban board |
| \`barkcli serve\` | Web app on localhost:4321 |
| \`barkcli serve --open\` | Open in browser |

---

## Add Task Flags

| Flag | Description | Example |
|------|-------------|---------|
| \`-p, --priority\` | Priority (high/medium/low) | \`-p high\` |
| \`-l, --label\` | Labels (repeatable) | \`-l backend,auth\` |
| \`-a, --assignee\` | Assigned to | \`-a alice\` |
| \`-c, --column\` | Target column | \`-c doing\` |
| \`-d, --description\` | Description | \`-d "Add JWT auth"\` |
| \`--due\` | Due date | \`--due 2024-12-15\` |
| \`--remind\` | Reminder | \`--remind 2024-12-14T09:00\` |
| \`--effort\` | Story points | \`--effort 5\` |
| \`--area\` | Area path | \`--area backend\` |
| \`--ac\` | Acceptance criteria | \`--ac "Login works"\` |

---

## MCP Server Integration

The MCP server allows AI agents to interact with barkcli programmatically.

### Start MCP Server

\`\`\`bash
barkcli mcp
\`\`\`

### Configure in Your Agent

Add to \`.claude/settings.json\`, \`.opencode/config.json\`, or \`.cursor/mcp.json\`:

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

### MCP Tools Available

| Tool | Description |
|------|-------------|
| \`board_list\` | List all boards |
| \`board_get\` | Get board details |
| \`board_create\` | Create new board |
| \`card_list\` | List cards |
| \`card_get\` | Get card details |
| \`card_create\` | Create card |
| \`card_update\` | Update card |
| \`card_move\` | Move card |
| \`card_comment\` | Add comment |
| \`task_list\` | List tasks in queue |
| \`task_create\` | Create task |
| \`task_claim\` | Claim task |
| \`task_complete\` | Complete task |
| \`task_fail\` | Fail task |
| \`agent_register\` | Register as agent |
| \`agent_status\` | Get agent stats |
| \`context_scan\` | Scan codebase |
| \`context_get\` | Get card context |
| \`code_search\` | Search code symbols |
| \`metrics_get\` | Get code metrics |

### Agent Registration

\`\`\`json
{
  "name": "agent_register",
  "arguments": {
    "agent_id": "my-agent",
    "name": "My Agent",
    "role": "tech-lead"
  }
}
\`\`\`

**Roles:** \`tech-lead\`, \`scrum-master\`, \`product-owner\`, \`project-manager\`

---

## Agent Workflow

### Standard Workflow

1. **Check project state**
   \`\`\`bash
   barkcli status
   barkcli list -c todo
   \`\`\`

2. **Get task details**
   \`\`\`bash
   barkcli show <task-id>
   \`\`\`

3. **Get code context**
   \`\`\`bash
   barkcli context show <task-id>
   barkcli code "<relevant-code>"
   \`\`\`

4. **Move task to doing**
   \`\`\`bash
   barkcli move <task-id> doing
   \`\`\`

5. **Write code** (implement the feature/fix)

6. **Run tests**
   \`\`\`bash
   # Run project tests (framework-dependent)
   cargo test  # For Rust projects
   npm test    # For Node.js projects
   pytest      # For Python projects
   \`\`\`

7. **Update task**
   \`\`\`bash
   barkcli comment <task-id> "Implemented feature, tests passing"
   barkcli done <task-id>
   \`\`\`

8. **Sync context**
   \`\`\`bash
   barkcli context sync
   \`\`\`

---

## YAML Board Format

Board files are stored as \`*.board\` in the project root:

\`\`\`yaml
title: my-project
columns:
  - id: todo
    name: Todo
  - id: doing
    name: Doing
  - id: review
    name: Review
  - id: done
    name: Done
cards:
  - id: fix-login
    title: Fix login bug
    description: Users cannot login with email
    column: todo
    priority: high
    labels: [bug, auth]
    effort: 3
    area: backend
    assignee: alice
    due_date: "2024-12-15"
    acceptance_criteria:
      - Users can login with email
      - Error messages are clear
    links:
      - type: parent
        target: auth-system
    comments:
      - author: alice
        text: Started investigation
        at: "2024-07-30T14:00:00Z"
    created_at: "2024-07-30T07:18:05.248Z"
    updated_at: "2024-07-30T07:18:05.248Z"
\`\`\`

---

## Board Directory Structure

\`\`\`
project/
├── .board/                    # Internal metadata (gitignored)
│   ├── config.json            # Configuration
│   ├── history/               # Change logs
│   ├── sessions/              # Agent sessions
│   ├── snapshots/             # Checkpoints
│   ├── context/               # Code context
│   └── agents/                # Agent registry
│
├── *.board                    # User-facing board files (committed)
\`\`\`

---

## Best Practices for AI Agents

### Do's

- **Always check barkcli status first** before starting work
- **Read task details** before implementing (\`barkcli show <id>\`)
- **Move tasks to doing** when starting work
- **Add comments** when making progress
- **Mark tasks done** when complete
- **Sync context** after code changes
- **Use labels and priorities** to organize tasks
- **Link related tasks** to show dependencies

### Don'ts

- Don't skip task status updates
- Don't forget to run tests
- Don't leave tasks in "doing" when blocked
- Don't ignore acceptance criteria
- Don't create duplicate tasks

---

## Quick Reference Card

\`\`\`bash
# View
barkcli list                    # All tasks
barkcli list -c todo            # Todo tasks
barkcli list -p high            # High priority
barkcli show <id>               # Task details

# Add
barkcli add "Title" -p high -l bug
barkcli add "Title" --due 2024-12-15

# Update
barkcli move <id> doing
barkcli done <id>
barkcli comment <id> "Progress"
barkcli update <id> -p critical

# Context
barkcli code "search"
barkcli context scan
barkcli context show <id>

# Board
barkcli status
barkcli boards
barkcli validate
\`\`\`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| \`barkcli: command not found\` | Install barkcli (see Installation section) |
| \`No board found\` | Run \`barkcli init\` in project root |
| \`Card not found\` | Check card ID with \`barkcli list\` |
| MCP server won't start | Ensure \`barkcli\` is in PATH |
| Tasks not appearing | Run \`barkcli validate\` |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`BARKCLI_BOARD\` | Default board name |
| \`BARKCLI_AGENT_ID\` | Default agent ID |`;

export function AgentPromptView() {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select and copy from textarea
      if (textareaRef.current) {
        textareaRef.current.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, []);

  const filteredContent = searchQuery
    ? AGENT_PROMPT.split("\n")
        .filter(
          (line) =>
            line.toLowerCase().includes(searchQuery.toLowerCase()) ||
            line.startsWith("#")
        )
        .join("\n")
    : AGENT_PROMPT;

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <span className="text-accent text-sm">{"</>"}</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">AI Agent Prompt</h2>
            <p className="text-xs text-muted">Copy into your AI agent's context to teach it barkcli</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search prompt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs bg-surface border border-border rounded px-2 py-1.5 text-text placeholder-muted focus:outline-none focus:border-accent w-48"
          />
          <button
            onClick={handleCopy}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              copied
                ? "bg-success/10 border-success text-success"
                : "bg-accent text-white border-accent hover:bg-accent-hover"
            }`}
          >
            {copied ? "Copied!" : "Copy Prompt"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto">
          {/* Sections */}
          <div className="space-y-4">
            {filteredContent.split("\n\n").map((block, i) => {
              const lines = block.split("\n");
              const isHeading = lines[0]?.startsWith("#");
              const isCode = lines[0]?.startsWith("```");
              const isTable = lines.some((l) => l.startsWith("|"));

              if (isHeading) {
                return (
                  <div key={i} className="mt-6 first:mt-0">
                    {lines.map((line, j) => (
                      <div
                        key={j}
                        className={`font-mono ${
                          line.startsWith("# ")
                            ? "text-lg font-bold text-text"
                            : line.startsWith("## ")
                            ? "text-base font-semibold text-text"
                            : line.startsWith("### ")
                            ? "text-sm font-semibold text-text"
                            : "text-xs text-muted"
                        }`}
                      >
                        {line.replace(/^#+\s*/, "")}
                      </div>
                    ))}
                  </div>
                );
              }

              if (isCode) {
                return (
                  <div key={i} className="bg-surface rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
                      <span className="text-[10px] text-muted font-mono">
                        {lines[0]?.replace("```", "").trim() || "code"}
                      </span>
                    </div>
                    <pre className="p-3 overflow-x-auto text-xs font-mono text-text leading-relaxed">
                      <code>{lines.slice(1, -1).join("\n")}</code>
                    </pre>
                  </div>
                );
              }

              if (isTable) {
                const headerLine = lines.find((l) => l.startsWith("|"));
                const separatorIndex = lines.findIndex((l) => l.match(/^\|[\s-]+\|/));
                const headers = headerLine?.split("|").filter(Boolean).map((h) => h.trim()) || [];
                const rows = lines
                  .slice(separatorIndex + 1)
                  .filter((l) => l.startsWith("|"))
                  .map((l) => l.split("|").filter(Boolean).map((c) => c.trim()));

                return (
                  <div key={i} className="overflow-x-auto">
                    <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-surface">
                          {headers.map((h, hi) => (
                            <th
                              key={hi}
                              className="px-3 py-2 text-left font-semibold text-text border-b border-border"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-border/50 last:border-0">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 text-muted-strong">
                                {cell.includes("`") ? (
                                  <span className="font-mono text-accent">
                                    {cell.replace(/`/g, "")}
                                  </span>
                                ) : (
                                  cell
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              // Regular text
              return (
                <div key={i} className="text-xs text-muted-strong leading-relaxed whitespace-pre-wrap">
                  {lines.map((line, j) => {
                    if (line.startsWith("- ")) {
                      return (
                        <div key={j} className="flex gap-2 ml-2">
                          <span className="text-accent shrink-0">•</span>
                          <span>{line.slice(2)}</span>
                        </div>
                      );
                    }
                    if (line.match(/^\d+\./)) {
                      return (
                        <div key={j} className="flex gap-2 ml-2">
                          <span className="text-accent shrink-0 font-mono">
                            {line.match(/^(\d+)\./)?.[1]}.
                          </span>
                          <span>{line.replace(/^\d+\.\s*/, "")}</span>
                        </div>
                      );
                    }
                    if (line.startsWith("> ")) {
                      return (
                        <div
                          key={j}
                          className="border-l-2 border-accent pl-3 text-accent italic"
                        >
                          {line.slice(2)}
                        </div>
                      );
                    }
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return (
                        <div key={j} className="font-semibold text-text">
                          {line.replace(/\*\*/g, "")}
                        </div>
                      );
                    }
                    return <div key={j}>{line}</div>;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-surface shrink-0">
        <p className="text-[10px] text-muted text-center">
          Full documentation:{" "}
          <a
            href="https://github.com/AkshatNaruka/barkcli/tree/master/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            github.com/AkshatNaruka/barkcli/docs
          </a>
        </p>
      </div>
    </div>
  );
}
