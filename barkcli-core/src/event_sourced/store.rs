//! Event store: the abstract log plus two implementations.
//!
//! [`EventStore`] is the read-side contract (positions, streams, receipts).
//! [`OutboxStore`] is the outbox delivery contract.
//! [`InMemoryEventStore`] is a `Mutex`-guarded in-process log (tests, REPL).
//! [`SqliteEventStore`] persists to SQLite (the production default, mirroring
//! t3code's `statev2.sqlite` layout: events + receipts + outbox in one file).
//!
//! Writing is done through [`super::sink::EventSink`], which commits events,
//! receipt, outbox, and projection checkpoints in one transaction. The raw
//! `append` on [`EventStore`] exists for callers that only need the log.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::command::{CommandId, CommandReceipt};
use super::event::{EventId, NewEvent, StoredEvent, StreamId};
use super::outbox::OutboxMessage;
use super::EventSourcedError;

/// Read-side contract over the committed event log and receipts.
pub trait EventStore: Send + Sync {
    /// Last per-stream sequence (0 when the stream is empty).
    fn stream_version(&self, stream_id: &str) -> Result<u64, EventSourcedError>;
    /// Events of `stream_id` with `stream_seq > from_seq`, in order.
    fn read_stream(&self, stream_id: &str, from_seq: u64) -> Result<Vec<StoredEvent>, EventSourcedError>;
    /// Events with `global_seq > from_global_seq`, in order, up to `limit`.
    fn read_all(&self, from_global_seq: u64, limit: usize) -> Result<Vec<StoredEvent>, EventSourcedError>;
    /// Latest assigned global position (0 when the log is empty).
    fn global_seq(&self) -> Result<u64, EventSourcedError>;
    fn find_receipt(&self, command_id: &CommandId) -> Result<Option<CommandReceipt>, EventSourcedError>;
    /// Flip a receipt to `Completed` (see [`super::lifecycle`]).
    fn mark_receipt_completed(&self, command_id: &CommandId, at: DateTime<Utc>) -> Result<(), EventSourcedError>;
    /// Append committed events to `stream_id`, checking `expected_version`
    /// (the caller's view of the stream version) for optimistic concurrency.
    /// Prefer [`super::sink::EventSink::commit`] when a receipt or outbox
    /// rows must land in the same transaction.
    fn append(
        &self,
        stream_id: &str,
        expected_version: Option<u64>,
        events: &[NewEvent],
    ) -> Result<Vec<StoredEvent>, EventSourcedError>;
}

/// Outbox delivery contract.
pub trait OutboxStore: Send + Sync {
    fn fetch_outbox_due(&self, now: DateTime<Utc>, limit: usize) -> Result<Vec<OutboxMessage>, EventSourcedError>;
    fn mark_outbox_dispatched(&self, id: Uuid, at: DateTime<Utc>) -> Result<(), EventSourcedError>;
    fn mark_outbox_failed(&self, id: Uuid, error: String, next_retry_at: DateTime<Utc>) -> Result<(), EventSourcedError>;
    fn count_outbox_pending(&self) -> Result<usize, EventSourcedError>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

#[derive(Default)]
pub(crate) struct InMemoryInner {
    /// Global log in `global_seq` order.
    pub(crate) events: Vec<StoredEvent>,
    /// Per-stream `stream_seq` counter (last assigned).
    pub(crate) stream_versions: HashMap<StreamId, u64>,
    pub(crate) receipts: HashMap<CommandId, CommandReceipt>,
    pub(crate) outbox: Vec<OutboxMessage>,
    pub(crate) checkpoints: HashMap<String, u64>,
}

/// In-process event store. Correct for tests and single-process tools; use
/// [`SqliteEventStore`] for durability.
#[derive(Default)]
pub struct InMemoryEventStore {
    pub(crate) inner: Mutex<InMemoryInner>,
}

impl InMemoryEventStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl EventStore for InMemoryEventStore {
    fn stream_version(&self, stream_id: &str) -> Result<u64, EventSourcedError> {
        Ok(*self.inner.lock().unwrap().stream_versions.get(stream_id).unwrap_or(&0))
    }

