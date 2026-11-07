//! Backward-compatibility bridge to the existing file-is-truth surfaces.
//!
//! The event-sourced module is additive: it does not replace the board YAML,
//! the thread JSONL log (`crate::threads`), or the runtime run records
//! (`crate::runtime`). This module is the mapping layer between the two
//! worlds so new event-sourced facts can be *observed* by the old surfaces
//! without any of them changing:
//!
//! * [`stored_to_thread_event`] renders a [`StoredEvent`] as a
//!   [`crate::threads::ThreadEvent`] (known types map to their
//!   [`crate::threads::ThreadEventKind`]; unknown types become
//!   `Custom(event_type)`, never dropped).
//! * [`run_phase_to_status`] maps a [`super::lifecycle::RunPhase`] to the
//!   legacy [`crate::runtime::RunStatus`] spelling so the existing run UI
//!   keeps rendering.

use crate::runtime::RunStatus;
use crate::threads::{ThreadEvent, ThreadEventKind};

use super::event::StoredEvent;
use super::lifecycle::RunPhase;

/// Map an event-sourced fact to the legacy thread-log representation.
///
/// `card_id` is recovered from the stream (`card:<id>`) or the payload; the
/// caller-facing thread remains the card's durable thread.
pub fn stored_to_thread_event(event: &StoredEvent) -> ThreadEvent {
    let card_id = event
        .payload
        .get("card_id")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| {
            event
                .stream_id
                .strip_prefix("card:")
                .unwrap_or(&event.stream_id)
                .to_string()
        });
    let kind = match event.event_type.as_str() {
        "card_created" => ThreadEventKind::PlanProposed,
        "card_moved" => ThreadEventKind::RunStatus,
        "run_accepted" => ThreadEventKind::RunQueued,
        "run_started" => ThreadEventKind::RunStarted,
        "run_completed" => ThreadEventKind::RunCompleted,
        "run_failed" => ThreadEventKind::RunFailed,
        "run_interrupted" => ThreadEventKind::RunInterrupted,
        "gate_checked" => ThreadEventKind::Gate,
        _ => ThreadEventKind::Custom(event.event_type.clone()),
    };
    ThreadEvent {
        id: event.event_id.to_string(),
        card_id,
        thread_id: None,
        seq: event.stream_seq,
        run_id: event
            .payload
            .get("run_id")
            .and_then(|value| value.as_str())
            .map(str::to_string),
        turn_id: None,
        parent_event_id: None,
        kind,
        author: "event_sourced".to_string(),
        text: event.event_type.clone(),
        data: Some(event.payload.clone()),
        created_at: event.occurred_at.to_rfc3339(),
    }
}

/// Map a run phase to the legacy status spelling used by `crate::runtime`.
pub fn run_phase_to_status(phase: RunPhase) -> RunStatus {
    match phase {
        RunPhase::Unknown => RunStatus::Queued,
        RunPhase::Accepted => RunStatus::Queued,
        RunPhase::Running => RunStatus::Running,
        RunPhase::GatePending => RunStatus::Waiting,
        RunPhase::Passed => RunStatus::Passed,
        RunPhase::Failed => RunStatus::Failed,
        RunPhase::Interrupted => RunStatus::Interrupted,
        RunPhase::Cancelled => RunStatus::Cancelled,
    }
}
