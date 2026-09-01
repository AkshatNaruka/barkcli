const llmsTxt = `# barkcli

> Git-native task management for developers. Tasks are YAML files in your git repo.

barkcli is a local-first project management tool. Tasks are stored as YAML files in your repository. No cloud. No accounts. Open source. MIT licensed. Built in Rust.

## What It Does

barkcli gives you a kanban board that lives in your git repo. Tasks are YAML files you can diff, merge, and version control alongside your code. It includes a CLI, terminal UI, web app, VS Code extension, and MCP server for AI coding agents.

## Key Features

- **Git-native:** Tasks are YAML files committed to your repo
- **Multi-interface:** CLI, Terminal UI, Web App, VS Code
- **Code context:** Links tasks to source code files
- **AI/MCP:** Server for Claude, OpenCode, Cursor integration
- **No cloud:** Works offline, no accounts needed
- **Free:** MIT license, no subscriptions

## Quick Start

\`\`\`bash
npm install -g barkcli
barkcli init
barkcli create my-project
barkcli my-project add "Fix login bug" -p high
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
- Version: 0.2.0

## Full Documentation

- [Complete documentation](/llms-full.txt) — All pages in markdown
`;

export async function GET() {
  return new Response(llmsTxt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
