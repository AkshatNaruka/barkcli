//! Timeline derivation: committed turn-items → ordered display entries.
//!
//! Inspired by t3code `session-logic.ts`: map the append-only event log into
//! a stable, render-ready timeline. Entries are pure projections — the event
//! log stays the source of truth.

use serde::{Deserialize, Serialize};

use super::{ThreadEvent, ThreadEventKind};

/// One render unit in the thread timeline.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TimelineEntry {
    /// A user / assistant message bubble.
    Message {
        event_id: String,
        seq: u64,
        author: String,
        text: String,
        created_at: String,
        run_id: Option<String>,
    },
    /// A proposed plan awaiting approval.
    ProposedPlan {
        event_id: String,
        seq: u64,
        text: String,
        created_at: String,
    },
    /// A single work step (tool call, file change, status, usage…).
    Work {
        event_id: String,
        seq: u64,
        kind: ThreadEventKind,
        label: String,
        detail: Option<String>,
        created_at: String,
        run_id: Option<String>,
        counts_for_run: bool,
    },
    /// A subagent span (spawned → completed/failed).
    Subagent {
        subagent_id: String,
        parent_event_id: String,
        label: String,
        status: String,
        created_at: String,
    },
    /// A checkpoint / diff marker.
    Checkpoint {
        event_id: String,
        seq: u64,
        label: String,
        created_at: String,
    },
    /// A fork / revert / handoff boundary.
    Boundary {
        event_id: String,
        seq: u64,
        kind: ThreadEventKind,
        label: String,
        created_at: String,
    },
    /// An approval / question that blocks the turn.
    Request {
        event_id: String,
        seq: u64,
        kind: ThreadEventKind,
        text: String,
        created_at: String,
    },
    /// Fallback for unknown / custom kinds (forward-compatible).
    Event {
        event_id: String,
        seq: u64,
        kind: ThreadEventKind,
        text: String,
        created_at: String,
    },
}

impl TimelineEntry {
    pub fn seq(&self) -> u64 {
        match self {
            Self::Message { seq, .. } => *seq,
            Self::ProposedPlan { seq, .. } => *seq,
            Self::Work { seq, .. } => *seq,
            Self::Subagent { .. } => 0,
            Self::Checkpoint { seq, .. } => *seq,
            Self::Boundary { seq, .. } => *seq,
            Self::Request { seq, .. } => *seq,
            Self::Event { seq, .. } => *seq,
        }
    }

    pub fn is_message(&self) -> bool {
        matches!(self, Self::Message { .. } | Self::ProposedPlan { .. })
    }
}

/// Whether an event counts toward its run's work log.
pub fn counts_for_run(kind: &ThreadEventKind) -> bool {
    matches!(
        kind,
        ThreadEventKind::ToolCall
            | ThreadEventKind::FileChange
            | ThreadEventKind::PlanProposed
            | ThreadEventKind::Checkpoint
            | ThreadEventKind::Diff
            | ThreadEventKind::SubagentSpawned
            | ThreadEventKind::SubagentCompleted
    )
}

