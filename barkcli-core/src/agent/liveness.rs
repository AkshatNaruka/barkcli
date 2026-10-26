//! What is *actually* running right now.
//!
//! A card in `doing` is not proof of work: agents crash, terminals close, and
//! worktrees stay behind. This module turns the raw stores (tasks, leases,
//! sessions, notes) into one liveness snapshot so every surface — threads,
//! board, agents, CLI — agrees on the difference between **running** and
//! **stalled**.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};

use super::queue::{TaskQueue, TaskRequest, TaskStatus};
use super::session::list_sessions;

/// A session with no heartbeat for this long is no longer evidence of life.
pub const HEARTBEAT_STALE_MINUTES: i64 = 2;
/// A lease with no refresh for this long is stale even if `expires_at` is far.
pub const LEASE_STALE_MINUTES: i64 = 5;
/// No session, lease, or note for this long → the card is stalled, not running.
pub const STALL_AFTER_MINUTES: i64 = 10;

/// Derived liveness for one board. Cheap to build once per request; never
/// mutates task or session state.
#[derive(Debug, Clone, Default)]
pub struct BoardLiveness {
    /// Task id → newest live evidence (fresh session heartbeat or live lease).
    live_tasks: HashMap<String, DateTime<Utc>>,
    /// Task id → newest evidence of any kind (including notes / creation).
    last_seen_tasks: HashMap<String, DateTime<Utc>>,
    /// Card id → task ids pointing at it.
    tasks_by_card: HashMap<String, Vec<String>>,
}

impl BoardLiveness {
    /// Load the snapshot for `board_name` (the queue file name, no extension).
    pub fn load(board_name: &str) -> Self {
        let now = Utc::now();
        let mut out = Self::default();

        // Sessions: fresh heartbeat is the strongest signal.
        if let Ok(sessions) = list_sessions() {
            for s in sessions {
                let Some(task_id) = s.task_id.clone() else {
                    continue;
                };
                if let Some(hb) = s.last_heartbeat {
                    touch(&mut out.last_seen_tasks, &task_id, hb);
                    let fresh = !s.status.is_terminal()
                        && now.signed_duration_since(hb)
                            < Duration::minutes(HEARTBEAT_STALE_MINUTES);
                    if fresh {
                        touch(&mut out.live_tasks, &task_id, hb);
                    }
                }
            }
        }

        // Tasks: leases and notes keep a task alive between heartbeats and give
        // us a card → task map for thread classification.
        if let Ok(board_dir) = crate::storage::board_dir::find_board_dir() {
            let path = board_dir
                .join("tasks")
                .join(format!("{}.json", board_name));
            if let Ok(queue) = TaskQueue::load(&path) {
                for task in &queue.tasks {
                    out.tasks_by_card
                        .entry(task.card_id.clone())
                        .or_default()
                        .push(task.id.clone());

                    touch(&mut out.last_seen_tasks, &task.id, task.created_at);

                    if let Some(lease) = &task.lease {
                        let lease_fresh = !lease.is_expired(now)
                            && now.signed_duration_since(lease.last_heartbeat)
                                < Duration::minutes(LEASE_STALE_MINUTES);
                        if lease_fresh {
                            touch(&mut out.live_tasks, &task.id, lease.last_heartbeat);
                        }
                        touch(&mut out.last_seen_tasks, &task.id, lease.last_heartbeat);
                    }

                    if let Some(note) = task.notes.last() {
                        touch(&mut out.last_seen_tasks, &task.id, note.at);
                    }
                }
            }
        }

        out
    }

    /// Is this task backed by a fresh session or live lease?
    pub fn is_task_live(&self, task: &TaskRequest) -> bool {
        !task.status.is_terminal() && self.live_tasks.contains_key(&task.id)
    }

    /// Active task with no recent evidence: the agent is gone but the lease
    /// (or the card column) still says "in progress".
    pub fn task_stalled(&self, task: &TaskRequest) -> bool {
        if task.status.is_terminal() {
            return false;
        }
        if !matches!(task.status, TaskStatus::Assigned | TaskStatus::InProgress) {
            return false;
        }
        if self.is_task_live(task) {
            return false;
        }
        match self.last_seen_tasks.get(&task.id) {
            Some(seen) => {
                Utc::now().signed_duration_since(*seen) >= Duration::minutes(STALL_AFTER_MINUTES)
            }
            // No evidence at all: only "stalled" once it is old enough that a
            // freshly created task would not be mislabelled.
            None => {
                Utc::now().signed_duration_since(task.created_at)
                    >= Duration::minutes(STALL_AFTER_MINUTES)
            }
        }
    }

    /// Newest evidence for a task.
    pub fn last_seen(&self, task_id: &str) -> Option<DateTime<Utc>> {
        self.last_seen_tasks.get(task_id).copied()
    }

    /// `Some(true)` = a live task points at this card, `Some(false)` = tasks
    /// exist but none are alive, `None` = no task linked to the card.
    pub fn card_running(&self, card_id: &str) -> Option<bool> {
        let tasks = self.tasks_by_card.get(card_id)?;
        Some(tasks.iter().any(|id| self.live_tasks.contains_key(id)))
    }

    /// Newest evidence across every task linked to the card.
    pub fn card_last_seen(&self, card_id: &str) -> Option<DateTime<Utc>> {
        self.tasks_by_card
            .get(card_id)?
            .iter()
            .filter_map(|id| self.last_seen_tasks.get(id).copied())
            .max()
    }

    /// Number of live tasks on the board.
    pub fn live_count(&self) -> usize {
        self.live_tasks.len()
    }
}

fn touch(map: &mut HashMap<String, DateTime<Utc>>, key: &str, at: DateTime<Utc>) {
    match map.get(key) {
        Some(existing) if *existing >= at => {}
        _ => {
            map.insert(key.to_string(), at);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::queue::{create_task, ProgressNote};

    fn task(status: TaskStatus, age_minutes: i64) -> TaskRequest {
        let mut t = create_task("card-1", "Ship it", "", vec![], vec![], "medium");
        t.status = status;
        t.created_at = Utc::now() - Duration::minutes(age_minutes);
        t
    }

    #[test]
    fn fresh_task_is_not_stalled() {
        let live = BoardLiveness::default();
        let t = task(TaskStatus::InProgress, 1);
        assert!(!live.task_stalled(&t));
    }

    #[test]
    fn old_task_with_no_evidence_is_stalled() {
        let live = BoardLiveness::default();
        let t = task(TaskStatus::InProgress, 60);
        assert!(live.task_stalled(&t));
    }

    #[test]
    fn terminal_tasks_are_never_stalled() {
        let live = BoardLiveness::default();
        let t = task(TaskStatus::Completed, 600);
        assert!(!live.task_stalled(&t));
    }

    #[test]
    fn recent_note_keeps_task_alive() {
        let mut live = BoardLiveness::default();
        let mut t = task(TaskStatus::InProgress, 60);
        let now = Utc::now();
        t.notes.push(ProgressNote {
            at: now,
            author: "agent".into(),
            text: "still working".into(),
        });
        live.last_seen_tasks.insert(t.id.clone(), now);
        assert!(!live.task_stalled(&t));
    }
}
