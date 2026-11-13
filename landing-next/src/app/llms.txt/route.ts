import { MCP_TOOL_COUNT } from "@/lib/mcp";

// Required for `output: "export"` (GitHub Pages) — the handler serves static text either way.
export const dynamic = "force-static";

const llmsTxt = `# barkcli

> The management layer for AI agents — intent in, plans out, isolated git worktrees, tests as the acceptance gate, and a merge train for whatever passes. Tasks, specs, memory, skills, and agent runs live in your git repo. No cloud, no accounts, 100% open source (MIT), built in Rust.

barkcli is a local-first management layer. Humans write intent, agents propose plans and execute within isolated worktrees, and barkcli enforces the acceptance test contract before merging. Perfect for founders, developers, teams, and autonomous AI-assisted workflows.

## What Is barkcli

- **The management layer for AI agents**: Intent in, plans out, isolated worktrees, a test gate, and a merge train, all in one binary.
- **Isolated Git Worktrees**: Every agent works inside an isolated \`.worktrees/\` directory. Your working tree remains clean and untouched.
- **Acceptance Gate Contract**: "Done" strictly means the project's tests (\`cargo test\`, \`pytest\`, \`npm test\`) pass in the worktree. Crashed agents and broken code never merge.
- **Merge Train**: Passing branches merge sequentially; conflicted branches re-run solo against the updated main branch.
- **Living Context & 4-Tier Memory**: Self-healing \`project_context.md\` + cross-session gotchas, conventions, and architectural facts.
- **Deterministic Trust Layer**: \`barkcli guard\` scans for hardcoded secrets and dangerous patterns; \`barkcli receipt show\` provides cryptographic SHA-256 audit receipts.
- **Tasks are YAML files**: Plain version-controlled files (\`.board/*.board\`) in your repository — diff them, merge them, grep them, roll them back with git.
- **No cloud required**: Zero accounts, zero subscriptions, works fully offline.
- **Five interfaces over one data source**: CLI, terminal UI (TUI), web app (axum), native macOS app (Tauri), and VS Code extension.
- **${MCP_TOOL_COUNT} MCP tools**: Let AI coding agents (Claude Code, OpenCode, Cursor) read tasks, claim work, inspect memory, and update progress.

## Key Features

- **Management Layer Pipeline**: Intake → plan → dispatch → test gate → review → merge train.
- **Parallel Dispatch**: \`barkcli run "<intent>" --agents 3 --yes\` runs multiple worktree agents concurrently.
- **Living Context**: Auto-maintained repository brief, active conventions, and memory packs.
- **Mind Snapshot**: Compiled project snapshot — health, blockers, stale work, next actions.
- **Skills Registry**: Reusable conventions versioned in your repo, injected into agent prompts.
- **Spec Traceability**: Requirements mapped directly from spec to card to code.
- **Memory Tiers**: Four-tier local memory (working, short-term, long-term gotchas, external).
- **Free Core**: MIT license, free CLI forever. Local-first.

## Quick Start

\`\`\`bash
# 1. Install (macOS / Linux)
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/main/install.sh | sh

# 2. Initialize and prime living context
barkcli init
barkcli context prime

# 3. Autonomous run with parallel worktrees and test gates
barkcli run "Add JWT authentication with rate limiting" --agents 3 --yes

# 4. Interactive interfaces
barkcli serve --open    # Browser app with live WebSocket updates
barkcli tui             # Terminal UI (ratatui)
\`\`\`

Homebrew: \`brew tap AkshatNaruka/barkcli && brew install barkcli\`
Cargo: \`cargo install barkcli\`

## Documentation

- [Getting Started](/docs/getting-started) — Install and first task
- [Core Concepts](/docs/concepts) — Tasks, boards, projects, code context
- [Commands](/docs/commands) — Complete CLI reference
- [Interfaces](/docs/interfaces) — CLI, TUI, Web App, VS Code
- [Web App Guide](/docs/web-app) — Browser interface
- [Code Context](/docs/code-context) — Link code to tasks
- [API Reference](/docs/api-reference) — REST API
- [Advanced](/docs/advanced) — Sessions, checkpoints, sprints, hooks
- [Autopilot](/docs/autopilot) — The intent → approve → merge loop

## Guides

- [Team Workflow](/guides/team-setup) — Git-based collaboration
- [AI Agent Setup](/guides/ai-agent-setup) — MCP server configuration
- [CI/CD Integration](/guides/ci-cd-integration) — GitHub Actions, GitLab CI
- [Migration from Linear](/guides/migrate-from-linear)
- [Migration from Jira](/guides/migrate-from-jira)
- [Multi-Board Workflow](/guides/multi-board)

## Comparisons

- [barkcli vs Linear](/compare/linear)
- [barkcli vs Jira](/compare/jira)
- [barkcli vs GitHub Projects](/compare/github-projects)
- [barkcli vs Trello](/compare/trello)
- [barkcli vs Notion](/compare/notion) (and more)

## Pricing

The CLI is free and open source (MIT) — free forever. A hosted team layer (multiplayer sessions, cloud sync, reliability analytics) is planned at $99/month per team, flat. See [pricing details](/pricing.md).

## Source Code

- GitHub: https://github.com/AkshatNaruka/barkcli
- Issues: https://github.com/AkshatNaruka/barkcli/issues
- License: MIT
- Version: 0.4.0

## Full Documentation

- [Complete documentation](/llms-full.txt) — All pages in markdown
`;

export async function GET() {
  return new Response(llmsTxt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
