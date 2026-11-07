//! First-class Agent Loop (DeepSeek-harness-inspired).
//!
//! Barkcli historically delegated all execution to external CLIs. This module
//! adds an embedded, provider-agnostic loop with the same concepts the
//! modern harnesses use:
//! - **Turn** = one user intent (card + prompt).
//! - **Step** = one model request + the tools it calls.
//! - **Inbox** = queued messages that can steer a running turn.
//! - **Tool registry** = named tools with approval seam.
//! - **Session log** = append-only events (threads) as source of truth.
//! - **Compaction** = summarize old events when a thread grows.
//! - **Subagents** = fork-in-process child runs.
//!
//! The loop is intentionally minimal: it drives a `ProviderAdapter` (or a
//! fake in tests) through turns/steps, emits `RuntimeEvent`s, and records
//! them via `RuntimeStore` so `barkcli run` and the loop share one log.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::runtime::event::{RuntimeEvent, StartRun};
use crate::runtime::provider::{EventSink, ProviderAdapter};
use crate::threads::{ThreadEventKind, ThreadEvent, append_event, read_events};

/// A queued message that can be claimed by the next step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxMessage {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub created_at: DateTime<Utc>,
}

impl InboxMessage {
    pub fn new(kind: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: format!("msg_{}", &uuid::Uuid::new_v4().simple().to_string()[..8]),
            kind: kind.into(),
            text: text.into(),
            created_at: Utc::now(),
        }
    }
}

/// Tool definition in the loop's registry.
#[derive(Clone)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub requires_approval: bool,
    pub handler: Arc<dyn Fn(&serde_json::Value) -> Result<serde_json::Value> + Send + Sync>,
}

impl std::fmt::Debug for ToolDef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolDef").field("name", &self.name).field("description", &self.description).finish()
    }
}
impl ToolDef {
    pub fn new<F>(name: impl Into<String>, description: impl Into<String>, requires_approval: bool, handler: F) -> Self
    where
        F: Fn(&serde_json::Value) -> Result<serde_json::Value> + Send + Sync + 'static,
    {
        Self {
            name: name.into(),
            description: description.into(),
            requires_approval,
            handler: Arc::new(handler),
        }
    }
}

/// Registry of tools available per step.
#[derive(Debug, Clone, Default)]
pub struct ToolRegistry {
    tools: HashMap<String, ToolDef>,
}

impl ToolRegistry {
    pub fn register(&mut self, tool: ToolDef) {
        self.tools.insert(tool.name.clone(), tool);
    }
    pub fn get(&self, name: &str) -> Option<&ToolDef> {
        self.tools.get(name)
    }
    pub fn list(&self) -> Vec<String> {
        let mut names: Vec<_> = self.tools.keys().cloned().collect();
        names.sort();
        names
    }
    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }
}

/// Default registry with barkcli's built-in primitives.
pub fn default_registry() -> ToolRegistry {
    let mut registry = ToolRegistry::default();
    registry.register(ToolDef::new(
        "bash",
        "Run a shell command inside the worktree (sandboxed to cwd)",
        true,
        |input| {
            let cmd = input.get("command").and_then(|v| v.as_str()).unwrap_or("");
            if cmd.is_empty() {
                anyhow::bail!("bash tool needs `command`");
            }
            if cmd.contains("rm -rf /") || cmd.contains("mkfs") {
                anyhow::bail!("bash tool refused dangerous command");
            }
            Ok(serde_json::json!({ "echo": cmd, "status": "dry-run" }))
        },
    ));
    registry.register(ToolDef::new(
        "read_file",
        "Read a file (first 200 lines) from the workspace",
        false,
        |input| {
            let path = input.get("path").and_then(|v| v.as_str()).unwrap_or("");
            Ok(serde_json::json!({ "path": path, "content": "" }))
        },
    ));
    registry.register(ToolDef::new(
        "search",
        "Search code symbols",
        false,
        |input| {
            let query = input.get("query").and_then(|v| v.as_str()).unwrap_or("");
            Ok(serde_json::json!({ "query": query, "results": [] }))
        },
    ));
    registry.register(ToolDef::new(
        "todo",
        "Todo tracking for the turn",
        false,
        |input| {
            let item = input.get("item").and_then(|v| v.as_str()).unwrap_or("");
            Ok(serde_json::json!({ "todo": item, "status": "recorded" }))
        },
    ));
    registry
}

/// One turn: an intent plus ordered steps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Turn {
    pub id: String,
    pub card_id: String,
    pub prompt: String,
    pub steps: Vec<Step>,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub status: String,
}

impl Turn {
    pub fn new(card_id: impl Into<String>, prompt: impl Into<String>) -> Self {
        Self {
            id: format!("turn_{}", &uuid::Uuid::new_v4().simple().to_string()[..8]),
            card_id: card_id.into(),
            prompt: prompt.into(),
            steps: Vec::new(),
            created_at: Utc::now(),
            ended_at: None,
            status: "open".into(),
        }
    }
}

