use anyhow::{Context, Result};
use std::path::PathBuf;

use crate::models::Board;
use crate::storage::board_dir::find_project_root;

pub fn board_path(name: &str) -> Result<PathBuf> {
    let root = find_project_root()?;
    Ok(root.join(format!("{}.board", name)))
}

pub fn board_dir() -> Result<PathBuf> {
    let root = find_project_root()?;
    Ok(root.join(".board"))
}

pub fn list_board_files() -> Result<Vec<String>> {
    let root = find_project_root()?;
    let mut boards = Vec::new();
    for entry in walkdir::WalkDir::new(&root)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("board") {
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                boards.push(name.to_string());
            }
        }
    }
    boards.sort();
    Ok(boards)
}

pub fn read_board(name: &str) -> Result<Board> {
    let path = board_path(name)?;
    let content =
        std::fs::read_to_string(&path).context(format!("failed to read {}", path.display()))?;
    let board: Board =
        serde_yaml::from_str(&content).context(format!("failed to parse {}", path.display()))?;
    Ok(board)
}

/// Read board and return (board, file_content_hash) for conflict detection.
pub fn read_board_with_hash(name: &str) -> Result<(Board, String)> {
    let path = board_path(name)?;
    let content =
        std::fs::read_to_string(&path).context(format!("failed to read {}", path.display()))?;
    let board: Board =
        serde_yaml::from_str(&content).context(format!("failed to parse {}", path.display()))?;
    let hash = format!("{:x}", md5::compute(content.as_bytes()));
    Ok((board, hash))
}

/// Atomically write a board file using temp-file-then-rename.
/// This prevents data corruption from partial writes or crashes.
/// Uses advisory file lock to coordinate concurrent access (SPEC-001).
pub fn write_board(name: &str, board: &Board) -> Result<()> {
    let path = board_path(name)?;
    crate::util::lock::with_lock(&path, || {
        let content =
            serde_yaml::to_string(board).context("failed to serialize board to YAML")?;

        let dir = path
            .parent()
            .context("board path has no parent directory")?;

        std::fs::create_dir_all(dir)
            .context(format!("failed to create directory {}", dir.display()))?;

        let temp_name = format!(
            ".boardtmp.{}.{}",
            name,
            std::process::id()
        );
        let temp_path = dir.join(&temp_name);

        std::fs::write(&temp_path, &content)
            .context(format!("failed to write temp file {}", temp_path.display()))?;

        std::fs::rename(&temp_path, &path).context(format!(
            "failed to rename {} -> {}",
            temp_path.display(),
            path.display()
        ))?;

        Ok(())
    })
}

/// Write board only if the file hasn't changed since `expected_hash`.
/// Returns Ok(true) on success, Ok(false) if conflict detected, Err on I/O failure.
pub fn write_board_if_unchanged(
    name: &str,
    board: &Board,
    expected_hash: &str,
) -> Result<bool> {
    // Re-read to check if file changed
    let (_, current_hash) = read_board_with_hash(name)?;
    if current_hash != *expected_hash {
        return Ok(false); // Conflict: file changed since we read it
    }
    write_board(name, board)?;
    Ok(true)
}

pub fn board_exists(name: &str) -> bool {
    board_path(name).is_ok_and(|p| p.exists())
}

/// Atomically read-modify-write a board under a file lock (SPEC-001).
/// The closure is executed while holding an exclusive lock, preventing lost updates.
pub fn update_board<F>(name: &str, f: F) -> Result<()>
where
    F: FnOnce(&mut Board) -> Result<()>,
{
    let path = board_path(name)?;
    crate::util::lock::with_lock(&path, || {
        // Read inside lock
        let content = std::fs::read_to_string(&path)
            .context(format!("failed to read {}", path.display()))?;
        let mut board: Board = serde_yaml::from_str(&content)
            .context(format!("failed to parse {}", path.display()))?;

        f(&mut board)?;

        let content =
            serde_yaml::to_string(&board).context("failed to serialize board to YAML")?;

        let dir = path
            .parent()
            .context("board path has no parent directory")?;
        std::fs::create_dir_all(dir)
            .context(format!("failed to create directory {}", dir.display()))?;

        let temp_name = format!(".boardtmp.{}.{}", name, std::process::id());
        let temp_path = dir.join(&temp_name);
        std::fs::write(&temp_path, &content)
            .context(format!("failed to write temp file {}", temp_path.display()))?;
        std::fs::rename(&temp_path, &path).context(format!(
            "failed to rename {} -> {}",
            temp_path.display(),
            path.display()
        ))?;

        Ok(())
    })
}
