import { describe, expect, it } from "vitest";
import {
  BARK_MCP_TOOLS,
  DEFAULT_MCP_SERVERS,
  generateClientMcpSnippet,
  loadMcpServers,
  saveMcpServers,
  type McpServerConfig,
} from "./mcp";

describe("mcp utilities", () => {
  it("includes all 9 core barkcli MCP tools with descriptions", () => {
    expect(BARK_MCP_TOOLS.length).toBeGreaterThanOrEqual(9);
    const names = BARK_MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("bark_prime");
    expect(names).toContain("bark_handoff");
    expect(names).toContain("board_list");
    expect(names).toContain("board_read");
    expect(names).toContain("board_write");
    expect(names).toContain("session_spawn");
    expect(names).toContain("receipt_check");
    expect(names).toContain("packet_claim");
    expect(names).toContain("autopilot_status");
  });

  it("generates valid Claude Code JSON configuration", () => {
    const servers: McpServerConfig[] = [
      {
        id: "barkcli",
        name: "Bark",
        transport: "stdio",
        command: "barkcli",
        args: ["mcp"],
        enabled: true,
      },
      {
        id: "disabled-server",
        name: "Disabled",
        transport: "stdio",
        command: "test",
        enabled: false,
      },
    ];

    const jsonStr = generateClientMcpSnippet("claude", servers);
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toHaveProperty("mcpServers");
    expect(parsed.mcpServers).toHaveProperty("barkcli");
    expect(parsed.mcpServers.barkcli.command).toBe("barkcli");
    expect(parsed.mcpServers.barkcli.args).toEqual(["mcp"]);
    expect(parsed.mcpServers).not.toHaveProperty("disabled-server");
  });

  it("generates valid OpenCode JSON configuration", () => {
    const servers: McpServerConfig[] = [
      {
        id: "barkcli",
        name: "Bark",
        transport: "stdio",
        command: "barkcli",
        args: ["mcp"],
        enabled: true,
      },
    ];

    const jsonStr = generateClientMcpSnippet("opencode", servers);
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toHaveProperty("mcp");
    expect(parsed.mcp[0].name).toBe("barkcli");
    expect(parsed.mcp[0].command).toBe("barkcli");
  });

  it("loads default servers and persists changes", () => {
    const defaults = loadMcpServers();
    expect(defaults.length).toBeGreaterThanOrEqual(1);

    const custom: McpServerConfig[] = [
      {
        id: "custom",
        name: "Custom Server",
        transport: "stdio",
        command: "custom-cmd",
        enabled: true,
      },
    ];
    saveMcpServers(custom);
    expect(loadMcpServers()).toEqual(custom);

    // Reset back
    saveMcpServers(DEFAULT_MCP_SERVERS);
  });
});
