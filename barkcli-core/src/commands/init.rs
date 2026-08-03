use std::path::Path;

use anyhow::{Context, Result};

use crate::models::Board;
use crate::storage::board_dir::ensure_board_dir;
use crate::storage::config_store::{init_config, read_config, write_config};
use crate::storage::board_file::write_board;

const DEFAULT_BOARD: &str = "tasks";

pub fn run() -> Result<()> {
    let board_dir = ensure_board_dir().context("failed to create .board directory")?;
    init_config(&board_dir).context("failed to create config.json")?;

    let project_root = board_dir.parent().unwrap();

    // Auto-create the default board
    let default_name = DEFAULT_BOARD;
    if !project_root.join(format!("{}.board", default_name)).exists() {
        let board = Board::new(default_name);
        write_board(default_name, &board)
            .context("failed to create default board")?;

        let mut config = read_config(&board_dir).unwrap_or_default();
        config.default_board = Some(default_name.to_string());
        write_config(&board_dir, &config)?;

        println!("Created default board '{}.board'", default_name);
    }

    let gitignore_path = project_root.join(".gitignore");
    append_gitignore_entry(&gitignore_path, ".board/")?;

    install_git_hooks(project_root)?;

    println!("Initialized board project in {}", board_dir.display());
    println!("Ready. Try:");
    println!("  board add \"Fix auth bug\" -p high");
    println!("  board list");
    println!("  board move <id> doing");
    Ok(())
}

fn install_git_hooks(root: &Path) -> Result<()> {
    let hooks_dir = root.join(".git").join("hooks");
    if !hooks_dir.exists() {
        return Ok(());
    }

    let pre_commit = hooks_dir.join("pre-commit");
    if !pre_commit.exists() {
        let content = "#!/bin/sh\nboard validate || exit 1\n";
        std::fs::write(&pre_commit, content).context("pre-commit hook")?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&pre_commit)?.permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&pre_commit, p).ok();
        }
        println!("  Installed .git/hooks/pre-commit");
    }

    let commit_msg = hooks_dir.join("commit-msg");
    if !commit_msg.exists() {
        let content = "#!/bin/sh\n# board commit-msg hook template\n";
        std::fs::write(&commit_msg, content).context("commit-msg hook")?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&commit_msg)?.permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&commit_msg, p).ok();
        }
        println!("  Installed .git/hooks/commit-msg");
    }

    Ok(())
}

fn append_gitignore_entry(path: &Path, entry: &str) -> Result<()> {
    let content = if path.exists() {
        let existing = std::fs::read_to_string(path).unwrap_or_default();
        if existing.lines().any(|l| l.trim() == entry) { return Ok(()); }
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