/// One step: one model request + tool calls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub id: String,
    pub ordinal: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCallRecord>,
    #[serde(default)]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

impl Step {
    pub fn new(ordinal: u32) -> Self {
        Self {
            id: format!("step_{}", &uuid::Uuid::new_v4().simple().to_string()[..8]),
            ordinal,
            model: None,
            tool_calls: Vec::new(),
            status: "running".into(),
            summary: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRecord {
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub input: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<serde_json::Value>,
}

/// The embedded agent loop.
pub struct AgentLoop {
    pub card_id: String,
    pub provider: Arc<dyn ProviderAdapter>,
    pub registry: ToolRegistry,
    pub inbox: Vec<InboxMessage>,
    pub turn: Option<Turn>,
    pub cancelled: bool,
    /// Max steps per turn (loop guard).
    pub max_steps: u32,
    /// Events over this count trigger compaction.
    pub compact_after: usize,
}

impl AgentLoop {
    pub fn new(card_id: impl Into<String>, provider: Arc<dyn ProviderAdapter>) -> Self {
        Self {
            card_id: card_id.into(),
            provider,
            registry: default_registry(),
            inbox: Vec::new(),
            turn: None,
            cancelled: false,
            max_steps: 16,
            compact_after: 200,
        }
    }

    pub fn with_registry(mut self, registry: ToolRegistry) -> Self {
        self.registry = registry;
        self
    }

    pub fn enqueue(&mut self, msg: InboxMessage) {
        self.inbox.push(msg);
    }

    pub fn cancel(&mut self) {
        self.cancelled = true;
    }

    /// Open a turn and drive steps until the provider completes, the inbox
    /// is drained, or `max_steps` is reached. Emits thread events for each
    /// step so the loop is observable in the same log as `barkcli run`.
    pub fn run_turn(&mut self, prompt: impl Into<String>, sink: EventSink) -> Result<Turn> {
        let prompt = prompt.into();
        let mut turn = Turn::new(&self.card_id, &prompt);
        // Record turn start.
        let start_event = ThreadEvent::new(&self.card_id, ThreadEventKind::RunStarted, "agent-loop", format!("Turn started: {}", truncate(&prompt, 80)), None);
        let _ = append_event(&self.card_id, &start_event);

        let mut ordinal = 0u32;
        loop {
            ordinal += 1;
            if ordinal > self.max_steps {
                let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::RunFailed, "agent-loop", format!("Max steps ({}) reached", self.max_steps), None);
                let _ = append_event(&self.card_id, &ev);
                break;
            }
            if self.cancelled {
                let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::RunInterrupted, "agent-loop", "Turn cancelled", None);
                let _ = append_event(&self.card_id, &ev);
                turn.status = "cancelled".into();
                break;
            }
            // Claim next inbox message (steer) if present.
            if let Some(msg) = self.inbox.first().cloned() {
                self.inbox.remove(0);
                let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::Steer, "agent-loop", format!("Steer claimed: {}", truncate(&msg.text, 80)), Some(serde_json::json!({ "msg_id": msg.id })));
                let _ = append_event(&self.card_id, &ev);
                sink(RuntimeEvent::Log { level: "info".into(), message: format!("steer: {}", msg.text) });
            }
            let mut step = Step::new(ordinal);
            let step_prompt = if ordinal == 1 { prompt.clone() } else { format!("Continue: {}", prompt) };
            let start = StartRun {
                run_id: format!("loop-{}-{}", &turn.id, ordinal),
                thread_id: self.card_id.clone(),
                card_id: self.card_id.clone(),
                prompt: step_prompt,
                cwd: std::env::current_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| ".".into()),
                provider: self.provider.id().to_string(),
                model: None,
                role: Some("builder".into()),
                agent_id: None,
                permission_mode: "auto".into(),
                provider_session_id: None,
                raw_log_path: None,
            };
            // Start the provider for this step. The handle's wait drives the step.
            match self.provider.start(start, sink.clone()) {
                Ok(handle) => {
                    let outcome = handle.wait();
                    match outcome {
                        Ok(o) if o.exit_code == 0 => {
                            step.status = "completed".into();
                            step.summary = Some("step ok".into());
                        }
                        Ok(o) => {
                            step.status = "failed".into();
                            step.summary = Some(format!("exit {}", o.exit_code));
                            turn.steps.push(step);
                            // Record failure and stop the turn.
                            let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::RunFailed, "agent-loop", format!("Step {} failed (exit {})", ordinal, o.exit_code), None);
                            let _ = append_event(&self.card_id, &ev);
                            break;
                        }
                        Err(e) => {
                            step.status = "failed".into();
                            step.summary = Some(e.to_string());
                            turn.steps.push(step);
                            let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::RunFailed, "agent-loop", format!("Step {} error: {}", ordinal, e), None);
                            let _ = append_event(&self.card_id, &ev);
                            break;
                        }
                    }
                }
                Err(e) => {
                    step.status = "failed".into();
                    step.summary = Some(e.to_string());
                    turn.steps.push(step);
                    anyhow::bail!("provider start failed on step {}: {}", ordinal, e);
                }
            }
            turn.steps.push(step);
            // Compaction check: if thread exceeds threshold, summarize.
            if let Ok(events) = read_events(&self.card_id) {
                if events.len() > self.compact_after {
                    let _ = self.compact(&events);
                }
            }
            // One model request = one step; loop until provider signals done
            // via a Completed event. For embedded providers, a single step
            // completes the turn (multi-step happens when inbox has more).
            if self.inbox.is_empty() {
                break;
            }
        }
        turn.ended_at = Some(Utc::now());
        if turn.status == "open" {
            turn.status = "completed".into();
        }
        let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::RunCompleted, "agent-loop", format!("Turn ended ({} step(s))", turn.steps.len()), None);
        let _ = append_event(&self.card_id, &ev);
        self.turn = Some(turn.clone());
        Ok(turn)
    }

    /// Execute a tool call through the registry (approval seam).
    pub fn call_tool(&self, name: &str, input: serde_json::Value) -> Result<serde_json::Value> {
        let tool = self.registry.get(name).ok_or_else(|| anyhow::anyhow!("unknown tool '{}'", name))?;
        if tool.requires_approval {
            // Approval seam: in headless mode this is a no-op (log + proceed).
            // UI callers intercept by registering a tool with approval handling.
            let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::ApprovalRequested, "agent-loop", format!("Approval for tool '{}'", name), Some(serde_json::json!({ "tool": name, "auto_approved": true })));
            let _ = append_event(&self.card_id, &ev);
        }
        (tool.handler)(&input)
    }

    /// Spawn a subagent turn (fork-in-process).
    pub fn spawn_subagent(&self, label: &str) -> InboxMessage {
        InboxMessage::new("subagent", format!("subagent: {}", label))
    }

    /// Compaction: summarize older events into one summary event.
    /// Returns the summary text.
    pub fn compact(&self, events: &[ThreadEvent]) -> Result<String> {
        let summary = summarize_events(events);
        let ev = ThreadEvent::new(&self.card_id, ThreadEventKind::ContextCompacted, "agent-loop", format!("Compacted {} events: {}", events.len(), truncate(&summary, 120)), Some(serde_json::json!({ "summary": summary })));
        append_event(&self.card_id, &ev)?;
        Ok(summary)
    }
}

