const llmsTxt = `# barkcli

> The management layer between humans and AI coding agents. Tasks, specs, memory, and agent runs live in your git repo.

barkcli is a local-first management layer. Humans write intent, agents do work, barkcli manages the pipeline: intake, plan, dispatch, review, remember. No cloud. No accounts. Open source. MIT licensed. Built in Rust.

## What It Does

barkcli gives you a Mind homepage, kanban board with spec traceability, agent task queue with review gate, four-tier local memory, BMAD skills, CLI, terminal UI, web app, VS Code extension, and 56 MCP tools for AI coding agents.

## Key Features

- **Management layer:** Pipeline from human intent to reviewed agent output
- **Mind:** Compiled snapshot — health, blockers, next actions
- **Skills:** Reusable conventions versioned in your repo
- **Git-native:** Tasks are YAML files committed to your repo
- **Multi-interface:** CLI, Terminal UI, Web App, VS Code
- **AI/MCP:** 56 tools for Claude, OpenCode, Cursor integration
- **No cloud:** Works offline, no accounts needed
- **Free:** MIT license, no subscriptions

## Quick Start

\`\`\`bash
curl -fsSL https://barkcli.vercel.app/install.sh | sh
barkcli init
barkcli create my-project
barkcli add "Fix login bug" -p high
barkcli serve --open
\`\`\`

## Documentation

- [Getting Started](/docs/getting-started) — Install and first task
- [Core Concepts](/docs/concepts) — Tasks, boards, projects, code context
- [Commands](/docs/commands) — Complete CLI reference
- [Interfaces](/docs/interfaces) — CLI, TUI, Web App, VS Code
- [Web App Guide](/docs/web-app) — Browser interface
- [Code Context](/docs/code-context) — Link code to tasks
- [API Reference](/docs/api-reference) — REST API
- [Advanced](/docs/advanced) — Sessions, checkpoints, sprints, hooks

## Guides

- [Team Workflow](/guides/team-setup) — Git-based collaboration
- [AI Agent Setup](/guides/ai-agent-setup) — MCP server configuration
- [CI/CD Integration](/guides/ci-cd-integration) — GitHub Actions, GitLab CI
- [Migration from Linear](/guides/migrate-from-linear)
- [Migration from Jira](/guides/migrate-from-jira)

## Comparisons

- [barkcli vs Linear](/compare/linear)
- [barkcli vs Jira](/compare/jira)
- [barkcli vs GitHub Projects](/compare/github-projects)
- [barkcli vs Trello](/compare/trello)

## Pricing

Free and open source (MIT). See [pricing details](/pricing.md).

## Source Code

- GitHub: https://github.com/AkshatNaruka/barkcli
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
