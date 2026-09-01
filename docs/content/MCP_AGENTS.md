# barkcli MCP Server - Agent Integration Guide

This document explains how coding agents (opencode, claude-code, cursor, etc.) can integrate with the barkcli management layer via the MCP (Model Context Protocol) server.

## Quick Start

### 1. Start the MCP Server

```bash
barkcli mcp
```

This starts a JSON-RPC 2.0 server over stdio that implements the MCP protocol.

### 2. Configure Your Agent

Add this to your agent's MCP configuration:

**For Claude Code** (`.claude/settings.json`):
```json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
```

**For OpenCode** (`.opencode/config.json`):
```json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
```

**For Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}
```

### 3. Register as an Agent

Once connected, register yourself as an agent:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "agent_register",
    "arguments": {
      "agent_id": "my-coding-agent",
      "name": "My Coding Agent",
      "role": "tech-lead"
    }
  }
}
```

Available roles:
- `tech-lead` - For coding agents that write code
- `scrum-master` - For agents that manage sprints and process
- `product-owner` - For agents that prioritize and define requirements
- `project-manager` - For agents that track timelines and resources

## MCP Tools Reference

### Board Management

#### `board_list`
List all boards in the project.

```json
{
  "name": "board_list",
  "arguments": {}
}
```

Response:
```json
{
  "boards": ["main", "backend", "frontend"]
}
```

#### `board_get`
Get board details including columns and cards.

```json
{
  "name": "board_get",
  "arguments": {
    "name": "main"  // optional, uses default if not provided
  }
}
```

Response:
```json
{
  "name": "main",
  "title": "Main Board",
  "description": "Project board",
  "columns": [
    {"id": "todo", "name": "Todo"},
    {"id": "doing", "name": "Doing"},
    {"id": "review", "name": "Review"},
    {"id": "done", "name": "Done"}
  ],
  "card_count": 15
}
```

#### `card_list`
List all cards on a board with optional filters.

```json
{
  "name": "card_list",
  "arguments": {
    "column": "todo",      // optional
    "priority": "high",    // optional
    "label": "frontend"    // optional
  }
}
```

Response:
```json
{
  "cards": [
    {
      "id": "jwt-login",
      "title": "JWT Login Implementation",
      "column": "todo",
      "priority": "high",
      "labels": ["auth", "backend"],
      "effort": 5,
      "due_date": "2024-02-15"
    }
  ]
}
```

#### `card_create`
Create a new card on the board.

```json
{
  "name": "card_create",
  "arguments": {
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication system",
    "column": "todo",
    "priority": "high",
    "labels": ["auth", "security"],
    "effort": 8,
    "acceptance_criteria": [
      "Users can register with email/password",
      "Users can login and receive JWT token",
      "Protected routes require valid token"
    ]
  }
}
```

Response:
```json
{
  "created": true,
  "card": {
    "id": "implement-user-authentication",
    "title": "Implement user authentication",
    "column": "todo"
  }
}
```

#### `card_move`
Move a card to a different column.

```json
{
  "name": "card_move",
  "arguments": {
    "card_id": "jwt-login",
    "column": "doing"
  }
}
```

Response:
```json
{
  "moved": true,
  "column": "doing"
}
```

### Task Management

#### `task_list`
List tasks in the queue.

```json
{
  "name": "task_list",
  "arguments": {
    "status": "pending",  // optional: pending, assigned, in_progress, completed, failed
    "agent_id": "my-agent"  // optional
  }
}
```

#### `task_create`
Create a new task (usually auto-created by orchestration).

```json
{
  "name": "task_create",
  "arguments": {
    "card_id": "jwt-login",
    "title": "Implement JWT token generation",
    "description": "Create JWT token generation and validation",
    "priority": "high",
    "acceptance_criteria": [
      "Token generation works correctly",
      "Token validation works correctly"
    ]
  }
}
```

#### `task_claim`
Claim a task for yourself.

