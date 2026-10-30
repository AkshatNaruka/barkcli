use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::threads::{ThreadEvent, ThreadEventKind};

/// Lifecycle of one agent attempt. A retry creates a new run; old runs remain
/// inspectable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Queued,
    Starting,
    Running,
    Waiting,
    NeedsReview,
    Passed,
    NotVerified,
    Failed,
    Interrupted,
    Cancelled,
    Merged,
}

impl RunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Starting => "starting",
            Self::Running => "running",
            Self::Waiting => "waiting",
            Self::NeedsReview => "needs_review",
            Self::Passed => "passed",
            Self::NotVerified => "not_verified",
            Self::Failed => "failed",
            Self::Interrupted => "interrupted",
            Self::Cancelled => "cancelled",
            Self::Merged => "merged",
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Passed | Self::NotVerified | Self::Failed | Self::Interrupted | Self::Cancelled | Self::Merged
        )
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RunUsage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RunDiffStats {
    #[serde(default)]
    pub files: u32,
    #[serde(default)]
    pub additions: u32,
    #[serde(default)]
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateSummary {
    pub passed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
    pub finished_at: DateTime<Utc>,
    /// Missing on legacy records. A historical boolean alone never authorizes a merge.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification: Option<CheckVerification>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckOutcome {
    NotRun,
    Skipped,
    Running,
    Passed,
    Failed,
    Error,
    Stale,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckVerification {
    pub outcome: CheckOutcome,
    pub tested_head: String,
    pub target_head: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

impl GateSummary {
    pub fn verified(&self) -> bool {
        self.passed
            && self.command.as_deref().is_some_and(|value| !value.trim().is_empty())
            && self.verification.as_ref().is_some_and(|proof| {
                proof.outcome == CheckOutcome::Passed
                    && proof.exit_code == Some(0)
                    && !proof.tested_head.is_empty()
                    && !proof.target_head.is_empty()
            })
    }
}

/// Everything needed to start one provider attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartRun {
    pub run_id: String,
    pub thread_id: String,
    pub card_id: String,
    pub prompt: String,
    pub cwd: String,
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_session_id: Option<String>,
    /// Optional file where raw provider stdout/stderr is preserved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_log_path: Option<String>,
}

fn default_permission_mode() -> String {
    "auto".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunOutcome {
    pub run_id: String,
    pub exit_code: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default)]
    pub interrupted: bool,
}

/// One attempt by an agent, scoped to a thread and a worktree.
/// What a contribution claims. Agora-style research graphs distinguish
/// results from the hypotheses, verifications, reports and failures that
/// surround them; Bark keeps the same distinction on every run node.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ContributionKind {
    #[default]
    Result,
    Hypothesis,
    Verification,
    Report,
    Insight,
    Failure,
}

impl ContributionKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Result => "result",
            Self::Hypothesis => "hypothesis",
            Self::Verification => "verification",
            Self::Report => "report",
            Self::Insight => "insight",
            Self::Failure => "failure",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value.trim().to_lowercase().as_str() {
            "hypothesis" => Self::Hypothesis,
            "verification" | "reproduction" | "reproduce" => Self::Verification,
            "report" => Self::Report,
            "insight" => Self::Insight,
            "failure" | "failed" => Self::Failure,
            _ => Self::Result,
        }
    }
}

/// One independent reproduction of a contribution. `verifier` is an agent id,
/// human handle, or provider name; self-verification is rejected at the store
/// boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Verification {
    pub verifier: String,
    pub passed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunRecord {
    pub id: String,
    pub thread_id: String,
    pub card_id: String,
    #[serde(default = "default_ordinal")]
    pub ordinal: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_run_id: Option<String>,
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    pub status: RunStatus,
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_manifest_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    pub started_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub diff_stats: RunDiffStats,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gate: Option<GateSummary>,
    #[serde(default)]
    pub usage: RunUsage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Contribution-graph metadata. Every field is defaulted so old run files
    /// stay readable; the graph is always on, but degrades to a flat list when
    /// an older node has no edges.
    #[serde(default)]
    pub kind: ContributionKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default)]
    pub contributes_to: Vec<String>,
    #[serde(default)]
    pub verified_by: Vec<String>,
    #[serde(default)]
    pub verifications: Vec<Verification>,
    #[serde(default)]
    pub files_touched: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default)]
    pub evidence_score: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