    fn read_stream(&self, stream_id: &str, from_seq: u64) -> Result<Vec<StoredEvent>, EventSourcedError> {
        let inner = self.inner.lock().unwrap();
        Ok(inner
            .events
            .iter()
            .filter(|event| event.stream_id == stream_id && event.stream_seq > from_seq)
            .cloned()
            .collect())
    }

    fn read_all(&self, from_global_seq: u64, limit: usize) -> Result<Vec<StoredEvent>, EventSourcedError> {
        let inner = self.inner.lock().unwrap();
        Ok(inner
            .events
            .iter()
            .filter(|event| event.global_seq > from_global_seq)
            .take(limit)
            .cloned()
            .collect())
    }

    fn global_seq(&self) -> Result<u64, EventSourcedError> {
        Ok(self.inner.lock().unwrap().events.last().map(|event| event.global_seq).unwrap_or(0))
    }

    fn find_receipt(&self, command_id: &CommandId) -> Result<Option<CommandReceipt>, EventSourcedError> {
        Ok(self.inner.lock().unwrap().receipts.get(command_id).cloned())
    }

    fn mark_receipt_completed(&self, command_id: &CommandId, at: DateTime<Utc>) -> Result<(), EventSourcedError> {
        let mut inner = self.inner.lock().unwrap();
        let receipt = inner
            .receipts
            .get_mut(command_id)
            .ok_or_else(|| EventSourcedError::ReceiptNotFound(command_id.clone()))?;
        receipt.status = super::command::ReceiptStatus::Completed;
        receipt.completed_at = Some(at);
        Ok(())
    }

    fn append(
        &self,
        stream_id: &str,
        expected_version: Option<u64>,
        events: &[NewEvent],
    ) -> Result<Vec<StoredEvent>, EventSourcedError> {
        append_in_memory(self, stream_id, expected_version, events)
    }
}

impl OutboxStore for InMemoryEventStore {
    fn fetch_outbox_due(&self, now: DateTime<Utc>, limit: usize) -> Result<Vec<OutboxMessage>, EventSourcedError> {
        let inner = self.inner.lock().unwrap();
        Ok(inner
            .outbox
            .iter()
            .filter(|message| message.is_due(now))
            .take(limit)
            .cloned()
            .collect())
    }

    fn mark_outbox_dispatched(&self, id: Uuid, at: DateTime<Utc>) -> Result<(), EventSourcedError> {
        let mut inner = self.inner.lock().unwrap();
        let message = inner
            .outbox
            .iter_mut()
            .find(|message| message.id == id)
            .ok_or_else(|| EventSourcedError::Store(format!("outbox message {id} not found")))?;
        message.status = super::outbox::OutboxStatus::Dispatched;
        message.dispatched_at = Some(at);
        Ok(())
    }

    fn mark_outbox_failed(&self, id: Uuid, error: String, next_retry_at: DateTime<Utc>) -> Result<(), EventSourcedError> {
        let mut inner = self.inner.lock().unwrap();
        let message = inner
            .outbox
            .iter_mut()
            .find(|message| message.id == id)
            .ok_or_else(|| EventSourcedError::Store(format!("outbox message {id} not found")))?;
        message.attempts += 1;
        message.status = super::outbox::OutboxStatus::Failed;
        message.last_error = Some(error);
        message.next_retry_at = next_retry_at;
        Ok(())
    }

