use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Task request sent to a coding agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRequest {
    pub id: String,
    pub card_id: String,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    pub context_files: Vec<FileContext>,
    pub branch: Option<String>,
    pub priority: String,
    pub assigned_agent: Option<String>,
    pub created_at: DateTime<Utc>,
    pub status: TaskStatus,
    pub attempts: u32,
    pub max_attempts: u32,
    pub deadline: Option<DateTime<Utc>>,
    pub dependencies: Vec<String>,
    pub metadata: TaskMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContext {
    pub path: String,
    pub content: Option<String>,
    pub symbols: Vec<String>,
    pub call_graph: Option<String>,
    pub test_coverage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMetadata {
    pub estimated_effort: Option<u32>,
    pub risk_score: Option<f32>,
    pub created_by: Option<String>,
    pub role: Option<String>,
}

impl Default for TaskMetadata {
    fn default() -> Self {
        Self {
            estimated_effort: None,
            risk_score: None,
            created_by: None,
            role: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Assigned,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub fn display_name(&self) -> &str {
        match self {
            TaskStatus::Pending => "Pending",
            TaskStatus::Assigned => "Assigned",
            TaskStatus::InProgress => "In Progress",
            TaskStatus::Completed => "Completed",
            TaskStatus::Failed => "Failed",
            TaskStatus::Cancelled => "Cancelled",
        }
    }
}

/// Result returned by a coding agent after completing a task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub status: CompletionStatus,
    pub files_changed: Vec<String>,
    pub commit_sha: Option<String>,
    pub summary: String,
    pub tests_passed: Option<bool>,
    pub duration_ms: u64,
    pub error_message: Option<String>,
    pub artifacts: Vec<Artifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompletionStatus {
    Success,
    PartialSuccess,
    Failed,
    NeedsReview,
}

impl CompletionStatus {
    pub fn display_name(&self) -> &str {
        match self {
            CompletionStatus::Success => "Success",
            CompletionStatus::PartialSuccess => "Partial Success",
            CompletionStatus::Failed => "Failed",
            CompletionStatus::NeedsReview => "Needs Review",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub name: String,
    pub path: String,
    pub artifact_type: ArtifactType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArtifactType {
    Code,
    Test,
    Documentation,
    Config,
    Other,
}

/// Task queue for managing tasks
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskQueue {
    pub tasks: Vec<TaskRequest>,
}

/// Persistent store for completed task results.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskResults {
    pub results: Vec<TaskResult>,
}

impl TaskResults {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a result entry.
    pub fn add(&mut self, result: TaskResult) {
        self.results.push(result);
    }

    /// Get result by task ID.
    pub fn for_task(&self, task_id: &str) -> Option<&TaskResult> {
        self.results.iter().find(|r| r.task_id == task_id)
    }

    /// Get results for a card.
    pub fn for_card(&self, card_id: &str) -> Vec<&TaskResult> {
        // Results don't directly reference card_id, but tasks do.
        // This is a convenience that requires cross-referencing.
        self.results.iter().collect()
    }

    /// Save results to file.
    pub fn save(&self, path: &Path) -> Result<()> {
        crate::util::lock::with_lock(path, || {
            let json = serde_json::to_string_pretty(self)?;
            std::fs::write(path, json).context("Failed to write task results")?;
            Ok(())
        })
    }

    /// Load results from file.
    pub fn load(path: &Path) -> Result<Self> {
        crate::util::lock::with_lock(path, || {
            if !path.exists() {
                return Ok(Self::new());
            }
            let json = std::fs::read_to_string(path).context("Failed to read task results")?;
            let results = serde_json::from_str(&json)?;
            Ok(results)
        })
    }
}

impl TaskQueue {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a task to the queue
    pub fn add(&mut self, task: TaskRequest) {
        self.tasks.push(task);
    }

    /// Get next pending task, respecting dependency order.
    ///
    /// A task with unmet dependencies is skipped — its dependencies must be
    /// completed first. Dependencies are resolved by checking the `dependencies`
    /// field (task IDs) and the `card_id` field (parent card must be done).
    pub fn next_pending(&self) -> Option<&TaskRequest> {
        self.tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Pending)
            .filter(|t| self.dependencies_met(t))
            .min_by_key(|t| {
                // Sort by priority, then by creation time
                let priority_score = match t.priority.as_str() {
                    "critical" => 0,
                    "high" => 1,
                    "medium" => 2,
                    "low" => 3,
                    _ => 4,
                };
                (priority_score, t.created_at)
            })
    }

    /// Check if all dependencies for a task are completed.
    fn dependencies_met(&self, task: &TaskRequest) -> bool {
        task.dependencies.iter().all(|dep_id| {
            self.tasks
                .iter()
                .any(|t| t.id == *dep_id && t.status == TaskStatus::Completed)
        })
    }

    /// Get tasks by status
    pub fn by_status(&self, status: &TaskStatus) -> Vec<&TaskRequest> {
        self.tasks.iter().filter(|t| t.status == *status).collect()
    }

    /// Get task by ID
    pub fn get(&self, id: &str) -> Option<&TaskRequest> {
        self.tasks.iter().find(|t| t.id == id)
    }

    /// Get mutable task by ID
    pub fn get_mut(&mut self, id: &str) -> Option<&mut TaskRequest> {
        self.tasks.iter_mut().find(|t| t.id == id)
    }

    /// Update task status
    pub fn update_status(&mut self, id: &str, status: TaskStatus) -> Result<()> {
        let task = self.get_mut(id).context("Task not found")?;
        task.status = status;
        Ok(())
    }

    /// Claim a task for an agent
    pub fn claim(&mut self, task_id: &str, agent_id: &str) -> Result<()> {
        let task = self.get_mut(task_id).context("Task not found")?;
        if task.status != TaskStatus::Pending {
            anyhow::bail!("Task is not pending");
        }
        task.status = TaskStatus::Assigned;
        task.assigned_agent = Some(agent_id.to_string());
        Ok(())
    }

    /// Start working on a task
    pub fn start(&mut self, task_id: &str) -> Result<()> {
        let task = self.get_mut(task_id).context("Task not found")?;
        if task.status != TaskStatus::Assigned {
            anyhow::bail!("Task is not assigned");
        }
        task.status = TaskStatus::InProgress;
        Ok(())
    }

    /// Complete a task
    pub fn complete(&mut self, task_id: &str) -> Result<()> {
        let task = self.get_mut(task_id).context("Task not found")?;
        task.status = TaskStatus::Completed;
        Ok(())
    }

    /// Fail a task
    pub fn fail(&mut self, task_id: &str) -> Result<()> {
        let task = self.get_mut(task_id).context("Task not found")?;
        task.attempts += 1;
        if task.attempts >= task.max_attempts {
            task.status = TaskStatus::Failed;
        } else {
            task.status = TaskStatus::Pending;
            task.assigned_agent = None;
        }
        Ok(())
    }

    /// Cancel a task
    pub fn cancel(&mut self, task_id: &str) -> Result<()> {
        let task = self.get_mut(task_id).context("Task not found")?;
        task.status = TaskStatus::Cancelled;
        Ok(())
    }

    /// Get tasks for a specific card
    pub fn for_card(&self, card_id: &str) -> Vec<&TaskRequest> {
        self.tasks.iter().filter(|t| t.card_id == card_id).collect()
    }

    /// Get tasks assigned to an agent
    pub fn for_agent(&self, agent_id: &str) -> Vec<&TaskRequest> {
        self.tasks
            .iter()
            .filter(|t| t.assigned_agent.as_deref() == Some(agent_id))
            .collect()
    }

    /// Get task count by status
    pub fn count_by_status(&self) -> std::collections::HashMap<TaskStatus, usize> {
        let mut counts = std::collections::HashMap::new();
        for task in &self.tasks {
            *counts.entry(task.status.clone()).or_insert(0) += 1;
        }
        counts
    }

    /// Save queue to file (with advisory file lock + atomic rename).
    pub fn save(&self, path: &Path) -> Result<()> {
        crate::util::lock::with_lock(path, || {
            let json = serde_json::to_string_pretty(self)?;
            let tmp = path.with_extension(format!(
                "{}.tmp",
                path.extension().and_then(|e| e.to_str()).unwrap_or("json")
            ));
            std::fs::write(&tmp, json).context("Failed to write tmp queue")?;
            std::fs::rename(&tmp, path).context("Failed to rename queue")?;
            Ok(())
        })
    }

    /// Load queue from file (with advisory file lock for concurrent access).
    pub fn load(path: &Path) -> Result<Self> {
        crate::util::lock::with_lock(path, || {
            if !path.exists() {
                return Ok(Self::new());
            }
            let json = std::fs::read_to_string(path).context("Failed to read task queue")?;
            let queue = serde_json::from_str(&json)?;
            Ok(queue)
        })
    }
}

/// Populate FileContext entries from the board's code context for a given card.
pub fn populate_context_files(card_id: &str, board_name: &str) -> Vec<FileContext> {
    let ctx = match crate::storage::context::read_context(board_name) {
        Ok(ctx) => ctx,
        Err(_) => return Vec::new(),
    };

    let card_ctx = match ctx.cards.get(card_id) {
        Some(c) => c,
        None => return Vec::new(),
    };

    card_ctx
        .files
        .iter()
        .map(|f| FileContext {
            path: f.path.clone(),
            content: std::fs::read_to_string(&f.path).ok(),
            symbols: f.symbols.clone(),
            call_graph: None,
            test_coverage: card_ctx
                .test_coverage
                .as_ref()
                .map(|tc| {
                    serde_json::to_string(tc).unwrap_or_default()
                }),
        })
        .collect()
}

/// Create a new task request
pub fn create_task(
    card_id: &str,
    title: &str,
    description: &str,
    acceptance_criteria: Vec<String>,
    context_files: Vec<FileContext>,
    priority: &str,
) -> TaskRequest {
    TaskRequest {
        id: format!("task-{}", uuid::Uuid::new_v4()),
        card_id: card_id.to_string(),
        title: title.to_string(),
        description: description.to_string(),
        acceptance_criteria,
        context_files,
        branch: None,
        priority: priority.to_string(),
        assigned_agent: None,
        created_at: Utc::now(),
        status: TaskStatus::Pending,
        attempts: 0,
        max_attempts: 3,
        deadline: None,
        dependencies: Vec::new(),
        metadata: TaskMetadata::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_queue() {
        let mut queue = TaskQueue::new();
        let task = create_task(
            "card-1",
            "Test Task",
            "Description",
            vec![],
            vec![],
            "high",
        );
        queue.add(task);

        assert_eq!(queue.tasks.len(), 1);
        assert!(queue.next_pending().is_some());

        let task_id = queue.tasks[0].id.clone();
        queue.claim(&task_id, "agent-1").unwrap();
        assert_eq!(queue.get(&task_id).unwrap().status, TaskStatus::Assigned);

        queue.start(&task_id).unwrap();
        assert_eq!(queue.get(&task_id).unwrap().status, TaskStatus::InProgress);

        queue.complete(&task_id).unwrap();
        assert_eq!(queue.get(&task_id).unwrap().status, TaskStatus::Completed);
    }

    #[test]
    fn test_task_retry() {
        let mut queue = TaskQueue::new();
        let mut task = create_task("card-1", "Test", "Desc", vec![], vec![], "medium");
        task.max_attempts = 2;
        queue.add(task);

        let task_id = queue.tasks[0].id.clone();
        queue.claim(&task_id, "agent-1").unwrap();
        queue.start(&task_id).unwrap();
        queue.fail(&task_id).unwrap();

        // Should be pending again (1 attempt used)
        assert_eq!(queue.get(&task_id).unwrap().status, TaskStatus::Pending);
        assert_eq!(queue.get(&task_id).unwrap().attempts, 1);

        // Fail again - should be failed (2 attempts used)
        queue.claim(&task_id, "agent-1").unwrap();
        queue.start(&task_id).unwrap();
        queue.fail(&task_id).unwrap();
        assert_eq!(queue.get(&task_id).unwrap().status, TaskStatus::Failed);
    }
}
