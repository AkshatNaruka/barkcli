use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::models::Sprint;
use crate::storage::board_dir::find_board_dir;

const SPRINTS_DIR: &str = "sprints";

/// `.board/sprints/<board>.json` — one JSON array of sprints per board.
pub fn sprints_path(board_name: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    let dir = board_dir.join(SPRINTS_DIR);
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.json", board_name)))
}

pub fn read_sprints(board_name: &str) -> Result<Vec<Sprint>> {
    let path = sprints_path(board_name)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).context("failed to read sprints")?;
    let sprints: Vec<Sprint> = serde_json::from_str(&content).unwrap_or_default();
    Ok(sprints)
}

pub fn write_sprints(board_name: &str, sprints: &[Sprint]) -> Result<()> {
    let path = sprints_path(board_name)?;
    let json = serde_json::to_string_pretty(sprints).context("failed to serialize sprints")?;
    std::fs::write(&path, json).context("failed to write sprints")?;
    Ok(())
}

/// Add a sprint or update an existing one (matched by name).
pub fn upsert_sprint(board_name: &str, sprint: Sprint) -> Result<()> {
    let mut sprints = read_sprints(board_name)?;
    match sprints.iter_mut().find(|s| s.name == sprint.name) {
        Some(existing) => *existing = sprint,
        None => sprints.push(sprint),
    }
    write_sprints(board_name, &sprints)
}
