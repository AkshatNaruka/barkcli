use serde::{Deserialize, Serialize};

/// Experimental/runtime switches. Defaults are conservative so existing
/// users keep the legacy thread path until the new runtime is dogfooded.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSettings {
    #[serde(default)]
    pub runtime_v2: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_provider: Option<String>,
    #[serde(default = "default_context_budget")]
    pub context_budget_tokens: usize,
    #[serde(default)]
    pub auto_merge: bool,
}

fn default_context_budget() -> usize {
    32_000
}

impl Default for RuntimeSettings {
    fn default() -> Self {
        Self {
            runtime_v2: false,
            default_provider: None,
            context_budget_tokens: default_context_budget(),
            auto_merge: false,
        }
    }
}

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
    /// Runtime/feature switches.
    #[serde(default)]
    pub runtime: RuntimeSettings,
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
            runtime: RuntimeSettings::default(),
        }
    }
}

fn default_columns() -> Vec<String> {
    vec!["todo".into(), "doing".into(), "review".into(), "done".into()]
}
