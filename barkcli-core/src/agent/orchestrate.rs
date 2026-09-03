use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::{Board, Card, Sprint};

use super::capacity::{VelocityTracker, calculate_velocity_from_data};
use super::decompose::{CardDecompositionContext, TaskPlan, decompose_task};
use super::identity::{AgentIdentity, AgentRegistry, AgentStatus};
use super::queue::{TaskQueue, TaskRequest, TaskResult, TaskStatus};
use super::roles::AgentRole;

/// Orchestration engine state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationState {
    pub board_name: String,
    pub role: AgentRole,
    pub status: OrchestrationStatus,
    pub cycle_count: usize,
    pub last_cycle_at: Option<DateTime<Utc>>,
    pub tasks_dispatched: usize,
    pub tasks_completed: usize,
    pub tasks_failed: usize,
    pub current_sprint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrchestrationStatus {
    Idle,
    Planning,
    Dispatching,
    Monitoring,
    Evaluating,
    Paused,
    Error,
}

impl OrchestrationStatus {
    pub fn display_name(&self) -> &str {
        match self {
            OrchestrationStatus::Idle => "Idle",
            OrchestrationStatus::Planning => "Planning",
            OrchestrationStatus::Dispatching => "Dispatching",
            OrchestrationStatus::Monitoring => "Monitoring",
            OrchestrationStatus::Evaluating => "Evaluating",
            OrchestrationStatus::Paused => "Paused",
            OrchestrationStatus::Error => "Error",
        }
    }
}

/// Orchestration engine
pub struct OrchestrationEngine {
    pub state: OrchestrationState,
    pub board: Board,
    pub task_queue: TaskQueue,
    pub agent_registry: AgentRegistry,
    pub velocity: VelocityTracker,
    pub board_path: std::path::PathBuf,
}

impl OrchestrationEngine {
    /// Create a new orchestration engine — loads persisted queue/registry/velocity if present (SPEC-001).
    pub fn new(board_name: &str, role: AgentRole, board: Board) -> Result<Self> {
        let board_dir = crate::storage::board_dir::find_board_dir()
            .context("Failed to find board directory")?;

        // Try to restore previous orchestration state (cycle count, etc.)
        let existing_state = Self::load_state(board_name).ok().flatten();
        let state = existing_state.unwrap_or(OrchestrationState {
            board_name: board_name.to_string(),
            role: role.clone(),
            status: OrchestrationStatus::Idle,
            cycle_count: 0,
            last_cycle_at: None,
            tasks_dispatched: 0,
            tasks_completed: 0,
            tasks_failed: 0,
            current_sprint: None,
        });

        // Load persisted task queue
        let tasks_path = board_dir.join("tasks").join(format!("{}.json", board_name));
        let task_queue = TaskQueue::load(&tasks_path).unwrap_or_default();

        // Load persisted agent registry
        let registry_path = board_dir.join("agents").join("registry.json");
        let agent_registry = AgentRegistry::load(&registry_path).unwrap_or_default();

        // Velocity tracker — new for MVP (deferred full wiring, but persisted)
        let velocity = VelocityTracker::new();

        Ok(Self {
            state,
            board,
            task_queue,
            agent_registry,
            velocity,
            board_path: board_dir,
        })
    }

