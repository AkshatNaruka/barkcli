# barkcli Management Layer - Implementation Summary

## Overview

The barkcli management layer is now complete with an MCP (Model Context Protocol) server that allows coding agents to easily interact with the task management system. This creates a two-layer architecture:

1. **Management Layer** (barkcli): Handles task decomposition, sprint planning, board management, and code context
2. **Coding Layer** (opencode, claude-code, etc.): Writes code, runs tests, and reports progress

## What Was Built

### Phase 1: Semantic Code Analysis
- **Call Graph Builder** (`barkcli-core/src/code/callgraph.rs`): Maps function calls across files, supports impact analysis
- **Test Coverage Mapping** (`barkcli-core/src/code/tests.rs`): Identifies which tests cover which production code
- **Complexity Metrics** (`barkcli-core/src/code/metrics.rs`): Computes cyclomatic/cognitive complexity and risk scores
- **Extended Context Sidecar** (`barkcli-core/src/models/context.rs`): Rich context with call graphs, test coverage, and complexity

### Phase 2: Agent Core
- **Agent Roles** (`barkcli-core/src/agent/roles.rs`): 4 roles with system prompts:
  - Tech Lead: Code review, architecture, technical debt
  - Scrum Master: Sprint planning, standups, retrospectives
  - Product Owner: Backlog prioritization, user stories
  - Project Manager: Timeline, resources, risk assessment
- **Agent Identity** (`barkcli-core/src/agent/identity.rs`): Registry with status tracking and capacity management
- **Task Decomposition** (`barkcli-core/src/agent/decompose.rs`): Role-specific decomposition strategies
- **Velocity Tracker** (`barkcli-core/src/agent/capacity.rs`): Sprint velocity and capacity planning

### Phase 3: HTTP API & Communication
- **Task Queue** (`barkcli-core/src/agent/queue.rs`): Task lifecycle with retry logic
- **Extended HTTP API** (`barkcli-server/src/lib.rs`): Endpoints for tasks, agents, orchestration
- **Coding Agent Listener** (`barkcli-cli/src/listener.rs`): Polls for tasks and executes them

### Phase 4: Orchestration Engine
- **Orchestration Engine** (`barkcli-core/src/agent/orchestrate.rs`): Multi-step workflow automation

### Phase 5: MCP Server
- **MCP Server** (`barkcli-core/src/mcp.rs`): JSON-RPC 2.0 server over stdio
- **25+ Tools**: Board, card, task, agent, context, sprint, and orchestration management
- **Comprehensive Documentation** (`MCP_AGENTS.md`): Complete guide for coding agents

### Phase 6: TUI Extensions
- **Agents Tab** (`barkcli-tui/src/ui.rs`): View registered agents, their status, and capacity
- **Orchestrate Tab** (`barkcli-tui/src/ui.rs`): View task queue, run orchestration cycles, claim tasks
- **New Keyboard Handlers** (`barkcli-tui/src/handlers.rs`): Navigation and actions for new tabs
- **Extended App State** (`barkcli-tui/src/app.rs`): Agent and task queue state management

## MCP Server Tools

### Board Management
- `board_list` - List all boards
- `board_get` - Get board details
- `board_create` - Create new board
- `card_list` - List cards with filters
- `card_get` - Get card details
- `card_create` - Create new card
- `card_update` - Update card
- `card_move` - Move card to column
- `card_comment` - Add comment to card

### Task Management
- `task_list` - List tasks
- `task_get` - Get task details
- `task_create` - Create task
- `task_claim` - Claim task for agent
- `task_complete` - Mark task completed
- `task_fail` - Mark task failed

### Agent Management
- `agent_register` - Register as agent
- `agent_status` - Get agent status
- `agent_list` - List agents

### Code Context
- `context_scan` - Scan codebase
- `context_get` - Get card context
- `code_search` - Search symbols
- `callgraph_get` - Get call graph
- `metrics_get` - Get code metrics

### Sprint Management
- `sprint_list` - List sprints
- `sprint_start` - Start sprint
- `sprint_end` - End sprint

### Orchestration
- `orchestrate_next` - Get next task
- `orchestrate_cycle` - Run orchestration cycle

## Usage

### Start MCP Server
```bash
barkcli mcp
```

### Configure Agent (e.g., Claude Code)
Add to `.claude/settings.json`:
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

