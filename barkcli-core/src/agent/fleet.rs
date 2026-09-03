use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::identity::{AgentRegistry, AgentStatus};
use super::queue::{TaskQueue, TaskRequest, TaskStatus};
use super::roles::AgentRole;

/// One ranked, runnable task with the reason it was chosen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadyItem {
    pub task_id: String,
    pub title: String,
    pub priority: String,
    pub score: f32,
    pub reason: String,
}

/// File-overlap report between open tasks (F5: collision avoidance).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlapReport {
    pub task_id: String,
    pub overlapping_tasks: Vec<String>,
    pub shared_files: Vec<String>,
}

fn files_of(task: &TaskRequest) -> HashSet<String> {
    task.context_files.iter().map(|f| f.path.clone()).collect()
}

/// Which open tasks share context files with `task_id`?
pub fn overlap(queue: &TaskQueue, task_id: &str) -> OverlapReport {
    let empty = OverlapReport {
        task_id: task_id.to_string(),
        overlapping_tasks: Vec::new(),
        shared_files: Vec::new(),
    };
    let Some(task) = queue.get(task_id) else {
        return empty;
    };
    let mine = files_of(task);
    if mine.is_empty() {
        return empty;
    }
    let mut overlapping = Vec::new();
    let mut shared: HashSet<String> = HashSet::new();
    for other in &queue.tasks {
        if other.id == task_id || other.status.is_terminal() {
            continue;
        }
        // Only live claims matter for collisions.
        if !other.status.is_active() {
            continue;
        }
        let theirs = files_of(other);
        let common: Vec<String> = mine.intersection(&theirs).cloned().collect();
        if !common.is_empty() {
            overlapping.push(format!(
                "{} ({})",
                other.id,
                other
                    .assigned_agent
                    .as_deref()
                    .unwrap_or("unassigned")
            ));
            shared.extend(common);
        }
    }
    let mut shared_files: Vec<String> = shared.into_iter().collect();
    shared_files.sort();
    OverlapReport {
        task_id: task_id.to_string(),
        overlapping_tasks: overlapping,
        shared_files,
    }
}

fn priority_score(priority: &str) -> f32 {
    match priority {
        "critical" => 0.0,
        "high" => 1.0,
        "medium" => 2.0,
        "low" => 3.0,
        _ => 4.0,
    }
}

