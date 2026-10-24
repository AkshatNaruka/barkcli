// Regenerates src/lib/mcp.ts from the actual MCP tool list in
// ../../barkcli-core/src/mcp.rs so the site never drifts from the binary.
// Usage: npm run gen:mcp (from landing-next/)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const mcpRs = readFileSync(join(here, "../../barkcli-core/src/mcp.rs"), "utf8");

// tools/list entries look like `"name": "tool_name"` inside handle_tools_list.
const names = [
  ...new Set(
    [...mcpRs.matchAll(/"name": "([a-z_]+)"/g)].map((m) => m[1]),
  ),
].sort();

if (names.length < 40) {
  console.error(`gen:mcp: only ${names.length} tools extracted — refusing to overwrite`);
  process.exit(1);
}

const out = `// Single source of truth for MCP tool count.
// Generated from barkcli-core/src/mcp.rs \`handle_tools_list\`.
// Run \`npm run gen:mcp\` (scripts/gen-mcp-count.mjs) to regenerate after adding tools.
//
// Do NOT hardcode counts anywhere — import MCP_TOOL_COUNT instead.

export const MCP_TOOL_COUNT = ${names.length};

export const MCP_TOOLS = [
${names.map((n) => `  "${n}",`).join("\n")}
] as const;

export const MCP_TOOL_COUNT_LABEL = \`\${MCP_TOOL_COUNT} MCP tools\`;
`;

writeFileSync(join(here, "../src/lib/mcp.ts"), out);
console.log(`gen:mcp: wrote ${names.length} tools to src/lib/mcp.ts`);
