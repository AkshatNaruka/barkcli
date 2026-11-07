use serde::{Deserialize, Serialize};

use super::catalog::ModelRef;

/// Explainable model selection/assignment record (O2.3/O3.4 foundation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelAssignment {
    pub model: ModelRef,
    pub task_id: String,
    pub role_id: String,
    #[serde(default)]
    pub policy_id: Option<String>,
    pub selection_reason: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub rejected: Vec<RejectedCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectedCandidate {
    pub model: ModelRef,
    pub reason: String,
}