/// Derive the display timeline from committed events (committed order = seq).
/// Unknown kinds fall back to a generic `Event` entry so new server kinds
/// never break older clients.
pub fn derive_timeline(events: &[ThreadEvent]) -> Vec<TimelineEntry> {
    let mut ordered: Vec<ThreadEvent> = events.to_vec();
    ordered.sort_by_key(|e| e.seq);

    let mut out = Vec::with_capacity(ordered.len());
    // Track open subagents by id.
    let mut subagent_status: std::collections::HashMap<String, (String, String, String)> =
        std::collections::HashMap::new();

    for ev in &ordered {
        match &ev.kind {
            ThreadEventKind::User | ThreadEventKind::Assistant => {
                out.push(TimelineEntry::Message {
                    event_id: ev.id.clone(),
                    seq: ev.seq,
                    author: ev.author.clone(),
                    text: ev.text.clone(),
                    created_at: ev.created_at.clone(),
                    run_id: ev.run_id.clone(),
                });
            }
            ThreadEventKind::PlanProposed => {
                out.push(TimelineEntry::ProposedPlan {
                    event_id: ev.id.clone(),
                    seq: ev.seq,
                    text: ev.text.clone(),
                    created_at: ev.created_at.clone(),
                });
            }
            ThreadEventKind::SubagentSpawned => {
                let id = ev
                    .data
                    .as_ref()
                    .and_then(|d| d.get("subagent_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(ev.id.as_str())
                    .to_string();
                subagent_status.insert(
                    id.clone(),
                    (ev.id.clone(), ev.text.clone(), "running".into()),
                );
            }
            ThreadEventKind::SubagentCompleted | ThreadEventKind::SubagentFailed => {
                let id = ev
                    .data
                    .as_ref()
                    .and_then(|d| d.get("subagent_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(ev.id.as_str())
                    .to_string();
                let status = if matches!(ev.kind, ThreadEventKind::SubagentFailed) {
                    "failed"
                } else {
                    "completed"
                };
                if let Some((parent, label, _)) = subagent_status.remove(&id) {
                    out.push(TimelineEntry::Subagent {
                        subagent_id: id,
                        parent_event_id: parent,
                        label,
                        status: status.into(),
                        created_at: ev.created_at.clone(),
                    });
                } else {
                    out.push(TimelineEntry::Subagent {
                        subagent_id: id,
                        parent_event_id: ev.id.clone(),
                        label: ev.text.clone(),
                        status: status.into(),
                        created_at: ev.created_at.clone(),
                    });
                }
            }
            ThreadEventKind::ToolCall
            | ThreadEventKind::FileChange
            | ThreadEventKind::RunStatus
            | ThreadEventKind::RunStarted
            | ThreadEventKind::Gate
            | ThreadEventKind::Usage
            | ThreadEventKind::Log
            | ThreadEventKind::ContextCompiled
            | ThreadEventKind::ContextCompacted => {
                out.push(TimelineEntry::Work {
                    event_id: ev.id.clone(),
                    seq: ev.seq,
                    kind: ev.kind.clone(),
                    label: ev.text.clone(),
                    detail: None,
                    created_at: ev.created_at.clone(),
                    run_id: ev.run_id.clone(),
                    counts_for_run: counts_for_run(&ev.kind),
                });
            }
            ThreadEventKind::Checkpoint | ThreadEventKind::Diff => {
                out.push(TimelineEntry::Checkpoint {
                    event_id: ev.id.clone(),
                    seq: ev.seq,
                    label: ev.text.clone(),
                    created_at: ev.created_at.clone(),
                });
            }
            ThreadEventKind::ApprovalRequested | ThreadEventKind::Question => {
                out.push(TimelineEntry::Request {
                    event_id: ev.id.clone(),
                    seq: ev.seq,
                    kind: ev.kind.clone(),
                    text: ev.text.clone(),
                    created_at: ev.created_at.clone(),
                });
            }
            ThreadEventKind::Forked
            | ThreadEventKind::Reverted
            | ThreadEventKind::RolledBack
            | ThreadEventKind::Handoff => {
                out.push(TimelineEntry::Boundary {
                    event_id: ev.id.clone(),
                    seq: ev.seq,
                    kind: ev.kind.clone(),
                    label: ev.text.clone(),
                    created_at: ev.created_at.clone(),
                });
            }
            other => {
                out.push(TimelineEntry::Event {
                    event_id: ev.id.clone(),
                    seq: ev.seq,
                    kind: other.clone(),
                    text: ev.text.clone(),
                    created_at: ev.created_at.clone(),
                });
            }
        }
    }

    // Close any still-open subagents as running (their span closes on completion).
    for (id, (parent, label, status)) in subagent_status {
        out.push(TimelineEntry::Subagent {
            subagent_id: id,
            parent_event_id: parent,
            label,
            status,
            created_at: String::new(),
        });
    }

    // Stable sort: subagents without seq sort last by creation order.
    out.sort_by_key(|e| e.seq());
    out
}

/// Number of checkpoints before (or at) `seq` — used for revert-count derivation.
pub fn revert_count(events: &[ThreadEvent], at_seq: u64) -> usize {
    events
        .iter()
        .filter(|e| e.seq <= at_seq && matches!(e.kind, ThreadEventKind::Checkpoint))
        .count()
}

/// The latest checkpoint event in a thread, if any.
pub fn latest_checkpoint(events: &[ThreadEvent]) -> Option<&ThreadEvent> {
    events
        .iter()
        .rev()
        .find(|e| matches!(e.kind, ThreadEventKind::Checkpoint))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(seq: u64, kind: ThreadEventKind, text: &str) -> ThreadEvent {
        let mut e = ThreadEvent::new("card", kind, "barkcli", text, None);
        e.seq = seq;
        e
    }

    #[test]
    fn derives_ordered_timeline() {
        let events = vec![
            ev(1, ThreadEventKind::User, "hi"),
            ev(2, ThreadEventKind::Assistant, "hello"),
            ev(3, ThreadEventKind::ToolCall, "read file"),
            ev(4, ThreadEventKind::Checkpoint, "snap"),
        ];
        let tl = derive_timeline(&events);
        assert_eq!(tl.len(), 4);
        assert!(tl[0].is_message());
        assert!(matches!(tl[2], TimelineEntry::Work { .. }));
        assert!(matches!(tl[3], TimelineEntry::Checkpoint { .. }));
    }

    #[test]
    fn unknown_kind_falls_back_to_event() {
        let events = vec![ev(1, ThreadEventKind::Custom("future_kind".into()), "x")];
        let tl = derive_timeline(&events);
        assert_eq!(tl.len(), 1);
        assert!(matches!(tl[0], TimelineEntry::Event { .. }));
    }

    #[test]
    fn subagent_spawn_complete_forms_one_entry() {
        let mut spawn = ev(1, ThreadEventKind::SubagentSpawned, "explore auth");
        spawn.data = Some(serde_json::json!({ "subagent_id": "sub-1" }));
        let mut done = ev(2, ThreadEventKind::SubagentCompleted, "explore auth");
        done.data = Some(serde_json::json!({ "subagent_id": "sub-1" }));
        let tl = derive_timeline(&[spawn, done]);
        assert_eq!(tl.len(), 1);
        match &tl[0] {
            TimelineEntry::Subagent { status, .. } => assert_eq!(status, "completed"),
            _ => panic!("expected subagent"),
        }
    }

    #[test]
    fn counts_for_run_only_work_kinds() {
        assert!(counts_for_run(&ThreadEventKind::ToolCall));
        assert!(!counts_for_run(&ThreadEventKind::User));
    }

    #[test]
    fn revert_count_binds_checkpoints() {
        let events = vec![
            ev(1, ThreadEventKind::User, "a"),
            ev(2, ThreadEventKind::Checkpoint, "c1"),
            ev(3, ThreadEventKind::ToolCall, "t"),
            ev(4, ThreadEventKind::Checkpoint, "c2"),
        ];
        assert_eq!(revert_count(&events, 3), 1);
        assert_eq!(revert_count(&events, 4), 2);
    }
}