fn default_ordinal() -> u32 {
    1
}

impl RunRecord {
    pub fn new(start: &StartRun) -> Self {
        Self {
            id: start.run_id.clone(),
            thread_id: start.thread_id.clone(),
            card_id: start.card_id.clone(),
            ordinal: 1,
            parent_run_id: None,
            provider: start.provider.clone(),
            model: start.model.clone(),
            role: start.role.clone(),
            agent_id: start.agent_id.clone(),
            status: RunStatus::Queued,
            permission_mode: start.permission_mode.clone(),
            cwd: Some(start.cwd.clone()),
            worktree: None,
            branch: None,
            base_sha: None,
            head_sha: None,
            context_manifest_id: None,
            provider_session_id: start.provider_session_id.clone(),
            pid: None,
            started_at: Utc::now(),
            ended_at: None,
            exit_code: None,
            diff_stats: RunDiffStats::default(),
            gate: None,
            usage: RunUsage::default(),
            error: None,
            kind: ContributionKind::Result,
            title: None,
            contributes_to: Vec::new(),
            verified_by: Vec::new(),
            verifications: Vec::new(),
            files_touched: Vec::new(),
            author: None,
            evidence_score: 0.0,
            summary: None,
        }
    }

    /// Identity used for independent-verification checks. Explicit author >
    /// agent profile > provider. A verifier may never equal this value.
    pub fn author_id(&self) -> String {
        self.author
            .clone()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| self.agent_id.clone().filter(|value| !value.trim().is_empty()))
            .unwrap_or_else(|| self.provider.clone())
    }

    /// Canonical parent set: the legacy single parent plus every explicit
    /// contribution edge, deduplicated in insertion order.
    pub fn effective_parents(&self) -> Vec<String> {
        let mut parents = Vec::new();
        if let Some(parent) = self.parent_run_id.as_deref() {
            if !parent.trim().is_empty() {
                parents.push(parent.to_string());
            }
        }
        for parent in &self.contributes_to {
            if !parent.trim().is_empty() && !parents.contains(parent) {
                parents.push(parent.clone());
            }
        }
        parents
    }

    pub fn add_parent(&mut self, parent: &str) -> Result<()> {
        let parent = parent.trim();
        if parent.is_empty() {
            bail!("parent run id is required");
        }
        if parent == self.id {
            bail!("a contribution cannot be its own parent");
        }
        if self.effective_parents().iter().any(|existing| existing == parent) {
            return Ok(());
        }
        if self.parent_run_id.is_none() {
            self.parent_run_id = Some(parent.to_string());
        }
        self.contributes_to.push(parent.to_string());
        Ok(())
    }

    pub fn add_verification(
        &mut self,
        verifier: &str,
        passed: bool,
        note: Option<String>,
    ) -> Result<()> {
        let verifier = verifier.trim();
        if verifier.is_empty() {
            bail!("verifier is required");
        }
        if verifier == self.author_id() {
            bail!("self-verification is not allowed; use a different agent or account");
        }
        if self
            .verifications
            .iter()
            .any(|existing| existing.verifier == verifier)
        {
            bail!("{verifier} has already verified this contribution");
        }
        self.verifications.push(Verification {
            verifier: verifier.to_string(),
            passed,
            note,
            at: Utc::now(),
        });
        if passed && !self.verified_by.iter().any(|existing| existing == verifier) {
            self.verified_by.push(verifier.to_string());
        }
        self.evidence_score =
            (1.0 + self.verified_by.len() as f64).ln() + if passed { 0.25 } else { 0.0 };
        Ok(())
    }

    pub fn independent_verifications(&self) -> usize {
        let author = self.author_id();
        let mut verifiers: Vec<&str> = self
            .verifications
            .iter()
            .filter(|verification| verification.passed && verification.verifier != author)
            .map(|verification| verification.verifier.as_str())
            .collect();
        verifiers.sort_unstable();
        verifiers.dedup();
        verifiers.len()
    }

    pub fn apply(&mut self, event: &RuntimeEvent) {
        match event {
            RuntimeEvent::Started { .. } => {
                self.status = RunStatus::Running;
                if self.started_at.timestamp() == 0 {
                    self.started_at = Utc::now();
                }
            }
            RuntimeEvent::Status { status, message } => {
                if let Some(message) = message {
                    if status == "error" {
                        self.error = Some(message.clone());
                    }
                }
                self.status = match status.as_str() {
                    "queued" => RunStatus::Queued,
                    "starting" => RunStatus::Starting,
                    "waiting" => RunStatus::Waiting,
                    "needs_review" => RunStatus::NeedsReview,
                    "passed" => RunStatus::Passed,
                    "not_verified" => RunStatus::NotVerified,
                    "failed" => RunStatus::Failed,
                    "interrupted" => RunStatus::Interrupted,
                    "cancelled" => RunStatus::Cancelled,
                    "merged" => RunStatus::Merged,
                    _ => RunStatus::Running,
                };
            }
            RuntimeEvent::Usage {
                input_tokens,
                output_tokens,
                cached_input_tokens,
                cost_usd,
            } => {
                self.usage.input_tokens = self.usage.input_tokens.saturating_add(*input_tokens);
                self.usage.output_tokens = self.usage.output_tokens.saturating_add(*output_tokens);
                if let Some(cached) = cached_input_tokens {
                    self.usage.cached_input_tokens =
                        Some(self.usage.cached_input_tokens.unwrap_or(0).saturating_add(*cached));
                }
                if cost_usd.is_some() {
                    self.usage.cost_usd = Some(self.usage.cost_usd.unwrap_or(0.0) + cost_usd.unwrap_or(0.0));
                }
            }
            RuntimeEvent::Session { id } => {
                self.provider_session_id = Some(id.clone());
            }
            RuntimeEvent::Context { .. } => {}
            RuntimeEvent::Completed {
                exit_code,
                session_id,
            } => {
                self.status = if *exit_code == 0 {
                    RunStatus::NeedsReview
                } else {
                    RunStatus::Failed
                };
                self.exit_code = Some(*exit_code);
                self.ended_at = Some(Utc::now());
                if session_id.is_some() {
                    self.provider_session_id = session_id.clone();
                }
            }
            RuntimeEvent::Failed {
                message,
                exit_code,
            } => {
                self.status = RunStatus::Failed;
                self.error = Some(message.clone());
                self.exit_code = *exit_code;
                self.ended_at = Some(Utc::now());
            }
            RuntimeEvent::Interrupted => {
                self.status = RunStatus::Interrupted;
                self.ended_at = Some(Utc::now());
            }
            RuntimeEvent::Gate {
                passed,
                command,
                summary,
                log_path,
                verification,
            } => {
                self.gate = Some(GateSummary {
                    passed: *passed,
                    command: command.clone(),
                    summary: Some(summary.clone()),
                    log_path: log_path.clone(),
                    finished_at: Utc::now(),
                    verification: verification.clone(),
                });
                self.status = match verification.as_ref().map(|proof| proof.outcome) {
                    Some(CheckOutcome::Passed) if self.gate.as_ref().is_some_and(GateSummary::verified) => RunStatus::Passed,
                    Some(CheckOutcome::Failed | CheckOutcome::Error) => RunStatus::Failed,
                    Some(CheckOutcome::Running) => RunStatus::Running,
                    _ => RunStatus::NotVerified,
                };
                self.ended_at = if matches!(verification.as_ref().map(|proof| proof.outcome), Some(CheckOutcome::Running)) {
                    None
                } else {
                    Some(Utc::now())
                };
            }
            RuntimeEvent::Diff {
                files,
                additions,
                deletions,
                paths,
            } => {
                self.diff_stats = RunDiffStats {
                    files: *files,
                    additions: *additions,
                    deletions: *deletions,
                };
                if !paths.is_empty() {
                    self.files_touched = paths.clone();
                }
            }
            RuntimeEvent::Merged { .. } => {
                self.status = RunStatus::Merged;
                self.ended_at = Some(Utc::now());
            }
            _ => {}
        }
    }
}