### CLI Commands
```bash
# Start coding agent listener
barkcli listener --agent-id my-agent --agent-name "My Agent" --role tech-lead

# Start orchestration
barkcli orchestrate start my-board tech-lead

# Run single cycle
barkcli orchestrate cycle my-board scrum-master

# Check status
barkcli orchestrate status my-board
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                MANAGEMENT LAYER                      │
│  barkcli (board, sprints, context, orchestration)    │
│                                                      │
│  Features:                                           │
│  - Task decomposition & prioritization               │
│  - Sprint planning & capacity management             │
│  - Codebase context (call graphs, tests, complexity) │
│  - Coding agent dispatch & monitoring                │
│  - Progress tracking & board updates                 │
│  - TUI management tabs (Agents, Orchestrate)         │
└──────────────────────┬──────────────────────────────┘
                       │ MCP (JSON-RPC 2.0)
                       │ or HTTP API
┌──────────────────────▼──────────────────────────────┐
│                CODING LAYER                          │
│  opencode / claude-code / cursor / aider             │
│                                                      │
│  Listener: polls for tasks, executes, reports back   │
└─────────────────────────────────────────────────────┘
```

## Key Features

1. **Role-Based Behavior**: Agents register with a role and behave accordingly
2. **Rich Code Context**: Call graphs, test coverage, complexity metrics
3. **Automatic Task Decomposition**: Cards are broken down into subtasks
4. **Progress Tracking**: Tasks move through lifecycle (pending → assigned → in_progress → completed)
5. **Velocity Tracking**: Sprint velocity and capacity planning
6. **MCP Standard**: Uses standard MCP protocol for easy integration
7. **TUI Management**: Visual interface for managing agents and orchestration

## Files Created/Modified

### New Files
- `barkcli-core/src/agent/mod.rs` - Agent module
- `barkcli-core/src/agent/roles.rs` - Role definitions
- `barkcli-core/src/agent/identity.rs` - Agent identity and registry
- `barkcli-core/src/agent/decompose.rs` - Task decomposition
- `barkcli-core/src/agent/capacity.rs` - Velocity tracking
- `barkcli-core/src/agent/orchestrate.rs` - Orchestration engine
- `barkcli-core/src/agent/queue.rs` - Task queue
- `barkcli-core/src/code/callgraph.rs` - Call graph builder
- `barkcli-core/src/code/tests.rs` - Test coverage mapping
- `barkcli-core/src/code/metrics.rs` - Complexity metrics
- `barkcli-core/src/mcp.rs` - MCP server
- `barkcli-cli/src/listener.rs` - Coding agent listener
- `MCP_AGENTS.md` - Agent integration guide

### Modified Files
- `barkcli-core/src/lib.rs` - Added agent and mcp modules
- `barkcli-core/src/models/mod.rs` - Added Column export
- `barkcli-core/src/models/card.rs` - Added Default impl
- `barkcli-core/src/models/context.rs` - Extended with new fields
- `barkcli-core/src/code/mod.rs` - Added new modules
- `barkcli-core/src/code/index.rs` - Added Serialize derive
- `barkcli-core/Cargo.toml` - Added uuid, similar dependencies
- `barkcli-cli/Cargo.toml` - Added clap dependency
- `barkcli-cli/src/main.rs` - Added listener and orchestrate commands
- `barkcli-server/src/lib.rs` - Added management API endpoints
- `barkcli-tui/src/app.rs` - Added Agents/Orchestrate tabs, AppMode variants, state fields
- `barkcli-tui/src/ui.rs` - Added draw_agents, draw_orchestrate functions
- `barkcli-tui/src/handlers.rs` - Added keyboard handlers for new tabs

## Next Steps

1. **Web UI Extensions**: Add Agents page, Tasks page, Orchestration dashboard
2. **Configuration**: Add more config options for agent behavior
3. **Error Handling**: Add retry logic and circuit breakers
4. **Documentation**: Expand agent integration guide with more examples

## Testing

All existing tests pass (56 unit tests + 43 integration tests). New modules include comprehensive unit tests for:
- Call graph building and impact analysis
- Test coverage mapping
- Complexity metrics calculation
- Agent role behaviors
- Task queue operations
- Velocity tracking
- TUI Agents and Orchestrate tabs
