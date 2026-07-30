use std::io::Write;

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;

const HISTORY_DIR: &str = "history";

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub op: String,
    pub board: String,
    pub card: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    pub at: String,
}

pub fn append(board_name: &str, entry: &HistoryEntry) -> Result<()> {
    let board_dir = find_board_dir()?;
    let history_dir = board_dir.join(HISTORY_DIR);
    std::fs::create_dir_all(&history_dir).ok();

    let path = history_dir.join(format!("{}.log", board_name));
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .context(format!("failed to open history log {}", path.display()))?;

    let json = serde_json::to_string(entry).context("failed to serialize history entry")?;
    writeln!(file, "{}", json).context("failed to write history entry")?;

    Ok(())
}

pub fn log_add(board: &str, card: &str, title: &str) -> Result<()> {
    append(
        board,
        &HistoryEntry {
            op: "add".into(),
            board: board.into(),
            card: card.into(),
            old_value: None,
            new_value: Some(title.into()),
            field: None,
            at: Utc::now().to_rfc3339(),
        },
    )
}

pub fn log_move(board: &str, card: &str, from: &str, to: &str) -> Result<()> {
    append(
        board,
        &HistoryEntry {
            op: "move".into(),
            board: board.into(),
            card: card.into(),
            old_value: Some(from.into()),
            new_value: Some(to.into()),
            field: Some("column".into()),
            at: Utc::now().to_rfc3339(),
        },
    )
}

pub fn log_update(board: &str, card: &str, field: &str, from: &str, to: &str) -> Result<()> {
    append(
        board,
        &HistoryEntry {
            op: "update".into(),
            board: board.into(),
            card: card.into(),
            old_value: Some(from.into()),
            new_value: Some(to.into()),
            field: Some(field.into()),
            at: Utc::now().to_rfc3339(),
        },
    )
}

pub fn log_remove(board: &str, card: &str, title: &str) -> Result<()> {
    append(
        board,
        &HistoryEntry {
            op: "remove".into(),
            board: board.into(),
            card: card.into(),
            old_value: Some(title.into()),
            new_value: None,
            field: None,
            at: Utc::now().to_rfc3339(),
        },
    )
}

#[allow(dead_code)]
pub fn read_history(board_name: &str) -> Result<Vec<HistoryEntry>> {
    let board_dir = find_board_dir()?;
    let path = board_dir.join(HISTORY_DIR).join(format!("{}.log", board_name));
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).context("failed to read history log")?;
    let mut entries = Vec::new();
    for line in content.lines() {
        if let Ok(entry) = serde_json::from_str::<HistoryEntry>(line) {
            entries.push(entry);
        }
    }
    Ok(entries)
}
