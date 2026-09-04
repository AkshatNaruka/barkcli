// Agent-tool brand colors — one mapping shared by the web Orchestrate view,
// the landing-page hero mock, and the TUI Agents view (see barkcli-tui/src/ui.rs).
// Keep the hexes in sync across all three.
//
// Sources:
// - Claude  #D97757 terracotta (official Anthropic brand)
// - OpenCode #D99C57 gold (opencode.ai brand palette accent)
// - Cursor  #6B5CE7 violet (Cursor dev-tools palette)
// - Codex   #10A37F green (OpenAI ChatGPT green)
// - Gemini  #4285F4 blue (Google blue)
// - Human   #34D399 emerald (reviewer/human convention)

export type AgentTool = "opencode" | "claude" | "cursor" | "codex" | "gemini" | "human" | "other";

export const AGENT_TOOL_COLORS: Record<Exclude<AgentTool, "other">, string> = {
  opencode: "#D99C57",
  claude: "#D97757",
  cursor: "#6B5CE7",
  codex: "#10A37F",
  gemini: "#4285F4",
  human: "#34D399",
};

/** Detect which coding-agent tool an agent id/name belongs to. */
export function agentTool(id: string, name?: string): AgentTool {
  const hay = `${id} ${name ?? ""}`.toLowerCase();
  if (hay.includes("opencode")) return "opencode";
  if (hay.includes("claude")) return "claude";
  if (hay.includes("cursor")) return "cursor";
  if (hay.includes("codex") || hay.includes("openai")) return "codex";
  if (hay.includes("gemini")) return "gemini";
  if (hay.includes("human")) return "human";
  return "other";
}

/** Brand hex for an agent, or null when the tool is unknown (caller falls back to muted). */
export function agentColor(id: string, name?: string): string | null {
  const tool = agentTool(id, name);
  return tool === "other" ? null : AGENT_TOOL_COLORS[tool];
}
