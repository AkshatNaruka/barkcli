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

/// Deterministic pre-merge scan settings (Trust Layer).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Block merges on error findings. Advisory (`false`) by default in v1.
    #[serde(default)]
    pub block: bool,
    #[serde(default = "default_checks")]
    pub checks: Vec<String>,
    #[serde(default = "default_large_diff_files")]
    pub large_diff_files: u32,
    #[serde(default = "default_large_diff_lines")]
    pub large_diff_lines: u32,
}

impl Default for GuardSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            block: false,
            checks: default_checks(),
            large_diff_files: default_large_diff_files(),
            large_diff_lines: default_large_diff_lines(),
        }
    }
}

/// Receipt generation settings (Trust Layer).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptSettings {
    #[serde(default = "default_true")]
    pub auto: bool,
}

impl Default for ReceiptSettings {
    fn default() -> Self {
        Self { auto: true }
    }
}

fn default_true() -> bool {
    true
}

fn default_checks() -> Vec<String> {
    vec![
        "secret".into(),
        "undeclared_dependency".into(),
        "suspicious_dependency".into(),
        "lockfile_drift".into(),
        "dangerous_pattern".into(),
        "missing_tests".into(),
        "debug_leftover".into(),
        "large_diff".into(),
    ]
}

fn default_large_diff_files() -> u32 {
    40
}

fn default_large_diff_lines() -> u32 {
    800
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
    /// Trust Layer: deterministic pre-merge scan.
    #[serde(default)]
    pub guard: GuardSettings,
    /// Trust Layer: merge receipts.
    #[serde(default)]
    pub receipts: ReceiptSettings,
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
            guard: GuardSettings::default(),
            receipts: ReceiptSettings::default(),
        }
    }
}

fn default_columns() -> Vec<String> {
    vec!["todo".into(), "doing".into(), "review".into(), "done".into()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_config_without_trust_fields_deserializes() {
        let json = r#"{
            "version": 1,
            "default_columns": ["todo", "doing", "done"]
        }"#;
        let config: Config = serde_json::from_str(json).unwrap();
        assert!(config.guard.enabled);
        assert!(!config.guard.block);
        assert_eq!(config.guard.checks.len(), 8);
        assert!(config.receipts.auto);
    }

    #[test]
    fn guard_defaults_are_advisory() {
        let guard = GuardSettings::default();
        assert!(guard.enabled);
        assert!(!guard.block, "guard must not block merges by default");
        assert_eq!(guard.large_diff_files, 40);
        assert_eq!(guard.large_diff_lines, 800);
    }

    #[test]
    fn trust_config_roundtrips() {
        let mut config = Config::default();
        config.guard.block = true;
        config.guard.checks = vec!["secret".into()];
        config.receipts.auto = false;

        let json = serde_json::to_string(&config).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert!(parsed.guard.block);
        assert_eq!(parsed.guard.checks, vec!["secret"]);
        assert!(!parsed.receipts.auto);
    }
}
