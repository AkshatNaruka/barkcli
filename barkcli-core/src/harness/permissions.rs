//! Per-backend permission flags derived from `harness.permissions`.
//!
//! An unattended agent needs write access inside its worktree and nothing
//! else. Before this module each backend carried hard-coded flags in
//! `Recipe::command`, so a project could not tighten or loosen them; codex
//! always got `workspace-write`, claude always `acceptEdits` + `Read,Edit,Bash`.
//!
//! The derivation is deliberately small and explicit: each backend gets only
//! the flags it actually understands, and a value the backend would reject is
//! normalised to the safe default instead of failing the spawn.

use crate::agent::session::SessionBackend;
use crate::models::config::PermissionSettings;

/// Claude's unattended default when config leaves the field blank.
pub const DEFAULT_MODE: &str = "acceptEdits";
/// Codex's unattended default when config leaves the field blank.
pub const DEFAULT_SANDBOX: &str = "workspace-write";

/// What the harness told the backend to allow, for the run record / manifest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedPermissions {
    pub backend: String,
    pub flags: Vec<String>,
}

impl AppliedPermissions {
    /// `claude: --permission-mode acceptEdits --allowedTools Read,Edit,Bash`
    pub fn summary(&self) -> String {
        if self.flags.is_empty() {
            return format!("{}: backend defaults", self.backend);
        }
        format!("{}: {}", self.backend, self.flags.join(" "))
    }
}

fn backend_name(backend: &SessionBackend) -> String {
    match backend {
        SessionBackend::Opencode => "opencode".into(),
        SessionBackend::ClaudeCode => "claude".into(),
        SessionBackend::Codex => "codex".into(),
        SessionBackend::Fx => "fx".into(),
        SessionBackend::Human => "human".into(),
    }
}

/// Normalise a mode/sandbox value: blank or whitespace falls back to `default`.
fn clean(value: &str, default: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        default.to_string()
    } else {
        trimmed.to_string()
    }
}

/// Tools as the backend expects them, dropping blanks and duplicates.
pub fn allowed_tools(settings: &PermissionSettings) -> Vec<String> {
    let mut tools: Vec<String> = Vec::new();
    for tool in &settings.allowed_tools {
        let tool = tool.trim();
        if tool.is_empty() {
            continue;
        }
        if !tools.iter().any(|t| t == tool) {
            tools.push(tool.to_string());
        }
    }
    tools
}

/// Flags to append to a backend's command line.
pub fn flags(backend: &SessionBackend, settings: &PermissionSettings) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    match backend {
        SessionBackend::ClaudeCode => {
            out.push("--permission-mode".into());
            out.push(clean(&settings.mode, DEFAULT_MODE));
            let tools = allowed_tools(settings);
            if !tools.is_empty() {
                out.push("--allowedTools".into());
                out.push(tools.join(","));
            }
        }
        SessionBackend::Codex => {
            out.push("--sandbox".into());
            out.push(clean(&settings.sandbox, DEFAULT_SANDBOX));
        }
        // OpenCode's `--auto` is part of its recipe (it is the headless mode,
        // not a permission scope); `fx` and `human` spawn nothing.
        SessionBackend::Opencode | SessionBackend::Fx | SessionBackend::Human => {}
    }
    out
}

/// Derive the effective policy for one spawn.
pub fn apply(backend: &SessionBackend, settings: &PermissionSettings) -> AppliedPermissions {
    AppliedPermissions {
        backend: backend_name(backend),
        flags: flags(backend, settings),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_defaults_match_the_previous_hard_coded_flags() {
        let applied = apply(&SessionBackend::ClaudeCode, &PermissionSettings::default());
        assert_eq!(
            applied.flags,
            vec![
                "--permission-mode",
                "acceptEdits",
                "--allowedTools",
                "Read,Edit,Bash"
            ]
        );
        assert!(applied.summary().starts_with("claude: --permission-mode"));
    }

    #[test]
    fn claude_honours_a_tighter_policy() {
        let settings = PermissionSettings {
            mode: "plan".into(),
            allowed_tools: vec!["Read".into(), " Bash(git:*) ".into(), "Read".into(), "".into()],
            sandbox: String::new(),
        };
        let flags = flags(&SessionBackend::ClaudeCode, &settings);
        assert_eq!(
            flags,
            vec!["--permission-mode", "plan", "--allowedTools", "Read,Bash(git:*)"]
        );
    }

    #[test]
    fn empty_tool_list_omits_the_flag() {
        let settings = PermissionSettings {
            allowed_tools: Vec::new(),
            ..PermissionSettings::default()
        };
        assert!(!flags(&SessionBackend::ClaudeCode, &settings)
            .iter()
            .any(|f| f == "--allowedTools"));
    }

    #[test]
    fn blank_values_fall_back_to_safe_defaults() {
        let settings = PermissionSettings {
            mode: "   ".into(),
            sandbox: "".into(),
            ..PermissionSettings::default()
        };
        assert_eq!(
            flags(&SessionBackend::ClaudeCode, &settings)[1],
            DEFAULT_MODE
        );
        assert_eq!(flags(&SessionBackend::Codex, &settings), vec!["--sandbox", DEFAULT_SANDBOX]);
    }

    #[test]
    fn codex_gets_only_a_sandbox_scope() {
        let settings = PermissionSettings {
            sandbox: "read-only".into(),
            ..PermissionSettings::default()
        };
        assert_eq!(
            flags(&SessionBackend::Codex, &settings),
            vec!["--sandbox", "read-only"]
        );
    }

    #[test]
    fn opencode_and_human_get_no_extra_flags() {
        for backend in [SessionBackend::Opencode, SessionBackend::Human] {
            let applied = apply(&backend, &PermissionSettings::default());
            assert!(applied.flags.is_empty());
            assert!(applied.summary().ends_with("backend defaults"));
        }
    }
}
