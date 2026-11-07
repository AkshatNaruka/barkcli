//! Event-sourced core (inspired by t3code's `orchestration-v2`).
//!
//! The event log is the source of truth; projections are disposable read
//! models rebuilt by replay. The pipeline mirrors t3code:
//!
//! ```text
//! command ──► Orchestrator (pure, no I/O) ──► events + outbox
//!   ──► EventSink (single-txn commit: events + receipt + outbox + checkpoints)
//!   ──► projections (in-memory fold, checkpointed per commit)
//! ```
//!
//! Key guarantees:
//! * **Idempotency** -- every command carries a client-supplied [`command::CommandId`];
//!   a [`command::CommandReceipt`] is persisted in the same transaction as its
//!   events, so retries (including retry-after-crash) return the original
//!   outcome instead of duplicating effects.
//! * **Accepted ≠ Completed** -- ack means *"intent durably committed"*,
//!   never *"work finished"*. Receipts flip to `Completed` only after a
//!   follow-up command confirms the downstream effects (see [`lifecycle`]).
//! * **Outbox** -- side effects travel as rows committed with the events that
//!   demand them, delivered at-least-once by [`outbox::OutboxDispatcher`].
//! * **Thin transports** -- CLI / MCP / web all call [`orchestrator::Dispatcher`];
//!   adapters stay at the boundary, orchestration stays pure.
//!
//! The module is **additive**: the existing file-is-truth board YAML,
//! thread JSONL log, and runtime run records are untouched. [`compat`]
//! maps new facts onto the legacy surfaces.
//!
//! ## Effect-style surface (Rust edition)
//!
//! t3code derives its orchestration from Effect services. Here the same
//! discipline is expressed with typed, composable primitives: a pure
//! [`orchestrator::Orchestrator`] (no I/O, no clock), an impure but
//! transactional [`sink::EventSink`], and a typed [`EventSourcedError`]
//! that composes upwards instead of stringifying early.

pub mod command;
pub mod compat;
pub mod domain;
pub mod event;
pub mod lifecycle;
pub mod orchestrator;
pub mod outbox;
pub mod projection;
pub mod sink;
pub mod store;

pub use command::{Command, CommandId, CommandReceipt, ReceiptStatus};
pub use event::{EventId, NewEvent, StoredEvent, StreamId};
pub use orchestrator::{AggregateState, Decision, Dispatcher, Orchestrator, Reject};
pub use outbox::{OutboxDispatcher, OutboxMessage, OutboxStatus};
pub use projection::{BoardStatsProjection, CardProjection, CardProjectionState, Projection, ProjectionRunner};
pub use sink::{CommitBatch, EventSink};
pub use store::{EventStore, InMemoryEventStore, OutboxStore, SqliteEventStore};

/// Typed error for the event-sourced core. Variants are matchable so
/// transports (CLI/MCP/web) can map failures without parsing strings --
/// the Effect-style "typed errors compose, panics don't" rule.
#[derive(Debug, thiserror::Error)]
pub enum EventSourcedError {
    #[error("store error: {0}")]
    Store(String),
    #[error("concurrency conflict on stream `{stream_id}`: expected v{expected}, found v{actual}")]
    Concurrency {
        stream_id: String,
        expected: u64,
        actual: u64,
    },
    #[error("duplicate receipt for command `{0}`")]
    DuplicateReceipt(CommandId),
    #[error("validation: {0}")]
    Validation(String),
    #[error("serialization in {context}: {source}")]
    Serialization {
        context: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("command receipt not found: {0}")]
    ReceiptNotFound(CommandId),
    #[error("projection `{name}` is behind: checkpoint {checkpoint}, head {head}")]
    ProjectionBehind {
        name: String,
        checkpoint: u64,
        head: u64,
    },
}

impl From<rusqlite::Error> for EventSourcedError {
    fn from(error: rusqlite::Error) -> Self {
        EventSourcedError::Store(error.to_string())
    }
}