    /// Run a single orchestration cycle
    pub fn run_cycle(&mut self) -> Result<CycleResult> {
        self.state.status = OrchestrationStatus::Planning;
        self.state.cycle_count += 1;
        self.state.last_cycle_at = Some(Utc::now());

        let mut result = CycleResult {
            cycle_number: self.state.cycle_count,
            tasks_created: 0,
            tasks_dispatched: 0,
            tasks_completed: 0,
            tasks_failed: 0,
            insights: Vec::new(),
        };

        // 1. Analyze board state
        let analysis = self.analyze_board();
        result.insights.extend(analysis.insights);

        // 2. Decompose ready cards
        self.state.status = OrchestrationStatus::Dispatching;
        let decomposed = self.decompose_ready_cards();
        result.tasks_created = decomposed.len();

        // 3. Dispatch tasks to agents
        for plan in decomposed {
            if let Err(e) = self.dispatch_task(&plan) {
                result.insights.push(format!("Failed to dispatch: {}", e));
            } else {
                result.tasks_dispatched += 1;
            }
        }

        // 4. Monitor active tasks
        self.state.status = OrchestrationStatus::Monitoring;
        let monitoring = self.monitor_tasks();
        result.tasks_completed = monitoring.completed;
        result.tasks_failed = monitoring.failed;
        result.insights.extend(monitoring.insights);

        // 5. Evaluate results
        self.state.status = OrchestrationStatus::Evaluating;
        let evaluation = self.evaluate_results();
        result.insights.extend(evaluation.insights);

        // Update state
        self.state.tasks_dispatched += result.tasks_dispatched;
        self.state.tasks_completed += result.tasks_completed;
        self.state.tasks_failed += result.tasks_failed;
        self.state.status = OrchestrationStatus::Idle;

        // Save state
        self.save_state()?;

        Ok(result)
    }

    /// Analyze current board state
    fn analyze_board(&self) -> AnalysisResult {
        let mut result = AnalysisResult {
            insights: Vec::new(),
        };

        // Count cards by column
        let mut column_counts: HashMap<&str, usize> = HashMap::new();
        for card in &self.board.cards {
            *column_counts.entry(&card.column).or_insert(0) += 1;
        }

        // Check for bottlenecks
        if let Some(&doing_count) = column_counts.get("doing") {
            if doing_count > 5 {
                result.insights.push(format!(
                    "Bottleneck detected: {} cards in doing column",
                    doing_count
                ));
            }
        }

        // Check for blocked cards
        let blocked: Vec<&Card> = self
            .board
            .cards
            .iter()
            .filter(|c| {
                c.links
                    .iter()
                    .any(|l| l.ty == crate::models::card::LinkType::BlockedBy)
            })
            .collect();

        if !blocked.is_empty() {
            result.insights.push(format!(
                "{} cards are blocked by dependencies",
                blocked.len()
            ));
        }

        // Check for stale cards (not updated in 7 days)
        let stale_threshold = Utc::now() - chrono::Duration::days(7);
        let stale: Vec<&Card> = self
            .board
            .cards
            .iter()
            .filter(|c| c.updated_at < stale_threshold && c.column != "done")
            .collect();

        if !stale.is_empty() {
            result.insights.push(format!(
                "{} cards haven't been updated in over 7 days",
                stale.len()
            ));
        }

        result
    }

    /// Decompose cards that are ready for work
    fn decompose_ready_cards(&mut self) -> Vec<TaskPlan> {
        let mut plans = Vec::new();

        for card in &self.board.cards {
            // Only decompose cards in "todo" column
            if card.column != "todo" {
                continue;
            }

            // Check if card already has active tasks
            let has_active_tasks = self
                .task_queue
                .for_card(&card.id)
                .iter()
                .any(|t| {
                    t.status == TaskStatus::InProgress || t.status == TaskStatus::Assigned
                });

            if has_active_tasks {
                continue;
            }

            // Check if card is blocked
            let is_blocked = card.links.iter().any(|l| {
                l.ty == crate::models::card::LinkType::BlockedBy
                    && self
                        .board
                        .cards
                        .iter()
                        .any(|c| c.id == l.target && c.column != "done")
            });

            if is_blocked {
                continue;
            }

            // Decompose the card
            let context = CardDecompositionContext::default();
            let plan = decompose_task(card, &self.state.role, Some(&context));
            plans.push(plan);
        }

        plans
    }

    /// Dispatch a task plan to the queue — populates context_files per SPEC-001 R3.
    fn dispatch_task(&mut self, plan: &TaskPlan) -> Result<()> {
        for child in &plan.child_cards {
            let ctx_files = super::queue::populate_context_files(&plan.parent_card, &self.state.board_name);
            let task = super::queue::create_task(
                &plan.parent_card,
                &child.title,
                &child.description,
                child.acceptance_criteria.clone(),
                ctx_files,
                &child.priority,
            );
            self.task_queue.add(task);
        }
        // Persist queue immediately so restart sees it
        let tasks_path = self.board_path.join("tasks").join(format!("{}.json", self.state.board_name));
        if let Some(parent) = tasks_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        self.task_queue.save(&tasks_path)?;
        Ok(())
    }

