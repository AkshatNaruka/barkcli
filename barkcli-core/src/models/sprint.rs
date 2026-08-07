use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A sprint with optional date range, stored in `.board/sprints/<board>.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprint {
    pub name: String,
    /// YYYY-MM-DD
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<String>,
    /// YYYY-MM-DD
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<String>,
    #[serde(default = "default_now")]
    pub created_at: DateTime<Utc>,
}

fn default_now() -> DateTime<Utc> {
    Utc::now()
}

impl Sprint {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            start: None,
            end: None,
            created_at: Utc::now(),
        }
    }
}
