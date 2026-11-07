//! Orchestrator: the pure decision layer (command → events).
//!
//! An [`Orchestrator`] sees a command plus the current aggregate state and
//! returns the events that command implies, or a rejection reason. It
//! performs **no I/O**: no store access, no clock reads (timestamps come
//! from the command's `issued_at`), no randomness. This is the t3code rule
//! "orchestration stays pure; complexity belongs at the adapter boundary."
//! Side effects are *demanded* as outbox rows ([`Decision::effects`]), not
//! performed.
//!
//! [`Dispatcher`] is the impure shell that glues it together: idempotency
//! check → load state → decide → single-transaction commit.

use std::marker::PhantomData;
use std::sync::Arc;

use chrono::DateTime;

use super::command::{Command, CommandId, CommandReceipt, ReceiptStatus};
use super::event::NewEvent;
use super::outbox::OutboxMessage;
use super::sink::{CommitBatch, EventSink};
use super::store::EventStore;
use super::EventSourcedError;

/// Pure decision output: events to commit, outbox effects to demand.
#[derive(Debug, Clone, Default)]
pub struct Decision {
    pub events: Vec<NewEvent>,
    pub outbox: Vec<OutboxMessage>,
}

impl Decision {
    pub fn new(events: Vec<NewEvent>) -> Self {
        Self {
            events,
            outbox: Vec::new(),
        }
    }

    pub fn with_effects(mut self, outbox: Vec<OutboxMessage>) -> Self {
        self.outbox = outbox;
        self
    }
}

/// Pure command handler. Implementors must not touch the network, the
/// filesystem, or the wall clock.
pub trait Orchestrator<C: Command>: Send + Sync {
    /// Fold the stream's events (highest last) into decision-usable state.
    /// Implementations should keep this cheap; the dispatcher rebuilds a
    /// fresh view per command.
    fn load_state(&self, stream_events: &[super::event::StoredEvent]) -> AggregateState;
    /// Decide the events/effects for `command` given current `state`.
    /// `Ok` means accepted (events may be empty for a no-op command);
    /// `Err(reason)` means rejected (receipt persisted, no events).
    fn decide(&self, state: &AggregateState, command: &C) -> Result<Decision, Reject>;
}

/// Minimal aggregate snapshot handed to orchestrators. Concrete
/// orchestrators extend by downcasting or by keeping their own typed state
/// alongside `version`.
#[derive(Debug, Clone, Default)]
pub struct AggregateState {
    /// Per-stream version the state was read at.
    pub version: u64,
    /// Type-erased folded view (orchestrators interpret as needed).
    pub events: Vec<StoredEventRef>,
}

/// Cheap textual view of an event for orchestrator state inspection.
#[derive(Debug, Clone)]
pub struct StoredEventRef {
    pub event_type: String,
    pub payload: serde_json::Value,
    pub stream_seq: u64,
}

/// Rejection reason: the domain reason a command was refused.
#[derive(Debug, Clone)]
pub struct Reject(pub String);

impl std::fmt::Display for Reject {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "rejected: {}", self.0)
    }
}

impl std::error::Error for Reject {}

/// The impure shell: idempotency → state → decide → atomic commit.
pub struct Dispatcher<S, C, O>
where
    S: EventStore + EventSink,
    C: Command,
    O: Orchestrator<C>,
{
    store: Arc<S>,
    orchestrator: O,
    _phantom: PhantomData<C>,
    /// Concurrency retries before surfacing a conflict to the caller.
    max_retries: u32,
}

