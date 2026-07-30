use std::path::Path;

use anyhow::{Context, Result};

use crate::storage::board_dir::ensure_board_dir;
use crate::storage::config_store::init_config;

pub fn run() -> Result<()> {
    let board_dir = ensure_board_dir().context("failed to create .board directory")?;
    init_config(&board_dir).context("failed to create config.json")?;

    let gitignore_path = board_dir.parent().unwrap().join(".gitignore");
    append_gitignore_entry(&gitignore_path, ".board/")?;

    println!(
        "Initialized empty board project in {}",
        board_dir.display()
    );
    Ok(())
}

fn append_gitignore_entry(path: &Path, entry: &str) -> Result<()> {
    let content = if path.exists() {
        let existing = std::fs::read_to_string(path).unwrap_or_default();
        if existing.lines().any(|l| l.trim() == entry) {
            return Ok(()); // already present
        }
        if !existing.ends_with('\n') {
            format!("{}\n{}\n", existing, entry)
        } else {
            format!("{}{}\n", existing, entry)
        }
    } else {
        format!("{}\n", entry)
    };
    std::fs::write(path, &content).context("failed to update .gitignore")?;
    Ok(())
}
