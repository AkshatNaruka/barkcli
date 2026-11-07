//! Commands and command receipts.
//!
//! A *command* expresses intent ("move this card", "start this run") and is
//! delivered at most once from the caller's perspective because it carries a
//! client-supplied [`CommandId`]. The store persists a [`CommandReceipt`]
//! (the t3code "command receipt" pattern) so a retry after a crash returns
//! the original outcome instead of re-executing.
//!
//! ## Accepted vs Completed
//!
//! A receipt is **Accepted** the moment its events + outbox rows are
//! committed -- the intent is durable, nothing more is promised. It becomes
//! **Completed** only once the downstream effects it demanded (provider
//! turns, gate runs, merges) have been confirmed, which happens through a
//! later command (see [`super::lifecycle`]). Ack must never be confused
//! with completion.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::event::StreamId;

/// Client-supplied, globally unique id of a command. Two deliveries with the
/// same `CommandId` are the same command; the second is a no-op that returns
/// the original receipt.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CommandId(Uuid);

impl CommandId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn parse(input: &str) -> Result<Self, uuid::Error> {
        input.parse::<Uuid>().map(Self)
    }

    pub fn as_uuid(&self) -> Uuid {
        self.0
    }
}

impl Default for CommandId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for CommandId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// A request to change state. Implemented by concrete command structs (see
/// [`super::domain`]). Commands are data, not behavior: all decision-making
/// lives in the pure orchestrator.
pub trait Command: Send + Sync {
    /// Type tag, e.g. `"move_card"`.
    fn command_type(&self) -> &'static str;
    /// Stream this command targets (one [`StreamId`] per command keeps
    /// optimistic concurrency scoped to a single aggregate).
    fn stream_id(&self) -> StreamId;
    /// JSON payload, for auditing (the receipt stores it verbatim).
    fn payload(&self) -> serde_json::Value;
    /// Time the command was issued. Orchestrators stamp events from this
    /// value so decisions stay pure (no wall-clock reads).
    fn issued_at(&self) -> DateTime<Utc>;
}

/// Where a command sits in its lifecycle. `Accepted` means "durably
/// recorded"; `Completed` means "the demanded work finished and was
/// confirmed". See the module docs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReceiptStatus {
    /// Intent committed; effects may still be in flight.
    Accepted,
    /// Downstream effects confirmed via a follow-up command.
    Completed,
    /// The orchestrator refused the command (no events were produced).
    Rejected,
}

impl ReceiptStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Accepted => "accepted",
            Self::Completed => "completed",
            Self::Rejected => "rejected",
        }
    }
}

/// Persistent record of one command's outcome. Written in the same
/// transaction as the events it produced, so "no receipt without events,
/// no events without a receipt" is invariant.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandReceipt {
    pub command_id: CommandId,
    pub command_type: String,
    pub stream_id: StreamId,
    pub status: ReceiptStatus,
    /// Rejection reason when `status == Rejected`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Ids of the events this command produced (empty for rejections).
    pub result_event_ids: Vec<super::event::EventId>,
    /// Verbatim command payload at acceptance time.
    pub command_payload: serde_json::Value,
    pub issued_at: DateTime<Utc>,
    pub accepted_at: DateTime<Utc>,
    /// Set when the receipt transitions to `Completed`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
}

impl CommandReceipt {
    pub fn accepted(
        command_id: CommandId,
        command_type: String,
        stream_id: StreamId,
        result_event_ids: Vec<super::event::EventId>,
        command_payload: serde_json::Value,
        at: DateTime<Utc>,
    ) -> Self {
        Self {
            command_id,
            command_type,
            stream_id,
            status: ReceiptStatus::Accepted,
            reason: None,
            result_event_ids,
            command_payload,
            issued_at: at,
            accepted_at: at,
            completed_at: None,
        }
    }

    pub fn rejected(
        command_id: CommandId,
        command_type: String,
        stream_id: StreamId,
        reason: String,
        command_payload: serde_json::Value,
        at: DateTime<Utc>,
    ) -> Self {
        Self {
            command_id,
            command_type,
            stream_id,
            status: ReceiptStatus::Rejected,
            reason: Some(reason),
            result_event_ids: Vec::new(),
            command_payload,
            issued_at: at,
            accepted_at: at,
            completed_at: None,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self.status, ReceiptStatus::Completed | ReceiptStatus::Rejected)
    }
}
