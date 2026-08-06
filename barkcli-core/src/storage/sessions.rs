use std::io::Write;

use anyhow::{Context, Result};

use crate::models::session::SessionEntry;
use crate::storage::board_dir::find_board_dir;
use crate::util::redact::redact_text;

const SESSIONS_DIR: &str = "sessions";

/// Append a session entry to `.board/sessions/<board>.jsonl`.
/// All free-text fields are redacted before hitting disk.
pub fn append(entry: &SessionEntry) -> Result<()> {
    let board_dir = find_board_dir()?;
    let sessions_dir = board_dir.join(SESSIONS_DIR);
    std::fs::create_dir_all(&sessions_dir).ok();

    let redacted = SessionEntry {
        prompt: entry.prompt.as_deref().map(redact_text),
        summary: entry.summary.as_deref().map(redact_text),
        files_touched: entry
            .files_touched
            .iter()
            .map(|f| redact_text(f))
            .collect(),
        ..entry.clone()
    };

    let path = sessions_dir.join(format!("{}.jsonl", redacted.board));
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .context(format!("failed to open sessions log {}", path.display()))?;

    let json = serde_json::to_string(&redacted).context("failed to serialize session entry")?;
    writeln!(file, "{}", json).context("failed to write session entry")?;

    Ok(())
}

/// Read all session entries for a board, newest last (append order).
pub fn read_sessions(board_name: &str) -> Result<Vec<SessionEntry>> {
    let board_dir = find_board_dir()?;
    let path = board_dir.join(SESSIONS_DIR).join(format!("{}.jsonl", board_name));
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).context("failed to read sessions log")?;
    let mut entries = Vec::new();
    for line in content.lines() {
        if let Ok(entry) = serde_json::from_str::<SessionEntry>(line) {
            entries.push(entry);
        }
    }
    Ok(entries)
}
