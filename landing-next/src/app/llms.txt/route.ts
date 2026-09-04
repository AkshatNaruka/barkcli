const llmsTxt = `# barkcli

> The management layer between humans and AI coding agents. Tasks, specs, memory, skills, and agent runs live in your git repo. No cloud, no accounts, open source (MIT), built in Rust.

barkcli is a local-first management layer. Humans write intent, agents do work, barkcli manages the pipeline: intake, plan, dispatch, review, remember. Perfect for individual developers, teams, and AI-assisted workflows.

## What Is barkcli

- A git-native Kanban board plus AI agent orchestration, all in one binary.
- Tasks are YAML files (\`.board/*.board\`) committed to your repository — diff them, merge them, grep them, roll them back with git.
- No cloud, no accounts, no subscriptions. Works fully offline.
- Four interfaces over one data source: CLI, terminal UI (TUI), web app, and VS Code extension.
- 56 MCP tools let AI coding agents (Claude Code, OpenCode, Cursor) read tasks, claim work, and update progress.

## Key Features

- **Management layer:** Pipeline from human intent to reviewed agent output (intake → plan → dispatch → review → merge).
- **Mind:** Compiled project snapshot — health, blockers, stale work, next actions.
- **Skills:** Reusable conventions versioned in your repo, injected into agent prompts.
- **Specs:** Requirements and traceability from spec to code.
- **Memory:** Four-tier local memory; project facts persist across sessions.
- **Autopilot:** Agent-driven loop with plan and merge gates and web intent UI.
- **Git-native:** YAML task files committed to your repo; git is the sync layer.
- **Multi-interface:** CLI, Terminal UI, Web App, VS Code extension.
- **AI/MCP:** 56 tools for Claude Code, OpenCode, Cursor integration.
- **Sprints:** Start/end sprints with velocity tracking.
- **Free forever:** MIT license, no subscriptions, no per-seat pricing.

## Quick Start

\`\`\`bash
curl -fsSL https://barkcli.vercel.app/install.sh | sh
barkcli init
barkcli create my-project
barkcli add "Fix login bug" -p high
barkcli serve --open
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

Free and open source (MIT) — $0 forever. No tiers, no per-seat fees. See [pricing details](/pricing.md).

## Source Code

- GitHub: https://github.com/AkshatNaruka/barkcli
- Issues: https://github.com/AkshatNaruka/barkcli/issues
- License: MIT
- Version: 0.3.0

## Full Documentation

- [Complete documentation](/llms-full.txt) — All pages in markdown
`;

export async function GET() {
  return new Response(llmsTxt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
