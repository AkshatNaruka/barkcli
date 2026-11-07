//! Concrete barkcli domain: commands, events, and the pure orchestrator.
//!
//! Stream layout: one stream per card, `card:<card_id>`. Commands are
//! validated against folded state inside [`BarkOrchestrator::decide`]; every
//! accepted command's *side-effecting* demands (provider turn, gate run)
//! become outbox rows, mirroring t3code's EffectWorker division.

use chrono::{DateTime, Utc};

use super::command::Command;
use super::event::{event_payload, NewEvent, StreamId};
use super::orchestrator::{AggregateState, Decision, Orchestrator, Reject, StoredEventRef};
use super::outbox::OutboxMessage;

/// Columns of a fresh board (see `models::board::Board::new`).
pub const KNOWN_COLUMNS: [&str; 4] = ["todo", "doing", "review", "done"];

// ---------------------------------------------------------------------------
// Commands (intent)
// ---------------------------------------------------------------------------

/// Create a card on a board stream.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CreateCardCommand {
    pub card_id: String,
    pub title: String,
    pub column: String,
    pub issued_at: DateTime<Utc>,
}

impl CreateCardCommand {
    pub fn new(card_id: impl Into<String>, title: impl Into<String>, column: impl Into<String>, issued_at: DateTime<Utc>) -> Self {
        Self {
            card_id: card_id.into(),
            title: title.into(),
            column: column.into(),
            issued_at,
        }
    }
}

/// Move a card to another column.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MoveCardCommand {
    pub card_id: String,
    pub to_column: String,
    pub issued_at: DateTime<Utc>,
}

impl MoveCardCommand {
    pub fn new(card_id: impl Into<String>, to_column: impl Into<String>, issued_at: DateTime<Utc>) -> Self {
        Self {
            card_id: card_id.into(),
            to_column: to_column.into(),
            issued_at,
        }
    }
}

/// Accept a run for a card. Acceptance commits the *intent*; the provider
/// turn it demands travels via outbox and completes via
/// [`CompleteCardRunCommand`] / [`RecordGateCommand`].
#[derive(Debug, Clone, serde::Serialize)]
pub struct StartCardRunCommand {
    pub card_id: String,
    pub run_id: String,
    pub provider: String,
    pub issued_at: DateTime<Utc>,
}

impl StartCardRunCommand {
    pub fn new(card_id: impl Into<String>, run_id: impl Into<String>, provider: impl Into<String>, issued_at: DateTime<Utc>) -> Self {
        Self {
            card_id: card_id.into(),
            run_id: run_id.into(),
            provider: provider.into(),
            issued_at,
        }
    }
}

/// Confirm a provider turn's outcome (external observation, delivered as a
/// follow-up command -- this is what flips receipts to `Completed`).
#[derive(Debug, Clone, serde::Serialize)]
pub struct CompleteCardRunCommand {
    pub card_id: String,
    pub run_id: String,
    pub gate_passed: bool,
    pub issued_at: DateTime<Utc>,
}

impl CompleteCardRunCommand {
    pub fn new(card_id: impl Into<String>, run_id: impl Into<String>, gate_passed: bool, issued_at: DateTime<Utc>) -> Self {
        Self {
            card_id: card_id.into(),
            run_id: run_id.into(),
            gate_passed,
            issued_at,
        }
    }
}

/// Record a gate verdict for a run.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RecordGateCommand {
    pub card_id: String,
    pub run_id: String,
    pub passed: bool,
    pub summary: Option<String>,
    pub issued_at: DateTime<Utc>,
}

impl RecordGateCommand {
    pub fn new(card_id: impl Into<String>, run_id: impl Into<String>, passed: bool, issued_at: DateTime<Utc>) -> Self {
        Self {
            card_id: card_id.into(),
            run_id: run_id.into(),
            passed,
            summary: None,
            issued_at,
        }
    }
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

pub fn card_stream(card_id: &str) -> StreamId {
    format!("card:{card_id}")
}

macro_rules! impl_command {
    ($ty:ty, $type_name:expr, $field:ident) => {
        impl Command for $ty {
            fn command_type(&self) -> &'static str {
                $type_name
            }

            fn stream_id(&self) -> StreamId {
                card_stream(&self.$field)
            }

            fn payload(&self) -> serde_json::Value {
                serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
            }

            fn issued_at(&self) -> DateTime<Utc> {
                self.issued_at
            }
        }
    };
}

