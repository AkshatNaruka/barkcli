//! EventSink: the single-transaction commit boundary (the t3code pattern).
//!
//! A [`CommitBatch`] carries everything one command produced -- its events,
//! its receipt, and the outbox rows demanding side effects -- and
//! [`EventSink::commit`] persists all of it atomically: either the whole
//! batch lands or none of it does. "No receipt without events, no events
//! without a receipt, no events without their outbox rows" is therefore an
//! invariant, not a hope.

use rusqlite::params;

use super::command::CommandReceipt;
use super::event::{NewEvent, StoredEvent, StreamId};
use super::outbox::OutboxMessage;
use super::store::{append_in_memory, storage_error, InMemoryEventStore, SqliteEventStore};
use super::EventSourcedError;

/// Everything the dispatcher commits for one command, atomically.
#[derive(Debug, Clone)]
pub struct CommitBatch {
    /// Stream this batch appends to.
    pub stream_id: StreamId,
    /// Optimistic-concurrency guard: commit fails if the stream version
    /// moved since the caller read it.
    pub expected_version: Option<u64>,
    pub events: Vec<NewEvent>,
    /// `None` only for pure event appends outside command handling.
    pub receipt: Option<CommandReceipt>,
    pub outbox: Vec<OutboxMessage>,
    /// Projection checkpoints advanced by this batch: `(name, last_global_seq)`.
    pub checkpoints: Vec<(String, u64)>,
}

impl CommitBatch {
    pub fn new(stream_id: StreamId, events: Vec<NewEvent>) -> Self {
        Self {
            stream_id,
            expected_version: None,
            events,
            receipt: None,
            outbox: Vec::new(),
            checkpoints: Vec::new(),
        }
    }

    pub fn with_receipt(mut self, receipt: CommandReceipt) -> Self {
        self.receipt = Some(receipt);
        self
    }

    pub fn with_outbox(mut self, outbox: Vec<OutboxMessage>) -> Self {
        self.outbox = outbox;
        self
    }

    pub fn with_expected_version(mut self, version: u64) -> Self {
        self.expected_version = Some(version);
        self
    }
}

/// Single-transaction commit over events + receipt + outbox + checkpoints.
pub trait EventSink: Send + Sync {
    fn commit(&self, batch: &CommitBatch) -> Result<Vec<StoredEvent>, EventSourcedError>;
}

impl EventSink for InMemoryEventStore {
    fn commit(&self, batch: &CommitBatch) -> Result<Vec<StoredEvent>, EventSourcedError> {
        // `append_in_memory` holds the one lock for the whole batch, so
        // events, receipt, outbox, and checkpoints become visible together.
        let stored = append_in_memory(self, &batch.stream_id, batch.expected_version, &batch.events)?;
        let mut inner = self.inner.lock().unwrap();
        if let Some(receipt) = &batch.receipt {
            if inner.receipts.contains_key(&receipt.command_id) {
                // Roll the events back: the batch is all-or-nothing.
                let keep = inner.events.len().saturating_sub(stored.len());
                inner.events.truncate(keep);
                let version = inner.events.iter().filter(|e| e.stream_id == batch.stream_id).count() as u64;
                match version {
                    0 => inner.stream_versions.remove(&batch.stream_id),
                    _ => inner.stream_versions.insert(batch.stream_id.clone(), version),
                };
                return Err(EventSourcedError::DuplicateReceipt(receipt.command_id.clone()));
            }
            inner.receipts.insert(receipt.command_id.clone(), receipt.clone());
        }
        for message in &batch.outbox {
            inner.outbox.push(message.clone());
        }
        for (name, seq) in &batch.checkpoints {
            inner.checkpoints.insert(name.clone(), *seq);
        }
        Ok(stored)
    }
}

impl EventSink for SqliteEventStore {
    fn commit(&self, batch: &CommitBatch) -> Result<Vec<StoredEvent>, EventSourcedError> {
        let conn = self.lock_conn();
        // BEGIN IMMEDIATE: acquire the write lock up front so concurrent
        // writers serialize instead of deadlocking on upgrade.
        conn.execute_batch("BEGIN IMMEDIATE").map_err(storage_error)?;
        let result = commit_in_transaction(&conn, batch);
        match result {
            Ok(stored) => {
                conn.execute_batch("COMMIT").map_err(storage_error)?;
                Ok(stored)
            }
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(error)
            }
        }
    }
}

/// Insert the whole batch inside the caller's transaction.
fn commit_in_transaction(
    conn: &rusqlite::Connection,
    batch: &CommitBatch,
) -> Result<Vec<StoredEvent>, EventSourcedError> {
    if let Some(expected) = batch.expected_version {
        let actual = conn
            .query_row(
                "SELECT COALESCE(MAX(stream_seq), 0) FROM events WHERE stream_id = ?1",
                params![batch.stream_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(storage_error)?
            .max(0) as u64;
        if actual != expected {
            return Err(EventSourcedError::Concurrency {
                stream_id: batch.stream_id.clone(),
                expected,
                actual,
            });
        }
    }
    if let Some(receipt) = &batch.receipt {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM command_receipts WHERE command_id = ?1",
                params![receipt.command_id.to_string()],
                |row| row.get(0),
            )
            .map_err(storage_error)?;
        if exists > 0 {
            return Err(EventSourcedError::DuplicateReceipt(receipt.command_id.clone()));
        }
    }
    let mut stored = Vec::with_capacity(batch.events.len());
    for event in &batch.events {
        stored.push(super::store::insert_event(conn, &batch.stream_id, event)?);
    }
    if let Some(receipt) = &batch.receipt {
        let result_ids = serde_json::to_string(&receipt.result_event_ids).unwrap_or_else(|_| "[]".into());
        let payload = serde_json::to_string(&receipt.command_payload).unwrap_or_else(|_| "null".into());
        conn.execute(
            "INSERT INTO command_receipts (command_id, command_type, stream_id, status, reason, \
             result_event_ids, command_payload, issued_at, accepted_at, completed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                receipt.command_id.to_string(),
                receipt.command_type,
                receipt.stream_id,
                receipt.status.as_str(),
                receipt.reason,
                result_ids,
                payload,
                receipt.issued_at.to_rfc3339(),
                receipt.accepted_at.to_rfc3339(),
                receipt.completed_at.map(|time| time.to_rfc3339()),
            ],
        )
        .map_err(storage_error)?;
    }
    for message in &batch.outbox {
        conn.execute(
            "INSERT INTO outbox (id, topic, payload, status, attempts, created_at, next_retry_at, dispatched_at, last_error) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                message.id.to_string(),
                message.topic,
                serde_json::to_string(&message.payload).unwrap_or_else(|_| "null".into()),
                message.status.as_str(),
                message.attempts as i64,
                message.created_at.to_rfc3339(),
                message.next_retry_at.to_rfc3339(),
                message.dispatched_at.map(|time| time.to_rfc3339()),
                message.last_error,
            ],
        )
        .map_err(storage_error)?;
    }
    for (name, seq) in &batch.checkpoints {
        conn.execute(
            "INSERT INTO projection_checkpoints (name, last_global_seq) VALUES (?1, ?2) \
             ON CONFLICT(name) DO UPDATE SET last_global_seq = excluded.last_global_seq",
            params![name, *seq as i64],
        )
        .map_err(storage_error)?;
    }
    Ok(stored)
}
