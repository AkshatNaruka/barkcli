//! MCP (Model Context Protocol) server for the barkcli management layer.
//!
//! This module provides a JSON-RPC 2.0 server that communicates over stdio,
//! allowing coding agents to interact with the management layer.
//!
//! # MCP Protocol
//!
//! The MCP protocol uses JSON-RPC 2.0 messages:
//! - `initialize`: Server capabilities and version
//! - `tools/list`: List available tools
//! - `tools/call`: Execute a tool
//! - `resources/list`: List available resources
//! - `resources/read`: Read a resource
//!
//! # Available Tools (51)
//!
//! ## Board Management
//! - `board_list`: List all boards
//! - `board_get`: Get board details
//! - `board_create`: Create a new board
//! - `card_list`: List cards on a board
//! - `card_get`: Get card details
//! - `card_create`: Create a new card
//! - `card_update`: Update a card
//! - `card_move`: Move card to different column
//! - `card_comment`: Add comment to a card
//!
//! ## Task Management
//! - `task_list`: List tasks
//! - `task_get`: Get task details
//! - `task_create`: Create a new task
//! - `task_claim`: Claim a task for an agent
//! - `task_complete`: Mark task as completed
//! - `task_fail`: Mark task as failed
//! - `task_block` / `task_unblock` / `task_heartbeat`: Lifecycle helpers
//! - `progress_note`: Append progress note
//!
//! ## Agent Management
//! - `agent_register`: Register as an agent
//! - `agent_status`: Get agent status
//! - `agent_list`: List registered agents
//! - `agent_heartbeat`: Agent liveness ping
//!
//! ## Code Context
//! - `context_scan`: Scan codebase and build context
//! - `context_get`: Get context for a card
//! - `code_search`: Search code symbols
//! - `callgraph_get`: Get call graph for a file
//! - `metrics_get`: Get code metrics (complexity, risk)
//!
//! ## Management layer
//! - `mind_snapshot` / `overview`: Project health
//! - `skill_list` / `skill_get`: BMAD skills
//! - `intake`: Classify text → card + spec
//! - `prime` / `ready` / `packet_get` / `handoff` / `verify`: Agent handoff helpers
//! - `sprint_list` / `sprint_start` / `sprint_end`: Sprints
//! - `orchestrate_next` / `orchestrate_cycle`: Dispatch
//! - `memory_add` / `memory_search` / `memory_list`: Cross-session memory
//! - `session_spawn` / `session_list` / `session_logs` / `session_kill` / `fleet_status`: Sessions & fleet
//!
//! # Usage
//!
//! Start the MCP server with:
//! ```bash
//! barkcli mcp
//! ```
//!
//! Or configure it in your agent's MCP settings:
//! ```json
//! {
//!   "mcpServers": {
//!     "barkcli": {
//!       "command": "barkcli",
//!       "args": ["mcp"]
//!     }
//!   }
//! }
//! ```

use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::agent::{
    AgentIdentity, AgentRegistry, AgentRole, TaskQueue, TaskRequest, TaskStatus,
};
use crate::code::{CallGraph, SymbolIndex};
use crate::models::{Board, Card, Column};
use crate::storage::board_file::{list_board_files, read_board, write_board};
use crate::storage::context::read_context;

/// MCP Server version
pub const MCP_VERSION: &str = "2024-11-05";

/// MCP Server implementation
pub struct McpServer {
    board_name: Option<String>,
    agent_id: Option<String>,
}

/// JSON-RPC request
#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

/// JSON-RPC response
#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

/// JSON-RPC error
#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

impl JsonRpcError {
    fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }
}

impl McpServer {
    /// Create a new MCP server
    pub fn new() -> Self {
        Self {
            board_name: None,
            agent_id: None,
        }
    }

    /// Start the MCP server (blocks on stdio)
    pub fn run(&mut self) -> Result<()> {
        let stdin = io::stdin();
        let mut reader = stdin.lock();
        let mut stdout = io::stdout();

        let mut buffer = String::new();

        loop {
            buffer.clear();
            match reader.read_line(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(_) => {
                    let line = buffer.trim();
                    if line.is_empty() {
                        continue;
                    }

                    // Parse JSON-RPC request
                    match serde_json::from_str::<JsonRpcRequest>(line) {
                        Ok(request) => {
                            let response = self.handle_request(request);
                            let response_json = serde_json::to_string(&response)?;
                            writeln!(stdout, "{}", response_json)?;
                            stdout.flush()?;
                        }
                        Err(e) => {
                            let error = JsonRpcResponse {
                                jsonrpc: "2.0".to_string(),
                                id: None,
                                result: None,
                                error: Some(JsonRpcError::new(-32700, format!("Parse error: {}", e))),
                            };
                            let response_json = serde_json::to_string(&error)?;
                            writeln!(stdout, "{}", response_json)?;
                            stdout.flush()?;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error reading stdin: {}", e);
                    break;
                }
            }
        }

        Ok(())
    }

    /// Handle a JSON-RPC request
    fn handle_request(&mut self, request: JsonRpcRequest) -> JsonRpcResponse {
        match request.method.as_str() {
            "initialize" => self.handle_initialize(request),
            "initialized" => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: Some(serde_json::json!({})),
                error: None,
            },
            "tools/list" => self.handle_tools_list(request),
            "tools/call" => self.handle_tools_call(request),
            "resources/list" => self.handle_resources_list(request),
            "resources/read" => self.handle_resources_read(request),
            _ => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: None,
                error: Some(JsonRpcError::new(-32601, format!("Method not found: {}", request.method))),
            },
        }
    }

