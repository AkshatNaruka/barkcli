//! Transactional outbox.
//!
//! Side effects (start a provider turn, run the gate, merge a branch) must
//! never run inside the same transaction that records intent -- but they must
//! be *guaranteed* to run eventually. The outbox pattern achieves both: the
//! [`OutboxMessage`] rows are written in the very same commit as the events
//! that demand them ([`super::sink::CommitBatch::outbox`]), then a separate
//! [`OutboxDispatcher`] delivers them at-least-once.
//!
//! Delivery is at-least-once by design: the dispatcher marks a message
//! `Dispatched` only after its handler succeeds, and handlers must be
//! idempotent. A crash between handler success and the mark results in one
//! redelivery -- never a lost message.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::EventSourcedError;

/// Delivery state of an outbox message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutboxStatus {
    /// Waiting to be delivered.
    Pending,
    /// Delivered successfully.
    Dispatched,
    /// Delivery failed (handler returned an error); will retry with backoff.
    Failed,
}

impl OutboxStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Dispatched => "dispatched",
            Self::Failed => "failed",
        }
    }
}

/// One side effect demanded by a committed event batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboxMessage {
    pub id: Uuid,
    /// Topic the dispatcher routes on, e.g. `"provider_turn.start"`.
    pub topic: String,
    pub payload: serde_json::Value,
    pub status: OutboxStatus,
    pub attempts: u32,
    pub created_at: DateTime<Utc>,
    /// Next time this message becomes eligible for (re)delivery.
    pub next_retry_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dispatched_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

impl OutboxMessage {
    pub fn new(topic: impl Into<String>, payload: serde_json::Value, at: DateTime<Utc>) -> Self {
        Self {
            id: Uuid::new_v4(),
            topic: topic.into(),
            payload,
            status: OutboxStatus::Pending,
            attempts: 0,
            created_at: at,
            next_retry_at: at,
            dispatched_at: None,
            last_error: None,
        }
    }

    /// Eligible for delivery at `now` (pending, or failed with backoff over).
    pub fn is_due(&self, now: DateTime<Utc>) -> bool {
        self.status != OutboxStatus::Dispatched && self.next_retry_at <= now
    }
}

/// Outcome of one [`OutboxDispatcher::drain`] pass.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DrainReport {
    pub delivered: usize,
    pub failed: usize,
    /// Messages that were due but left pending because the handler
    /// rejected them (they stay pending for a later drain).
    pub retried_later: usize,
}

/// Drains due outbox messages through a handler.
///
/// The handler is `Fn(&OutboxMessage) -> Result<(), OutboxError>` where any
/// `Err` leaves the message pending (with attempt count incremented and
/// backoff applied) instead of dropping it. The dispatcher itself holds no
/// I/O policy beyond "deliver, then mark".
pub struct OutboxDispatcher<'a> {
    store: &'a dyn super::store::OutboxStore,
    /// Base delay for exponential backoff, in seconds (attempt * base).
    backoff_base_secs: u64,
}

impl<'a> OutboxDispatcher<'a> {
    pub fn new(store: &'a dyn super::store::OutboxStore) -> Self {
        Self {
            store,
            backoff_base_secs: 1,
        }
    }

    pub fn with_backoff_base_secs(mut self, secs: u64) -> Self {
        self.backoff_base_secs = secs.max(1);
        self
    }

    /// Deliver all due messages (up to `limit`) through `handler`.
    pub fn drain(
        &self,
        limit: usize,
        now: DateTime<Utc>,
        handler: &dyn Fn(&OutboxMessage) -> Result<(), OutboxError>,
    ) -> Result<DrainReport, EventSourcedError> {
        let mut report = DrainReport::default();
        let due = self.store.fetch_outbox_due(now, limit)?;
        for message in &due {
            match handler(message) {
                Ok(()) => {
                    self.store.mark_outbox_dispatched(message.id, now)?;
                    report.delivered += 1;
                }
                Err(error) => {
                    let attempts = message.attempts + 1;
                    // Backoff: attempts * base, capped at attempt*60 so a
                    // poison message never blocks the queue head for hours.
                    let delay = (attempts as u64)
                        .saturating_mul(self.backoff_base_secs)
                        .min((attempts as u64).saturating_mul(60))
                        .max(1);
                    let next_retry_at = now + chrono::Duration::seconds(delay as i64);
                    self.store.mark_outbox_failed(message.id, error.to_string(), next_retry_at)?;
                    report.failed += 1;
                    report.retried_later += 1;
                }
            }
        }
        Ok(report)
    }

    /// Count of messages not yet dispatched.
    pub fn pending_count(&self) -> Result<usize, EventSourcedError> {
        self.store.count_outbox_pending()
    }
}

/// Error returned by outbox handlers. Any error defers redelivery; it never
/// drops the message.
#[derive(Debug, thiserror::Error)]
#[error("outbox delivery failed: {0}")]
pub struct OutboxError(pub String);

impl From<String> for OutboxError {
    fn from(message: String) -> Self {
        Self(message)
    }
}
