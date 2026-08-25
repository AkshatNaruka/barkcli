export interface UseCase {
  slug: string;
  title: string;
  description: string;
  icon: string;
  benefits: string[];
  workflow: string[];
  commands: string[];
}

export const useCases: UseCase[] = [
  {
    slug: "solo-developer",
    title: "Solo Developers",
    description: "Manage your personal projects without SaaS subscriptions. Tasks live in your repo, version controlled with your code.",
    icon: "👤",
    benefits: [
      "No subscription fees — free forever",
      "Tasks travel with your code",
      "Works offline on planes, trains, cafes",
      "AI agents can read your task list",
    ],
    workflow: [
      "barkcli init",
      'barkcli add "Build landing page" -p high',
      'barkcli add "Write tests" -p medium',
      "barkcli move build-landing-page doing",
      "barkcli done build-landing-page",
    ],
    commands: ["init", "add", "list", "move", "done"],
  },
  {
    slug: "small-team",
    title: "Small Teams (2-10)",
    description: "Collaborate on tasks via git. No server, no admin — just push and pull.",
    icon: "👥",
    benefits: [
      "Git handles sync — no server needed",
      "Everyone sees the same board",
      "Branch-aware tasks for feature branches",
      "Code review includes task changes",
    ],
    workflow: [
      "barkcli init",
      "git add .board && git push",
      "# Team member pulls changes",
      "barkcli list  # See same board",
      "barkcli move task doing",
      "git add .board && git push",
    ],
    commands: ["init", "list", "move", "export"],
  },
  {
    slug: "ai-workflow",
    title: "AI-Assisted Development",
    description: "Give coding agents context about what to build. MCP server exposes tasks to Claude, GPT, and local models.",
    icon: "🤖",
    benefits: [
      "MCP server for agent integration",
      "Agents read tasks without API calls",
      "Automatic code context mapping",
      "Task decomposition and orchestration",
    ],
    workflow: [
      "barkcli add 'Implement auth' -p high --ac 'JWT tokens'",
      "barkcli mcp  # Start MCP server",
      "# Agent reads tasks via MCP",
      "# Agent implements code",
      "barkcli context scan  # Link code to tasks",
    ],
    commands: ["add", "mcp", "context scan", "context link"],
  },
  {
    slug: "open-source",
    title: "Open Source Maintainers",
    description: "Track issues, features, and roadmap in the repo itself. Contributors see tasks alongside code.",
    icon: "📖",
    benefits: [
      "Issues live in the repo — no GitHub Issues needed",
      "Contributors see the full picture",
      "Tasks version controlled with releases",
      "No external service dependency",
    ],
    workflow: [
      "barkcli init",
      'barkcli add "Add dark mode" -l feature -p medium',
      'barkcli add "Fix #123" -l bug -p high',
      "barkcli list  # Show roadmap",
      "# Contributor forks, sees tasks, submits PR",
    ],
    commands: ["init", "add", "list", "link"],
  },
  {
    slug: "migration-from-linear",
    title: "Migrating from Linear",
    description: "Bring your workflow to the repo. Export from Linear, import to barkcli, keep your team's process.",
    icon: "🔄",
    benefits: [
      "Keep your column structure",
      "Import existing tasks",
      "No per-seat costs",
      "Tasks travel with code",
    ],
    workflow: [
      "# Export from Linear (CSV/API)",
      "barkcli init",
      "barkcli import main tasks.yaml",
      "barkcli list  # Verify import",
      "git add .board && git push",
    ],
    commands: ["init", "import", "list", "export"],
  },
  {
    slug: "enterprise-alternative",
    title: "Jira Alternative for Dev Teams",
    description: "Replace Jira for engineering tasks. Keep Jira for non-engineering if needed.",
    icon: "🏢",
    benefits: [
      "10-second setup vs hours of Jira config",
      "No server administration",
      "Human-readable YAML, not Jira markup",
      "AI agents access tasks directly",
    ],
    workflow: [
      "barkcli init",
      'barkcli add "Migrate auth service" -p high -a alice',
      'barkcli add "Update API docs" -p medium -a bob',
      "barkcli status  # Quick overview",
      "barkcli sprint start 'Q1 2024' --ends 2024-03-31",
    ],
    commands: ["init", "add", "status", "sprint start"],
  },
];

export function getUseCaseBySlug(slug: string): UseCase | undefined {
  return useCases.find((u) => u.slug === slug);
}
