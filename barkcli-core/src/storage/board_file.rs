use anyhow::{Context, Result};

use crate::models::Board;
use crate::storage::board_dir::find_project_root;

pub fn board_path(name: &str) -> Result<std::path::PathBuf> {
    let root = find_project_root()?;
    Ok(root.join(format!("{}.board", name)))
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

pub fn write_board(name: &str, board: &Board) -> Result<()> {
    let path = board_path(name)?;
    let content =
        serde_yaml::to_string(board).context("failed to serialize board to YAML")?;
    std::fs::write(&path, &content).context(format!("failed to write {}", path.display()))?;
    Ok(())
}

pub fn board_exists(name: &str) -> bool {
    board_path(name).is_ok_and(|p| p.exists())
}