/// Normalized event emitted by a provider adapter. Persist it as a
/// `ThreadEvent` so the thread log remains the single append-only timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuntimeEvent {
    Started {
        provider: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        cwd: String,
    },
    Status {
        status: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    Assistant {
        text: String,
        #[serde(default)]
        partial: bool,
    },
    ToolCall {
        name: String,
        #[serde(default)]
        input: Value,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        output: Option<Value>,
        #[serde(default = "default_tool_status")]
        status: String,
    },
    FileChange {
        path: String,
        #[serde(default = "default_change_kind")]
        change: String,
        #[serde(default)]
        additions: u32,
        #[serde(default)]
        deletions: u32,
    },
    ApprovalRequested {
        id: String,
        title: String,
        #[serde(default)]
        detail: String,
        #[serde(default)]
        options: Vec<String>,
    },
    ApprovalResolved {
        id: String,
        #[serde(default)]
        allowed: bool,
        #[serde(default)]
        note: String,
    },
    Question {
        id: String,
        text: String,
        #[serde(default)]
        options: Vec<String>,
    },
    Answer {
        id: String,
        text: String,
    },
    Usage {
        #[serde(default)]
        input_tokens: u64,
        #[serde(default)]
        output_tokens: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cached_input_tokens: Option<u64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cost_usd: Option<f64>,
    },
    /// A provider session id observed in the stream, used for safe resume.
    Session {
        id: String,
    },
    /// The compiled context pack attached to this run.
    Context {
        manifest_id: String,
        #[serde(default)]
        tokens: usize,
        #[serde(default)]
        stable_tokens: usize,
        #[serde(default)]
        dynamic_tokens: usize,
        #[serde(default)]
        reused: bool,
        #[serde(default)]
        reason: String,
        #[serde(default)]
        skills: Vec<String>,
        #[serde(default)]
        files: Vec<String>,
    },
    Completed {
        #[serde(default)]
        exit_code: i32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
    },
    Failed {
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
    },
    Interrupted,
    Gate {
        #[serde(default)]
        passed: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        command: Option<String>,
        #[serde(default)]
        summary: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        log_path: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        verification: Option<CheckVerification>,
    },
    Diff {
        #[serde(default)]
        files: u32,
        #[serde(default)]
        additions: u32,
        #[serde(default)]
        deletions: u32,
        #[serde(default)]
        paths: Vec<String>,
    },
    Merged {
        branch: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        commit: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        receipt_id: Option<String>,
    },
    Log {
        #[serde(default = "default_log_level")]
        level: String,
        message: String,
    },
}

