use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::agent::liveness::BoardLiveness;
use crate::models::Card;
use crate::storage::board_dir::ensure_board_dir;
use crate::storage::board_file::read_board;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThreadEventKind {
    User,
    Assistant,
    PlanProposed,
    PlanApproved,
    PlanRejected,
    TaskSpawned,
    AgentOutput,
    Gate,
    Merge,
    Steer,
    RunQueued,
    RunStarted,
    RunStatus,
    AssistantDelta,
    ToolCall,
    FileChange,
    ApprovalRequested,
    ApprovalResolved,
    Question,
    Answer,
    ContextCompiled,
    ContextCompacted,
    Handoff,
    Review,
    RunCompleted,
    RunFailed,
    RunInterrupted,
    Usage,
    Checkpoint,
    Diff,
    Log,
    #[serde(untagged)]
    Custom(String),
}

impl ThreadEventKind {
    pub fn as_str(&self) -> &str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
            Self::PlanProposed => "plan_proposed",
            Self::PlanApproved => "plan_approved",
            Self::PlanRejected => "plan_rejected",
            Self::TaskSpawned => "task_spawned",
            Self::AgentOutput => "agent_output",
            Self::Gate => "gate",
            Self::Merge => "merge",
            Self::Steer => "steer",
            Self::RunQueued => "run_queued",
            Self::RunStarted => "run_started",
            Self::RunStatus => "run_status",
            Self::AssistantDelta => "assistant_delta",
            Self::ToolCall => "tool_call",
            Self::FileChange => "file_change",
            Self::ApprovalRequested => "approval_requested",
            Self::ApprovalResolved => "approval_resolved",
            Self::Question => "question",
            Self::Answer => "answer",
            Self::ContextCompiled => "context_compiled",
            Self::ContextCompacted => "context_compacted",
            Self::Handoff => "handoff",
            Self::Review => "review",
            Self::RunCompleted => "run_completed",
            Self::RunFailed => "run_failed",
            Self::RunInterrupted => "run_interrupted",
            Self::Usage => "usage",
            Self::Checkpoint => "checkpoint",
            Self::Diff => "diff",
            Self::Log => "log",
            Self::Custom(s) => s.as_str(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadEvent {
    pub id: String,
    pub card_id: String,
    /// Thread identity. Defaults to `card_id` for older events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// Monotonic per-thread sequence. `0` means the event predates v2.
    #[serde(default)]
    pub seq: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_event_id: Option<String>,
    pub kind: ThreadEventKind,
    pub author: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    pub created_at: String,
}

impl ThreadEvent {
    pub fn new(
        card_id: impl Into<String>,
        kind: ThreadEventKind,
        author: impl Into<String>,
        text: impl Into<String>,
        data: Option<serde_json::Value>,
    ) -> Self {
        let cid = card_id.into();
        let now = Utc::now();
        // Millisecond timestamps collide when a provider emits a burst of
        // events (started + first tool call). Keep the readable prefix and add
        // an entropy suffix so ids stay unique within one process.
        let id = format!(
            "evt_{}_{}_{}",
            now.timestamp_millis(),
            crate::util::slug::to_slug(&cid),
            &uuid::Uuid::new_v4().simple().to_string()[..8]
        );
        Self {
            id,
            card_id: cid.clone(),
            thread_id: Some(cid),
            seq: 0,
            run_id: None,
            turn_id: None,
            parent_event_id: None,
            kind,
            author: author.into(),
            text: text.into(),
            data,
            created_at: now.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadSummary {
    pub id: String,
    pub title: String,
    pub status_group: String,
    pub event_count: usize,
    pub last_event: Option<ThreadEvent>,
    pub updated_at: String,
    pub column: String,
    pub backend: Option<String>,
    /// Newest evidence of agent life for this card (heartbeat, lease, note).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
    /// Kept at the top of the navigator until unpinned.
    #[serde(default)]
    pub pinned: bool,
}

pub fn threads_dir() -> Result<PathBuf> {
    let board_dir = ensure_board_dir()?;
    let path = board_dir.join("threads");
    if !path.exists() {
        create_dir_all(&path).context("failed to create threads directory")?;
    }
    Ok(path)
}

pub fn thread_path(card_id: &str) -> Result<PathBuf> {
    let dir = threads_dir()?;
    let safe_name = crate::util::slug::to_slug(card_id);
    Ok(dir.join(format!("{}.jsonl", safe_name)))
}

/// Remove a thread's conversation file and its lock sidecar. Run records are
/// intentionally retained as audit evidence; this only deletes the transcript.
pub fn delete_thread_file(card_id: &str) -> Result<bool> {
    let path = thread_path(card_id)?;
    let existed = path.exists();
    if existed {
        std::fs::remove_file(&path)
            .with_context(|| format!("failed to delete thread file {:?}", path))?;
    }
    let _ = std::fs::remove_file(path.with_extension("jsonl.lock"));
    Ok(existed)
}

pub fn append_event_to_dir(dir: &std::path::Path, card_id: &str, event: &ThreadEvent) -> Result<()> {
    append_event_to_dir_returning(dir, card_id, event).map(|_| ())
}

/// Append under the thread file lock and return the event as persisted, with
/// its assigned monotonic sequence number.
pub fn append_event_to_dir_returning(
    dir: &std::path::Path,
    card_id: &str,
    event: &ThreadEvent,
) -> Result<ThreadEvent> {
    if !dir.exists() {
        create_dir_all(dir).context("failed to create directory")?;
    }
    let safe_name = crate::util::slug::to_slug(card_id);
    let path = dir.join(format!("{}.jsonl", safe_name));
    crate::util::lock::with_lock(&path, || {
        let mut event = event.clone();
        if event.thread_id.is_none() {
            event.thread_id = Some(card_id.to_string());
        }
        if event.seq == 0 {
            let existing = read_events_from_dir(dir, card_id).unwrap_or_default();
            event.seq = existing.iter().map(|e| e.seq).max().unwrap_or(0) + 1;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .with_context(|| format!("failed to open thread file {:?}", path))?;
        let line = serde_json::to_string(&event).context("failed to serialize thread event")?;
        writeln!(file, "{}", line).context("failed to append thread event")?;
        Ok(event)
    })
}

pub fn read_events_from_dir(dir: &std::path::Path, card_id: &str) -> Result<Vec<ThreadEvent>> {
    let safe_name = crate::util::slug::to_slug(card_id);
    let path = dir.join(format!("{}.jsonl", safe_name));
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = File::open(&path).with_context(|| format!("failed to open {:?}", path))?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    for line in reader.lines() {
        let l = line?;
        let trimmed = l.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(ev) = serde_json::from_str::<ThreadEvent>(trimmed) {
            events.push(ev);
        }
    }
    Ok(events)
}

pub fn append_event(card_id: &str, event: &ThreadEvent) -> Result<()> {
    let dir = threads_dir()?;
    append_event_to_dir(&dir, card_id, event)
}

pub fn read_events(card_id: &str) -> Result<Vec<ThreadEvent>> {
    let dir = threads_dir()?;
    read_events_from_dir(&dir, card_id)
}

pub fn load_or_init_thread(board_name: &str, card: &Card) -> Result<Vec<ThreadEvent>> {
    let mut events = read_events(&card.id)?;
    if events.is_empty() {
        let initial_text = match &card.description {
            Some(d) if !d.trim().is_empty() => d.clone(),
            _ => card.title.clone(),
        };
        let user_event = ThreadEvent::new(
            &card.id,
            ThreadEventKind::User,
            "you",
            initial_text,
            Some(serde_json::json!({
                "title": card.title,
                "priority": card.priority,
                "column": card.column,
                "labels": card.labels,
            })),
        );
        append_event(&card.id, &user_event)?;
        events.push(user_event);

        if let Ok(st) = crate::agent::autopilot::AutopilotState::load(board_name).proposals.get(&card.id).cloned().ok_or(()) {
            let plan_event = ThreadEvent::new(
                &card.id,
                ThreadEventKind::PlanProposed,
                "barkcli",
                format!("Proposed plan with {} child tasks", st.children.len()),
                Some(serde_json::to_value(&st).unwrap_or_default()),
            );
            append_event(&card.id, &plan_event)?;
            events.push(plan_event);
        }
    }
    Ok(events)
}

/// Thread classification with a pre-built liveness snapshot (preferred: one
/// snapshot per board read instead of one per card).
pub fn classify_status_group_with(
    card: &Card,
    board_name: &str,
    live: &BoardLiveness,
) -> String {
    let col = card.column.to_lowercase();
    if col == "done" {
        return "settled".to_string();
    }
    let st = crate::agent::autopilot::AutopilotState::load(board_name);
    if st.proposals.contains_key(&card.id) {
        return "needs_you".to_string();
    }
    if col == "doing" {
        // A `doing` card is only "running" while an agent is demonstrably
        // alive. Crashed agents used to leave cards looking busy forever.
        return match live.card_running(&card.id) {
            Some(true) => "running".to_string(),
            Some(false) => "stalled".to_string(),
            None => {
                let age = Utc::now().signed_duration_since(card.updated_at);
                if age < Duration::minutes(crate::agent::liveness::STALL_AFTER_MINUTES) {
                    "running".to_string()
                } else {
                    "stalled".to_string()
                }
            }
        };
    }
    "features".to_string()
}

/// Classify a single card (loads its own liveness snapshot).
pub fn classify_status_group(card: &Card, board_name: &str) -> String {
    let live = BoardLiveness::load(board_name);
    classify_status_group_with(card, board_name, &live)
}

pub fn list_threads(board_name: &str) -> Result<Vec<ThreadSummary>> {
    let board = read_board(board_name)?;
    let live = BoardLiveness::load(board_name);
    let mut summaries = Vec::new();
    // `doctor` flags duplicate ids, but a malformed board must not leak two
    // rows with the same React key into the navigator.
    let mut seen = std::collections::HashSet::new();
    for card in &board.cards {
        if !seen.insert(card.id.as_str()) {
            continue;
        }
        let events = read_events(&card.id).unwrap_or_default();
        let last_event = events.last().cloned();
        let count = events.len();
        let status_group = classify_status_group_with(card, board_name, &live);
        let backend = card.assignee.clone().or_else(|| {
            card.labels
                .iter()
                .find(|l| l.starts_with("agent:"))
                .map(|l| l.trim_start_matches("agent:").to_string())
        });
        summaries.push(ThreadSummary {
            id: card.id.clone(),
            title: card.title.clone(),
            status_group,
            event_count: count,
            last_event,
            updated_at: card.updated_at.to_rfc3339(),
            column: card.column.clone(),
            backend,
            last_seen: live
                .card_last_seen(&card.id)
                .map(|t| t.to_rfc3339())
                .or_else(|| Some(card.updated_at.to_rfc3339())),
            pinned: card.pinned,
        });
    }

    summaries.sort_by(|a, b| {
        let prio = |sg: &str| match sg {
            "needs_you" => 0,
            "stalled" => 1,
            "running" => 2,
            "features" => 3,
            "settled" => 4,
            _ => 5,
        };
        b.pinned
            .cmp(&a.pinned)
            .then_with(|| prio(&a.status_group).cmp(&prio(&b.status_group)))
            .then_with(|| b.updated_at.cmp(&a.updated_at))
    });

    Ok(summaries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doing_card_without_a_live_agent_is_stalled() {
        let mut card = Card::new("stalled-card", "Long gone", "doing");
        card.updated_at = Utc::now() - Duration::hours(3);
        let live = BoardLiveness::default();
        assert_eq!(
            classify_status_group_with(&card, "test-board", &live),
            "stalled"
        );
    }

    #[test]
    fn freshly_moved_doing_card_gets_a_grace_window() {
        let card = Card::new("fresh-card", "Just started", "doing");
        let live = BoardLiveness::default();
        assert_eq!(
            classify_status_group_with(&card, "test-board", &live),
            "running"
        );
    }

    #[test]
    fn done_cards_are_settled_regardless_of_liveness() {
        let mut card = Card::new("done-card", "Shipped", "doing");
        card.column = "done".into();
        card.updated_at = Utc::now() - Duration::days(2);
        let live = BoardLiveness::default();
        assert_eq!(
            classify_status_group_with(&card, "test-board", &live),
            "settled"
        );
    }

    #[test]
    fn thread_event_serialization_roundtrip() {
        let event = ThreadEvent::new(
            "auth_flow",
            ThreadEventKind::User,
            "tester",
            "Add google oauth login support",
            Some(serde_json::json!({ "scope": "auth" })),
        );
        let serialized = serde_json::to_string(&event).unwrap();
        let deserialized: ThreadEvent = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.card_id, "auth_flow");
        assert_eq!(deserialized.author, "tester");
        assert_eq!(deserialized.kind, ThreadEventKind::User);
    }

    #[test]
    fn thread_append_and_replay_preserves_order() {
        let dir = std::env::temp_dir().join(format!("bark_test_threads_{}", uuid::Uuid::new_v4()));
        let card_id = "test_feature_card";

        let ev1 = ThreadEvent::new(card_id, ThreadEventKind::User, "alice", "Build stripe webhook", None);
        let ev2 = ThreadEvent::new(card_id, ThreadEventKind::Assistant, "barkcli", "I will plan this task", None);
        let ev3 = ThreadEvent::new(card_id, ThreadEventKind::Gate, "barkcli", "cargo test ok", Some(serde_json::json!({ "passed": true })));

        append_event_to_dir(&dir, card_id, &ev1).unwrap();
        append_event_to_dir(&dir, card_id, &ev2).unwrap();
        append_event_to_dir(&dir, card_id, &ev3).unwrap();

        let loaded = read_events_from_dir(&dir, card_id).unwrap();
        assert_eq!(loaded.len(), 3);
        assert_eq!(loaded[0].kind, ThreadEventKind::User);
        assert_eq!(loaded[0].text, "Build stripe webhook");
        assert_eq!(loaded[1].kind, ThreadEventKind::Assistant);
        assert_eq!(loaded[1].text, "I will plan this task");
        assert_eq!(loaded[2].kind, ThreadEventKind::Gate);
        assert_eq!(loaded[2].text, "cargo test ok");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn thread_all_event_kinds_roundtrip() {
        let kinds = vec![
            ThreadEventKind::User,
            ThreadEventKind::Assistant,
            ThreadEventKind::PlanProposed,
            ThreadEventKind::PlanApproved,
            ThreadEventKind::TaskSpawned,
            ThreadEventKind::AgentOutput,
            ThreadEventKind::Gate,
            ThreadEventKind::Merge,
            ThreadEventKind::Steer,
        ];

        for kind in kinds {
            let ev = ThreadEvent::new("card1", kind.clone(), "barkcli", "event text", None);
            let s = serde_json::to_string(&ev).unwrap();
            let parsed: ThreadEvent = serde_json::from_str(&s).unwrap();
            assert_eq!(parsed.kind, kind);
        }
    }
}