impl_command!(CreateCardCommand, "create_card", card_id);
impl_command!(MoveCardCommand, "move_card", card_id);
impl_command!(StartCardRunCommand, "start_card_run", card_id);
impl_command!(CompleteCardRunCommand, "complete_card_run", card_id);
impl_command!(RecordGateCommand, "record_gate", card_id);

// Serialize commands for `payload()`. Only the plain fields matter; method
// shapes mirror the event structs below.
// ---------------------------------------------------------------------------
// Events (facts)
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct CardCreatedEvent {
    pub card_id: String,
    pub title: String,
    pub column: String,
}

#[derive(serde::Serialize)]
pub struct CardMovedEvent {
    pub card_id: String,
    pub from_column: String,
    pub to_column: String,
}

#[derive(serde::Serialize)]
pub struct RunAcceptedEvent {
    pub card_id: String,
    pub run_id: String,
    pub provider: String,
}

#[derive(serde::Serialize)]
pub struct RunCompletedEvent {
    pub card_id: String,
    pub run_id: String,
    pub gate_passed: bool,
}

#[derive(serde::Serialize)]
pub struct GateCheckedEvent {
    pub card_id: String,
    pub run_id: String,
    pub passed: bool,
    pub summary: Option<String>,
}

fn card_created(command: &CreateCardCommand) -> NewEvent {
    NewEvent::new(
        "card_created",
        event_payload(&CardCreatedEvent {
            card_id: command.card_id.clone(),
            title: command.title.clone(),
            column: command.column.clone(),
        })
        .unwrap_or(serde_json::Value::Null),
        command.issued_at,
    )
}

fn card_moved(command: &MoveCardCommand, from_column: &str) -> NewEvent {
    NewEvent::new(
        "card_moved",
        event_payload(&CardMovedEvent {
            card_id: command.card_id.clone(),
            from_column: from_column.to_string(),
            to_column: command.to_column.clone(),
        })
        .unwrap_or(serde_json::Value::Null),
        command.issued_at,
    )
}

fn run_accepted(command: &StartCardRunCommand) -> NewEvent {
    NewEvent::new(
        "run_accepted",
        event_payload(&RunAcceptedEvent {
            card_id: command.card_id.clone(),
            run_id: command.run_id.clone(),
            provider: command.provider.clone(),
        })
        .unwrap_or(serde_json::Value::Null),
        command.issued_at,
    )
}

fn run_completed(command: &CompleteCardRunCommand) -> NewEvent {
    NewEvent::new(
        "run_completed",
        event_payload(&RunCompletedEvent {
            card_id: command.card_id.clone(),
            run_id: command.run_id.clone(),
            gate_passed: command.gate_passed,
        })
        .unwrap_or(serde_json::Value::Null),
        command.issued_at,
    )
}

fn gate_checked(command: &RecordGateCommand) -> NewEvent {
    NewEvent::new(
        "gate_checked",
        event_payload(&GateCheckedEvent {
            card_id: command.card_id.clone(),
            run_id: command.run_id.clone(),
            passed: command.passed,
            summary: command.summary.clone(),
        })
        .unwrap_or(serde_json::Value::Null),
        command.issued_at,
    )
}

// ---------------------------------------------------------------------------
// Pure orchestrator
// ---------------------------------------------------------------------------

/// Pure orchestrator for barkcli's card/run domain.
pub struct BarkOrchestrator;

impl BarkOrchestrator {
    /// Current column + existence, folded from the stream's events.
    fn card_state(events: &[StoredEventRef]) -> (bool, Option<String>) {
        let mut created = false;
        let mut column: Option<String> = None;
        for event in events {
            match event.event_type.as_str() {
                "card_created" => {
                    created = true;
                    column = event.payload.get("column").and_then(|value| value.as_str()).map(str::to_string);
                    if let Some(title) = event.payload.get("title").and_then(|value| value.as_str()) {
                        let _ = title;
                    }
                }
                "card_moved" => {
                    column = event.payload.get("to_column").and_then(|value| value.as_str()).map(str::to_string);
                }
                _ => {}
            }
        }
        (created, column)
    }

    fn run_accepted(events: &[StoredEventRef], run_id: &str) -> bool {
        events.iter().any(|event| {
            event.event_type == "run_accepted"
                && event.payload.get("run_id").and_then(|value| value.as_str()) == Some(run_id)
        })
    }
}

