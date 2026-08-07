use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: u32,
    #[serde(default)]
    pub default_board: Option<String>,
    #[serde(default = "default_columns")]
    pub default_columns: Vec<String>,
    #[serde(default)]
    pub default_labels: Vec<String>,
    #[serde(default)]
    pub priorities: Vec<String>,
    /// Per-project AI provider settings (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai: Option<AiSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiSettings {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub base_url: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub model: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            default_board: None,
            default_columns: default_columns(),
            default_labels: vec!["frontend".into(), "backend".into(), "bug".into(), "enhancement".into()],
            priorities: vec!["high".into(), "medium".into(), "low".into()],
            ai: None,
        }
    }
}

fn default_columns() -> Vec<String> {
    vec!["todo".into(), "doing".into(), "review".into(), "done".into()]
}
