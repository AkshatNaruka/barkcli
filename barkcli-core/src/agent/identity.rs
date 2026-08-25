use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::roles::AgentRole;

/// Agent identity and state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub id: String,
    pub name: String,
    pub role: AgentRole,
    pub created_at: DateTime<Utc>,
    pub last_active: Option<DateTime<Utc>>,
    pub status: AgentStatus,
    pub active_tasks: Vec<String>,
    pub completed_tasks: Vec<String>,
    pub failed_tasks: Vec<String>,
    pub total_time_ms: u64,
    pub metadata: AgentMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentStatus {
    Idle,
    Working,
    Paused,
    Error,
}

impl AgentStatus {
    pub fn display_name(&self) -> &str {
        match self {
            AgentStatus::Idle => "Idle",
            AgentStatus::Working => "Working",
            AgentStatus::Paused => "Paused",
            AgentStatus::Error => "Error",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentMetadata {
    pub model: Option<String>,
    pub provider: Option<String>,
    pub max_concurrent_tasks: usize,
    pub total_tokens_used: u64,
    pub avg_task_duration_ms: u64,
}

impl AgentMetadata {
    pub fn new() -> Self {
        Self {
            model: None,
            provider: None,
            max_concurrent_tasks: 3, // Default to 3 concurrent tasks
            total_tokens_used: 0,
            avg_task_duration_ms: 0,
        }
    }
}

impl AgentIdentity {
    pub fn new(id: &str, name: &str, role: AgentRole) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            role,
            created_at: Utc::now(),
            last_active: None,
            status: AgentStatus::Idle,
            active_tasks: Vec::new(),
            completed_tasks: Vec::new(),
            failed_tasks: Vec::new(),
            total_time_ms: 0,
            metadata: AgentMetadata::new(),
        }
    }

    /// Mark agent as working on a task
    pub fn start_task(&mut self, task_id: &str) {
        self.active_tasks.push(task_id.to_string());
        self.status = AgentStatus::Working;
        self.last_active = Some(Utc::now());
    }

    /// Mark a task as completed
    pub fn complete_task(&mut self, task_id: &str, duration_ms: u64) {
        self.active_tasks.retain(|t| t != task_id);
        self.completed_tasks.push(task_id.to_string());
        self.total_time_ms += duration_ms;

        if self.active_tasks.is_empty() {
            self.status = AgentStatus::Idle;
        }

        self.last_active = Some(Utc::now());
    }

    /// Mark a task as failed
    pub fn fail_task(&mut self, task_id: &str) {
        self.active_tasks.retain(|t| t != task_id);
        self.failed_tasks.push(task_id.to_string());

        if self.active_tasks.is_empty() {
            self.status = AgentStatus::Idle;
        }

        self.last_active = Some(Utc::now());
    }

    /// Get success rate
    pub fn success_rate(&self) -> f32 {
        let total = self.completed_tasks.len() + self.failed_tasks.len();
        if total == 0 {
            0.0
        } else {
            self.completed_tasks.len() as f32 / total as f32
        }
    }

    /// Get average task duration
    pub fn avg_task_duration(&self) -> u64 {
        if self.completed_tasks.is_empty() {
            0
        } else {
            self.total_time_ms / self.completed_tasks.len() as u64
        }
    }

    /// Check if agent can take on more tasks
    pub fn can_accept_task(&self) -> bool {
        self.status != AgentStatus::Error
            && self.active_tasks.len() < self.metadata.max_concurrent_tasks
    }

    /// Save agent state to file
    pub fn save(&self, path: &Path) -> Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json).context("Failed to write agent state")?;
        Ok(())
    }

    /// Load agent state from file
    pub fn load(path: &Path) -> Result<Self> {
        let json = std::fs::read_to_string(path).context("Failed to read agent state")?;
        let agent = serde_json::from_str(&json)?;
        Ok(agent)
    }
}

/// Agent registry for managing multiple agents
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentRegistry {
    pub agents: Vec<AgentIdentity>,
}

impl AgentRegistry {
    pub fn new() -> Self {
        Self {
            agents: Vec::new(),
        }
    }

    /// Register a new agent
    pub fn register(&mut self, agent: AgentIdentity) {
        self.agents.push(agent);
    }

    /// Get agent by ID
    pub fn get(&self, id: &str) -> Option<&AgentIdentity> {
        self.agents.iter().find(|a| a.id == id)
    }

    /// Get mutable agent by ID
    pub fn get_mut(&mut self, id: &str) -> Option<&mut AgentIdentity> {
        self.agents.iter_mut().find(|a| a.id == id)
    }

    /// Remove agent by ID
    pub fn remove(&mut self, id: &str) -> Option<AgentIdentity> {
        self.agents.iter().position(|a| a.id == id).map(|i| self.agents.remove(i))
    }

    /// Get all idle agents
    pub fn idle_agents(&self) -> Vec<&AgentIdentity> {
        self.agents.iter().filter(|a| a.status == AgentStatus::Idle && a.can_accept_task()).collect()
    }

    /// Get agents by role
    pub fn by_role(&self, role: &AgentRole) -> Vec<&AgentIdentity> {
        self.agents.iter().filter(|a| a.role == *role).collect()
    }

    /// Get best agent for a task (based on role and availability)
    pub fn best_agent_for_task(&self, role: &AgentRole) -> Option<&AgentIdentity> {
        self.agents
            .iter()
            .filter(|a| a.role == *role && a.can_accept_task())
            .min_by_key(|a| a.active_tasks.len())
    }

    /// Save registry to file
    pub fn save(&self, path: &Path) -> Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json).context("Failed to write agent registry")?;
        Ok(())
    }

    /// Load registry from file
    pub fn load(path: &Path) -> Result<Self> {
        let json = std::fs::read_to_string(path).context("Failed to read agent registry")?;
        let registry = serde_json::from_str(&json)?;
        Ok(registry)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_identity() {
        let mut agent = AgentIdentity::new("agent-1", "Test Agent", AgentRole::ScrumMaster);
        assert_eq!(agent.status, AgentStatus::Idle);
        assert!(agent.can_accept_task());

        agent.start_task("task-1");
        assert_eq!(agent.status, AgentStatus::Working);
        assert_eq!(agent.active_tasks.len(), 1);

        agent.complete_task("task-1", 1000);
        assert_eq!(agent.status, AgentStatus::Idle);
        assert_eq!(agent.completed_tasks.len(), 1);
        assert_eq!(agent.total_time_ms, 1000);
    }

    #[test]
    fn test_agent_registry() {
        let mut registry = AgentRegistry::new();
        let agent = AgentIdentity::new("agent-1", "Test Agent", AgentRole::ScrumMaster);
        registry.register(agent);

        assert!(registry.get("agent-1").is_some());
        assert!(registry.get("agent-2").is_none());

        let idle = registry.idle_agents();
        assert_eq!(idle.len(), 1);

        let removed = registry.remove("agent-1");
        assert!(removed.is_some());
        assert!(registry.get("agent-1").is_none());
    }

    #[test]
    fn test_success_rate() {
        let mut agent = AgentIdentity::new("agent-1", "Test", AgentRole::TechLead);
        agent.complete_task("t1", 100);
        agent.complete_task("t2", 100);
        agent.fail_task("t3");

        assert!((agent.success_rate() - 0.666).abs() < 0.01);
    }
}
