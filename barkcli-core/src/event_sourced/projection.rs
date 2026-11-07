//! Projections: read models rebuilt by replaying the event log.
//!
//! The event log is the truth; a [`Projection`] is a disposable fold over
//! it. [`ProjectionRunner::rebuild`] replays from the persisted checkpoint at
//! `0` (or resumes from the last checkpoint), which makes every projection
//! trivially repairable: delete the projection, replay, done. The incremental
//! apply path ([`ProjectionRunner::apply`]) and the full-replay path are
//! always equal -- the test suite asserts this parity.

use std::collections::HashMap;

use super::EventSourcedError;
use super::event::StoredEvent;
use super::store::EventStore;

/// A fold over stored events. `apply` must be pure and total: unknown
/// event types are ignored (replay-tolerant decoding).
pub trait Projection: Default + Send {
    /// Stable name used as the checkpoint key.
    fn name(&self) -> &'static str;
    fn apply(&mut self, event: &StoredEvent);
    /// Lowest global position applied so far (0 = nothing applied).
    fn last_applied(&self) -> u64 {
        0
    }
    /// Forget all applied state (used before a full rebuild).
    fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Replays events from a store into projections.
pub struct ProjectionRunner<'a, S: EventStore> {
    store: &'a S,
    batch_size: usize,
}

impl<'a, S: EventStore> ProjectionRunner<'a, S> {
    pub fn new(store: &'a S) -> Self {
        Self {
            store,
            batch_size: 512,
        }
    }

    pub fn with_batch_size(mut self, batch_size: usize) -> Self {
        self.batch_size = batch_size.max(1);
        self
    }

    /// Replay every event with `global_seq > from_global_seq` into `projection`.
    /// Returns the highest global position applied.
    pub fn rebuild<P: Projection>(
        &self,
        projection: &mut P,
        from_global_seq: u64,
    ) -> Result<u64, EventSourcedError> {
        projection.reset();
        self.resume(projection, from_global_seq)
    }

    /// Continue applying new events into `projection` from `from_global_seq`.
    pub fn resume<P: Projection>(
        &self,
        projection: &mut P,
        from_global_seq: u64,
    ) -> Result<u64, EventSourcedError> {
        let mut cursor = from_global_seq;
        loop {
            let batch = self.store.read_all(cursor, self.batch_size)?;
            if batch.is_empty() {
                break;
            }
            for event in &batch {
                projection.apply(event);
                cursor = event.global_seq;
            }
            if batch.len() < self.batch_size {
                break;
            }
        }
        Ok(cursor)
    }

    /// Apply a single already-stored event (the incremental path).
    pub fn apply<P: Projection>(projection: &mut P, event: &StoredEvent) {
        projection.apply(event);
    }
}

// ---------------------------------------------------------------------------
// Concrete projections for barkcli's domain events (see `super::domain`)
// ---------------------------------------------------------------------------

pub use super::lifecycle::RunPhase;

/// `card_id -> (column, title, run phase)`, folded from card/run events.
#[derive(Debug, Clone, Default)]
pub struct CardProjection {
    pub cards: HashMap<String, CardProjectionState>,
    last_applied: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CardProjectionState {
    pub title: String,
    pub column: String,
    pub run: Option<RunPhase>,
}

impl Projection for CardProjection {
    fn name(&self) -> &'static str {
        "cards"
    }

    fn apply(&mut self, event: &StoredEvent) {
        self.last_applied = event.global_seq;
        match event.event_type.as_str() {
            "card_created" => {
                if let (Some(card_id), Some(title), Some(column)) = (
                    event.payload.get("card_id").and_then(|value| value.as_str()),
                    event.payload.get("title").and_then(|value| value.as_str()),
                    event.payload.get("column").and_then(|value| value.as_str()),
                ) {
                    self.cards.insert(
                        card_id.to_string(),
                        CardProjectionState {
                            title: title.to_string(),
                            column: column.to_string(),
                            run: None,
                        },
                    );
                }
            }
            "card_moved" => {
                if let (Some(card_id), Some(to_column)) = (
                    event.payload.get("card_id").and_then(|value| value.as_str()),
                    event.payload.get("to_column").and_then(|value| value.as_str()),
                ) {
                    if let Some(state) = self.cards.get_mut(card_id) {
                        state.column = to_column.to_string();
                    }
                }
            }
            "run_accepted" | "run_started" => Self::apply_run_event(self, event),
            "run_completed" | "gate_checked" | "run_failed" | "run_interrupted" => Self::apply_run_event(self, event),
            _ => {}
        }
    }

    fn last_applied(&self) -> u64 {
        self.last_applied
    }
}

impl CardProjection {
    fn apply_run_event(&mut self, event: &StoredEvent) {
        let Some(card_id) = event.payload.get("card_id").and_then(|value| value.as_str()) else {
            return;
        };
        let phase = match event.event_type.as_str() {
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
            _ => return,
        };
        if let Some(state) = self.cards.get_mut(card_id) {
            state.run = Some(phase);
        }
    }
}

/// Column -> card count, plus a total.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BoardStatsProjection {
    pub columns: HashMap<String, usize>,
    pub total: usize,
    last_applied: u64,
}

impl Projection for BoardStatsProjection {
    fn name(&self) -> &'static str {
        "board_stats"
    }

    fn apply(&mut self, event: &StoredEvent) {
        self.last_applied = event.global_seq;
        match event.event_type.as_str() {
            "card_created" => {
                if let Some(column) = event.payload.get("column").and_then(|value| value.as_str()) {
                    *self.columns.entry(column.to_string()).or_default() += 1;
                    self.total += 1;
                }
            }
            "card_moved" => {
                let (from, to) = (
                    event.payload.get("from_column").and_then(|value| value.as_str()),
                    event.payload.get("to_column").and_then(|value| value.as_str()),
                );
                if let (Some(from), Some(to)) = (from, to) {
                    if from != to {
                        if let Some(count) = self.columns.get_mut(from) {
                            *count = count.saturating_sub(1);
                        }
                        *self.columns.entry(to.to_string()).or_default() += 1;
                    }
                }
            }
            _ => {}
        }
    }

    fn last_applied(&self) -> u64 {
        self.last_applied
    }
}
