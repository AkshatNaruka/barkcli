export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
  builtin?: boolean;
}

export interface McpToolInfo {
  name: string;
  description: string;
  readOnly: boolean;
}

export const BARK_MCP_TOOLS: McpToolInfo[] = [
  { name: "bark_prime", description: "Inject project context, active cards, and conventions into agent context", readOnly: true },
  { name: "bark_handoff", description: "Format current worktree state, git diff, and run summaries for handoff", readOnly: true },
  { name: "board_list", description: "List all boards, columns, and task cards in the current project", readOnly: true },
  { name: "board_read", description: "Read details, subtasks, notes, and links of a specific task card", readOnly: true },
  { name: "board_write", description: "Create or update tasks, assign agents, and transition card columns", readOnly: false },
  { name: "packet_claim", description: "Claim an unassigned card or next queued intent for execution", readOnly: false },
  { name: "session_spawn", description: "Launch an agent session in an isolated git worktree with safety checks", readOnly: false },
  { name: "receipt_check", description: "Verify cryptographically signed task verification receipts and test gates", readOnly: true },
  { name: "autopilot_status", description: "Query active autonomous agent runs, milestones, and gate verdicts", readOnly: true },
];

export const DEFAULT_MCP_SERVERS: McpServerConfig[] = [
  {
    id: "barkcli",
    name: "Bark Management Layer",
    transport: "stdio",
    command: "barkcli",
    args: ["mcp"],
    enabled: true,
    description: "Built-in Bark MCP server for intent, worktrees, boards, and receipts",
    builtin: true,
  },
  {
    id: "filesystem",
    name: "Filesystem",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    enabled: true,
    description: "Read, write, search, and manage repository files safely",
  },
  {
    id: "github",
    name: "GitHub",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    enabled: false,
    description: "Issues, pull requests, branch management, and repository searches",
  },
  {
    id: "memory",
    name: "Knowledge Graph Memory",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    enabled: true,
    description: "Persistent cross-session entity memory and relationship graphs",
  },
  {
    id: "brave-search",
    name: "Brave Web Search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
    enabled: false,
    description: "Web and documentation search for real-time external queries",
  },
];

const MCP_STORAGE_KEY = "barkcli-mcp-servers-v1";

export function loadMcpServers(): McpServerConfig[] {
  if (typeof window === "undefined") return DEFAULT_MCP_SERVERS;
  try {
    const raw = localStorage.getItem(MCP_STORAGE_KEY);
    if (!raw) return DEFAULT_MCP_SERVERS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MCP_SERVERS;
    return parsed;
  } catch {
    return DEFAULT_MCP_SERVERS;
  }
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(servers));
  } catch {}
}

export type McpClientType = "claude" | "cursor" | "opencode" | "windsurf";

export function generateClientMcpSnippet(
  client: McpClientType,
  servers: McpServerConfig[]
): string {
  const activeServers = servers.filter((s) => s.enabled);

  if (client === "claude" || client === "cursor" || client === "windsurf") {
    const mcpServers: Record<string, unknown> = {};
    for (const server of activeServers) {
      if (server.transport === "stdio") {
        mcpServers[server.id] = {
          command: server.command || "npx",
          args: server.args || [],
          ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
        };
      } else {
        mcpServers[server.id] = {
          url: server.url || "http://localhost:3000/sse",
          transport: server.transport,
        };
      }
    }
    return JSON.stringify({ mcpServers }, null, 2);
  }

  // OpenCode format (.opencode/config.json)
  const mcp = activeServers.map((s) => ({
    name: s.id,
    type: s.transport === "stdio" ? "command" : "sse",
    command: s.command || "barkcli",
    args: s.args || ["mcp"],
    ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
  }));
  return JSON.stringify({ mcp }, null, 2);
}
