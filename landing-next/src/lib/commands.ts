export interface Command {
  slug: string;
  name: string;
  description: string;
  category: string;
  usage: string;
  examples: string[];
  flags?: { name: string; description: string }[];
}

export const commands: Command[] = [
  {
    slug: "init",
    name: "barkcli init",
    description: "Initialize barkcli in the current project. Creates a .board directory with configuration.",
    category: "Core",
    usage: "barkcli init",
    examples: ["barkcli init"],
  },
  {
    slug: "add",
    name: "barkcli add",
    description: "Add a new task to the board with optional priority, labels, and acceptance criteria.",
    category: "Task Management",
    usage: 'barkcli add <title> [options]',
    examples: [
      'barkcli add "Fix authentication bug"',
      'barkcli add "Implement JWT login" -p high -l backend,auth',
      'barkcli add "Write documentation" --due 2024-12-15 --effort 3',
    ],
    flags: [
      { name: "-p, --priority", description: "high, medium, low" },
      { name: "-l, --label", description: "Labels (repeatable)" },
      { name: "-a, --assignee", description: "Person assigned" },
      { name: "-c, --column", description: "Target column" },
      { name: "-d, --description", description: "Task description" },
      { name: "--due", description: "Due date (YYYY-MM-DD)" },
      { name: "--effort", description: "Story points" },
      { name: "--ac", description: "Acceptance criterion (repeatable)" },
    ],
  },
  {
    slug: "list",
    name: "barkcli list",
    description: "Show all tasks grouped by column with optional filtering.",
    category: "Task Management",
    usage: "barkcli list [options]",
    examples: [
      "barkcli list",
      "barkcli list -c doing",
      "barkcli list -p high",
      "barkcli list -l backend",
    ],
    flags: [
      { name: "-c, --column", description: "Filter by column" },
      { name: "-p, --priority", description: "Filter by priority" },
      { name: "-l, --label", description: "Filter by label" },
    ],
  },
  {
    slug: "move",
    name: "barkcli move",
    description: "Move a task to a different column in the board.",
    category: "Task Management",
    usage: "barkcli move <id> <column>",
    examples: [
      "barkcli move jwt-login doing",
      "barkcli move fix-auth-bug done",
    ],
  },
  {
    slug: "done",
    name: "barkcli done",
    description: "Shortcut to move a task to the done column.",
    category: "Task Management",
    usage: "barkcli done <id>",
    examples: ["barkcli done jwt-login"],
  },
  {
    slug: "show",
    name: "barkcli show",
    description: "Display full details of a task including links, criteria, and context.",
    category: "Task Management",
    usage: "barkcli show <id>",
    examples: ["barkcli show jwt-login"],
  },
  {
    slug: "update",
    name: "barkcli update",
    description: "Update any field on an existing task.",
    category: "Task Management",
    usage: "barkcli update <id> [options]",
    examples: [
      'barkcli update jwt-login -t "New title"',
      "barkcli update jwt-login -p critical",
      "barkcli update jwt-login --due 2024-12-20",
    ],
    flags: [
      { name: "-t, --title", description: "New title" },
      { name: "-p, --priority", description: "New priority" },
      { name: "-l, --label", description: "Add labels" },
      { name: "--due", description: "Set due date" },
      { name: "--effort", description: "Set story points" },
      { name: "--rm-ac", description: "Remove acceptance criterion" },
    ],
  },
  {
    slug: "remove",
    name: "barkcli remove",
    description: "Delete a task from the board.",
    category: "Task Management",
    usage: "barkcli remove <id>",
    examples: ["barkcli remove jwt-login"],
  },
  {
    slug: "link",
    name: "barkcli link",
    description: "Create a typed link between two tasks (parent, child, related, blocked-by).",
    category: "Task Management",
    usage: "barkcli link <id> <target> --as <type>",
    examples: [
      "barkcli link jwt-login token-validation --as parent",
      "barkcli link api-tests jwt-login --as child",
      "barkcli link refactor-db api-tests --as related",
      "barkcli link deploy staging --as blocked-by",
    ],
    flags: [
      { name: "--as", description: "Link type: parent, child, related, blocked-by" },
    ],
  },
  {
    slug: "tree",
    name: "barkcli tree",
    description: "Display the parent-child hierarchy of linked tasks.",
    category: "Task Management",
    usage: "barkcli tree",
    examples: ["barkcli tree"],
  },
  {
    slug: "log",
    name: "barkcli log",
    description: "Show the history of changes to tasks.",
    category: "History",
    usage: "barkcli log [options]",
    examples: ["barkcli log", "barkcli log --limit 10"],
  },
  {
    slug: "undo",
    name: "barkcli undo",
    description: "Revert the last change made to tasks.",
    category: "History",
    usage: "barkcli undo",
    examples: ["barkcli undo"],
  },
  {
    slug: "code",
    name: "barkcli code",
    description: "Search symbols and files, then see which cards are linked.",
    category: "Code Context",
    usage: "barkcli code <query>",
    examples: [
      'barkcli code "login"',
      'barkcli code "UserService"',
      'barkcli code "src/api"',
    ],
  },
  {
    slug: "context-scan",
    name: "barkcli context scan",
    description: "Automatically map cards to code files using fuzzy title matching.",
    category: "Code Context",
    usage: "barkcli context scan",
    examples: ["barkcli context scan"],
  },
  {
    slug: "context-link",
    name: "barkcli context link",
    description: "Manually pin a file or symbol to a card.",
    category: "Code Context",
    usage: "barkcli context link <card> <path|symbol>",
    examples: [
      "barkcli context link jwt-login src/auth/login.ts",
      "barkcli context link jwt-login UserService",
    ],
  },
  {
    slug: "context-status",
    name: "barkcli context status",
    description: "Show coverage and staleness of your code context.",
    category: "Code Context",
    usage: "barkcli context status",
    examples: ["barkcli context status"],
  },
  {
    slug: "context-sync",
    name: "barkcli context sync",
    description: "Git-aware refresh of your context. Updates last commit info and dirty state.",
    category: "Code Context",
    usage: "barkcli context sync",
    examples: ["barkcli context sync"],
  },
  {
    slug: "tui",
    name: "barkcli tui",
    description: "Launch the interactive terminal UI with kanban board, list, tree, and agenda views.",
    category: "Interfaces",
    usage: "barkcli tui",
    examples: ["barkcli tui"],
  },
  {
    slug: "serve",
    name: "barkcli serve",
    description: "Launch the web-based kanban board with drag-and-drop, calendar, and reports.",
    category: "Interfaces",
    usage: "barkcli serve [options]",
    examples: [
      "barkcli serve",
      "barkcli serve --open",
      "barkcli serve --port 8080",
      "barkcli serve --board backend",
    ],
    flags: [
      { name: "--open", description: "Open in default browser" },
      { name: "--port", description: "Custom port (default: 4321)" },
      { name: "--board", description: "Specific board to serve" },
      { name: "--host", description: "Bind address (default: 127.0.0.1)" },
    ],
  },
  {
    slug: "mcp",
    name: "barkcli mcp",
    description: "Start the MCP server for coding agent integration via JSON-RPC 2.0 over stdio.",
    category: "Agent Integration",
    usage: "barkcli mcp",
    examples: ["barkcli mcp"],
  },
  {
    slug: "session-list",
    name: "barkcli session list",
    description: "Show captured agent sessions with timestamps and matched cards.",
    category: "Sessions",
    usage: "barkcli session list",
    examples: ["barkcli session list"],
  },
  {
    slug: "checkpoint-save",
    name: "barkcli checkpoint save",
    description: "Save a manual checkpoint of the current board state.",
    category: "Checkpoints",
    usage: "barkcli checkpoint save [label]",
    examples: ['barkcli checkpoint save "before refactor"'],
  },
  {
    slug: "sprint-start",
    name: "barkcli sprint start",
    description: "Start a new sprint with optional end date.",
    category: "Sprints",
    usage: "barkcli sprint start <name> [options]",
    examples: ['barkcli sprint start "Sprint 1" --ends 2024-12-31'],
    flags: [
      { name: "--ends", description: "Sprint end date (YYYY-MM-DD)" },
    ],
  },
  {
    slug: "export",
    name: "barkcli export",
    description: "Export a board to JSON or YAML format.",
    category: "Utilities",
    usage: "barkcli export [name] [format]",
    examples: [
      "barkcli export main yaml",
      "barkcli export main json",
    ],
  },
  {
    slug: "validate",
    name: "barkcli validate",
    description: "Check all task files for structural errors.",
    category: "Utilities",
    usage: "barkcli validate",
    examples: ["barkcli validate"],
  },
  {
    slug: "doctor",
    name: "barkcli doctor",
    description: "Validate and automatically fix missing fields in task files.",
    category: "Utilities",
    usage: "barkcli doctor",
    examples: ["barkcli doctor"],
  },
];

export const commandCategories = [
  "Core",
  "Task Management",
  "History",
  "Code Context",
  "Interfaces",
  "Agent Integration",
  "Sessions",
  "Checkpoints",
  "Sprints",
  "Utilities",
];

export function getCommandBySlug(slug: string): Command | undefined {
  return commands.find((c) => c.slug === slug);
}

export function getCommandsByCategory(category: string): Command[] {
  return commands.filter((c) => c.category === category);
}
