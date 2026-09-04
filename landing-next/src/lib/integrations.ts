export interface Integration {
  slug: string;
  name: string;
  description: string;
  icon: string;
  logo?: string;
  brandColor?: string;
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
    description:
      "Integrate barkcli with OpenCode via MCP so an OpenCode session can read tasks, claim work, update progress, and run orchestration cycles from inside your repo.",
    icon: "🤖",
    logo: "/logos/opencode.svg",
    brandColor: "#D99C57",
    setupSteps: [
      "Install barkcli and run `barkcli init` in your repo",
      "Add barkcli as an MCP server in your OpenCode config",
      "OpenCode reads tasks and code context via MCP tools",
      "OpenCode creates, assigns, and completes tasks",
    ],
    features: [
      "56 MCP tools — task, board, memory, specs, orchestration",
      "Agent can read full task context from the codebase",
      "Automatic task creation from prompts",
      "Code context and symbol search for the agent",
    ],
    configExample: '{\n  "mcpServers": {\n    "barkcli": {\n      "command": "barkcli",\n      "args": ["mcp"]\n    }\n  }\n}',
  },
  {
    slug: "claude-code",
    name: "Claude Code",
    description:
      "Connect barkcli to Claude Code via MCP so Claude can read your board, link tasks to code, manage memory and specs, and report progress — all with full project context.",
    icon: "🧠",
    logo: "/logos/claude-code.svg",
    brandColor: "#D97757",
    setupSteps: [
      "Install barkcli and run `barkcli init` in your repo",
      "Add barkcli as an MCP server to Claude Code settings",
      "Claude reads tasks and specs from .board/",
      "Claude creates, links, and completes tasks via MCP",
    ],
    features: [
      "Full task and spec context for Claude",
      "Automatic task creation from prompts",
      "Code context mapping and symbol search",
      "Session tracking and handoff between agents",
    ],
    configExample: '{\n  "mcpServers": {\n    "barkcli": {\n      "command": "barkcli",\n      "args": ["mcp"]\n    }\n  }\n}',
  },
  {
    slug: "cursor",
    name: "Cursor",
    description:
      "Use barkcli alongside Cursor. Tasks live in your repo and Cursor's AI gets full task context through MCP while you manage boards from the terminal.",
    icon: "📝",
    logo: "/logos/cursor.svg",
    brandColor: "#6B5CE7",
    setupSteps: [
      "Install barkcli binary and run `barkcli init`",
      "Configure barkcli as an MCP server in Cursor",
      "Tasks and specs visible to Cursor's AI",
      "Manage tasks from terminal or Cursor chat",
    ],
    features: [
      "Tasks as context for Cursor AI",
      "MCP integration in Cursor settings",
      "Code context and symbol search",
      "Works alongside Cursor's codebase indexing",
    ],
    configExample: '// .cursor/mcp.json\n{\n  "mcpServers": {\n    "barkcli": {\n      "command": "barkcli",\n      "args": ["mcp"]\n    }\n  }\n}',
  },
];

export function getIntegrationBySlug(slug: string): Integration | undefined {
  return integrations.find((i) => i.slug === slug);
}
