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
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            default_board: None,
            default_columns: default_columns(),
            default_labels: vec!["frontend".into(), "backend".into(), "bug".into(), "enhancement".into()],
            priorities: vec!["high".into(), "medium".into(), "low".into()],
        }
    }
}

fn default_columns() -> Vec<String> {
    vec!["todo".into(), "doing".into(), "review".into(), "done".into()]
}
