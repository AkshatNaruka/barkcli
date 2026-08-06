use anyhow::{Context, Result};

use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::list_board_files;
use crate::util::style;

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
            println!("{} {} lock file(s)", style::ok("Cleaned"), count);
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

    // Clean orphaned session logs for deleted boards
    let sessions_dir = board_dir.join("sessions");
    if sessions_dir.is_dir() {
        let boards = list_board_files()?;
        for entry in std::fs::read_dir(&sessions_dir)
            .context("failed to read sessions directory")?
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                if !boards.contains(&stem.to_string()) {
                    std::fs::remove_file(&path)
                        .context(format!("failed to remove {}", path.display()))?;
                    println!("Removed orphaned sessions: {}", path.display());
                    cleaned += 1;
                }
            }
        }
    }

    // Clean orphaned auto-checkpoints for deleted boards
    let auto_dir = board_dir.join("snapshots").join("auto");
    if auto_dir.is_dir() {
        let boards = list_board_files()?;
        let mut to_remove: Vec<std::path::PathBuf> = Vec::new();
        for entry in std::fs::read_dir(&auto_dir)
            .context("failed to read auto-checkpoint directory")?
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            let keep = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|e| e == "yaml")
                .unwrap_or(false);
            // Auto-checkpoints are named <board>-<sha>.yaml; drop files whose
            // board no longer exists.
            if keep {
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                let Some(stem) = name.strip_suffix(".yaml") else { continue };
                if let Some((board, _sha)) = stem.rsplit_once('-') {
                    if !boards.contains(&board.to_string()) {
                        to_remove.push(path);
                    }
                }
            }
        }
        for path in to_remove {
            std::fs::remove_file(&path)
                .context(format!("failed to remove {}", path.display()))?;
            println!("Removed orphaned checkpoint: {}", path.display());
            cleaned += 1;
        }
    }

    if cleaned == 0 {
        println!("{}", style::muted("Nothing to clean."));
    } else {
        println!("{} {} item(s).", style::ok("Cleaned"), cleaned);
    }
    Ok(())
}
