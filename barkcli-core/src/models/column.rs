use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wip_limit: Option<usize>,
}

impl Column {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            wip_limit: None,
        }
    }

    pub fn with_wip_limit(id: impl Into<String>, name: impl Into<String>, limit: usize) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            wip_limit: Some(limit),
        }
    }
}