impl Orchestrator<CreateCardCommand> for BarkOrchestrator {
    fn load_state(&self, stream_events: &[super::event::StoredEvent]) -> AggregateState {
        AggregateState {
            version: stream_events.last().map(|event| event.stream_seq).unwrap_or(0),
            events: stream_events.iter().map(|event| StoredEventRef {
                event_type: event.event_type.clone(),
                payload: event.payload.clone(),
                stream_seq: event.stream_seq,
            }).collect(),
        }
    }

    fn decide(&self, state: &AggregateState, command: &CreateCardCommand) -> Result<Decision, Reject> {
        let (created, _) = Self::card_state(&state.events);
        if created {
            return Err(Reject(format!("card {} already exists", command.card_id)));
        }
        if !KNOWN_COLUMNS.contains(&command.column.as_str()) {
            return Err(Reject(format!("unknown column {}", command.column)));
        }
        if command.title.trim().is_empty() {
            return Err(Reject("title must not be empty".into()));
        }
        Ok(Decision::new(vec![card_created(command)]))
    }
}

impl Orchestrator<MoveCardCommand> for BarkOrchestrator {
    fn load_state(&self, stream_events: &[super::event::StoredEvent]) -> AggregateState {
        <Self as Orchestrator<CreateCardCommand>>::load_state(self, stream_events)
    }

    fn decide(&self, state: &AggregateState, command: &MoveCardCommand) -> Result<Decision, Reject> {
        let (created, column) = Self::card_state(&state.events);
        if !created {
            return Err(Reject(format!("card {} does not exist", command.card_id)));
        }
        if !KNOWN_COLUMNS.contains(&command.to_column.as_str()) {
            return Err(Reject(format!("unknown column {}", command.to_column)));
        }
        let from = column.unwrap_or_else(|| "todo".to_string());
        if from == command.to_column {
            // Valid no-op: accepted with no events.
            return Ok(Decision::default());
        }
        Ok(Decision::new(vec![card_moved(command, &from)]))
    }
}

impl Orchestrator<StartCardRunCommand> for BarkOrchestrator {
    fn load_state(&self, stream_events: &[super::event::StoredEvent]) -> AggregateState {
        <Self as Orchestrator<CreateCardCommand>>::load_state(self, stream_events)
    }

    fn decide(&self, state: &AggregateState, command: &StartCardRunCommand) -> Result<Decision, Reject> {
        let (created, _) = Self::card_state(&state.events);
        if !created {
            return Err(Reject(format!("card {} does not exist", command.card_id)));
        }
        if Self::run_accepted(&state.events, &command.run_id) {
            return Err(Reject(format!("run {} already accepted", command.run_id)));
        }
        if command.run_id.trim().is_empty() || command.provider.trim().is_empty() {
            return Err(Reject("run_id and provider must not be empty".into()));
        }
        // Demand the provider turn as an outbox effect: the *intent* is
        // accepted here, the *work* happens in the dispatcher/effect worker.
        let effect = OutboxMessage::new(
            "provider_turn.start",
            serde_json::json!({
                "card_id": command.card_id,
                "run_id": command.run_id,
                "provider": command.provider,
            }),
            command.issued_at,
        );
        Ok(Decision::new(vec![run_accepted(command)]).with_effects(vec![effect]))
    }
}

impl Orchestrator<CompleteCardRunCommand> for BarkOrchestrator {
    fn load_state(&self, stream_events: &[super::event::StoredEvent]) -> AggregateState {
        <Self as Orchestrator<CreateCardCommand>>::load_state(self, stream_events)
    }

    fn decide(&self, state: &AggregateState, command: &CompleteCardRunCommand) -> Result<Decision, Reject> {
        if !Self::run_accepted(&state.events, &command.run_id) {
            return Err(Reject(format!("run {} was never accepted", command.run_id)));
        }
        Ok(Decision::new(vec![run_completed(command)]))
    }
}

impl Orchestrator<RecordGateCommand> for BarkOrchestrator {
    fn load_state(&self, stream_events: &[super::event::StoredEvent]) -> AggregateState {
        <Self as Orchestrator<CreateCardCommand>>::load_state(self, stream_events)
    }

    fn decide(&self, state: &AggregateState, command: &RecordGateCommand) -> Result<Decision, Reject> {
        if !Self::run_accepted(&state.events, &command.run_id) {
            return Err(Reject(format!("run {} was never accepted", command.run_id)));
        }
        Ok(Decision::new(vec![gate_checked(command)]))
    }
}