fn default_tool_status() -> String {
    "completed".to_string()
}
fn default_change_kind() -> String {
    "modified".to_string()
}
fn default_log_level() -> String {
    "info".to_string()
}

impl RuntimeEvent {
    pub fn thread_kind(&self) -> ThreadEventKind {
        match self {
            Self::Started { .. } => ThreadEventKind::RunStarted,
            Self::Status { .. } => ThreadEventKind::RunStatus,
            Self::Assistant { partial: true, .. } => ThreadEventKind::AssistantDelta,
            Self::Assistant { .. } => ThreadEventKind::Assistant,
            Self::ToolCall { .. } => ThreadEventKind::ToolCall,
            Self::FileChange { .. } => ThreadEventKind::FileChange,
            Self::ApprovalRequested { .. } => ThreadEventKind::ApprovalRequested,
            Self::ApprovalResolved { .. } => ThreadEventKind::ApprovalResolved,
            Self::Question { .. } => ThreadEventKind::Question,
            Self::Answer { .. } => ThreadEventKind::Answer,
            Self::Usage { .. } => ThreadEventKind::Usage,
            Self::Session { .. } => ThreadEventKind::RunStatus,
            Self::Context { .. } => ThreadEventKind::ContextCompiled,
            Self::Completed { .. } => ThreadEventKind::RunCompleted,
            Self::Failed { .. } => ThreadEventKind::RunFailed,
            Self::Interrupted => ThreadEventKind::RunInterrupted,
            Self::Gate { .. } => ThreadEventKind::Gate,
            Self::Diff { .. } => ThreadEventKind::Diff,
            Self::Merged { .. } => ThreadEventKind::Merge,
            Self::Log { .. } => ThreadEventKind::Log,
        }
    }

