use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

pub const BOARD_DIR_NAME: &str = ".board";

pub fn find_board_dir_opt() -> Result<Option<PathBuf>> {
    let cwd = std::env::current_dir().context("failed to get current directory")?;
    let mut current: Option<&Path> = Some(cwd.as_path());
    while let Some(dir) = current {
        let candidate = dir.join(BOARD_DIR_NAME);
        if candidate.is_dir() {
            return Ok(Some(candidate));
        }
        current = dir.parent();
    }
    Ok(None)
}

pub fn find_board_dir() -> Result<PathBuf> {
    find_board_dir_opt()?.context("fatal: not a board project (run `board init`)")
}

pub fn ensure_board_dir() -> Result<PathBuf> {
    match find_board_dir_opt()? {
        Some(path) => Ok(path),
        None => {
            let path = std::env::current_dir().context("failed to get current directory")?.join(BOARD_DIR_NAME);
            std::fs::create_dir_all(&path).context("failed to create .board directory")?;
            std::fs::create_dir_all(path.join("boards")).ok();
            std::fs::create_dir_all(path.join("metadata")).ok();
            std::fs::create_dir_all(path.join("history")).ok();
            std::fs::create_dir_all(path.join("locks")).ok();
            Ok(path)
        }
    }
}

pub fn find_project_root() -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    board_dir
        .parent()
        .map(|p| p.to_path_buf())
        .context("fatal: .board is at filesystem root")
}
