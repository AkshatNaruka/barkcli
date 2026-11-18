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

/// What a hook run does when it exits non-zero or times out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum HookFailure {
    /// Record a warning and continue (default).
    #[default]
    Warn,
    /// Treat the attempt as failed.
    Block,
}

/// One external hook: a shell command the harness runs at a lifecycle event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HarnessHook {
    /// `attempt.start` | `pre_spawn` | `post_agent` | `post_gate` |
    /// `pre_merge` | `attempt.end`.
    pub event: String,
    pub command: String,
    #[serde(default = "default_hook_timeout")]
    pub timeout_secs: u64,
    #[serde(default)]
    pub on_failure: HookFailure,
}

fn default_hook_timeout() -> u64 {
    30
}

/// Context assembly knobs for one attempt.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContextSettings {
    /// Token budget for the assembled prompt (0 = harness default).
    #[serde(default = "default_packet_budget")]
    pub budget_tokens: usize,
    /// Read `project_context.md`, `AGENTS.md` and `.board/rules/*.md`.
    #[serde(default = "default_true")]
    pub instructions: bool,
    /// Include matched skills (top body + index).
    #[serde(default = "default_true")]
    pub skills: bool,
    /// Strip HTML comments from instruction layers.
    #[serde(default = "default_true")]
    pub strip_comments: bool,
    /// Code-index evidence: `auto` (use `leantoken` when it is installed) or
    /// `off`. Anything else falls back to `auto`.
    #[serde(default = "default_code_index")]
    pub code_index: String,
    /// Token budget for the code-index request (0 = harness default).
    #[serde(default = "default_code_index_budget")]
    pub code_index_budget_tokens: usize,
    /// Paste the returned source instead of only pointing at ranges.
    #[serde(default)]
    pub code_index_snippets: bool,
    /// Optional extra blacklist patterns excluded from code-index evidence.
    #[serde(default)]
    pub code_index_blacklist: Vec<String>,
}

fn default_packet_budget() -> usize {
    8_000
}

fn default_code_index() -> String {
    "auto".into()
}

fn default_code_index_budget() -> usize {
    800
}

impl Default for ContextSettings {
    fn default() -> Self {
        Self {
            budget_tokens: default_packet_budget(),
            instructions: true,
            skills: true,
            strip_comments: true,
            code_index: default_code_index(),
            code_index_budget_tokens: default_code_index_budget(),
            code_index_snippets: false,
            code_index_blacklist: Vec::new(),
        }
    }
}

impl ContextSettings {
    /// Is the code index enabled (and not explicitly turned off)?
    pub fn code_index_enabled(&self) -> bool {
        !self.code_index.trim().eq_ignore_ascii_case("off")
    }
}

/// Backend permission flags derived for each spawn.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PermissionSettings {
    /// Claude `--permission-mode` (`acceptEdits` for unattended runs).
    #[serde(default = "default_permission_mode")]
    pub mode: String,
    /// Claude `--allowedTools` list; empty means the backend default.
    #[serde(default = "default_allowed_tools")]
    pub allowed_tools: Vec<String>,
    /// Codex `--sandbox` mode.
    #[serde(default = "default_sandbox")]
    pub sandbox: String,
}

fn default_permission_mode() -> String {
    "acceptEdits".into()
}

fn default_allowed_tools() -> Vec<String> {
    vec!["Read".into(), "Edit".into(), "Bash".into()]
}

fn default_sandbox() -> String {
    "workspace-write".into()
}

impl Default for PermissionSettings {
    fn default() -> Self {
        Self {
            mode: default_permission_mode(),
            allowed_tools: default_allowed_tools(),
            sandbox: default_sandbox(),
        }
    }
}

