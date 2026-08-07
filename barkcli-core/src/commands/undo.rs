use std::fs;
use std::io::Write;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::models::Board;
use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::{read_board, write_board};

#[derive(Debug, Serialize, Deserialize)]
pub struct UndoEntry {
    pub at: String,
    pub op: String,
    pub card_id: Option<String>,
    pub yaml: String,
}

pub fn save_undo_state(board_name: &str, op: &str, card_id: Option<&str>) -> Result<()> {
    let board_dir = find_board_dir()?;
    let undo_dir = board_dir.join("undo");
    fs::create_dir_all(&undo_dir).ok();

    let board = read_board(board_name)?;
    let yaml = serde_yaml::to_string(&board).context("serialize for undo")?;

    let entry = UndoEntry {
        at: chrono::Utc::now().to_rfc3339(),
        op: op.to_string(),
        card_id: card_id.map(|s| s.to_string()),
        yaml,
    };

    let path = undo_dir.join(format!("{}.jsonl", board_name));
    let mut file = fs::OpenOptions::new().create(true).append(true).open(&path)
        .context("open undo log")?;
    let json = serde_json::to_string(&entry).context("serialize undo entry")?;
    writeln!(file, "{}", json).context("write undo entry")?;
    Ok(())
}

pub fn run_undo(board_name: Option<&str>, card_id: Option<&str>) -> Result<()> {
    let name = crate::commands::boards::resolve_board(board_name)?;
    let board_dir = find_board_dir()?;
    let undo_dir = board_dir.join("undo");
    let path = undo_dir.join(format!("{}.jsonl", name));

    if !path.exists() {
        println!("Nothing to undo.");
        return Ok(());
    }

    let content = fs::read_to_string(&path).context("read undo log")?;
    let mut entries: Vec<UndoEntry> = content
        .lines()
        .filter_map(|l| serde_json::from_str::<UndoEntry>(l).ok())
        .collect();

    if entries.is_empty() {
        println!("Nothing to undo.");
        return Ok(());
    }

    // Find the entry to restore
    let restore_idx = if let Some(ref cid) = card_id {
        entries.iter().rposition(|e| e.card_id.as_deref() == Some(*cid))
    } else {
        Some(entries.len() - 1)
    };

    let idx = match restore_idx {
        Some(i) => i,
        None => {
            println!("No undo entry found for card '{}'", card_id.unwrap_or("?"));
            return Ok(());
        }
    };

    // Restore board from the undo entry
    let board: Board = serde_yaml::from_str(&entries[idx].yaml)
        .context("parse undo entry")?;
    write_board(&name, &board)?;

    if let Some(ref cid) = card_id {
        // Remove all undo entries that reference this card
        entries.retain(|e| e.card_id.as_deref() != Some(*cid));
    } else {
        // Remove the last entry
        entries.truncate(idx);
    }

    // Rewrite the undo log
    let new_content: String = entries
        .iter()
        .map(|e| {
            let json = serde_json::to_string(e).unwrap_or_default();
            format!("{}\n", json)
        })
        .collect();

    fs::write(&path, new_content).context("write undo log")?;

    if let Some(ref cid) = card_id {
        println!("Undid last change to card '{}' in '{}'", cid, name);
    } else {
        println!("Undid last change in '{}'. Board state before '{}': restored.",
            name, entries.get(idx).map(|e| e.op.as_str()).unwrap_or("?"));
    }
    Ok(())
}

pub fn run_snapshot(board_name: Option<&str>, label: &str) -> Result<()> {
    let name = crate::commands::boards::resolve_board(board_name)?;
    let board_dir = find_board_dir()?;
    let snap_dir = board_dir.join("snapshots");
    fs::create_dir_all(&snap_dir).ok();

    let board = read_board(&name)?;
    let yaml = serde_yaml::to_string(&board).context("serialize snapshot")?;

    let filename = format!("{}.yaml", label.replace(['/', '\\', ':'], "-"));
    let path = snap_dir.join(&filename);

    fs::write(&path, &yaml).context("write snapshot")?;

    println!("Snapshot '{}' saved for board '{}'", label, name);
    Ok(())
}

pub fn run_diff() -> Result<()> {
    let name = crate::commands::boards::resolve_board(None)?;
    let board_dir = find_board_dir()?;
    let undo_dir = board_dir.join("undo");
    let path = undo_dir.join(format!("{}.jsonl", name));

    if !path.exists() {
        println!("No history to diff against.");
        return Ok(());
    }

    let content = fs::read_to_string(&path).context("read undo log")?;
    let entries: Vec<UndoEntry> = content
        .lines()
        .filter_map(|l| serde_json::from_str::<UndoEntry>(l).ok())
        .collect();

    let current = read_board(&name)?;

    if let Some(last_undo) = entries.last() {
        let prev: Board = serde_yaml::from_str(&last_undo.yaml)
            .context("parse previous state")?;

        let added: Vec<_> = current.cards.iter()
            .filter(|c| !prev.cards.iter().any(|p| p.id == c.id))
            .collect();
        let removed: Vec<_> = prev.cards.iter()
            .filter(|p| !current.cards.iter().any(|c| c.id == p.id))
            .collect();
        let moved: Vec<_> = current.cards.iter()
            .filter(|c| {
                prev.cards.iter().any(|p| p.id == c.id && p.column != c.column)
            })
            .collect();

        if added.is_empty() && removed.is_empty() && moved.is_empty() {
            println!("No changes since last operation.");
        } else {
            for c in &added { println!("+ {} [{}] ({})", c.title, c.id, c.column); }
            for c in &removed { println!("- {} [{}]", c.title, c.id); }
            for c in &moved {
                let old = prev.cards.iter().find(|p| p.id == c.id).map(|p| p.column.as_str()).unwrap_or("?");
                println!("→ {} {} → {}", c.title, old, c.column);
            }
        }
    } else {
        println!("No history to diff against.");
    }

    Ok(())
}

pub fn run_blame(board_name: Option<&str>, card_id: &str) -> Result<()> {
    let name = crate::commands::boards::resolve_board(board_name)?;
    let board_dir = find_board_dir()?;
    let undo_dir = board_dir.join("undo");
    let path = undo_dir.join(format!("{}.jsonl", name));

    if !path.exists() {
        println!("No history for '{}'.", card_id);
        return Ok(());
    }

    let content = fs::read_to_string(&path).context("read undo log")?;
    let entries: Vec<UndoEntry> = content
        .lines()
        .filter_map(|l| serde_json::from_str::<UndoEntry>(l).ok())
        .filter(|e| e.card_id.as_deref() == Some(card_id))
        .collect();

    if entries.is_empty() {
        println!("No history for card '{}'.", card_id);
        return Ok(());
    }

    println!("Blame for card '{}':", card_id);
    println!("| When                           | What changed |");
    println!("|--------------------------------|--------------|");
    for entry in entries {
        println!("| {} | {}", entry.at, entry.op);
    }

    Ok(())
}
