use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BudgetPolicy {
    #[serde(default)]
    pub allow_paid: bool,
    #[serde(default)]
    pub require_approval_for_paid: bool,
    #[serde(default)]
    pub daily_limit_usd: Option<f64>,
    #[serde(default)]
    pub estimated_spend_usd: f64,
}

impl BudgetPolicy {
    pub fn can_use_paid(&self, estimated_cost_usd: f64) -> Result<(), String> {
        if !self.allow_paid {
            return Err("paid models are disabled by budget policy".into());
        }
        if let Some(limit) = self.daily_limit_usd {
            if self.estimated_spend_usd + estimated_cost_usd > limit {
                return Err(format!(
                    "estimated spend ${:.4} exceeds daily limit ${:.2}",
                    self.estimated_spend_usd + estimated_cost_usd,
                    limit
                ));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResourceCapacity {
    #[serde(default = "default_parallel")]
    pub max_parallel_workers: u32,
    #[serde(default)]
    pub active_workers: u32,
}

fn default_parallel() -> u32 { 3 }

impl ResourceCapacity {
    pub fn has_slot(&self) -> bool {
        self.active_workers < self.max_parallel_workers
    }
}
