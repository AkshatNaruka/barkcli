//! Accepted vs Completed: the two-level state model.
//!
//! t3code's sharpest guarantee, adopted here: calling `accept` on a command
//! means *"the intent is durably committed"*, never *"the work finished"*.
//! This module models the two transitions as separate, separately-observable
//! facts so UI, CLI, and automation never mistake one for the other.
//!
//! ```text
//!   command ──► [Accepted] ──► (outbox effects run) ──► [Completed]
//!                   │                                        ▲
//!              receipt durably                      follow-up command
//!              committed                            (gate result, provider
//!                                                     exit, merge ack)
//! ```
//!
//! Two independent lifecycles use this vocabulary:
//!
//! 1. **Command receipt** ([`super::command::CommandReceipt::status`]):
//!    `Accepted` when events + outbox rows commit; `Completed` once the
//!    follow-up command confirms effects; `Rejected` when the pure
//!    orchestrator refuses the command.
//! 2. **Run lifecycle** ([`RunPhase`], a projection over run events):
//!    `Accepted` (turn committed, provider not yet started) is distinct
//!    from `Running` and from `Passed` (gate verified) -- exactly the
//!    separation the old `RunStatus::Passed`-on-ack conflation lacked.

use super::event::StoredEvent;

/// Execution lifecycle of one card run, folded from run events.
///
/// `Accepted` and `Passed` are deliberately far apart: between them lie
/// `Running` and `GatePending`, crossed only by follow-up commands carrying
/// externally-observed outcomes (provider exit, gate verdict).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunPhase {
    /// Nothing committed yet.
    #[default]
    Unknown,
    /// Intent committed; provider turn may not have started.
    Accepted,
    /// Provider process running.
    Running,
    /// Provider finished; gate verdict still owed.
    GatePending,
    /// Gate verified. Only this state authorizes a merge.
    Passed,
    /// Gate failed or provider errored.
    Failed,
    /// User interrupted the run.
    Interrupted,
    /// User cancelled before completion.
    Cancelled,
}

impl RunPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::Accepted => "accepted",
            Self::Running => "running",
            Self::GatePending => "gate_pending",
            Self::Passed => "passed",
            Self::Failed => "failed",
            Self::Interrupted => "interrupted",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Passed | Self::Failed | Self::Interrupted | Self::Cancelled)
    }

    /// Terminal completion for receipts: a run whose phase is terminal may
    /// mark its originating command `Completed`.
    pub fn is_completed(&self) -> bool {
        self.is_terminal()
    }
}

/// Fold run events into a [`RunPhase`]. Total and pure.
pub fn phase_from_events(events: &[StoredEvent]) -> RunPhase {
    let mut phase = RunPhase::Unknown;
    for event in events {
        phase = match event.event_type.as_str() {
            "run_accepted" => RunPhase::Accepted,
            "run_started" => RunPhase::Running,
            "run_completed" => {
                if event.payload.get("gate_passed").and_then(|value| value.as_bool()) == Some(true) {
                    RunPhase::Passed
                } else {
                    RunPhase::GatePending
                }
            }
            "gate_checked" => {
                if event.payload.get("passed").and_then(|value| value.as_bool()) == Some(true) {
                    RunPhase::Passed
                } else {
                    RunPhase::Failed
                }
            }
            "run_failed" => RunPhase::Failed,
            "run_interrupted" => RunPhase::Interrupted,
            "run_cancelled" => RunPhase::Cancelled,
            _ => phase,
        };
    }
    phase
}

/// Guard: only [`RunPhase::Passed`] may authorize a merge. Centralized so no
/// caller re-derives the rule (the old `GateSummary.passed` boolean alone
/// never authorized a merge; this is the event-sourced equivalent).
pub fn merge_authorized(phase: RunPhase) -> bool {
    phase == RunPhase::Passed
}
