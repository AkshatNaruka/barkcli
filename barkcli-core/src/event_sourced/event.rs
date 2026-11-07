//! Event envelope: the immutable fact record written to the event log.
//!
//! The event log is the source of truth (mirroring t3code's orch-v2 design).
//! [`NewEvent`] is what an orchestrator produces (pure data, no sequence
//! numbers); the store assigns the global position and the per-stream
//! sequence when the event is committed, then returns a [`StoredEvent`].
//!
//! Payloads are `serde_json::Value` built from typed event structs via
//! [`event_payload`]. Unknown payload shapes decode with
//! [`EventEnvelope::unknown_type`] falling back to
//! [`crate::event_sourced::compat::FALLBACK_EVENT_TYPE`].

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::command::CommandId;

/// Stable wire name for events whose type is not known to this reader
/// (forward compatibility: replay-tolerant decoding).
pub const FALLBACK_EVENT_TYPE: &str = "unknown";

/// Identifies a stream/aggregate an event belongs to.
pub type StreamId = String;

/// Identifies a single committed event.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EventId(Uuid);

impl EventId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn parse(input: &str) -> Result<Self, uuid::Error> {
        input.parse::<Uuid>().map(Self)
    }
}

impl Default for EventId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for EventId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// A fact produced by an [`super::orchestrator::Orchestrator`] but not yet
/// assigned a store position. Sequence fields are assigned by the store.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewEvent {
    pub event_id: EventId,
    /// Type tag, e.g. `"card_created"`. Derived from the typed event struct.
    pub event_type: String,
    pub payload: serde_json::Value,
    /// Time the fact occurred (from the originating command's `issued_at`
    /// for pure orchestrators; the store never rewrites it).
    pub occurred_at: DateTime<Utc>,
    /// Correlation id shared by a whole command→effect chain.
    pub correlation_id: Option<String>,
    /// Id of the command that caused this event.
    pub causation_id: Option<CommandId>,
}

impl NewEvent {
    pub fn new(
        event_type: impl Into<String>,
        payload: serde_json::Value,
        occurred_at: DateTime<Utc>,
    ) -> Self {
        Self {
            event_id: EventId::new(),
            event_type: event_type.into(),
            payload,
            occurred_at,
            correlation_id: None,
            causation_id: None,
        }
    }

    pub fn with_causation(mut self, command_id: CommandId) -> Self {
        self.causation_id = Some(command_id);
        self
    }

    pub fn with_correlation(mut self, correlation_id: impl Into<String>) -> Self {
        self.correlation_id = Some(correlation_id.into());
        self
    }
}

/// Serialize a typed event struct into the JSON payload carried by a
/// [`NewEvent`].
pub fn event_payload<T: Serialize>(event: &T) -> Result<serde_json::Value, super::EventSourcedError> {
    serde_json::to_value(event).map_err(|source| super::EventSourcedError::Serialization {
        context: "event payload".into(),
        source,
    })
}

/// A committed event: the envelope with its positions in the log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredEvent {
    pub event_id: EventId,
    pub stream_id: StreamId,
    /// Monotonic position in the global log (assigned by the store).
    pub global_seq: u64,
    /// Monotonic position within `stream_id` (assigned by the store).
    pub stream_seq: u64,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub occurred_at: DateTime<Utc>,
    pub correlation_id: Option<String>,
    pub causation_id: Option<CommandId>,
}

impl StoredEvent {
    pub fn is_known_type(&self) -> bool {
        self.event_type != FALLBACK_EVENT_TYPE
    }
}

impl From<NewEvent> for StoredEvent {
    fn from(event: NewEvent) -> Self {
        Self {
            event_id: event.event_id,
            stream_id: String::new(),
            global_seq: 0,
            stream_seq: 0,
            event_type: event.event_type,
            payload: event.payload,
            occurred_at: event.occurred_at,
            correlation_id: event.correlation_id,
            causation_id: event.causation_id,
        }
    }
}
