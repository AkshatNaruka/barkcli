//! Model performance records from verified outcomes (Phase 5 foundation).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelPerformanceRecord {
    pub runtime_id: String,
    pub provider_id: String,
    pub model_id: String,
    #[serde(default)]
    pub task_class: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub attempts: u64,
    #[serde(default)]
    pub verified_successes: u64,
    #[serde(default)]
    pub failures: u64,
    #[serde(default)]
    pub median_duration_ms: Option<u64>,
    #[serde(default)]
    pub median_estimated_cost_usd: Option<f64>,
    #[serde(default)]
    pub interventions: u64,
    #[serde(default)]
    pub regressions_found: u64,
}

impl ModelPerformanceRecord {
    pub fn success_rate(&self) -> Option<f32> {
        if self.attempts == 0 { None } else { Some(self.verified_successes as f32 / self.attempts as f32) }
    }
}