```json
{
  "name": "task_claim",
  "arguments": {
    "task_id": "task-abc123",
    "agent_id": "my-coding-agent"
  }
}
```

#### `task_complete`
Mark a task as completed.

```json
{
  "name": "task_complete",
  "arguments": {
    "task_id": "task-abc123",
    "summary": "Implemented JWT token generation and validation",
    "files_changed": ["src/auth/jwt.rs", "src/auth/mod.rs"],
    "commit_sha": "abc123def456"
  }
}
```

#### `task_fail`
Mark a task as failed.

```json
{
  "name": "task_fail",
  "arguments": {
    "task_id": "task-abc123",
    "reason": "Missing required dependency"
  }
}
```

### Code Context

#### `context_scan`
Scan codebase and build context for cards.

```json
{
  "name": "context_scan",
  "arguments": {}
}
```

Response:
```json
{
  "scanned": true,
  "cards_with_context": 12,
  "files_indexed": 150
}
```

#### `context_get`
Get code context for a specific card.

```json
{
  "name": "context_get",
  "arguments": {
    "card_id": "jwt-login"
  }
}
```

Response:
```json
{
  "card_id": "jwt-login",
  "files": [
    {
      "path": "src/auth/jwt.rs",
      "symbols": ["generate_token", "validate_token"],
      "source": "scan",
      "status": "clean"
    }
  ],
  "sessions": [],
  "call_graph": {
    "symbol": "generate_token",
    "callers": ["src/api/login.rs"],
    "callees": ["src/config.rs"]
  },
  "test_coverage": {
    "has_tests": true,
    "test_files": ["tests/test_jwt.rs"],
    "coverage_ratio": 0.8
  },
  "complexity": {
    "cyclomatic": 5,
    "cognitive": 3,
    "risk_score": 0.2
  }
}
```

#### `code_search`
Search code symbols in the codebase.

```json
{
  "name": "code_search",
  "arguments": {
    "query": "authentication",
    "limit": 10
  }
}
```

Response:
```json
{
  "query": "authentication",
  "results": [
    {
      "path": "src/auth/mod.rs",
      "score": 8,
      "matched_symbols": ["authenticate_user", "AuthError"]
    }
  ]
}
```

#### `metrics_get`
Get code metrics for a file.

```json
{
  "name": "metrics_get",
  "arguments": {
    "file": "src/auth/jwt.rs"
  }
}
```

Response:
```json
{
  "path": "src/auth/jwt.rs",
  "lines": 150,
  "code_lines": 120,
  "functions": 8,
  "complexity": {
    "cyclomatic": 12,
    "cognitive": 8,
    "max_nesting": 3
  },
  "risk_score": 0.35
}
```

### Sprint Management

#### `sprint_start`
Start a new sprint.

```json
{
  "name": "sprint_start",
  "arguments": {
    "name": "Sprint 2024-W06",
    "end_date": "2024-02-15"
  }
}
```

#### `sprint_list`
List all sprints.

```json
{
  "name": "sprint_list",
  "arguments": {}
}
```

### Orchestration

#### `orchestrate_next`
Get the next task to work on.

```json
{
  "name": "orchestrate_next",
  "arguments": {}
}
```

Response:
```json
{
  "task": {
    "id": "task-abc123",
    "card_id": "jwt-login",
    "title": "Implement JWT token generation",
    "priority": "high",
    "acceptance_criteria": [...]
  }
}
```

#### `orchestrate_cycle`
Run an orchestration cycle (decompose, dispatch, monitor).

```json
{
  "name": "orchestrate_cycle",
  "arguments": {
    "role": "tech-lead"
  }
}
```

## Agent Workflow

### Typical Workflow for a Coding Agent

1. **Register yourself**
   ```json
   {"name": "agent_register", "arguments": {"agent_id": "opencode-1", "name": "OpenCode", "role": "tech-lead"}}
   ```

2. **Get context for current task**
   ```json
   {"name": "context_get", "arguments": {"card_id": "jwt-login"}}
   ```

