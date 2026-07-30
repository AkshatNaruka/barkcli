use anyhow::{Context, Result};

use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::list_board_files;

pub fn run() -> Result<()> {
    let board_dir = find_board_dir()?;
    let mut cleaned = 0;

    // Clean locks
    let locks_dir = board_dir.join("locks");
    if locks_dir.is_dir() {
        let count = std::fs::read_dir(&locks_dir)
            .map(|e| e.count())
            .unwrap_or(0);
        if count > 0 {
            std::fs::remove_dir_all(&locks_dir)
                .context("failed to remove locks directory")?;
            std::fs::create_dir_all(&locks_dir).ok();
            println!("Cleaned {} lock file(s)", count);
            cleaned += count;
        }
    }

    // Clean orphaned history entries for deleted boards
    let history_dir = board_dir.join("history");
    if history_dir.is_dir() {
        let boards = list_board_files()?;
        for entry in std::fs::read_dir(&history_dir)
            .context("failed to read history directory")?
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                if !boards.contains(&stem.to_string()) {
                    std::fs::remove_file(&path)
                        .context(format!("failed to remove {}", path.display()))?;
                    println!("Removed orphaned history: {}", path.display());
                    cleaned += 1;
                }
            }
        }
    }

    if cleaned == 0 {
        println!("Nothing to clean.");
    } else {
        println!("Cleaned {} item(s).", cleaned);
    }
    Ok(())
}
