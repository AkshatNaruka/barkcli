//! Safe model handoff artifacts (Phase 4/O4.4 foundation).
//! A handoff captures verified workspace/task state for a replacement session/model.
//! Claims must be backed by files/tests/events, not model self-report.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffArtifact {
    pub task_id: String,
    pub previous_runtime: String,
    pub previous_model: Option<String>,
    pub previous_session_id: Option<String>,
    #[serde(default)]
    pub completed: Vec<String>,
    #[serde(default)]
    pub remaining: Vec<String>,
    #[serde(default)]
    pub required_files: Vec<String>,
    #[serde(default)]
    pub tests_passed: u32,
    #[serde(default)]
    pub tests_failed: u32,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
    pub verified_context: bool,
    pub branch: Option<String>,
    pub worktree: Option<String>,
}