3. **Search related code**
   ```json
   {"name": "code_search", "arguments": {"query": "authentication middleware"}}
   ```

4. **Claim a task**
   ```json
   {"name": "task_claim", "arguments": {"task_id": "task-abc123", "agent_id": "opencode-1"}}
   ```

5. **Move card to in-progress**
   ```json
   {"name": "card_move", "arguments": {"card_id": "jwt-login", "column": "doing"}}
   ```

6. **Do the work** (write code, run tests, etc.)

7. **Complete the task**
   ```json
   {"name": "task_complete", "arguments": {"task_id": "task-abc123", "summary": "Implemented JWT auth", "files_changed": ["src/auth.rs"], "commit_sha": "abc123"}}
   ```

8. **Move card to review/done**
   ```json
   {"name": "card_move", "arguments": {"card_id": "jwt-login", "column": "review"}}
   ```

### Adding a Comment

After completing work, add a comment to the card:

```json
{
  "name": "card_comment",
  "arguments": {
    "card_id": "jwt-login",
    "author": "opencode-1",
    "text": "Implemented JWT token generation and validation. All tests passing. Ready for review."
  }
}
```

## Available Resources

The MCP server also provides resources that can be read:

- `barkcli://boards` - List of all boards
- `barkcli://agents` - List of registered agents

## Error Handling

All errors return JSON-RPC error responses:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Card not found: invalid-card-id"
  }
}
```

Common error codes:
- `-32700` - Parse error
- `-32601` - Method not found
- `-32602` - Invalid params
- `-32000` - Server error

## Role Behaviors

When you register with a specific role, the management layer expects certain behaviors:

### Tech Lead
- Write code that meets acceptance criteria
- Follow existing code patterns and conventions
- Add tests for new functionality
- Update documentation if needed
- Review your own code before marking complete

### Scrum Master
- Plan sprints based on velocity
- Identify and remove blockers
- Facilitate daily standups
- Track team progress

### Product Owner
- Prioritize backlog items
- Write clear acceptance criteria
- Validate delivered features
- Communicate with stakeholders

### Project Manager
- Track timeline and milestones
- Manage dependencies
- Report progress
- Identify risks

## Configuration

The MCP server can be configured via environment variables:

- `BARKCLI_BOARD` - Default board name
- `BARKCLI_AGENT_ID` - Default agent ID

Or via `.board/config.json`:

```json
{
  "agent": {
    "default_role": "tech-lead",
    "max_concurrent_tasks": 3
  }
}
```

## Example: Full Integration

Here's a complete example of a coding agent workflow:

```bash
# 1. Start the MCP server
barkcli mcp

# 2. Agent registers (sent via stdin)
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agent_register","arguments":{"agent_id":"claude-1","name":"Claude Code","role":"tech-lead"}}}

# 3. Get next task
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"orchestrate_next","arguments":{}}}

# 4. Claim the task
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"task_claim","arguments":{"task_id":"task-abc","agent_id":"claude-1"}}}

# 5. Get context
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"context_get","arguments":{"card_id":"jwt-login"}}}

# 6. Search code
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"code_search","arguments":{"query":"authentication"}}}

# 7. Complete task
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"task_complete","arguments":{"task_id":"task-abc","summary":"Implemented JWT auth","files_changed":["src/auth.rs"],"commit_sha":"abc123"}}}

# 8. Move card
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"card_move","arguments":{"card_id":"jwt-login","column":"review"}}}
```

## Troubleshooting

### MCP Server won't start
- Ensure `barkcli` is in your PATH
- Check that the board is initialized (`barkcli init`)

### Tools not available
- Verify MCP configuration in your agent settings
- Restart your agent after configuration changes

### Tasks not appearing
- Ensure board has cards in "todo" column
- Run `barkcli context scan` to build context
- Check `barkcli orchestrate cycle` to create tasks

### Agent not registering
- Check the `barkcli agents list` command
- Verify `.board/agents/registry.json` exists