    /// Handle initialize request
    fn handle_initialize(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(serde_json::json!({
                "protocolVersion": MCP_VERSION,
                "capabilities": {
                    "tools": {
                        "listChanged": false
                    },
                    "resources": {
                        "subscribe": false,
                        "listChanged": false
                    }
                },
                "serverInfo": {
                    "name": "barkcli-mcp",
                    "version": "0.2.0"
                }
            })),
            error: None,
        }
    }

    /// Handle tools/list request
    fn handle_tools_list(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let tools = vec![
            // Board management tools
            serde_json::json!({
                "name": "board_list",
                "description": "List all boards in the project",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "board_get",
                "description": "Get board details including columns and cards",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Board name (optional, uses default if not provided)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "board_create",
                "description": "Create a new board with columns",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Board name"
                        },
                        "columns": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Column names (optional, defaults to ['todo', 'doing', 'review', 'done'])"
                        }
                    },
                    "required": ["name"]
                }
            }),
            serde_json::json!({
                "name": "card_list",
                "description": "List all cards on a board, optionally filtered by column or priority",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "column": {
                            "type": "string",
                            "description": "Filter by column name"
                        },
                        "priority": {
                            "type": "string",
                            "description": "Filter by priority (high, medium, low)"
                        },
                        "label": {
                            "type": "string",
                            "description": "Filter by label"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "card_get",
                "description": "Get detailed information about a specific card",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "card_id": {
                            "type": "string",
                            "description": "Card ID"
                        }
                    },
                    "required": ["card_id"]
                }
            }),
            serde_json::json!({
                "name": "card_create",
                "description": "Create a new card on the board",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "title": {
                            "type": "string",
                            "description": "Card title"
                        },
                        "description": {
                            "type": "string",
                            "description": "Card description"
                        },
                        "column": {
                            "type": "string",
                            "description": "Column to place card in (default: first column)"
                        },
                        "priority": {
                            "type": "string",
                            "description": "Priority (high, medium, low)"
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Labels for the card"
                        },
                        "effort": {
                            "type": "integer",
                            "description": "Story points / effort estimate"
                        },
                        "acceptance_criteria": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Acceptance criteria"
                        }
                    },
                    "required": ["title"]
                }
            }),
            serde_json::json!({
                "name": "card_update",
                "description": "Update an existing card",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "card_id": {
                            "type": "string",
                            "description": "Card ID"
                        },
                        "title": {
                            "type": "string",
                            "description": "New title"
                        },
                        "description": {
                            "type": "string",
                            "description": "New description"
                        },
                        "priority": {
                            "type": "string",
                            "description": "New priority"
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "New labels"
                        },
                        "effort": {
                            "type": "integer",
                            "description": "New effort estimate"
                        },
                        "acceptance_criteria": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "New acceptance criteria"
                        }
                    },
                    "required": ["card_id"]
                }
            }),
            serde_json::json!({
                "name": "card_move",
                "description": "Move a card to a different column",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "card_id": {
                            "type": "string",
                            "description": "Card ID"
                        },
                        "column": {
                            "type": "string",
                            "description": "Target column name"
                        }
                    },
                    "required": ["card_id", "column"]
                }
            }),
            serde_json::json!({
                "name": "card_comment",
                "description": "Add a comment to a card",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "card_id": {
                            "type": "string",
                            "description": "Card ID"
                        },
                        "author": {
                            "type": "string",
                            "description": "Comment author"
                        },
                        "text": {
                            "type": "string",
                            "description": "Comment text"
                        }
                    },
                    "required": ["card_id", "author", "text"]
                }
            }),
            // Task management tools
            serde_json::json!({
                "name": "task_list",
                "description": "List tasks in the queue, optionally filtered by status or agent",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "status": {
                            "type": "string",
                            "description": "Filter by status (pending, assigned, in_progress, completed, failed)"
                        },
                        "agent_id": {
                            "type": "string",
                            "description": "Filter by assigned agent"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "task_get",
                "description": "Get detailed information about a specific task",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        }
                    },
                    "required": ["task_id"]
                }
            }),
            serde_json::json!({
                "name": "task_create",
                "description": "Create a new task in the queue",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "card_id": {
                            "type": "string",
                            "description": "Associated card ID"
                        },
                        "title": {
                            "type": "string",
                            "description": "Task title"
                        },
                        "description": {
                            "type": "string",
                            "description": "Task description"
                        },
                        "priority": {
                            "type": "string",
                            "description": "Priority (high, medium, low)"
                        },
                        "acceptance_criteria": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Acceptance criteria"
                        }
                    },
                    "required": ["card_id", "title"]
                }
            }),
            serde_json::json!({
                "name": "task_claim",
                "description": "Claim a task for an agent (lease-based, idempotent per agent)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        },
                        "agent_id": {
                            "type": "string",
                            "description": "Agent ID claiming the task"
                        },
                        "session_id": {
                            "type": "string",
                            "description": "Session ID holding the lease (optional)"
                        },
                        "lease_minutes": {
                            "type": "integer",
                            "description": "Lease duration in minutes (default 30)"
                        }
                    },
                    "required": ["task_id", "agent_id"]
                }
            }),
            serde_json::json!({
                "name": "task_complete",
                "description": "Mark a task as completed",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        },
                        "summary": {
                            "type": "string",
                            "description": "Summary of work done"
                        },
                        "files_changed": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of files changed"
                        },
                        "commit_sha": {
                            "type": "string",
                            "description": "Git commit SHA"
                        }
                    },
                    "required": ["task_id"]
                }
            }),
            serde_json::json!({
                "name": "task_fail",
                "description": "Mark a task as failed",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        },
                        "reason": {
                            "type": "string",
                            "description": "Failure reason"
                        }
                    },
                    "required": ["task_id"]
                }
            }),
            // Agent management tools
            serde_json::json!({
                "name": "agent_register",
                "description": "Register as an agent with the management layer",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "agent_id": {
                            "type": "string",
                            "description": "Unique agent identifier"
                        },
                        "name": {
                            "type": "string",
                            "description": "Human-readable agent name"
                        },
                        "role": {
                            "type": "string",
                            "description": "Agent role (scrum-master, product-owner, tech-lead, project-manager)"
                        }
                    },
                    "required": ["agent_id", "name", "role"]
                }
            }),
            serde_json::json!({
                "name": "agent_status",
                "description": "Get agent status and statistics",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "agent_id": {
                            "type": "string",
                            "description": "Agent ID"
                        }
                    },
                    "required": ["agent_id"]
                }
            }),
            serde_json::json!({
                "name": "agent_list",
                "description": "List all registered agents",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }),
            // Code context tools
            serde_json::json!({
                "name": "context_scan",
                "description": "Scan codebase and build context for cards",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "context_get",
                "description": "Get code context for a specific card",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "card_id": {
                            "type": "string",
                            "description": "Card ID"
                        }
                    },
                    "required": ["card_id"]
                }
            }),
            serde_json::json!({
                "name": "code_search",
                "description": "Search code symbols in the codebase",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results (default: 10)"
                        }
                    },
                    "required": ["query"]
                }
            }),
            serde_json::json!({
                "name": "callgraph_get",
                "description": "Get call graph for a specific file",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "file": {
                            "type": "string",
                            "description": "File path"
                        }
                    },
                    "required": ["file"]
                }
            }),
            serde_json::json!({
                "name": "metrics_get",
                "description": "Get code metrics for a file",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "file": {
                            "type": "string",
                            "description": "File path"
                        }
                    },
                    "required": ["file"]
                }
            }),
            // Sprint management tools
            serde_json::json!({
                "name": "sprint_list",
                "description": "List all sprints for a board",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "sprint_start",
                "description": "Start a new sprint",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "name": {
                            "type": "string",
                            "description": "Sprint name"
                        },
                        "end_date": {
                            "type": "string",
                            "description": "End date (YYYY-MM-DD)"
                        }
                    },
                    "required": ["name"]
                }
            }),
            serde_json::json!({
                "name": "sprint_end",
                "description": "End the current sprint",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "name": {
                            "type": "string",
                            "description": "Sprint name (default: current)"
                        }
                    },
                    "required": []
                }
            }),
            // Orchestration tools
            serde_json::json!({
                "name": "orchestrate_next",
                "description": "Get the next task to work on",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "orchestrate_cycle",
                "description": "Run an orchestration cycle",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "role": {
                            "type": "string",
                            "description": "Orchestration role"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "memory_add",
                "description": "Store a memory entry for cross-session learning",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "Memory content to store"
                        },
                        "tier": {
                            "type": "string",
                            "enum": ["working", "short", "long", "external"],
                            "description": "Memory tier (default: short)"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Tags for categorization"
                        },
                        "source": {
                            "type": "string",
                            "description": "Source context (card id, session id, etc.)"
                        }
                    },
                    "required": ["content"]
                }
            }),
            serde_json::json!({
                "name": "memory_search",
                "description": "Search memories using BM25 text matching",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query"
                        },
                        "top": {
                            "type": "integer",
                            "description": "Number of results (default: 5)"
                        }
                    },
                    "required": ["query"]
                }
            }),
            serde_json::json!({
                "name": "memory_list",
                "description": "List stored memories",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "tier": {
                            "type": "string",
                            "enum": ["working", "short", "long", "external"],
                            "description": "Filter by tier"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results (default: 20)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "agent_heartbeat",
                "description": "Send a heartbeat to indicate the agent is alive",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "agent_id": {
                            "type": "string",
                            "description": "Agent ID"
                        }
                    },
                    "required": ["agent_id"]
                }
            }),
            // Mind & Skills (SPEC-004 R3)
            serde_json::json!({
                "name": "mind_snapshot",
                "description": "Get Mind snapshot (board health, blockers, stale, next actions)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "overview",
                "description": "Human narrative overview (4 panels) from Mind",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "skill_list",
                "description": "List all skills (mvp/planning/scrum-master/test)",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "skill_get",
                "description": "Get a skill by id",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Skill id"
                        }
                    },
                    "required": ["id"]
                }
            }),
            serde_json::json!({
                "name": "intake",
                "description": "Classify natural language into card + spec (offline heuristic if no LLM)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Human input text"
                        },
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "bug": {
                            "type": "boolean",
                            "description": "Force bug"
                        },
                        "feature": {
                            "type": "boolean",
                            "description": "Force feature"
                        }
                    },
                    "required": ["text"]
                }
            }),
            serde_json::json!({
                "name": "prime",
                "description": "One-shot boot context for an agent: board, next actions, memory, skills, queue, verify profile, git (<8KB)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "ready",
                "description": "Ranked runnable tasks with reasons (dependency + overlap aware)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "role": {
                            "type": "string",
                            "description": "Agent role for scoring (default scrum-master)"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max items (default 10)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "packet_get",
                "description": "Fully enriched executable packet for a task: goal, AC, files, skills, prior art, verify steps",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        }
                    },
                    "required": ["task_id"]
                }
            }),
            serde_json::json!({
                "name": "progress_note",
                "description": "Append a timestamped progress note to a task",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        },
                        "author": {
                            "type": "string",
                            "description": "Author (agent id)"
                        },
                        "text": {
                            "type": "string",
                            "description": "Note text"
                        }
                    },
                    "required": ["task_id", "author", "text"]
                }
            }),
            serde_json::json!({
                "name": "task_block",
                "description": "Park a task as blocked with a reason",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        },
                        "author": {
                            "type": "string",
                            "description": "Author (agent id)"
                        },
                        "reason": {
                            "type": "string",
                            "description": "Why blocked"
                        }
                    },
                    "required": ["task_id", "reason"]
                }
            }),
            serde_json::json!({
                "name": "task_unblock",
                "description": "Return a blocked task to pending",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        }
                    },
                    "required": ["task_id"]
                }
            }),
            serde_json::json!({
                "name": "task_heartbeat",
                "description": "Refresh the lease on a claimed task",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        },
                        "agent_id": {
                            "type": "string",
                            "description": "Agent ID holding the lease"
                        },
                        "lease_minutes": {
                            "type": "integer",
                            "description": "Lease extension in minutes (default 30)"
                        }
                    },
                    "required": ["task_id", "agent_id"]
                }
            }),
            serde_json::json!({
                "name": "handoff",
                "description": "Resume text for a task: goal, notes, blockers, transcript tail, last result",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task ID"
                        }
                    },
                    "required": ["task_id"]
                }
            }),
            serde_json::json!({
                "name": "verify",
                "description": "Run the repo verify profile (test/lint/build). Optionally inside a task worktree.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Run inside this task's worktree (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "session_spawn",
                "description": "Spawn an agent session, optionally bound to a task (acquires worktree + claims with lease + spawns backend)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "agent_id": {
                            "type": "string",
                            "description": "Agent identity for this session"
                        },
                        "backend": {
                            "type": "string",
                            "description": "opencode | claude-code | codex | human (default auto)"
                        },
                        "task_id": {
                            "type": "string",
                            "description": "Task to bind (optional)"
                        },
                        "role": {
                            "type": "string",
                            "description": "Agent role (default scrum-master)"
                        }
                    },
                    "required": ["agent_id"]
                }
            }),
            serde_json::json!({
                "name": "session_list",
                "description": "List agent sessions with liveness",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "description": "Filter by status (optional)"
                        }
                    },
                    "required": []
                }
            }),
            serde_json::json!({
                "name": "session_logs",
                "description": "Tail a session transcript",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Session ID"
                        },
                        "tail": {
                            "type": "integer",
                            "description": "Last N lines (default 50)"
                        }
                    },
                    "required": ["session_id"]
                }
            }),
            serde_json::json!({
                "name": "session_kill",
                "description": "Kill a session and release its lease back to pending",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        },
                        "session_id": {
                            "type": "string",
                            "description": "Session ID"
                        }
                    },
                    "required": ["session_id"]
                }
            }),
            serde_json::json!({
                "name": "fleet_status",
                "description": "Sessions x tasks x worktrees status for the fleet",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "board": {
                            "type": "string",
                            "description": "Board name (optional)"
                        }
                    },
                    "required": []
                }
            }),
        ];

        JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(serde_json::json!({
                "tools": tools
            })),
            error: None,
        }
    }

    /// Handle tools/call request
    fn handle_tools_call(&mut self, request: JsonRpcRequest) -> JsonRpcResponse {
        let tool_name = request.params.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let arguments = request.params.get("arguments")
            .cloned()
            .unwrap_or(serde_json::json!({}));

        let result = match tool_name {
            // Board management
            "board_list" => self.tool_board_list(),
            "board_get" => self.tool_board_get(arguments),
            "board_create" => self.tool_board_create(arguments),
            "card_list" => self.tool_card_list(arguments),
            "card_get" => self.tool_card_get(arguments),
            "card_create" => self.tool_card_create(arguments),
            "card_update" => self.tool_card_update(arguments),
            "card_move" => self.tool_card_move(arguments),
            "card_comment" => self.tool_card_comment(arguments),
            // Task management
            "task_list" => self.tool_task_list(arguments),
            "task_get" => self.tool_task_get(arguments),
            "task_create" => self.tool_task_create(arguments),
            "task_claim" => self.tool_task_claim(arguments),
            "task_complete" => self.tool_task_complete(arguments),
            "task_fail" => self.tool_task_fail(arguments),
            // Agent management
            "agent_register" => self.tool_agent_register(arguments),
            "agent_status" => self.tool_agent_status(arguments),
            "agent_list" => self.tool_agent_list(),
            // Code context
            "context_scan" => self.tool_context_scan(arguments),
            "context_get" => self.tool_context_get(arguments),
            "code_search" => self.tool_code_search(arguments),
            "callgraph_get" => self.tool_callgraph_get(arguments),
            "metrics_get" => self.tool_metrics_get(arguments),
            // Sprint management
            "sprint_list" => self.tool_sprint_list(arguments),
            "sprint_start" => self.tool_sprint_start(arguments),
            "sprint_end" => self.tool_sprint_end(arguments),
            // Orchestration
            "orchestrate_next" => self.tool_orchestrate_next(arguments),
            "orchestrate_cycle" => self.tool_orchestrate_cycle(arguments),
            // Memory
            "memory_add" => self.tool_memory_add(arguments),
            "memory_search" => self.tool_memory_search(arguments),
            "memory_list" => self.tool_memory_list(arguments),
            "agent_heartbeat" => self.tool_agent_heartbeat(arguments),
            "mind_snapshot" => self.tool_mind_snapshot(arguments),
            "overview" => self.tool_overview(arguments),
            "skill_list" => self.tool_skill_list(arguments),
            "skill_get" => self.tool_skill_get(arguments),
            "intake" => self.tool_intake(arguments),
            "prime" => self.tool_prime(arguments),
            "ready" => self.tool_ready(arguments),
            "packet_get" => self.tool_packet_get(arguments),
            "progress_note" => self.tool_progress_note(arguments),
            "task_block" => self.tool_task_block(arguments),
            "task_unblock" => self.tool_task_unblock(arguments),
            "task_heartbeat" => self.tool_task_heartbeat(arguments),
            "handoff" => self.tool_handoff(arguments),
            "verify" => self.tool_verify(arguments),
            "session_spawn" => self.tool_session_spawn(arguments),
            "session_list" => self.tool_session_list(arguments),
            "session_logs" => self.tool_session_logs(arguments),
            "session_kill" => self.tool_session_kill(arguments),
            "fleet_status" => self.tool_fleet_status(arguments),
            _ => Err(anyhow::anyhow!("Unknown tool: {}", tool_name)),
        };

        match result {
            Ok(value) => {
                let text = serde_json::to_string_pretty(&value).unwrap_or_default();
                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: Some(serde_json::json!({
                        "content": [{
                            "type": "text",
                            "text": text
                        }]
                    })),
                    error: None,
                }
            }
            Err(e) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: None,
                error: Some(JsonRpcError::new(-32000, e.to_string())),
            },
        }
    }

    /// Handle resources/list request
    fn handle_resources_list(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let resources = vec![
            serde_json::json!({
                "uri": "barkcli://boards",
                "name": "Boards",
                "description": "List of all boards in the project",
                "mimeType": "application/json"
            }),
            serde_json::json!({
                "uri": "barkcli://agents",
                "name": "Agents",
                "description": "List of registered agents",
                "mimeType": "application/json"
            }),
        ];

        JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(serde_json::json!({
                "resources": resources
            })),
            error: None,
        }
    }

    /// Handle resources/read request
    fn handle_resources_read(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let uri = request.params.get("uri")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let result = match uri {
            "barkcli://boards" => {
                let boards = list_board_files().unwrap_or_default();
                serde_json::json!({ "boards": boards })
            }
            "barkcli://agents" => {
                let registry = self.load_agent_registry().unwrap_or_default();
                serde_json::json!({ "agents": registry.agents })
            }
            _ => {
                return JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: None,
                    error: Some(JsonRpcError::new(-32602, format!("Resource not found: {}", uri))),
                };
            }
        };

        JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(serde_json::json!({
                "contents": [{
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": serde_json::to_string_pretty(&result).unwrap_or_default()
                }]
            })),
            error: None,
        }
    }

    // ── Tool Implementations ──

    fn resolve_board(&self, args: &Value) -> Result<String> {
        if let Some(name) = args.get("board").and_then(|v| v.as_str()) {
            return Ok(name.to_string());
        }
        if let Some(name) = &self.board_name {
            return Ok(name.clone());
        }
        let boards = list_board_files()?;
        boards.first().cloned().ok_or_else(|| anyhow::anyhow!("No boards found"))
    }

    fn tool_board_list(&self) -> Result<Value> {
        let boards = list_board_files()?;
        Ok(serde_json::json!({ "boards": boards }))
    }

    fn tool_board_get(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let board = read_board(&board_name)?;
        Ok(serde_json::json!({
            "name": board_name,
            "title": board.title,
            "description": board.description,
            "columns": board.columns,
            "card_count": board.cards.len()
        }))
    }

    fn tool_board_create(&self, args: Value) -> Result<Value> {
        let name = args.get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Board name required"))?;
        
        let columns: Vec<Column> = args.get("columns")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .enumerate()
                    .map(|(i, col)| Column {
                        id: col.as_str().unwrap_or(&format!("col-{}", i)).to_string(),
                        name: col.as_str().unwrap_or(&format!("Column {}", i)).to_string(),
                    })
                    .collect()
            })
            .unwrap_or_else(|| {
                vec![
                    Column { id: "todo".to_string(), name: "Todo".to_string() },
                    Column { id: "doing".to_string(), name: "Doing".to_string() },
                    Column { id: "review".to_string(), name: "Review".to_string() },
                    Column { id: "done".to_string(), name: "Done".to_string() },
                ]
            });

        let board = Board {
            title: name.to_string(),
            description: None,
            columns,
            cards: Vec::new(),
        };

        write_board(name, &board)?;
        Ok(serde_json::json!({ "created": true, "name": name }))
    }

    fn tool_card_list(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let board = read_board(&board_name)?;
        
        let mut cards: Vec<&Card> = board.cards.iter().collect();

        // Apply filters
        if let Some(column) = args.get("column").and_then(|v| v.as_str()) {
            cards.retain(|c| c.column == column);
        }
        if let Some(priority) = args.get("priority").and_then(|v| v.as_str()) {
            cards.retain(|c| c.priority == priority);
        }
        if let Some(label) = args.get("label").and_then(|v| v.as_str()) {
            cards.retain(|c| c.labels.contains(&label.to_string()));
        }

        let card_summaries: Vec<Value> = cards.iter().map(|c| {
            serde_json::json!({
                "id": c.id,
                "title": c.title,
                "column": c.column,
                "priority": c.priority,
                "labels": c.labels,
                "effort": c.effort,
                "due_date": c.due_date
            })
        }).collect();

        Ok(serde_json::json!({ "cards": card_summaries }))
    }

    fn tool_card_get(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let card_id = args.get("card_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("card_id required"))?;
        
        let board = read_board(&board_name)?;
        let card = board.cards.iter()
            .find(|c| c.id == card_id)
            .ok_or_else(|| anyhow::anyhow!("Card not found: {}", card_id))?;

        Ok(serde_json::json!({
            "id": card.id,
            "title": card.title,
            "description": card.description,
            "column": card.column,
            "priority": card.priority,
            "labels": card.labels,
            "assignee": card.assignee,
            "effort": card.effort,
            "area": card.area,
            "due_date": card.due_date,
            "remind_at": card.remind_at,
            "acceptance_criteria": card.acceptance_criteria,
            "links": card.links,
            "checklist": card.checklist,
            "comments": card.comments,
            "created_at": card.created_at,
            "updated_at": card.updated_at
        }))
    }

    fn tool_card_create(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let title = args.get("title")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("title required"))?;
        
        let mut board = read_board(&board_name)?;
        
        let column = args.get("column")
            .and_then(|v| v.as_str())
            .unwrap_or("todo")
            .to_string();
        
        let priority = args.get("priority")
            .and_then(|v| v.as_str())
            .unwrap_or("medium")
            .to_string();
        
        let labels: Vec<String> = args.get("labels")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        
        let effort = args.get("effort").and_then(|v| v.as_u64()).map(|e| e as u32);
        
        let acceptance_criteria: Vec<String> = args.get("acceptance_criteria")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        let description = args.get("description")
            .and_then(|v| v.as_str())
            .map(String::from);

        let card_id = crate::util::slug::to_slug(title);
        let mut card = Card::new(card_id, title, &column);
        card.priority = priority;
        card.labels = labels;
        card.effort = effort;
        card.acceptance_criteria = acceptance_criteria;
        card.description = description;

        board.cards.push(card.clone());
        write_board(&board_name, &board)?;

        Ok(serde_json::json!({
            "created": true,
            "card": {
                "id": card.id,
                "title": card.title,
                "column": card.column
            }
        }))
    }

    fn tool_card_update(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let card_id = args.get("card_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("card_id required"))?;
        
        let mut board = read_board(&board_name)?;
        let card = board.cards.iter_mut()
            .find(|c| c.id == card_id)
            .ok_or_else(|| anyhow::anyhow!("Card not found: {}", card_id))?;

        if let Some(title) = args.get("title").and_then(|v| v.as_str()) {
            card.title = title.to_string();
        }
        if let Some(description) = args.get("description").and_then(|v| v.as_str()) {
            card.description = Some(description.to_string());
        }
        if let Some(priority) = args.get("priority").and_then(|v| v.as_str()) {
            card.priority = priority.to_string();
        }
        if let Some(labels) = args.get("labels").and_then(|v| v.as_array()) {
            card.labels = labels.iter().filter_map(|v| v.as_str().map(String::from)).collect();
        }
        if let Some(effort) = args.get("effort").and_then(|v| v.as_u64()) {
            card.effort = Some(effort as u32);
        }
        if let Some(ac) = args.get("acceptance_criteria").and_then(|v| v.as_array()) {
            card.acceptance_criteria = ac.iter().filter_map(|v| v.as_str().map(String::from)).collect();
        }

        card.touch();
        write_board(&board_name, &board)?;

        Ok(serde_json::json!({ "updated": true }))
    }

    fn tool_card_move(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let card_id = args.get("card_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("card_id required"))?;
        let column = args.get("column")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("column required"))?;
        
        let mut board = read_board(&board_name)?;
        let card = board.cards.iter_mut()
            .find(|c| c.id == card_id)
            .ok_or_else(|| anyhow::anyhow!("Card not found: {}", card_id))?;

        card.column = column.to_string();
        card.touch();
        write_board(&board_name, &board)?;

        Ok(serde_json::json!({ "moved": true, "column": column }))
    }

    fn tool_card_comment(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let card_id = args.get("card_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("card_id required"))?;
        let author = args.get("author")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("author required"))?;
        let text = args.get("text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("text required"))?;
        
        let mut board = read_board(&board_name)?;
        let card = board.cards.iter_mut()
            .find(|c| c.id == card_id)
            .ok_or_else(|| anyhow::anyhow!("Card not found: {}", card_id))?;

        card.comments.push(crate::models::card::Comment {
            author: author.to_string(),
            text: text.to_string(),
            at: chrono::Utc::now(),
        });
        card.touch();
        write_board(&board_name, &board)?;

        Ok(serde_json::json!({ "commented": true }))
    }

    fn tool_task_list(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let tasks_path = crate::storage::board_dir::find_board_dir()?
            .join("tasks")
            .join(format!("{}.json", board_name));

        let queue = if tasks_path.exists() {
            TaskQueue::load(&tasks_path)?
        } else {
            TaskQueue::new()
        };

        let mut tasks = queue.tasks;

        // Apply filters
        if let Some(status_str) = args.get("status").and_then(|v| v.as_str()) {
            if let Ok(status) = serde_json::from_str::<TaskStatus>(&format!("\"{}\"", status_str)) {
                tasks.retain(|t| t.status == status);
            }
        }
        if let Some(agent_id) = args.get("agent_id").and_then(|v| v.as_str()) {
            tasks.retain(|t| t.assigned_agent.as_deref() == Some(agent_id));
        }

        Ok(serde_json::json!({ "tasks": tasks }))
    }

    fn tool_task_get(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        
        let tasks_path = crate::storage::board_dir::find_board_dir()?
            .join("tasks")
            .join(format!("{}.json", board_name));

        let queue = TaskQueue::load(&tasks_path)?;
        let task = queue.get(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task not found: {}", task_id))?;

        Ok(serde_json::json!(task))
    }

    fn tool_task_create(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let card_id = args.get("card_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("card_id required"))?;
        let title = args.get("title")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("title required"))?;
        
        let tasks_dir = crate::storage::board_dir::find_board_dir()?.join("tasks");
        std::fs::create_dir_all(&tasks_dir)?;
        let tasks_path = tasks_dir.join(format!("{}.json", board_name));

        let mut queue = if tasks_path.exists() {
            TaskQueue::load(&tasks_path)?
        } else {
            TaskQueue::new()
        };

        let description = args.get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let priority = args.get("priority")
            .and_then(|v| v.as_str())
            .unwrap_or("medium")
            .to_string();
        
        let acceptance_criteria: Vec<String> = args.get("acceptance_criteria")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        let task = crate::agent::queue::create_task(
            card_id,
            title,
            &description,
            acceptance_criteria,
            crate::agent::queue::populate_context_files(card_id, &board_name),
            &priority,
        );

        queue.add(task.clone());
        queue.save(&tasks_path)?;

        Ok(serde_json::json!({
            "created": true,
            "task": {
                "id": task.id,
                "title": task.title,
                "status": task.status
            }
        }))
    }

    fn tool_task_claim(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        let agent_id = args.get("agent_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("agent_id required"))?;
        let session_id = args.get("session_id").and_then(|v| v.as_str());
        let lease_minutes = args.get("lease_minutes").and_then(|v| v.as_i64()).unwrap_or(30);

        let tasks_path = crate::storage::board_dir::find_board_dir()?
            .join("tasks")
            .join(format!("{}.json", board_name));

        let mut queue = TaskQueue::load(&tasks_path)?;
        queue.claim(task_id, agent_id, session_id, lease_minutes)?;
        queue.save(&tasks_path)?;

        Ok(serde_json::json!({ "claimed": true }))
    }

    fn tool_task_complete(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        
        let tasks_path = crate::storage::board_dir::find_board_dir()?
            .join("tasks")
            .join(format!("{}.json", board_name));

        let mut queue = TaskQueue::load(&tasks_path)?;
        queue.complete(task_id)?;
        queue.save(&tasks_path)?;

        Ok(serde_json::json!({ "completed": true }))
    }

    fn tool_task_fail(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        
        let tasks_path = crate::storage::board_dir::find_board_dir()?
            .join("tasks")
            .join(format!("{}.json", board_name));

        let mut queue = TaskQueue::load(&tasks_path)?;
        queue.fail(task_id)?;
        queue.save(&tasks_path)?;

        Ok(serde_json::json!({ "failed": true }))
    }

    fn load_agent_registry(&self) -> Result<AgentRegistry> {
        let agents_path = crate::storage::board_dir::find_board_dir()?
            .join("agents")
            .join("registry.json");
        
        if agents_path.exists() {
            AgentRegistry::load(&agents_path)
        } else {
            Ok(AgentRegistry::new())
        }
    }

    fn save_agent_registry(&self, registry: &AgentRegistry) -> Result<()> {
        let agents_dir = crate::storage::board_dir::find_board_dir()?.join("agents");
        std::fs::create_dir_all(&agents_dir)?;
        let registry_path = agents_dir.join("registry.json");
        registry.save(&registry_path)?;
        Ok(())
    }

    fn tool_agent_register(&mut self, args: Value) -> Result<Value> {
        let agent_id = args.get("agent_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("agent_id required"))?;
        let name = args.get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("name required"))?;
        let role_str = args.get("role")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("role required"))?;
        
        let role = AgentRole::from_str(role_str)
            .ok_or_else(|| anyhow::anyhow!("Invalid role: {}", role_str))?;

        let mut registry = self.load_agent_registry()?;
        let agent = AgentIdentity::new(agent_id, name, role);
        registry.register(agent.clone());
        self.save_agent_registry(&registry)?;

        self.agent_id = Some(agent_id.to_string());

        Ok(serde_json::json!({
            "registered": true,
            "agent": {
                "id": agent.id,
                "name": agent.name,
                "role": agent.role
            }
        }))
    }

    fn tool_agent_status(&self, args: Value) -> Result<Value> {
        let agent_id = args.get("agent_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("agent_id required"))?;
        
        let registry = self.load_agent_registry()?;
        let agent = registry.get(agent_id)
            .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

        Ok(serde_json::json!({
            "agent": {
                "id": agent.id,
                "name": agent.name,
                "role": agent.role,
                "status": agent.status,
                "active_tasks": agent.active_tasks.len(),
                "completed_tasks": agent.completed_tasks.len(),
                "failed_tasks": agent.failed_tasks.len(),
                "success_rate": agent.success_rate()
            }
        }))
    }

    fn tool_agent_list(&self) -> Result<Value> {
        let registry = self.load_agent_registry()?;
        Ok(serde_json::json!({
            "agents": registry.agents
        }))
    }

    fn tool_context_scan(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let board = read_board(&board_name)?;
        
        // Build symbol index
        let root = crate::storage::board_dir::find_project_root()?;
        let index = SymbolIndex::build(&root);
        
        // Match cards to files
        let mut context = crate::models::BoardContext::new();
        
        for card in &board.cards {
            let matches = index.match_title(&card.title, 1, 10);
            let card_ctx = context.card_mut(&card.id);
            
            for m in matches {
                card_ctx.files.push(crate::models::FileRef {
                    path: m.path,
                    symbols: m.matched_symbols,
                    source: "scan".to_string(),
                    last_commit: None,
                    status: "unknown".to_string(),
                });
            }
        }
        
        context.rebuild_index();
        
        // Save context
        let context_path = crate::storage::context::context_path(&board_name)?;
        if let Some(parent) = context_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&context)?;
        std::fs::write(&context_path, json)?;

        Ok(serde_json::json!({
            "scanned": true,
            "cards_with_context": context.cards.len(),
            "files_indexed": index.files.len()
        }))
    }

    fn tool_context_get(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let card_id = args.get("card_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("card_id required"))?;
        
        let context = read_context(&board_name)?;
        let card_ctx = context.cards.get(card_id);

        match card_ctx {
            Some(ctx) => Ok(serde_json::json!({
                "card_id": card_id,
                "files": ctx.files,
                "sessions": ctx.sessions,
                "ai": ctx.ai,
                "call_graph": ctx.call_graph,
                "test_coverage": ctx.test_coverage,
                "complexity": ctx.complexity,
                "dependencies": ctx.dependencies,
                "risk_score": ctx.risk_score
            })),
            None => Ok(serde_json::json!({
                "card_id": card_id,
                "files": [],
                "sessions": []
            }))
        }
    }

    fn tool_code_search(&self, args: Value) -> Result<Value> {
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("query required"))?;
        let limit = args.get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(10) as usize;
        
        let root = crate::storage::board_dir::find_project_root()?;
        let index = SymbolIndex::build(&root);
        let results = index.search(query, limit);

        Ok(serde_json::json!({
            "query": query,
            "results": results
        }))
    }

    fn tool_callgraph_get(&self, args: Value) -> Result<Value> {
        let file = args.get("file")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("file required"))?;
        
        let root = crate::storage::board_dir::find_project_root()?;
        let index = SymbolIndex::build(&root);
        
        // Build call graph from index
        let files: Vec<(String, Vec<String>, Vec<String>)> = index.files.iter()
            .map(|f| (f.path.clone(), f.symbols.clone(), Vec::new()))
            .collect();
        
        let call_graph = CallGraph::build(&files);
        let summary = call_graph.summary_for_file(file);

        Ok(serde_json::json!({
            "file": file,
            "summary": summary,
            "total_edges": call_graph.edges.len()
        }))
    }

    fn tool_metrics_get(&self, args: Value) -> Result<Value> {
        let file = args.get("file")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("file required"))?;
        
        let root = crate::storage::board_dir::find_project_root()?;
        let file_path = root.join(file);
        
        let content = std::fs::read_to_string(&file_path)?;
        let metrics = crate::code::metrics::compute_metrics(file, &content);

        Ok(serde_json::json!(metrics))
    }

    fn tool_sprint_list(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let sprints = crate::storage::sprints::read_sprints(&board_name)?;
        Ok(serde_json::json!({ "sprints": sprints }))
    }

    fn tool_sprint_start(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let name = args.get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("sprint name required"))?;
        let end_date = args.get("end_date").and_then(|v| v.as_str());
        
        let mut sprints = crate::storage::sprints::read_sprints(&board_name)?;
        
        let sprint = crate::models::Sprint {
            name: name.to_string(),
            start: Some(chrono::Utc::now().format("%Y-%m-%d").to_string()),
            end: end_date.map(String::from),
            created_at: chrono::Utc::now(),
        };
        
        sprints.push(sprint);
        crate::storage::sprints::write_sprints(&board_name, &sprints)?;

        Ok(serde_json::json!({
            "started": true,
            "sprint": name
        }))
    }

    fn tool_sprint_end(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let name = args.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("current");
        
        let mut sprints = crate::storage::sprints::read_sprints(&board_name)?;
        
        // Find and remove the sprint
        if let Some(pos) = sprints.iter().position(|s| s.name == name) {
            sprints.remove(pos);
            crate::storage::sprints::write_sprints(&board_name, &sprints)?;
            Ok(serde_json::json!({ "ended": true, "sprint": name }))
        } else {
            Err(anyhow::anyhow!("Sprint not found: {}", name))
        }
    }

    fn tool_orchestrate_next(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let tasks_path = crate::storage::board_dir::find_board_dir()?
            .join("tasks")
            .join(format!("{}.json", board_name));

        let queue = if tasks_path.exists() {
            TaskQueue::load(&tasks_path)?
        } else {
            TaskQueue::new()
        };

        let task = queue.next_pending().cloned();
        Ok(serde_json::json!({ "task": task }))
    }

    fn tool_orchestrate_cycle(&mut self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let role_str = args.get("role")
            .and_then(|v| v.as_str())
            .unwrap_or("scrum-master");
        
        let role = AgentRole::from_str(role_str)
            .ok_or_else(|| anyhow::anyhow!("Invalid role: {}", role_str))?;

        let board = read_board(&board_name)?;
        let mut engine = crate::agent::OrchestrationEngine::new(&board_name, role, board)?;
        let result = engine.run_cycle()?;

        Ok(serde_json::json!({
            "cycle": result.cycle_number,
            "tasks_created": result.tasks_created,
            "tasks_dispatched": result.tasks_dispatched,
            "tasks_completed": result.tasks_completed,
            "tasks_failed": result.tasks_failed,
            "insights": result.insights
        }))
    }

    fn tool_memory_add(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let content = args.get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("content required"))?;

        let tier_str = args.get("tier").and_then(|v| v.as_str()).unwrap_or("short");
        let tier = match tier_str {
            "working" => crate::memory::MemoryTier::Working,
            "short" => crate::memory::MemoryTier::ShortTerm,
            "long" => crate::memory::MemoryTier::LongTerm,
            "external" => crate::memory::MemoryTier::External,
            _ => crate::memory::MemoryTier::ShortTerm,
        };

        let tags: Vec<String> = args.get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        let source = args.get("source").and_then(|v| v.as_str()).map(String::from);

        let mut store = crate::memory::MemoryStore::open(&board_name)?;
        let mut entry = crate::memory::MemoryEntry::new(content, tier);
        entry.tags = tags;
        entry.source = source;
        store.add(entry.clone());
        store.save()?;

        Ok(serde_json::json!({
            "id": entry.id,
            "tier": tier_str,
            "content": content
        }))
    }

    fn tool_memory_search(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let query = args.get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("query required"))?;
        let top = args.get("top").and_then(|v| v.as_u64()).unwrap_or(5) as usize;

        let store = crate::memory::MemoryStore::open(&board_name)?;
        let results = store.search(query, top);

        let items: Vec<Value> = results.iter().map(|e| {
            serde_json::json!({
                "id": e.id,
                "content": e.content,
                "tier": e.tier.display_name(),
                "tags": e.tags,
                "source": e.source,
                "created_at": e.created_at.to_rfc3339(),
            })
        }).collect();

        Ok(serde_json::json!({
            "count": items.len(),
            "results": items
        }))
    }

    fn tool_memory_list(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(20) as usize;

        let store = crate::memory::MemoryStore::open(&board_name)?;
        let entries = store.recent(limit);

        let items: Vec<Value> = entries.iter().map(|e| {
            serde_json::json!({
                "id": e.id,
                "content": e.content,
                "tier": e.tier.display_name(),
                "tags": e.tags,
                "created_at": e.created_at.to_rfc3339(),
            })
        }).collect();

        Ok(serde_json::json!({
            "count": items.len(),
            "total": store.len(),
            "memories": items
        }))
    }

    fn tool_agent_heartbeat(&self, args: Value) -> Result<Value> {
        let agent_id = args.get("agent_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("agent_id required"))?;

        let agents_path = crate::storage::board_dir::find_board_dir()?
            .join("agents")
            .join("registry.json");

        let mut registry = if agents_path.exists() {
            AgentRegistry::load(&agents_path)?
        } else {
            AgentRegistry::new()
        };

        let found = registry.get_mut(agent_id).is_some();
        if found {
            if let Some(agent) = registry.get_mut(agent_id) {
                agent.heartbeat();
            }
            registry.save(&agents_path)?;
            let agent = registry.get(agent_id).unwrap();
            Ok(serde_json::json!({
                "ok": true,
                "agent_id": agent_id,
                "last_heartbeat": agent.last_heartbeat.map(|t| t.to_rfc3339()),
            }))
        } else {
            Err(anyhow::anyhow!("Agent '{}' not found", agent_id))
        }
    }

    fn tool_mind_snapshot(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let snap = crate::mind::snapshot::build(&board_name)?;
        Ok(serde_json::to_value(&snap)?)
    }

    fn tool_overview(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let snap = crate::mind::snapshot::build(&board_name)?;
        let digest = crate::mind::digest::render(&snap);
        Ok(serde_json::json!({"board": board_name, "digest": digest, "snapshot": snap}))
    }

    fn tool_skill_list(&self, _args: Value) -> Result<Value> {
        let reg = crate::skills::SkillRegistry::load_all(None)?;
        let skills: Vec<Value> = reg
            .skills
            .iter()
            .map(|s| {
                serde_json::json!({
                    "id": s.id,
                    "name": s.name,
                    "description": s.description,
                    "triggers": s.triggers,
                    "source": s.source.to_string()
                })
            })
            .collect();
        Ok(serde_json::json!({"skills": skills}))
    }

    fn tool_skill_get(&self, args: Value) -> Result<Value> {
        let id = args
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("id required"))?;
        let reg = crate::skills::SkillRegistry::load_all(None)?;
        let s = reg
            .get(id)
            .ok_or_else(|| anyhow::anyhow!("skill '{}' not found", id))?;
        Ok(serde_json::json!({
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "triggers": s.triggers,
            "source": s.source.to_string(),
            "content": s.content
        }))
    }

    fn tool_intake(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let text = args
            .get("text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("text required"))?;
        let force_bug = args.get("bug").and_then(|v| v.as_bool()).unwrap_or(false);
        let force_feature = args.get("feature").and_then(|v| v.as_bool()).unwrap_or(false);

        // Reuse heuristic path directly (offline) — avoid LLM for MCP speed
        // We still try intake logic: create card via storage
        // Simplified: create card directly with heuristic classification
        let lower = text.to_lowercase();
        let card_type = if force_bug {
            "bug"
        } else if force_feature {
            "feature"
        } else if lower.contains("crash") || lower.contains("error") || lower.contains("bug") {
            "bug"
        } else {
            "feature"
        };

        let mut board = read_board(&board_name)?;
        let card_id = crate::util::slug::to_slug(text);
        let mut card = crate::models::card::Card::new(&card_id, text, "todo");
        card.description = Some(text.to_string());
        card.labels = vec![card_type.to_string()];
        // Set spec_id
        let spec_id = card_id.clone();
        card.spec_id = Some(spec_id.clone());
        board.cards.push(card.clone());
        write_board(&board_name, &board)?;

        // Create spec
        let mut specs = crate::storage::specs::read_specs(&board_name).unwrap_or_default();
        let spec = crate::models::spec::Spec {
            id: spec_id.clone(),
            title: format!("{}: {}", card_type, text),
            description: Some(text.to_string()),
            status: crate::models::spec::SpecStatus::Draft,
            priority: "medium".into(),
            tags: vec![],
            requirements: vec![crate::models::spec::Requirement {
                id: "req-1".into(),
                title: text.to_string(),
                description: None,
                status: crate::models::spec::RequirementStatus::Pending,
                acceptance_criteria: vec!["AC via intake mcp".into()],
                linked_code: vec![],
                linked_tests: vec![],
                linked_tasks: vec![card_id.clone()],
                stale: false,
                stale_reason: None,
                updated_at: chrono::Utc::now(),
            }],
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        specs.push(spec);
        crate::storage::specs::write_specs(&board_name, &specs).ok();

        Ok(serde_json::json!({
            "card_id": card_id,
            "title": text,
            "board": board_name,
            "spec_id": spec_id,
            "type": card_type
        }))
    }

    // ── Fleet: prime / ready / packet / notes / states / handoff / verify ──

    fn tasks_path_for(&self, board_name: &str) -> Result<std::path::PathBuf> {
        Ok(crate::storage::board_dir::find_board_dir()?
            .join("tasks")
            .join(format!("{}.json", board_name)))
    }

    fn load_queue_for(&self, board_name: &str) -> Result<TaskQueue> {
        let path = self.tasks_path_for(board_name)?;
        if path.exists() {
            TaskQueue::load(&path)
        } else {
            Ok(TaskQueue::new())
        }
    }

    fn tool_prime(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let text = crate::commands::prime::prime_text(&board_name)?;
        Ok(serde_json::json!({ "board": board_name, "prime": text }))
    }

    fn tool_ready(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let role = match args.get("role").and_then(|v| v.as_str()) {
            Some("product-owner") | Some("po") => AgentRole::ProductOwner,
            Some("tech-lead") | Some("techlead") | Some("dev") => AgentRole::TechLead,
            Some("project-manager") | Some("pm") => AgentRole::ProjectManager,
            _ => AgentRole::ScrumMaster,
        };
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
        let queue = self.load_queue_for(&board_name)?;
        let registry = self.load_agent_registry().unwrap_or_default();
        let items = crate::agent::dispatch_scores(&queue, &registry, &role);
        let out: Vec<Value> = items
            .into_iter()
            .take(limit)
            .map(|i| serde_json::json!(i))
            .collect();
        Ok(serde_json::json!({ "ready": out }))
    }

    fn tool_packet_get(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args
            .get("task_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        let queue = self.load_queue_for(&board_name)?;
        let task = queue
            .get(task_id)
            .ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;

        let skills = crate::agent::skills_for_task(task);
        let overlap = crate::agent::overlap(&queue, &task.id);
        let siblings: Vec<Value> = queue
            .for_card(&task.card_id)
            .into_iter()
            .filter(|t| t.id != task.id)
            .take(5)
            .map(|t| serde_json::json!({"id": t.id, "title": t.title, "status": t.status}))
            .collect();
        let memories: Vec<Value> = crate::memory::MemoryStore::open(&board_name)
            .map(|s| {
                s.search(&task.title, 3)
                    .into_iter()
                    .map(|e| serde_json::json!({"id": e.id, "content": e.content}))
                    .collect()
            })
            .unwrap_or_default();
        let verify_steps: Vec<Value> = crate::agent::verify::load_profile()
            .map(|p| {
                p.steps
                    .into_iter()
                    .map(|s| serde_json::json!({"name": s.name, "cmd": s.cmd}))
                    .collect()
            })
            .unwrap_or_default();

        Ok(serde_json::json!({
            "task": task,
            "skills_md": skills,
            "overlap": overlap,
            "siblings": siblings,
            "memories": memories,
            "verify_steps": verify_steps,
        }))
    }

    fn tool_progress_note(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        let author = args.get("author").and_then(|v| v.as_str()).unwrap_or("agent");
        let text = args.get("text").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("text required"))?;
        let path = self.tasks_path_for(&board_name)?;
        let mut queue = TaskQueue::load(&path)?;
        queue.add_note(task_id, author, text)?;
        queue.save(&path)?;
        Ok(serde_json::json!({ "noted": true }))
    }

    fn tool_task_block(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        let author = args.get("author").and_then(|v| v.as_str()).unwrap_or("agent");
        let reason = args.get("reason").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("reason required"))?;
        let path = self.tasks_path_for(&board_name)?;
        let mut queue = TaskQueue::load(&path)?;
        queue.block(task_id, author, reason)?;
        queue.save(&path)?;
        Ok(serde_json::json!({ "blocked": true }))
    }

    fn tool_task_unblock(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        let path = self.tasks_path_for(&board_name)?;
        let mut queue = TaskQueue::load(&path)?;
        queue.unblock(task_id)?;
        queue.save(&path)?;
        Ok(serde_json::json!({ "unblocked": true }))
    }

    fn tool_task_heartbeat(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        let agent_id = args.get("agent_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("agent_id required"))?;
        let lease_minutes = args.get("lease_minutes").and_then(|v| v.as_i64()).unwrap_or(30);
        let path = self.tasks_path_for(&board_name)?;
        let mut queue = TaskQueue::load(&path)?;
        queue.heartbeat(task_id, agent_id, lease_minutes)?;
        queue.save(&path)?;
        Ok(serde_json::json!({ "refreshed": true }))
    }

    fn tool_handoff(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let task_id = args.get("task_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("task_id required"))?;
        let text = crate::commands::handoff::handoff_text(&board_name, task_id)?;
        Ok(serde_json::json!({ "task_id": task_id, "handoff": text }))
    }

    fn tool_verify(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let cwd = if let Some(task_id) = args.get("task_id").and_then(|v| v.as_str()) {
            let queue = self.load_queue_for(&board_name)?;
            let task = queue.get(task_id).ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;
            task.lease
                .as_ref()
                .and_then(|l| l.session_id.as_ref())
                .and_then(|sid| crate::agent::load_session(sid).ok())
                .and_then(|s| s.worktree_path.map(std::path::PathBuf::from))
                .filter(|p| p.exists())
                .unwrap_or(crate::storage::board_dir::find_project_root()?)
        } else {
            crate::storage::board_dir::find_project_root()?
        };
        let profile = crate::agent::verify::load_profile()?;
        let results = crate::agent::verify::run_profile(&profile, &cwd);
        let failed = results.iter().filter(|r| !r.success).count();
        Ok(serde_json::json!({
            "cwd": cwd.to_string_lossy(),
            "steps": results,
            "failed": failed,
        }))
    }

    // ── Fleet: sessions ──

    fn tool_session_spawn(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let agent_id = args.get("agent_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("agent_id required"))?;
        let backend = args.get("backend").and_then(|v| v.as_str()).map(String::from);
        let task_id = args.get("task_id").and_then(|v| v.as_str()).map(String::from);
        let role = match args.get("role").and_then(|v| v.as_str()) {
            Some("product-owner") | Some("po") => crate::agent::AgentRole::ProductOwner,
            Some("tech-lead") | Some("techlead") | Some("dev") => crate::agent::AgentRole::TechLead,
            Some("project-manager") | Some("pm") => crate::agent::AgentRole::ProjectManager,
            _ => crate::agent::AgentRole::ScrumMaster,
        };
        let id = crate::commands::fleet::spawn_session(
            &board_name,
            crate::commands::fleet::SpawnOptions {
                agent_id: agent_id.to_string(),
                backend_name: backend,
                task_id,
                lease_minutes: 30,
                role,
            },
        )?;
        let session = crate::agent::load_session(&id)?;
        Ok(serde_json::json!({ "session": session }))
    }

    fn tool_session_list(&self, args: Value) -> Result<Value> {
        let status_filter = args.get("status").and_then(|v| v.as_str()).map(|s| s.to_string());
        let sessions = crate::agent::list_sessions().unwrap_or_default();
        let live: std::collections::HashSet<String> =
            crate::commands::fleet::live_session_ids(&sessions);
        let out: Vec<Value> = sessions
            .into_iter()
            .filter(|s| {
                status_filter
                    .as_ref()
                    .map(|f| s.status.display_name().eq_ignore_ascii_case(f))
                    .unwrap_or(true)
            })
            .map(|s| {
                serde_json::json!({
                    "id": s.id,
                    "agent_id": s.agent_id,
                    "backend": s.backend.display_name(),
                    "task_id": s.task_id,
                    "status": s.status.display_name(),
                    "alive": live.contains(&s.id),
                    "worktree": s.worktree_path,
                    "branch": s.branch,
                    "started_at": s.started_at,
                })
            })
            .collect();
        Ok(serde_json::json!({ "sessions": out }))
    }

    fn tool_session_logs(&self, args: Value) -> Result<Value> {
        let session_id = args.get("session_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("session_id required"))?;
        let tail = args.get("tail").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
        let session = crate::agent::load_session(session_id)?;
        let lines = crate::agent::transcript_tail(&session, tail);
        Ok(serde_json::json!({ "session_id": session_id, "lines": lines }))
    }

    fn tool_session_kill(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let session_id = args.get("session_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("session_id required"))?;
        let mut session = crate::agent::load_session(session_id)?;
        if !session.status.is_terminal() {
            if let Some(pid) = session.pid {
                if crate::agent::pid_alive(pid) {
                    crate::agent::kill_pid(pid).ok();
                }
            }
            session.finish(crate::agent::SessionStatus::Killed, None);
            session.add_note("fleet", "killed via MCP");
            crate::agent::save_session(&session)?;
            // Release lease.
            let path = self.tasks_path_for(&board_name)?;
            if path.exists() {
                let mut queue = TaskQueue::load(&path)?;
                for task in queue.tasks.iter_mut() {
                    let bound = task
                        .lease
                        .as_ref()
                        .and_then(|l| l.session_id.as_ref())
                        .map(|sid| sid == &session.id)
                        .unwrap_or(false);
                    if bound && task.status.is_active() {
                        task.status = crate::agent::TaskStatus::Pending;
                        task.assigned_agent = None;
                        task.lease = None;
                    }
                }
                queue.save(&path)?;
            }
            crate::agent::remove_session(&session.id).ok();
        }
        Ok(serde_json::json!({ "killed": true }))
    }

    fn tool_fleet_status(&self, args: Value) -> Result<Value> {
        let board_name = self.resolve_board(&args)?;
        let queue = self.load_queue_for(&board_name)?;
        let registry = self.load_agent_registry().unwrap_or_default();
        let sessions = crate::agent::list_sessions().unwrap_or_default();
        let live = crate::commands::fleet::live_session_ids(&sessions);
        let session_rows: Vec<Value> = sessions
            .iter()
            .map(|s| {
                serde_json::json!({
                    "id": s.id,
                    "agent_id": s.agent_id,
                    "backend": s.backend.display_name(),
                    "task_id": s.task_id,
                    "status": s.status.display_name(),
                    "alive": live.contains(&s.id),
                    "worktree": s.worktree_path,
                })
            })
            .collect();
        let worktrees: Vec<Value> = crate::agent::worktree::list_worktrees()
            .unwrap_or_default()
            .into_iter()
            .filter(|(p, _, _)| crate::agent::worktree::is_managed_worktree(p))
            .map(|(path, branch, _)| serde_json::json!({"path": path, "branch": branch}))
            .collect();
        Ok(serde_json::json!({
            "board": board_name,
            "tasks": crate::agent::FleetReconciler::task_counts(&queue),
            "agents": crate::agent::FleetReconciler::agent_counts(&registry),
            "sessions": session_rows,
            "worktrees": worktrees,
        }))
    }
}

/// Start the MCP server
pub fn run_mcp_server() -> Result<()> {
    let mut server = McpServer::new();
    server.run()
}
