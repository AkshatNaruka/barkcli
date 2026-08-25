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

impl TaskQueue {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a task to the queue
    pub fn add(&mut self, task: TaskRequest) {
        self.tasks.push(task);
    }

    /// Get next pending task
    pub fn next_pending(&self) -> Option<&TaskRequest> {
        self.tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Pending)
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

    /// Save queue to file
    pub fn save(&self, path: &Path) -> Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json).context("Failed to write task queue")?;
        Ok(())
    }

    /// Load queue from file
    pub fn load(path: &Path) -> Result<Self> {
        let json = std::fs::read_to_string(path).context("Failed to read task queue")?;
        let queue = serde_json::from_str(&json)?;
        Ok(queue)
    }
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