    fn count_outbox_pending(&self) -> Result<usize, EventSourcedError> {
        let inner = self.inner.lock().unwrap();
        Ok(inner
            .outbox
            .iter()
            .filter(|message| message.status != super::outbox::OutboxStatus::Dispatched)
            .count())
    }
}

// ---------------------------------------------------------------------------
// SQLite implementation
// ---------------------------------------------------------------------------

/// SQLite-backed event store (production default). A single connection is
/// serialized behind a `Mutex`, and [`super::sink::EventSink::commit`] runs
/// `BEGIN IMMEDIATE` so the four-table commit either lands whole or not at
/// all.
pub struct SqliteEventStore {
    conn: Mutex<Connection>,
}

impl SqliteEventStore {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, EventSourcedError> {
        let conn = Connection::open(path).map_err(storage_error)?;
        Self::initialize(conn)
    }

    pub fn in_memory() -> Result<Self, EventSourcedError> {
        let conn = Connection::open_in_memory().map_err(storage_error)?;
        Self::initialize(conn)
    }

    fn initialize(conn: Connection) -> Result<Self, EventSourcedError> {
        let conn = Mutex::new(conn);
        {
            let guard = conn.lock().unwrap();
            guard
                .execute_batch(
                    "
                    PRAGMA journal_mode = WAL;
                    CREATE TABLE IF NOT EXISTS events (
                        global_seq   INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id     TEXT NOT NULL UNIQUE,
                        stream_id    TEXT NOT NULL,
                        stream_seq   INTEGER NOT NULL,
                        event_type   TEXT NOT NULL,
                        payload      TEXT NOT NULL,
                        occurred_at  TEXT NOT NULL,
                        correlation_id TEXT,
                        causation_id TEXT,
                        UNIQUE(stream_id, stream_seq)
                    );
                    CREATE INDEX IF NOT EXISTS idx_events_stream
                        ON events(stream_id, stream_seq);
                    CREATE TABLE IF NOT EXISTS command_receipts (
                        command_id   TEXT PRIMARY KEY,
                        command_type TEXT NOT NULL,
                        stream_id    TEXT NOT NULL,
                        status       TEXT NOT NULL,
                        reason       TEXT,
                        result_event_ids TEXT NOT NULL,
                        command_payload  TEXT NOT NULL,
                        issued_at    TEXT NOT NULL,
                        accepted_at  TEXT NOT NULL,
                        completed_at TEXT
                    );
                    CREATE TABLE IF NOT EXISTS outbox (
                        id             TEXT PRIMARY KEY,
                        topic          TEXT NOT NULL,
                        payload        TEXT NOT NULL,
                        status         TEXT NOT NULL,
                        attempts       INTEGER NOT NULL,
                        created_at     TEXT NOT NULL,
                        next_retry_at  TEXT NOT NULL,
                        dispatched_at  TEXT,
                        last_error     TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_outbox_due
                        ON outbox(status, next_retry_at);
                    CREATE TABLE IF NOT EXISTS projection_checkpoints (
                        name           TEXT PRIMARY KEY,
                        last_global_seq INTEGER NOT NULL
                    );
                    ",
                )
                .map_err(storage_error)?;
        }
        Ok(Self { conn })
    }

    pub(crate) fn lock_conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}

impl EventStore for SqliteEventStore {
    fn stream_version(&self, stream_id: &str) -> Result<u64, EventSourcedError> {
        let conn = self.lock_conn();
        let version = conn
            .query_row(
                "SELECT COALESCE(MAX(stream_seq), 0) FROM events WHERE stream_id = ?1",
                params![stream_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(storage_error)?;
        Ok(version.max(0) as u64)
    }

    fn read_stream(&self, stream_id: &str, from_seq: u64) -> Result<Vec<StoredEvent>, EventSourcedError> {
        let conn = self.lock_conn();
        let mut stmt = conn
            .prepare(
                "SELECT * FROM events WHERE stream_id = ?1 AND stream_seq > ?2 ORDER BY stream_seq",
            )
            .map_err(storage_error)?;
        let rows = stmt
            .query_map(params![stream_id, from_seq], decode_event_row)
            .map_err(storage_error)?;
        rows.map(|row| row.map_err(storage_error)).collect()
    }

    fn read_all(&self, from_global_seq: u64, limit: usize) -> Result<Vec<StoredEvent>, EventSourcedError> {
        let conn = self.lock_conn();
        let mut stmt = conn
            .prepare(
                "SELECT * FROM events WHERE global_seq > ?1 ORDER BY global_seq LIMIT ?2",
            )
            .map_err(storage_error)?;
        let rows = stmt
            .query_map(params![from_global_seq, limit as i64], decode_event_row)
            .map_err(storage_error)?;
        rows.map(|row| row.map_err(storage_error)).collect()
    }

    fn global_seq(&self) -> Result<u64, EventSourcedError> {
        let conn = self.lock_conn();
        let seq = conn
            .query_row(
                "SELECT COALESCE(MAX(global_seq), 0) FROM events",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(storage_error)?;
        Ok(seq.max(0) as u64)
    }

    fn find_receipt(&self, command_id: &CommandId) -> Result<Option<CommandReceipt>, EventSourcedError> {
        let conn = self.lock_conn();
        let mut stmt = conn
            .prepare("SELECT * FROM command_receipts WHERE command_id = ?1")
            .map_err(storage_error)?;
        let mut rows = stmt
            .query_map(params![command_id.to_string()], decode_receipt_row)
            .map_err(storage_error)?;
        rows.next().transpose().map_err(storage_error)
    }

    fn mark_receipt_completed(&self, command_id: &CommandId, at: DateTime<Utc>) -> Result<(), EventSourcedError> {
        let conn = self.lock_conn();
        let updated = conn
            .execute(
                "UPDATE command_receipts SET status = 'completed', completed_at = ?1 \
                 WHERE command_id = ?2 AND status = 'accepted'",
                params![at.to_rfc3339(), command_id.to_string()],
            )
            .map_err(storage_error)?;
        if updated == 0 {
            // Distinguish "missing" from "already terminal".
            let exists = self.find_receipt(command_id)?.is_some();
            if !exists {
                return Err(EventSourcedError::ReceiptNotFound(command_id.clone()));
            }
        }
        Ok(())
    }

    fn append(
        &self,
        stream_id: &str,
        expected_version: Option<u64>,
        events: &[NewEvent],
    ) -> Result<Vec<StoredEvent>, EventSourcedError> {
        append_in_sqlite(self, stream_id, expected_version, events)
    }
}

impl OutboxStore for SqliteEventStore {
    fn fetch_outbox_due(&self, now: DateTime<Utc>, limit: usize) -> Result<Vec<OutboxMessage>, EventSourcedError> {
        let conn = self.lock_conn();
        let mut stmt = conn
            .prepare(
                "SELECT * FROM outbox \
                 WHERE status != 'dispatched' AND next_retry_at <= ?1 \
                 ORDER BY created_at LIMIT ?2",
            )
            .map_err(storage_error)?;
        let rows = stmt
            .query_map(params![now.to_rfc3339(), limit as i64], decode_outbox_row)
            .map_err(storage_error)?;
        rows.map(|row| row.map_err(storage_error)).collect()
    }

    fn mark_outbox_dispatched(&self, id: Uuid, at: DateTime<Utc>) -> Result<(), EventSourcedError> {
        let conn = self.lock_conn();
        let updated = conn
            .execute(
                "UPDATE outbox SET status = 'dispatched', dispatched_at = ?1 WHERE id = ?2",
                params![at.to_rfc3339(), id.to_string()],
            )
            .map_err(storage_error)?;
        if updated == 0 {
            return Err(EventSourcedError::Store(format!("outbox message {id} not found")));
        }
        Ok(())
    }

    fn mark_outbox_failed(&self, id: Uuid, error: String, next_retry_at: DateTime<Utc>) -> Result<(), EventSourcedError> {
        let conn = self.lock_conn();
        let updated = conn
            .execute(
                "UPDATE outbox SET status = 'failed', attempts = attempts + 1, \
                 last_error = ?1, next_retry_at = ?2 WHERE id = ?3",
                params![error, next_retry_at.to_rfc3339(), id.to_string()],
            )
            .map_err(storage_error)?;
        if updated == 0 {
            return Err(EventSourcedError::Store(format!("outbox message {id} not found")));
        }
        Ok(())
    }

    fn count_outbox_pending(&self) -> Result<usize, EventSourcedError> {
        let conn = self.lock_conn();
        let count = conn
            .query_row(
                "SELECT COUNT(*) FROM outbox WHERE status != 'dispatched'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(storage_error)?;
        Ok(count.max(0) as usize)
    }
}

// ---------------------------------------------------------------------------
// Row decoding helpers (used by store reads and sink-committed reads)
// ---------------------------------------------------------------------------

pub(crate) fn decode_event_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredEvent> {
    let event_id: String = row.get(1)?;
    let causation: Option<String> = row.get(8)?;
    Ok(StoredEvent {
        global_seq: row.get::<_, i64>(0)? as u64,
        event_id: EventId::parse(&event_id).map_err(|_| rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad event_id"))))?,
        stream_id: row.get(2)?,
        stream_seq: row.get::<_, i64>(3)? as u64,
        event_type: row.get(4)?,
        payload: serde_json::from_str(&row.get::<_, String>(5)?).map_err(|_| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad payload"))))?,
        occurred_at: parse_time(&row.get::<_, String>(6)?),
        correlation_id: row.get(7)?,
        causation_id: causation.and_then(|id| CommandId::parse(&id).ok()),
    })
}

pub(crate) fn decode_receipt_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CommandReceipt> {
    let status: String = row.get(3)?;
    let result_ids: String = row.get::<_, String>(5)?;
    let completed: Option<String> = row.get(9)?;
    Ok(CommandReceipt {
        command_id: CommandId::parse(&row.get::<_, String>(0)?)
            .map_err(|_| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad command_id"))))?,
        command_type: row.get(1)?,
        stream_id: row.get(2)?,
        status: match status.as_str() {
            "completed" => super::command::ReceiptStatus::Completed,
            "rejected" => super::command::ReceiptStatus::Rejected,
            _ => super::command::ReceiptStatus::Accepted,
        },
        reason: row.get(4)?,
        result_event_ids: serde_json::from_str(&result_ids).unwrap_or_default(),
        command_payload: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or(serde_json::Value::Null),
        issued_at: parse_time(&row.get::<_, String>(7)?),
        accepted_at: parse_time(&row.get::<_, String>(8)?),
        completed_at: completed.map(|value| parse_time(&value)),
    })
}

pub(crate) fn decode_outbox_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<OutboxMessage> {
    let status: String = row.get(3)?;
    Ok(OutboxMessage {
        id: row.get::<_, String>(0)?.parse().map_err(|_| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad outbox id")))
        })?,
        topic: row.get(1)?,
        payload: serde_json::from_str(&row.get::<_, String>(2)?).map_err(|_| {
            rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad payload")))
        })?,
        status: match status.as_str() {
            "dispatched" => super::outbox::OutboxStatus::Dispatched,
            "failed" => super::outbox::OutboxStatus::Failed,
            _ => super::outbox::OutboxStatus::Pending,
        },
        attempts: row.get::<_, i64>(4)? as u32,
        created_at: parse_time(&row.get::<_, String>(5)?),
        next_retry_at: parse_time(&row.get::<_, String>(6)?),
        dispatched_at: row.get::<_, Option<String>>(7)?.map(|value| parse_time(&value)),
        last_error: row.get(8)?,
    })
}

/// Parse an RFC3339 timestamp written by this module. Legacy/garbage rows
/// decode to UTC epoch rather than failing the whole read.
pub(crate) fn parse_time(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .map(|parsed| parsed.with_timezone(&Utc))
        .unwrap_or_else(|_| DateTime::<Utc>::from_timestamp(0, 0).unwrap())
}

pub(crate) fn storage_error(error: rusqlite::Error) -> EventSourcedError {
    EventSourcedError::Store(error.to_string())
}

/// Insert one new event into `conn` under `stream_id`, assigning the
/// per-stream sequence. Callers own the surrounding transaction.
pub(crate) fn insert_event(
    conn: &Connection,
    stream_id: &str,
    event: &NewEvent,
) -> Result<StoredEvent, EventSourcedError> {
    let next = conn
        .query_row(
            "SELECT COALESCE(MAX(stream_seq), 0) + 1 FROM events WHERE stream_id = ?1",
            params![stream_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(storage_error)?;
    conn.execute(
        "INSERT INTO events (event_id, stream_id, stream_seq, event_type, payload, occurred_at, correlation_id, causation_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            event.event_id.to_string(),
            stream_id,
            next,
            event.event_type,
            serde_json::to_string(&event.payload).unwrap_or_else(|_| "null".into()),
            event.occurred_at.to_rfc3339(),
            event.correlation_id,
            event.causation_id.as_ref().map(|id| id.to_string()),
        ],
    )
    .map_err(storage_error)?;
    let global_seq = conn.last_insert_rowid() as u64;
    Ok(StoredEvent {
        event_id: event.event_id.clone(),
        stream_id: stream_id.to_string(),
        global_seq,
        stream_seq: next as u64,
        event_type: event.event_type.clone(),
        payload: event.payload.clone(),
        occurred_at: event.occurred_at,
        correlation_id: event.correlation_id.clone(),
        causation_id: event.causation_id.clone(),
    })
}

/// Append `events` to the in-memory log under one lock (a single logical
/// transaction: either every event lands or — on a concurrency failure —
// none does).
pub(crate) fn append_in_memory(
    store: &InMemoryEventStore,
    stream_id: &str,
    expected_version: Option<u64>,
    events: &[NewEvent],
) -> Result<Vec<StoredEvent>, EventSourcedError> {
    let mut inner = store.inner.lock().unwrap();
    if let Some(expected) = expected_version {
        let actual = inner.stream_versions.get(stream_id).copied().unwrap_or(0);
        if actual != expected {
            return Err(EventSourcedError::Concurrency {
                stream_id: stream_id.to_string(),
                expected,
                actual,
            });
        }
    }
    let mut stored = Vec::with_capacity(events.len());
    for event in events {
        let stream_seq = inner.stream_versions.get(stream_id).copied().unwrap_or(0) + 1;
        let global_seq = inner.events.len() as u64 + 1;
        let mut stored_event: StoredEvent = event.clone().into();
        stored_event.stream_id = stream_id.to_string();
        stored_event.global_seq = global_seq;
        stored_event.stream_seq = stream_seq;
        inner.stream_versions.insert(stream_id.to_string(), stream_seq);
        inner.events.push(stored_event.clone());
        stored.push(stored_event);
    }
    Ok(stored)
}

/// Append `events` to SQLite inside a single transaction.
pub(crate) fn append_in_sqlite(
    store: &SqliteEventStore,
    stream_id: &str,
    expected_version: Option<u64>,
    events: &[NewEvent],
) -> Result<Vec<StoredEvent>, EventSourcedError> {
    let mut conn = store.lock_conn();
    let tx = conn.transaction().map_err(storage_error)?;
    if let Some(expected) = expected_version {
        let actual = tx
            .query_row(
                "SELECT COALESCE(MAX(stream_seq), 0) FROM events WHERE stream_id = ?1",
                params![stream_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(storage_error)?
            .max(0) as u64;
        if actual != expected {
            return Err(EventSourcedError::Concurrency {
                stream_id: stream_id.to_string(),
                expected,
                actual,
            });
        }
    }
    let mut stored = Vec::with_capacity(events.len());
    for event in events {
        stored.push(insert_event(&tx, stream_id, event)?);
    }
    tx.commit().map_err(storage_error)?;
    Ok(stored)
}

#[cfg(test)]
pub(super) fn event_type_of(event: &NewEvent) -> &str {
    &event.event_type
}