/// Score every runnable task for a given agent role.
///
/// score = priority + staleness_bonus − overlap_penalty − success_bonus
/// Lower is better. Reasons are human-readable for `ready()` output.
pub fn dispatch_scores(
    queue: &TaskQueue,
    registry: &AgentRegistry,
    role: &AgentRole,
) -> Vec<ReadyItem> {
    let mut items = Vec::new();
    for task in queue
        .tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Pending)
        .filter(|t| {
            // Dependencies must be completed (reuse queue logic via public scan).
            t.dependencies.iter().all(|dep_id| {
                queue
                    .tasks
                    .iter()
                    .any(|o| o.id == *dep_id && o.status == TaskStatus::Completed)
            })
        })
    {
        let mut score = priority_score(&task.priority);
        let mut reasons = vec![format!("priority {}", task.priority)];

        // Prefer tasks that have been waiting longest (up to -0.5).
        let age_hours = (Utc::now() - task.created_at).num_hours().max(0) as f32;
        let age_bonus = (age_hours / 48.0).min(0.5);
        score -= age_bonus;
        if age_bonus > 0.05 {
            reasons.push(format!("waiting {}h", age_hours as i64));
        }

        // Penalize file overlap with actively-worked tasks.
        let rep = overlap(queue, &task.id);
        if !rep.overlapping_tasks.is_empty() {
            score += 1.5;
            reasons.push(format!(
                "overlaps {} ({} shared files)",
                rep.overlapping_tasks.join(", "),
                rep.shared_files.len()
            ));
        }

        // Prefer roles with a good track record for this role.
        if let Some(_agent) = registry.best_agent_for_task(role) {
            score -= 0.1;
            reasons.push(format!("role {:?} available", role));
        }

        items.push(ReadyItem {
            task_id: task.id.clone(),
            title: task.title.clone(),
            priority: task.priority.clone(),
            score,
            reason: reasons.join("; "),
        });
    }
    items.sort_by(|a, b| {
        a.score
            .partial_cmp(&b.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items
}

/// Fleet reconciler state (persisted per board).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ReconcilerState {
    pub board_name: String,
    pub max_agents: usize,
    pub lease_minutes: i64,
    pub backend: Option<String>,
    pub running: bool,
    pub started_at: Option<chrono::DateTime<Utc>>,
    pub cycles: u64,
    pub spawned_sessions: Vec<String>,
}

/// The reconcile loop brain: given queue + registry + sessions-aliveness,
/// decide what to do next. Pure logic — spawning lives in the CLI layer.
pub struct FleetReconciler {
    pub state: ReconcilerState,
}

impl FleetReconciler {
    pub fn new(board_name: &str, max_agents: usize, lease_minutes: i64) -> Self {
        Self {
            state: ReconcilerState {
                board_name: board_name.to_string(),
                max_agents,
                lease_minutes,
                backend: None,
                running: false,
                started_at: None,
                cycles: 0,
                spawned_sessions: Vec::new(),
            },
        }
    }

    pub fn state_path(board_name: &str) -> Result<PathBuf> {
        let board_dir = crate::storage::board_dir::find_board_dir()?;
        Ok(board_dir.join("fleet").join(format!("{}.json", board_name)))
    }

    pub fn load(board_name: &str) -> Result<Self> {
        let path = Self::state_path(board_name)?;
        if !path.exists() {
            return Ok(Self::new(board_name, 5, 30));
        }
        let json = std::fs::read_to_string(&path).context("Failed to read fleet state")?;
        let state = serde_json::from_str(&json)?;
        Ok(Self { state })
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::state_path(&self.state.board_name)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        crate::util::lock::with_lock(&path, || {
            let json = serde_json::to_string_pretty(&self.state)?;
            std::fs::write(&path, json).context("Failed to write fleet state")?;
            Ok(())
        })
    }

    /// How many more sessions may be spawned right now?
    ///
    /// Fleet spawns fresh agent processes per task, so the budget is simply:
    /// `min(max_agents − live_claims, runnable_tasks)`, where a live claim
    /// is an active task whose lease session is still alive.
    pub fn spawn_budget(
        &self,
        queue: &TaskQueue,
        registry: &AgentRegistry,
        live_session_ids: &HashSet<String>,
    ) -> usize {
        let live_claims = queue
            .tasks
            .iter()
            .filter(|t| t.status.is_active())
            .filter(|t| {
                t.lease
                    .as_ref()
                    .and_then(|l| l.session_id.as_ref())
                    .map(|sid| live_session_ids.contains(sid))
                    .unwrap_or(false)
            })
            .count();
        let runnable = dispatch_scores(queue, registry, &AgentRole::TechLead).len();
        self.state.max_agents.saturating_sub(live_claims).min(runnable)
    }

    /// Task counts by status for `fleet status`.
    pub fn task_counts(queue: &TaskQueue) -> HashMap<String, usize> {
        let mut map = HashMap::new();
        for t in &queue.tasks {
            *map.entry(t.status.display_name().to_string()).or_insert(0) += 1;
        }
        map
    }

    /// Agent counts by status for `fleet status`.
    pub fn agent_counts(registry: &AgentRegistry) -> HashMap<String, usize> {
        let mut map = HashMap::new();
        for a in &registry.agents {
            let key = match a.status {
                AgentStatus::Idle => "idle",
                AgentStatus::Working => "working",
                AgentStatus::Paused => "paused",
                AgentStatus::Error => "error",
            };
            *map.entry(key.to_string()).or_insert(0) += 1;
        }
        map
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::queue::create_task;

    fn test_queue() -> TaskQueue {
        let mut q = TaskQueue::new();
        q.add(create_task("c1", "High task", "d", vec![], vec![], "high"));
        q.add(create_task("c2", "Low task", "d", vec![], vec![], "low"));
        q
    }

    #[test]
    fn test_dispatch_scores_priority_order() {
        let q = test_queue();
        let reg = AgentRegistry::new();
        let items = dispatch_scores(&q, &reg, &AgentRole::TechLead);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].priority, "high");
        assert!(items[0].score < items[1].score);
    }

    #[test]
    fn test_overlap_empty_without_context() {
        let q = test_queue();
        let id = q.tasks[0].id.clone();
        let rep = overlap(&q, &id);
        assert!(rep.overlapping_tasks.is_empty());
    }

    #[test]
    fn test_spawn_budget_capped() {
        let q = test_queue();
        let reg = AgentRegistry::new();
        let rec = FleetReconciler::new("b", 1, 30);
        let live = HashSet::new();
        // max_agents=1, no live claims, 2 runnable → budget 1.
        assert_eq!(rec.spawn_budget(&q, &reg, &live), 1);

        let rec0 = FleetReconciler::new("b", 0, 30);
        assert_eq!(rec0.spawn_budget(&q, &reg, &live), 0);
    }
}
