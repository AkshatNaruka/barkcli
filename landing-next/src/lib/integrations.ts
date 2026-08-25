export interface Integration {
  slug: string;
  name: string;
  description: string;
  icon: string;
  setupSteps: string[];
  features: string[];
  configExample: string;
}

export const integrations: Integration[] = [
  {
    slug: "github",
    name: "GitHub",
    description: "Sync tasks with GitHub Issues, link PRs to tasks, and auto-close issues on merge.",
    icon: "🐙",
    setupSteps: [
      "Initialize barkcli in your repo",
      "Tasks are already in your GitHub repo as YAML files",
      "Link tasks to issues with commit messages",
      "Use barkcli sync to push tasks as GitHub Issues",
    ],
    features: [
      "Bidirectional sync with GitHub Issues",
      "PR linking to tasks",
      "Auto-close issues on merge",
      "GitHub Actions integration",
    ],
    configExample: '# .github/workflows/barkcli.yml\nname: Barkcli Sync\non:\n  push:\n    paths:\n      - ".board/**"\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: barkcli sync --push',
  },
  {
    slug: "vscode",
    name: "VS Code",
    description: "Custom editor for .board files. Visualize and manage tasks without leaving your editor.",
    icon: "💻",
    setupSteps: [
      "Open VS Code",
      "Go to Extensions (Cmd+Shift+X)",
      "Search for 'barkcli'",
      "Click Install",
    ],
    features: [
      "Custom kanban editor for .board files",
      "Drag and drop cards",
      "Inline editing",
      "Git diff support",
    ],
    configExample: '// Install via CLI\ncode --install-extension barkcli.barkcli\n\n// Or search "barkcli" in VS Code extensions',
  },
  {
    slug: "gitlab",
    name: "GitLab",
    description: "Use barkcli with GitLab repos. Tasks live in your repo, independent of the git host.",
    icon: "🦊",
    setupSteps: [
      "Initialize barkcli in your GitLab repo",
      "Commit .board directory",
      "Tasks sync via git push/pull",
      "Use CI/CD for automation",
    ],
    features: [
      "Git-host agnostic — works with any git provider",
      "CI/CD integration via .gitlab-ci.yml",
      "Merge request linking",
      "Pipeline automation",
    ],
    configExample: '# .gitlab-ci.yml\nbarkcli-sync:\n  script:\n    - barkcli sync --push\n  only:\n    changes:\n      - ".board/**"',
  },
  {
    slug: "neovim",
    name: "Neovim",
    description: "Manage tasks from Neovim with barkcli's full CLI. Terminal-native workflow.",
    icon: "🟢",
    setupSteps: [
      "Install barkcli binary",
      "Use :terminal in Neovim",
      "Run barkcli commands directly",
      "Optionally use barkcli tui in a split",
    ],
    features: [
      "Full CLI access from Neovim",
      "Terminal UI in a split window",
      "No plugin required",
      "Works with any Neovim setup",
    ],
    configExample: '" Add to your init.lua\nvim.keymap.set("n", "<leader>bl", function()\n  vim.cmd("terminal barkcli list")\nend)\n\nvim.keymap.set("n", "<leader>bt", function()\n  vim.cmd("terminal barkcli tui")\nend)',
  },
  {
    slug: "tmux",
    name: "tmux",
    description: "Run barkcli TUI in a tmux pane. Persistent task board across sessions.",
    icon: "🖥️",
    setupSteps: [
      "Start a tmux session",
      "Create a new pane for barkcli",
      "Run barkcli tui",
      "Navigate with vim keys",
    ],
    features: [
      "Persistent task board across SSH sessions",
      "Split pane alongside your code",
      "Session persistence",
      "Works over SSH",
    ],
    configExample: '# Add to .tmux.conf\nbind-key B split-window -h "barkcli tui"\nbind-key b split-window -v "barkcli list"',
  },
  {
    slug: "opencode",
    name: "OpenCode",
    description: "Integrate barkcli with OpenCode via MCP. Give your AI agent full task context.",
    icon: "🤖",
    setupSteps: [
      "Configure MCP in your OpenCode config",
      "Set barkcli as the MCP server",
      "Agent reads tasks via MCP tools",
      "Agent creates and updates tasks",
    ],
    features: [
      "25+ MCP tools for task management",
      "Agent reads task context",
      "Automatic task creation",
      "Code context integration",
    ],
    configExample: '{\n  "mcpServers": {\n    "barkcli": {\n      "command": "barkcli",\n      "args": ["mcp"]\n    }\n  }\n}',
  },
  {
    slug: "claude-code",
    name: "Claude Code",
    description: "Connect barkcli to Claude Code via MCP. Give Claude full project context.",
    icon: "🧠",
    setupSteps: [
      "Add barkcli MCP server to Claude Code config",
      "Claude reads tasks from .board/",
      "Claude creates tasks via MCP",
      "Claude links code to tasks",
    ],
    features: [
      "Full task context for Claude",
      "Automatic task creation from prompts",
      "Code context mapping",
      "Session tracking",
    ],
    configExample: '{\n  "mcpServers": {\n    "barkcli": {\n      "command": "barkcli",\n      "args": ["mcp"]\n    }\n  }\n}',
  },
  {
    slug: "cursor",
    name: "Cursor",
    description: "Use barkcli alongside Cursor. Tasks in your repo, AI context via MCP.",
    icon: "📝",
    setupSteps: [
      "Install barkcli binary",
      "Configure MCP in Cursor settings",
      "Tasks visible to Cursor's AI",
      "Manage tasks from terminal or Cursor",
    ],
    features: [
      "Tasks as context for Cursor AI",
      "MCP integration",
      "Code context mapping",
      "Works alongside Cursor's codebase indexing",
    ],
    configExample: '// .cursor/mcp.json\n{\n  "mcpServers": {\n    "barkcli": {\n      "command": "barkcli",\n      "args": ["mcp"]\n    }\n  }\n}',
  },
];

export function getIntegrationBySlug(slug: string): Integration | undefined {
  return integrations.find((i) => i.slug === slug);
}
