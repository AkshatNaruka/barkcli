use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::models::context::BoardContext;
use crate::storage::board_dir::find_board_dir;

const CONTEXT_DIR: &str = "context";

/// `.board/context/<board>.json` — code-aware context sidecar per board.
pub fn context_path(board_name: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    let dir = board_dir.join(CONTEXT_DIR);
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.json", board_name)))
}

pub fn read_context(board_name: &str) -> Result<BoardContext> {
    let path = context_path(board_name)?;
    if !path.exists() {
        return Ok(BoardContext::new());
    }
    let content = std::fs::read_to_string(&path).context("failed to read context")?;
    match serde_json::from_str::<BoardContext>(&content) {
        Ok(mut ctx) => {
            if ctx.version == 0 {
                ctx.version = 1;
            }
            Ok(ctx)
        }
        Err(_) => Ok(BoardContext::new()),
    }
}

pub fn write_context(board_name: &str, ctx: &BoardContext) -> Result<()> {
    let path = context_path(board_name)?;
    crate::util::lock::with_lock(&path, || {
        let json = serde_json::to_string_pretty(ctx).context("failed to serialize context")?;
        let tmp = path.with_extension(format!(
            "{}.tmp",
            path.extension().and_then(|e| e.to_str()).unwrap_or("json")
        ));
        std::fs::write(&tmp, json).context("failed to write tmp context")?;
        std::fs::rename(&tmp, &path).context("failed to rename context")?;
        Ok(())
    })
}

pub fn remove_context(board_name: &str) {
    let _ = std::fs::remove_file(context_path(board_name).unwrap_or_default());
}
