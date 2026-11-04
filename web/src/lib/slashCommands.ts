import type { IconName } from "../components/Icon";

export type SlashCategory = "Modes" | "Agents" | "Skills" | "Actions";

export interface SlashCommand {
  id: string;
  name: string;
  aliases?: string[];
  category: SlashCategory;
  description: string;
  syntax: string;
  icon: IconName;
  actionType: "mode" | "agent" | "skill" | "action";
  payload?: string;
  requiresPrompt?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Modes
  {
    id: "mode-build",
    name: "/build",
    category: "Modes",
    description: "Switch to Build mode: isolated worktree with test gate",
    syntax: "/build <task>",
    icon: "code",
    actionType: "mode",
    payload: "build",
    requiresPrompt: true,
  },
  {
    id: "mode-plan",
    name: "/plan",
    category: "Modes",
    description: "Switch to Plan mode: propose architecture & atomic tasks without editing files",
    syntax: "/plan <task>",
    icon: "spark",
    actionType: "mode",
    payload: "plan",
    requiresPrompt: true,
  },
  {
    id: "mode-ask",
    name: "/ask",
    category: "Modes",
    description: "Switch to Ask mode: instant read-only exploration and Q&A",
    syntax: "/ask <question>",
    icon: "comment",
    actionType: "mode",
    payload: "ask",
    requiresPrompt: true,
  },

  // Agents
  {
    id: "agent-claude",
    name: "/claude",
    aliases: ["/claude-code"],
    category: "Agents",
    description: "Switch active agent backend to Claude Code",
    syntax: "/claude [prompt]",
    icon: "robot",
    actionType: "agent",
    payload: "claude-code",
  },
  {
    id: "agent-opencode",
    name: "/opencode",
    category: "Agents",
    description: "Switch active agent backend to OpenCode",
    syntax: "/opencode [prompt]",
    icon: "robot",
    actionType: "agent",
    payload: "opencode",
  },
  {
    id: "agent-codex",
    name: "/codex",
    aliases: ["/openai"],
    category: "Agents",
    description: "Switch active agent backend to OpenAI Codex",
    syntax: "/codex [prompt]",
    icon: "robot",
    actionType: "agent",
    payload: "codex",
  },
  {
    id: "agent-picker",
    name: "/agent",
    category: "Agents",
    description: "Open agent picker to select model or provider",
    syntax: "/agent [name]",
    icon: "robot",
    actionType: "action",
    payload: "open-agent-picker",
  },

  // Skills
  {
    id: "skill-tdd",
    name: "/tdd",
    category: "Skills",
    description: "Test-Driven Development: RED failing test → GREEN implementation → REFACTOR",
    syntax: "/tdd <feature>",
    icon: "check",
    actionType: "skill",
    payload: "tdd",
    requiresPrompt: true,
  },
  {
    id: "skill-mvp",
    name: "/mvp",
    category: "Skills",
    description: "Rapid MVP delivery pattern: minimal scope, zero over-engineering",
    syntax: "/mvp <feature>",
    icon: "spark",
    actionType: "skill",
    payload: "mvp",
    requiresPrompt: true,
  },
  {
    id: "skill-review",
    name: "/review",
    category: "Skills",
    description: "Code review: inspect diff, check edge cases, and run gate tests",
    syntax: "/review",
    icon: "eye",
    actionType: "action",
    payload: "review",
  },
  {
    id: "skill-security",
    name: "/security",
    category: "Skills",
    description: "Security audit: scan for secrets, injection, and unsafe boundaries",
    syntax: "/security",
    icon: "warn",
    actionType: "skill",
    payload: "security",
    requiresPrompt: true,
  },
  {
    id: "skill-refactor",
    name: "/refactor",
    category: "Skills",
    description: "Refactoring workflow: clean architecture without breaking test gates",
    syntax: "/refactor <target>",
    icon: "cycle",
    actionType: "skill",
    payload: "refactor",
    requiresPrompt: true,
  },
  {
    id: "skill-list",
    name: "/skills",
    category: "Skills",
    description: "Open the Skills registry and active agent conventions",
    syntax: "/skills",
    icon: "star",
    actionType: "action",
    payload: "open-skills",
  },

  // Actions
  {
    id: "action-gate",
    name: "/gate",
    aliases: ["/test"],
    category: "Actions",
    description: "Run acceptance tests in current worktree (cargo test, npm test)",
    syntax: "/gate",
    icon: "check",
    actionType: "action",
    payload: "gate",
  },
  {
    id: "action-diff",
    name: "/diff",
    category: "Actions",
    description: "View Git diff across current worktree and modified files",
    syntax: "/diff",
    icon: "branch",
    actionType: "action",
    payload: "diff",
  },
  {
    id: "action-context",
    name: "/context",
    aliases: ["/digest"],
    category: "Actions",
    description: "Inspect or refresh project_context.md living context",
    syntax: "/context",
    icon: "doc",
    actionType: "action",
    payload: "context",
  },
  {
    id: "action-doctor",
    name: "/doctor",
    category: "Actions",
    description: "Validate boards and auto-fix project discrepancies",
    syntax: "/doctor",
    icon: "gear",
    actionType: "action",
    payload: "doctor",
  },
  {
    id: "action-clear",
    name: "/clear",
    category: "Actions",
    description: "Clear current prompt draft",
    syntax: "/clear",
    icon: "trash",
    actionType: "action",
    payload: "clear",
  },
  {
    id: "action-help",
    name: "/help",
    category: "Actions",
    description: "Show command reference and keyboard shortcuts",
    syntax: "/help",
    icon: "search",
    actionType: "action",
    payload: "help",
  },
];

export function matchSlashCommands(query: string): SlashCommand[] {
  const clean = query.trim().toLowerCase();
  if (!clean || clean === "/") {
    return SLASH_COMMANDS;
  }
  const token = clean.split(/\s+/)[0];
  const needle = token.startsWith("/") ? token : `/${token}`;
  const term = clean.replace(/^\//, "");

  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.name.toLowerCase().startsWith(needle)) return true;
    if (cmd.aliases?.some((a) => a.toLowerCase().startsWith(needle))) return true;
    if (cmd.description.toLowerCase().includes(term)) return true;
    return false;
  });
}
