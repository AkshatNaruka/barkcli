const llmsTxt = `# barkcli

> Local-first task management for developers. Tasks are YAML files in your git repo.

Bark CLI is a git-native project management tool with CLI, Terminal UI, Web App, VS Code extension, code context analysis, and AI/MCP integrations. No cloud. No accounts. Open source. MIT licensed. Built in Rust.

## Documentation

- [Introduction](/docs)
- [Getting Started](/docs/getting-started)
- [Core Concepts](/docs/concepts)
- [Commands](/docs/commands)
- [Interfaces](/docs/interfaces)
- [Web App Guide](/docs/web-app)
- [Code Context](/docs/code-context)
- [Advanced](/docs/advanced)
- [API Reference](/docs/api-reference)

## Guides

- [Team Workflow](/guides/team-setup)
- [AI Agent Setup](/guides/ai-agent-setup)
- [CI/CD Integration](/guides/ci-cd-integration)
- [Migration from Linear](/guides/migrate-from-linear)
- [Migration from Jira](/guides/migrate-from-jira)

## Full Documentation

- [Complete documentation (LLM-optimized)](/llms-full.txt)
`;

export async function GET() {
  return new Response(llmsTxt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