impl<S, C, O> Dispatcher<S, C, O>
where
    S: EventStore + EventSink,
    C: Command,
    O: Orchestrator<C>,
{
    pub fn new(store: S, orchestrator: O) -> Self {
        Self::from_shared(Arc::new(store), orchestrator)
    }

    /// Share one store across several dispatchers (one per command type).
    pub fn from_shared(store: Arc<S>, orchestrator: O) -> Self {
        Self {
            store,
            orchestrator,
            _phantom: PhantomData,
            max_retries: 3,
        }
    }

    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    pub fn store(&self) -> &S {
        &self.store
    }

    /// Handle one command end-to-end.
    ///
    /// * Duplicate `CommandId` → returns the stored receipt untouched.
    /// * Valid command → `[Accepted]`: commit + return receipt.
    /// * Invalid command → `[Rejected]` receipt persisted, no events.
    pub fn handle(&self, command_id: CommandId, command: &C) -> Result<CommandReceipt, EventSourcedError> {
        if let Some(existing) = self.store.find_receipt(&command_id)? {
            return Ok(existing);
        }
        let issued_at = command.issued_at();
        let stream_id = command.stream_id();
        let mut attempts = 0;
        loop {
            attempts += 1;
            // Load state at the current stream version.
            let version = self.store.stream_version(&stream_id)?;
            let stream_events = self.store.read_stream(&stream_id, 0)?;
            let state = self.orchestrator.load_state(&stream_events);
            let mut state = state;
            state.version = version;
            match self.orchestrator.decide(&state, command) {
                Ok(decision) => {
                    let events = decision
                        .events
                        .into_iter()
                        .map(|mut event| {
                            event.causation_id = Some(command_id.clone());
                            if event.correlation_id.is_none() {
                                event.correlation_id = Some(command_id.to_string());
                            }
                            event
                        })
                        .collect::<Vec<_>>();
                    let event_ids: Vec<super::event::EventId> = events.iter().map(|event| event.event_id.clone()).collect();
                    // Outbox rows must carry causation so delivery can be traced.
                    let outbox: Vec<OutboxMessage> = decision
                        .outbox
                        .into_iter()
                        .map(|mut message| {
                            message.payload = with_command_id(message.payload, &command_id);
                            message
                        })
                        .collect();
                    let receipt = CommandReceipt::accepted(
                        command_id.clone(),
                        command.command_type().to_string(),
                        stream_id.clone(),
                        event_ids,
                        command.payload(),
                        issued_at,
                    );
                    let batch = CommitBatch {
                        stream_id: stream_id.clone(),
                        expected_version: Some(version),
                        events,
                        receipt: Some(receipt),
                        outbox,
                        checkpoints: Vec::new(),
                    };
                    match self.store.commit(&batch) {
                        Ok(_) => {
                            return self.store.find_receipt(&command_id)?.ok_or_else(|| {
                                EventSourcedError::Store("receipt vanished after commit".into())
                            })
                        }
                        Err(EventSourcedError::Concurrency { .. }) if attempts <= self.max_retries => continue,
                        Err(EventSourcedError::DuplicateReceipt(_)) => {
                            // Lost a race with a duplicate delivery; the
                            // winner's receipt is the truth.
                            return self.store.find_receipt(&command_id)?.ok_or_else(|| {
                                EventSourcedError::Store("duplicate receipt vanished".into())
                            });
                        }
                        Err(error) => return Err(error),
                    }
                }
                Err(reject) => {
                    let receipt = CommandReceipt::rejected(
                        command_id.clone(),
                        command.command_type().to_string(),
                        stream_id.clone(),
                        reject.0,
                        command.payload(),
                        issued_at,
                    );
                    let batch = CommitBatch {
                        stream_id: stream_id.clone(),
                        expected_version: Some(version),
                        events: Vec::new(),
                        receipt: Some(receipt),
                        outbox: Vec::new(),
                        checkpoints: Vec::new(),
                    };
                    match self.store.commit(&batch) {
                        Ok(_) => {
                            return self.store.find_receipt(&command_id)?.ok_or_else(|| {
                                EventSourcedError::Store("receipt vanished after commit".into())
                            })
                        }
                        Err(EventSourcedError::Concurrency { .. }) if attempts <= self.max_retries => continue,
                        Err(error) => return Err(error),
                    }
                }
            }
        }
    }

    /// Mark an accepted receipt `Completed` once its effects are confirmed.
    /// Call sites: after the follow-up command / outbox delivery that proved
    /// completion (see [`super::lifecycle`]).
    pub fn mark_completed(&self, command_id: &CommandId, at: DateTime<chrono::Utc>) -> Result<(), EventSourcedError> {
        self.store.mark_receipt_completed(command_id, at)
    }
}

fn with_command_id(mut payload: serde_json::Value, command_id: &CommandId) -> serde_json::Value {
    if payload.is_object() {
        if let Some(object) = payload.as_object_mut() {
            object.insert("command_id".into(), serde_json::Value::String(command_id.to_string()));
        }
    } else {
        payload = serde_json::json!({ "command_id": command_id.to_string(), "value": payload });
    }
    payload
}

/// Receipt status of a stored receipt (convenience over `CommandReceipt`).
pub fn status_of(receipt: &CommandReceipt) -> ReceiptStatus {
    receipt.status
}
