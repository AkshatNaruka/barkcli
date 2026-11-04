import type { IconName } from "../components/Icon";
import { navigate, type RouteState } from "./hashnav";

export interface ProjectTool {
  id: string;
  label: string;
  group: "Planning" | "Agent setup" | "History & maintenance";
  icon: IconName;
  destination: RouteState;
  keywords?: string;
  /** One-line description shown in the Project hub. */
  hint: string;
}

export const PROJECT_TOOLS: ProjectTool[] = [
  { id: "rules", label: "Rules", group: "Agent setup", icon: "doc", destination: { route: "operations", tool: "rules" }, hint: "Instructions injected into every agent context." },
  { id: "automations", label: "Automations", group: "History & maintenance", icon: "clock", destination: { route: "operations", tool: "automations" }, hint: "Scheduled intents and recurring runs." },
  { id: "board", label: "Board", group: "Planning", icon: "board", destination: { route: "board" }, hint: "Cards, columns, and gates." },
  { id: "sprints", label: "Sprints", group: "Planning", icon: "cycle", destination: { route: "agents", tool: "sprints" }, hint: "Cycle planning and delivery." },
  { id: "calendar", label: "Calendar", group: "Planning", icon: "calendar", destination: { route: "operations", tool: "calendar" }, hint: "Due dates and reminders." },
  { id: "reports", label: "Reports", group: "Planning", icon: "chart", destination: { route: "operations", tool: "reports" }, hint: "Velocity, burndown, and summaries." },
  { id: "agents", label: "Agents", group: "Agent setup", icon: "users", destination: { route: "agents", tool: "team" }, keywords: "team providers", hint: "Team, provider readiness, and profiles." },
  { id: "orchestra", label: "Orchestration", group: "Agent setup", icon: "pulse", destination: { route: "agents", tool: "orchestra" }, hint: "Task queue and active agent runs." },
  { id: "skills", label: "Skills", group: "Agent setup", icon: "star", destination: { route: "skills" }, hint: "Installed capabilities and bundles." },
  { id: "memory", label: "Context & memory", group: "Agent setup", icon: "db", destination: { route: "brain", tool: "memory" }, keywords: "knowledge brain", hint: "Project memories and learned facts." },
  { id: "graph", label: "Contribution graph", group: "Agent setup", icon: "spark", destination: { route: "brain", tool: "graph" }, hint: "Run ancestry and evidence links." },
  { id: "context", label: "Project context", group: "Agent setup", icon: "doc", destination: { route: "brain", tool: "context" }, hint: "The living project_context.md file." },
  { id: "workspace", label: "Project setup", group: "Agent setup", icon: "layers", destination: { route: "operations", tool: "workspace" }, hint: "Folders, Git, hooks, and detected commands." },
  { id: "history", label: "History", group: "History & maintenance", icon: "history", destination: { route: "history" }, hint: "Runs, gates, diffs, and sessions." },
  { id: "timeline", label: "Checkpoints", group: "History & maintenance", icon: "clock", destination: { route: "operations", tool: "timeline" }, keywords: "undo diff blame timeline", hint: "Undo, diffs, and restore points." },
  { id: "code", label: "Code search", group: "History & maintenance", icon: "code", destination: { route: "operations", tool: "code" }, hint: "Symbols and file references." },
  { id: "usage", label: "Usage & Limits", group: "History & maintenance", icon: "chart", destination: { route: "operations", tool: "usage" }, keywords: "tokens cost analytics models limits", hint: "Token consumption, cache savings, model breakdowns, and estimated cost." },
  { id: "agent-api", label: "Agent API", group: "Agent setup", icon: "robot", destination: { route: "operations", tool: "agent" }, keywords: "mcp instructions", hint: "Local API and MCP access." },
];

export function openProjectTool(tool: ProjectTool) {
  const { route, ...state } = tool.destination;
  navigate(route, state);
}

export interface AppCommand {
  id: string;
  label: string;
  icon: IconName;
  shortcut?: string;
  modifiers?: string;
}

export const APP_COMMANDS: AppCommand[] = [
  { id: "new-intent", label: "New thread", icon: "plus", shortcut: "n", modifiers: "mod" },
  { id: "new-chat", label: "New read-only question", icon: "comment", shortcut: "n", modifiers: "mod+shift" },
  { id: "open-project", label: "Open project", icon: "layers", shortcut: "o", modifiers: "mod" },
  { id: "quick-open", label: "Quick open file", icon: "search", shortcut: "p", modifiers: "mod" },
  { id: "command-runner", label: "Run project command", icon: "terminal", shortcut: "r", modifiers: "mod+shift" },
  { id: "command-palette", label: "Search or command", icon: "search", shortcut: "k", modifiers: "mod" },
  { id: "usage", label: "Usage & Limits", icon: "chart", shortcut: "u", modifiers: "mod" },
  { id: "settings", label: "Settings", icon: "gear", shortcut: ",", modifiers: "mod" },
  { id: "customize-sidebar", label: "Customize sidebar", icon: "sliders" },
  { id: "open-terminal", label: "Open terminal", icon: "terminal", shortcut: "t", modifiers: "mod+shift" },
  { id: "toggle-workbench", label: "Toggle surfaces", icon: "panel", shortcut: "j", modifiers: "mod" },
  { id: "toggle-sidebar", label: "Toggle sidebar", icon: "panel", shortcut: "b", modifiers: "mod+shift" },
];
export function commandForKey(event: KeyboardEvent): string | undefined {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return;
  return APP_COMMANDS.find((command) => command.shortcut === event.key.toLowerCase() &&
    Boolean(command.modifiers?.includes("shift")) === event.shiftKey)?.id;
}