    pub fn summary(&self) -> String {
        match self {
            Self::Started { provider, model, .. } => match model {
                Some(model) => format!("Started {provider} ({model})"),
                None => format!("Started {provider}"),
            },
            Self::Status { status, .. } => format!("Status: {status}"),
            Self::Assistant { text, .. } => text.clone(),
            Self::ToolCall { name, status, .. } => format!("{name} ({status})"),
            Self::FileChange {
                path,
                additions,
                deletions,
                ..
            } => format!("{path} +{additions} -{deletions}"),
            Self::ApprovalRequested { title, .. } => title.clone(),
            Self::ApprovalResolved { id, allowed, .. } => {
                format!("Approval {id}: {}", if *allowed { "allowed" } else { "denied" })
            }
            Self::Question { text, .. } => text.clone(),
            Self::Answer { text, .. } => text.clone(),
            Self::Usage {
                input_tokens,
                output_tokens,
                ..
            } => format!("Tokens: {input_tokens} in / {output_tokens} out"),
            Self::Session { id } => format!("Provider session {id}"),
            Self::Context {
                tokens,
                stable_tokens,
                dynamic_tokens,
                reused,
                ..
            } => format!(
                "Context: {tokens} tokens ({stable_tokens} stable / {dynamic_tokens} dynamic{})",
                if *reused { ", reused" } else { "" }
            ),
            Self::Completed { exit_code, .. } => format!("Run completed (exit {exit_code})"),
            Self::Failed { message, .. } => format!("Run failed: {message}"),
            Self::Interrupted => "Run interrupted".to_string(),
            Self::Gate { passed, command, summary, verification, .. } => {
                let label = match verification.as_ref().map(|proof| proof.outcome) {
                    Some(CheckOutcome::Passed) if *passed => "passed",
                    Some(CheckOutcome::Failed) => "failed",
                    Some(CheckOutcome::Error) => "could not run",
                    Some(CheckOutcome::Running) => "running",
                    Some(CheckOutcome::Stale) => "stale",
                    _ if command.is_none() => "not verified",
                    _ => "not verified",
                };
                format!("Checks {label}: {summary}")
            }
            Self::Diff {
                files,
                additions,
                deletions,
                ..
            } => format!("Diff: {files} files, +{additions} -{deletions}"),
            Self::Merged { branch, .. } => format!("Merged {branch} into main"),
            Self::Log { message, .. } => message.clone(),
        }
    }

    pub fn to_thread_event(&self, card_id: &str, run_id: &str, author: &str) -> ThreadEvent {
        let mut event = ThreadEvent::new(
            card_id,
            self.thread_kind(),
            author,
            self.summary(),
            serde_json::to_value(self).ok(),
        );
        event.run_id = Some(run_id.to_string());
        event.thread_id = Some(card_id.to_string());
        event
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_apply_completed_needs_review() {
        let start = StartRun {
            run_id: "run_1".into(),
            thread_id: "card".into(),
            card_id: "card".into(),
            prompt: "hi".into(),
            cwd: "/tmp".into(),
            provider: "fake".into(),
            model: None,
            role: None,
            agent_id: None,
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        };
        let mut run = RunRecord::new(&start);
        run.apply(&RuntimeEvent::Started {
            provider: "fake".into(),
            model: None,
            cwd: "/tmp".into(),
        });
        assert_eq!(run.status, RunStatus::Running);
        run.apply(&RuntimeEvent::Completed {
            exit_code: 0,
            session_id: Some("sess".into()),
        });
        assert_eq!(run.status, RunStatus::NeedsReview);
        assert_eq!(run.provider_session_id.as_deref(), Some("sess"));
    }

    #[test]
    fn usage_accumulates() {
        let start = StartRun {
            run_id: "run_1".into(),
            thread_id: "card".into(),
            card_id: "card".into(),
            prompt: "hi".into(),
            cwd: "/tmp".into(),
            provider: "fake".into(),
            model: None,
            role: None,
            agent_id: None,
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        };
        let mut run = RunRecord::new(&start);
        run.apply(&RuntimeEvent::Usage {
            input_tokens: 10,
            output_tokens: 4,
            cached_input_tokens: Some(3),
            cost_usd: Some(0.01),
        });
        run.apply(&RuntimeEvent::Usage {
            input_tokens: 5,
            output_tokens: 2,
            cached_input_tokens: None,
            cost_usd: None,
        });
        assert_eq!(run.usage.input_tokens, 15);
        assert_eq!(run.usage.output_tokens, 6);
        assert_eq!(run.usage.cached_input_tokens, Some(3));
    }

    #[test]
    fn event_maps_to_thread_kind() {
        let ev = RuntimeEvent::Assistant {
            text: "hello".into(),
            partial: false,
        };
        assert_eq!(ev.thread_kind(), ThreadEventKind::Assistant);
        let te = ev.to_thread_event("card", "run", "builder");
        assert_eq!(te.run_id.as_deref(), Some("run"));
        assert_eq!(te.thread_id.as_deref(), Some("card"));
    }
}