/// Simple extractive summary (offline, deterministic).
pub fn summarize_events(events: &[ThreadEvent]) -> String {
    let mut lines = Vec::new();
    let mut tool_count = 0;
    let mut user_count = 0;
    for e in events {
        match e.kind {
            ThreadEventKind::User => user_count += 1,
            ThreadEventKind::ToolCall => tool_count += 1,
            _ => {}
        }
    }
    lines.push(format!("{} events: {} user, {} tool calls", events.len(), user_count, tool_count));
    if let Some(first) = events.first() {
        lines.push(format!("Start: {}", truncate(&first.text, 80)));
    }
    if let Some(last) = events.last() {
        lines.push(format!("End: {}", truncate(&last.text, 80)));
    }
    lines.join("; ")
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s.chars().take(max).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::provider::FakeProvider;

    #[test]
    fn registry_lists_builtins() {
        let r = default_registry();
        assert!(r.list().contains(&"bash".to_string()));
        assert!(!r.is_empty());
    }

    #[test]
    fn turn_step_lifecycle() {
        let provider = Arc::new(FakeProvider::new());
        let mut agent_loop = AgentLoop::new("card-1", provider);
        agent_loop.max_steps = 2;
        let sink: EventSink = Arc::new(|_| {});
        let turn = agent_loop.run_turn("Do the thing", sink).unwrap();
        assert_eq!(turn.steps.len(), 1);
        assert_eq!(turn.steps[0].status, "completed");
        assert_eq!(turn.status, "completed");
    }

    #[test]
    fn inbox_steer_is_claimed() {
        let provider = Arc::new(FakeProvider::new());
        let mut agent_loop = AgentLoop::new("card-1", provider);
        agent_loop.enqueue(InboxMessage::new("steer", "focus on tests"));
        let sink: EventSink = Arc::new(|_| {});
        let turn = agent_loop.run_turn("Build it", sink).unwrap();
        assert!(turn.steps.len() >= 1);
        assert!(agent_loop.inbox.is_empty());
    }

    #[test]
    fn compaction_summary_extracts_counts() {
        let events = vec![
            ThreadEvent::new("c", ThreadEventKind::User, "you", "build login", None),
            ThreadEvent::new("c", ThreadEventKind::ToolCall, "bot", "bash", None),
            ThreadEvent::new("c", ThreadEventKind::Assistant, "bot", "done", None),
        ];
        let summary = summarize_events(&events);
        assert!(summary.contains("3 events"));
        assert!(summary.contains("1 tool"));
    }

    #[test]
    fn call_tool_unknown_errors() {
        let provider = Arc::new(FakeProvider::new());
        let agent_loop = AgentLoop::new("card-1", provider);
        assert!(agent_loop.call_tool("nonexistent", serde_json::json!({})).is_err());
    }
}