    /// Monitor active tasks
    fn monitor_tasks(&self) -> MonitoringResult {
        let mut result = MonitoringResult {
            completed: 0,
            failed: 0,
            insights: Vec::new(),
        };

        for task in &self.task_queue.tasks {
            match task.status {
                TaskStatus::Completed => result.completed += 1,
                TaskStatus::Failed => result.failed += 1,
                _ => {}
            }
        }

        // Check for stuck tasks
        let stuck_threshold = Utc::now() - chrono::Duration::hours(24);
        for task in &self.task_queue.tasks {
            if task.status == TaskStatus::InProgress {
                if let Some(agent_id) = &task.assigned_agent {
                    if let Some(agent) = self.agent_registry.get(agent_id) {
                        if let Some(last_active) = agent.last_active {
                            if last_active < stuck_threshold {
                                result.insights.push(format!(
                                    "Task {} may be stuck (agent {} last active {})",
                                    task.id,
                                    agent_id,
                                    last_active
                                ));
                            }
                        }
                    }
                }
            }
        }

        result
    }

    /// Evaluate completed results
    fn evaluate_results(&self) -> EvaluationResult {
        let mut result = EvaluationResult {
            insights: Vec::new(),
        };

        let completed = self.task_queue.by_status(&TaskStatus::Completed);
        let failed = self.task_queue.by_status(&TaskStatus::Failed);

        if !completed.is_empty() {
            result.insights.push(format!(
                "{} tasks completed this cycle",
                completed.len()
            ));
        }

        if !failed.is_empty() {
            result.insights.push(format!(
                "{} tasks failed this cycle",
                failed.len()
            ));
        }

        // Calculate success rate
        let total = completed.len() + failed.len();
        if total > 0 {
            let success_rate = completed.len() as f32 / total as f32;
            result.insights.push(format!(
                "Task success rate: {:.1}%",
                success_rate * 100.0
            ));
        }

        result
    }

    /// Save orchestration state
    fn save_state(&self) -> Result<()> {
        let state_path = self.board_path.join("orchestration").join(format!("{}.json", self.state.board_name));
        if let Some(parent) = state_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&self.state)?;
        std::fs::write(&state_path, json)?;
        Ok(())
    }

    /// Load orchestration state
    pub fn load_state(board_name: &str) -> Result<Option<OrchestrationState>> {
        let board_dir = crate::storage::board_dir::find_board_dir()?;
        let state_path = board_dir.join("orchestration").join(format!("{}.json", board_name));

        if state_path.exists() {
            let json = std::fs::read_to_string(&state_path)?;
            let state = serde_json::from_str(&json)?;
            Ok(Some(state))
        } else {
            Ok(None)
        }
    }
}

#[derive(Debug, Clone)]
pub struct AnalysisResult {
    pub insights: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MonitoringResult {
    pub completed: usize,
    pub failed: usize,
    pub insights: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct EvaluationResult {
    pub insights: Vec<String>,
}

/// Cycle result from orchestration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CycleResult {
    pub cycle_number: usize,
    pub tasks_created: usize,
    pub tasks_dispatched: usize,
    pub tasks_completed: usize,
    pub tasks_failed: usize,
    pub insights: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_orchestration_state() {
        let state = OrchestrationState {
            board_name: "test".to_string(),
            role: AgentRole::ScrumMaster,
            status: OrchestrationStatus::Idle,
            cycle_count: 0,
            last_cycle_at: None,
            tasks_dispatched: 0,
            tasks_completed: 0,
            tasks_failed: 0,
            current_sprint: None,
        };

        assert_eq!(state.status, OrchestrationStatus::Idle);
        assert_eq!(state.cycle_count, 0);
    }
}
