use std::fs;

use anyhow::{Context, Result};
use comfy_table::Cell;

use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::{board_exists, read_board, write_board};
use crate::util::{display, style};

const SNAPSHOTS_DIR: &str = "snapshots";
const AUTO_DIR: &str = "auto";

/// `barkcli checkpoint save [label]` — manual checkpoint (alias of `snapshot`).
pub fn run_save(board: Option<&str>, label: &str) -> Result<()> {
    let name = crate::commands::boards::resolve_board(board)?;
    save_to(&name, label)
}

/// `barkcli checkpoint save --auto` — called by the post-commit git hook.
/// Saves one auto checkpoint per board file touched by the latest commit,
/// keyed by the commit SHA. Silent when nothing board-related changed.
pub fn run_auto() -> Result<()> {
    let Some(sha) = current_commit_sha() else {
        return Ok(());
    };
    let changed_boards = changed_board_files();

    if changed_boards.is_empty() {
        return Ok(());
    }

    let mut saved = 0;
    // 12-hex short SHA keeps filenames compact.
    let short = sha.chars().take(12).collect::<String>();
    for board in changed_boards {
        // Filename embeds the board so `barkcli clean` can detect orphans:
        // <board>-<sha>.yaml
        save_to(&board, &format!("auto/{}-{}", board, short))?;
        saved += 1;
    }
    println!("Auto checkpoint for {} board(s) at commit {}", saved, style::muted(&short));
    Ok(())
}

/// `barkcli checkpoint list` — table of manual + auto checkpoints.
pub fn run_list(board: Option<&str>) -> Result<()> {
    let name = crate::commands::boards::resolve_board(board)?;
    let board_dir = find_board_dir()?;
    let snap_dir = board_dir.join(SNAPSHOTS_DIR);

    let mut rows: Vec<(String, String, String)> = Vec::new(); // (kind, id, at)

    if snap_dir.is_dir() {
        for entry in fs::read_dir(&snap_dir).context("failed to read snapshots")?.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("yaml") {
                continue;
            }
            let kind = if path.file_name().and_then(|s| s.to_str()).unwrap_or("") == AUTO_DIR {
                continue;
            } else {
                "manual"
            };
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                let at = modified_str(&path);
                rows.push((kind.to_string(), stem.to_string(), at));
            }
        }

        let auto_dir = snap_dir.join(AUTO_DIR);
        if auto_dir.is_dir() {
            for entry in fs::read_dir(&auto_dir).context("failed to read auto snapshots")?.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("yaml") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        rows.push(("auto".into(), stem.into(), modified_str(&path)));
                    }
                }
            }
        }
    }

    if rows.is_empty() {
        println!("{}", style::muted(format!("No checkpoints for '{}'", name)));
        return Ok(());
    }

    rows.sort_by(|a, b| a.2.cmp(&b.2));

    let mut t = display::table();
    t.set_header(display::header(vec!["Kind", "Checkpoint", "Saved"]));
    for (kind, id, at) in rows {
        let kind_styled = match kind.as_str() {
            "auto" => style::accent(&kind),
            _ => style::muted(&kind),
        };
        t.add_row(vec![
            Cell::new(kind_styled),
            Cell::new(style::strong(&id)),
            Cell::new(style::muted(&at)),
        ]);
    }
    println!("{t}");
    println!("{}", style::muted("Use `barkcli checkpoint show <id>` / `barkcli checkpoint restore <id>`"));
    Ok(())
}

/// `barkcli checkpoint show <id>` — print the checkpoint YAML.
pub fn run_show(board: Option<&str>, id: &str) -> Result<()> {
    let name = crate::commands::boards::resolve_board(board)?;
    let yaml = fs::read_to_string(checkpoint_path(&name, id)?).context("read checkpoint")?;
    print!("{}", yaml);
    Ok(())
}

/// `barkcli checkpoint restore <id>` — restore a checkpoint, undo-safe.
pub fn run_restore(board: Option<&str>, id: &str) -> Result<()> {
    let name = crate::commands::boards::resolve_board(board)?;
    let path = checkpoint_path(&name, id)?;
    let yaml = fs::read_to_string(&path).context("read checkpoint")?;

    crate::commands::undo::save_undo_state(&name, "checkpoint-restore", None)?;

    let board: crate::models::Board = serde_yaml::from_str(&yaml).context("parse checkpoint")?;
    write_board(&name, &board)?;

    println!("Restored board '{}' from checkpoint '{}'", style::ok(&name), style::accent(id));
    Ok(())
}

// ─── Helpers ─────────────────────────────────────

fn save_to(board: &str, label: &str) -> Result<()> {
    let board_dir = find_board_dir()?;
    let snap_dir = board_dir.join(SNAPSHOTS_DIR);

    // "auto/<label>" routes into snapshots/auto/ — commit-keyed checkpoints.
    let (clean_label, dir) = if let Some(sha) = label.strip_prefix("auto/") {
        (sha.to_string(), snap_dir.join(AUTO_DIR))
    } else {
        (label.to_string(), snap_dir)
    };
    fs::create_dir_all(&dir).ok();
    let clean = clean_label.replace(['/', '\\', ':'], "-");

    let parsed = read_board(board)?;
    let yaml = serde_yaml::to_string(&parsed).context("serialize checkpoint")?;

    let path = dir.join(format!("{}.yaml", clean));
    fs::write(&path, &yaml).context("write checkpoint")?;

    crate::storage::history::append(
        board,
        &crate::storage::history::HistoryEntry {
            op: "checkpoint".into(),
            board: board.to_string(),
            card: clean.clone(),
            old_value: None,
            new_value: Some(label.into()),
            field: None,
            at: chrono::Utc::now().to_rfc3339(),
        },
    )?;

    println!("Checkpoint '{}' saved for board '{}'", label, board);
    Ok(())
}

fn checkpoint_path(board: &str, id: &str) -> Result<std::path::PathBuf> {
    let board_dir = find_board_dir()?;
    let snap_dir = board_dir.join(SNAPSHOTS_DIR);
    let clean = id.replace(['/', '\\', ':'], "-");

    for candidate in [snap_dir.join(format!("{}.yaml", clean)), snap_dir.join(AUTO_DIR).join(format!("{}.yaml", clean))] {
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    anyhow::bail!("checkpoint '{}' not found for board '{}'", id, board)
}

fn current_commit_sha() -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Boards (`*.board` files) touched by the latest commit.
fn changed_board_files() -> Vec<String> {
    let Ok(out) = std::process::Command::new("git")
        .args(["diff-tree", "-r", "--root", "--name-only", "HEAD"])
        .output()
    else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|f| f.ends_with(".board"))
        .filter_map(|f| {
            let name = f.strip_suffix(".board")?.to_string();
            // File could live in a subdir; use its stem for the board name.
            let name = name.rsplit('/').next()?.to_string();
            board_exists(&name).then_some(name)
        })
        .collect()
}

fn modified_str(path: &std::path::Path) -> String {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.format("%Y-%m-%d %H:%M").to_string()
        })
        .unwrap_or_else(|| "-".into())
}
