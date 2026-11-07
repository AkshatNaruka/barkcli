//! Subagent model: provider-native vs app-owned children of a thread.
//!
//! t3code distinguishes:
//! - `provider_native`: spawned by the provider CLI stack, cannot receive
//!   messages from the user. Surfaced read-only.
//! - `app_owned`: spawned by barkcli itself (delegate_task), fully steerable.
//! - `remote_child`: delegated to a linked environment.
//!
//! Subagent threads are hidden from the thread navigator (see
//! [`super::ThreadSummary::hidden`]) but their spans render in the parent
//! timeline via [`super::timeline::TimelineEntry::Subagent`].

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// How a subagent was created and whether it can be steered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentKind {
    /// Spawned inside the provider CLI (e.g. claude's Task tool).
    ProviderNative,
    /// Spawned by barkcli with its own session + worktree.
    AppOwned,
    /// Delegated to a linked environment.
    RemoteChild,
}

impl SubagentKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ProviderNative => "provider_native",
            Self::AppOwned => "app_owned",
            Self::RemoteChild => "remote_child",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "native" | "provider_native" | "provider-native" => Self::ProviderNative,
            "remote" | "remote_child" | "remote-child" => Self::RemoteChild,
            _ => Self::AppOwned,
        }
    }

    /// App-owned subagents can receive steer messages; provider-native cannot.
    pub fn can_receive_messages(&self) -> bool {
        matches!(self, Self::AppOwned | Self::RemoteChild)
    }

    /// Hidden from thread lists (subagent threads still get their own log).
    pub fn hidden_from_lists(&self) -> bool {
        true
    }
}

/// Lifecycle of a subagent span.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentStatus {
    Running,
    Completed,
    Failed,
    Interrupted,
}

impl SubagentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Interrupted => "interrupted",
        }
    }
}

/// One subagent record. Persisted as a sidecar of the parent thread
/// (`.board/threads/<card>.subagents.json`) so it survives session restarts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subagent {
    pub id: String,
    pub kind: SubagentKind,
    pub status: SubagentStatus,
    pub parent_thread_id: String,
    /// The thread that holds this subagent's conversation log.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// Disposable session driving it (none for provider-native).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_session_id: Option<String>,
    #[serde(default)]
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub tool_calls: u32,
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
}

impl Subagent {
    pub fn new(parent_thread_id: impl Into<String>, kind: SubagentKind, label: impl Into<String>, prompt: impl Into<String>) -> Self {
        Self {
            id: format!("sub-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]),
            kind,
            status: SubagentStatus::Running,
            parent_thread_id: parent_thread_id.into(),
            thread_id: None,
            session_id: None,
            provider_session_id: None,
            label: label.into(),
            model: None,
            prompt: prompt.into(),
            created_at: Utc::now(),
            ended_at: None,
            tool_calls: 0,
            input_tokens: 0,
            output_tokens: 0,
        }
    }

    pub fn finish(&mut self, status: SubagentStatus) {
        self.status = status;
        self.ended_at = Some(Utc::now());
    }

    pub fn is_terminal(&self) -> bool {
        self.status != SubagentStatus::Running
    }
}

/// Delegate request: spawn an app-owned child on the same thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelegateRequest {
    pub label: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_app_owned_receives_messages() {
        assert!(!SubagentKind::ProviderNative.can_receive_messages());
        assert!(SubagentKind::AppOwned.can_receive_messages());
        assert!(SubagentKind::RemoteChild.can_receive_messages());
    }

    #[test]
    fn all_kinds_hidden_from_lists() {
        assert!(SubagentKind::ProviderNative.hidden_from_lists());
        assert!(SubagentKind::AppOwned.hidden_from_lists());
    }

    #[test]
    fn kind_parse_defaults_to_app_owned() {
        assert_eq!(SubagentKind::parse("banana"), SubagentKind::AppOwned);
        assert_eq!(SubagentKind::parse("provider_native"), SubagentKind::ProviderNative);
    }

    #[test]
    fn subagent_roundtrip() {
        let s = Subagent::new("th-1", SubagentKind::AppOwned, "explore", "find auth");
        let json = serde_json::to_string(&s).unwrap();
        let back: Subagent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, s.id);
        assert_eq!(back.kind, SubagentKind::AppOwned);
    }
}
