use chrono::Utc;
use serde::{Deserialize, Serialize};

/// A captured agent session entry, scoped to a board. Stored as JSONL in
/// `.board/sessions/<board>.jsonl`; free-text fields are redacted before write.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEntry {
    /// Stable id: `barkcli-YYYYMMDD-<8 hex>`.
    pub id: String,
    /// Agent that produced the session (e.g. "opencode", "claude-code").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    /// LLM model used (e.g. "gpt-4o-mini").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Board this session is scoped to.
    pub board: String,
    /// User prompt (redacted before storage).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// Commit linked to this session (auto checkpoints post-commit).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit_sha: Option<String>,
    /// Files touched during the session (redacted before storage).
    #[serde(default)]
    pub files_touched: Vec<String>,
    /// AI-generated or hand-written summary of intent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// RFC3339 start timestamp.
    pub at: String,
    /// Session duration in milliseconds, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    /// Cards whose mapped files this session touched (computed on append).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub matched_card_ids: Vec<String>,
}

impl SessionEntry {
    pub fn new(board: impl Into<String>) -> Self {
        Self {
            id: new_session_id(),
            agent: None,
            model: None,
            board: board.into(),
            prompt: None,
            commit_sha: None,
            files_touched: Vec::new(),
            summary: None,
            at: Utc::now().to_rfc3339(),
            duration_ms: None,
            matched_card_ids: Vec::new(),
        }
    }
}

/// `barkcli-20260806-a1b2c3d4` — date + 8 hex chars of entropy (no uuid crate in core).
pub fn new_session_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or_default();
    let counter = COUNTER.fetch_add(1, Ordering::SeqCst);
    // Mix wall-clock nanos with a per-process counter so consecutive ids differ.
    let mixed = (nanos << 16) ^ (counter.rotate_left(32)) ^ (std::process::id() as u64);
    let suffix = format!("{:08x}", mixed);
    format!("barkcli-{}-{}", Utc::now().format("%Y%m%d"), &suffix[suffix.len() - 8..])
}