/// Independent review of a candidate change (verifier subagent).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VerifySettings {
    /// Run a verifier after the gate passes and before the merge.
    #[serde(default)]
    pub enabled: bool,
    /// Shell command that receives the review prompt on stdin.
    /// `BARKCLI_VERIFIER_CMD` overrides it; with neither set the run's own
    /// backend is used with a fresh context.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// Timeout for one review.
    #[serde(default = "default_verify_timeout")]
    pub timeout_secs: u64,
    /// A `FAIL` re-queues the task with the verifier's reason. Set to `false`
    /// to record the review and merge anyway (advisory mode).
    #[serde(default = "default_true")]
    pub block_on_fail: bool,
}

fn default_verify_timeout() -> u64 {
    180
}

impl Default for VerifySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            command: None,
            timeout_secs: default_verify_timeout(),
            block_on_fail: true,
        }
    }
}

/// Hard ceiling on what one `barkcli run` may spend.
///
/// This is the run-level complement to `orchestra::budget`, which decides
/// whether a *paid model* may be selected. The ceiling stops dispatching new
/// work once the run's accumulated cost reaches the limit; in-flight attempts
/// always finish, so a run never leaves a half-written worktree behind.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BudgetSettings {
    /// `None` (default) means no ceiling.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_run_usd: Option<f64>,
}

impl Default for BudgetSettings {
    fn default() -> Self {
        Self { max_run_usd: None }
    }
}

/// Harness v2 settings: context assembly, retry checkpoints, hooks,
/// permissions, review and spend. Every field defaults, so an older
/// `config.json` still loads.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessSettings {
    #[serde(default)]
    pub context: ContextSettings,
    /// Reset the task branch to its checkpoint before a retry.
    #[serde(default = "default_true")]
    pub retry_reset: bool,
    #[serde(default)]
    pub hooks: Vec<HarnessHook>,
    #[serde(default)]
    pub permissions: PermissionSettings,
    #[serde(default)]
    pub verify: VerifySettings,
    #[serde(default)]
    pub budget: BudgetSettings,
}

impl Default for HarnessSettings {
    fn default() -> Self {
        Self {
            context: ContextSettings::default(),
            retry_reset: true,
            hooks: Vec::new(),
            permissions: PermissionSettings::default(),
            verify: VerifySettings::default(),
            budget: BudgetSettings::default(),
        }
    }
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
    /// Harness v2: context packet, retry checkpoints, hooks, permissions.
    #[serde(default)]
    pub harness: HarnessSettings,
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
            harness: HarnessSettings::default(),
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
    fn old_config_without_harness_fields_gets_defaults() {
        let json = r#"{"version": 1, "default_columns": ["todo"]}"#;
        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.harness.context.budget_tokens, 8_000);
        assert!(config.harness.context.skills);
        assert!(config.harness.retry_reset);
        assert!(config.harness.hooks.is_empty());
        assert_eq!(config.harness.permissions.mode, "acceptEdits");
        assert_eq!(
            config.harness.permissions.allowed_tools,
            vec!["Read", "Edit", "Bash"]
        );
        assert_eq!(config.harness.permissions.sandbox, "workspace-write");
    }

    #[test]
    fn harness_config_roundtrips_hooks() {
        let mut config = Config::default();
        config.harness.retry_reset = false;
        config.harness.hooks.push(HarnessHook {
            event: "pre_merge".into(),
            command: "scripts/policy.sh".into(),
            timeout_secs: 5,
            on_failure: HookFailure::Block,
        });
        let json = serde_json::to_string(&config).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert!(!parsed.harness.retry_reset);
        assert_eq!(parsed.harness.hooks.len(), 1);
        assert_eq!(parsed.harness.hooks[0].on_failure, HookFailure::Block);
        assert_eq!(parsed.harness.hooks[0].timeout_secs, 5);
    }

    #[test]
    fn hook_failure_defaults_to_warn() {
        let json = r#"{"event":"post_gate","command":"true"}"#;
        let hook: HarnessHook = serde_json::from_str(json).unwrap();
        assert_eq!(hook.on_failure, HookFailure::Warn);
        assert_eq!(hook.timeout_secs, 30);
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
