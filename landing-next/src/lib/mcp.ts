// Single source of truth for MCP tool count.
// Generated from barkcli-core/src/mcp.rs `handle_tools_list`.
// Run `npm run gen:mcp` (scripts/gen-mcp-count.mjs) to regenerate after adding tools.
//
// Do NOT hardcode "38" anywhere — import MCP_TOOL_COUNT instead.

export const MCP_TOOL_COUNT = 51;

export const MCP_TOOLS = [
  "board_list",
  "board_get",
  "board_create",
  "card_list",
  "card_get",
  "card_create",
  "card_update",
  "card_move",
  "card_comment",
  "task_list",
  "task_get",
  "task_create",
  "task_claim",
  "task_complete",
  "task_fail",
  "agent_register",
  "agent_status",
  "agent_list",
  "context_scan",
  "context_get",
  "code_search",
  "callgraph_get",
  "metrics_get",
  "sprint_list",
  "sprint_start",
  "sprint_end",
  "orchestrate_next",
  "orchestrate_cycle",
  "memory_add",
  "memory_search",
  "memory_list",
  "agent_heartbeat",
  "mind_snapshot",
  "overview",
  "skill_list",
  "skill_get",
  "intake",
  "prime",
  "ready",
  "packet_get",
  "progress_note",
  "task_block",
  "task_unblock",
  "task_heartbeat",
  "handoff",
  "verify",
  "session_spawn",
  "session_list",
  "session_logs",
  "session_kill",
  "fleet_status",
] as const;

export const MCP_TOOL_COUNT_LABEL = `${MCP_TOOL_COUNT} MCP tools`;
