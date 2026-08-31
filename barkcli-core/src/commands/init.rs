use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};

use crate::models::Board;
use crate::storage::board_dir::ensure_board_dir;
use crate::storage::config_store::{init_config, read_config, write_config};
use crate::storage::board_file::write_board;
use crate::util::style;

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

        println!("{} default board '{}.board'", style::ok("Created"), default_name);
    }

    let gitignore_path = project_root.join(".gitignore");
    append_gitignore_entry(&gitignore_path, ".board/")?;

    install_git_hooks(project_root)?;

    println!("{} board project in {}", style::ok("Initialized"), board_dir.display());
    println!("{} Try:", style::accent("Ready."));
    println!("  barkcli add \"Fix auth bug\" -p high");
    println!("  barkcli list");
    println!("  barkcli move <id> doing");

    // Hint about VS Code extension
    hint_vscode_extension();

    Ok(())
}

fn install_git_hooks(root: &Path) -> Result<()> {
    let hooks_dir = root.join(".git").join("hooks");
    if !hooks_dir.exists() {
        return Ok(());
    }

    let pre_commit = hooks_dir.join("pre-commit");
    if !pre_commit.exists() {
        let content = "#!/bin/sh\nbarkcli validate || exit 1\n";
        std::fs::write(&pre_commit, content).context("pre-commit hook")?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&pre_commit)?.permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&pre_commit, p).ok();
        }
        println!("  {} .git/hooks/pre-commit", style::ok("Installed"));
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
        println!("  {} .git/hooks/commit-msg", style::ok("Installed"));
    }

    // Auto-checkpoint: after every commit, save a checkpoint for any board
    // file that changed (commit-linked checkpoints).
    let post_commit = hooks_dir.join("post-commit");
    if !post_commit.exists() {
        let content = "#!/bin/sh\nbarkcli checkpoint save --auto >/dev/null 2>&1 || exit 0\n";
        std::fs::write(&post_commit, content).context("post-commit hook")?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&post_commit)?.permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&post_commit, p).ok();
        }
        println!("  {} .git/hooks/post-commit (auto-checkpoints)", style::ok("Installed"));
    }

    Ok(())
}

fn hint_vscode_extension() {
    // Check if VS Code CLI is available
    let vscode_cmd = if Command::new("code").arg("--version").output().is_ok() {
        "code"
    } else if Command::new("code-insiders").arg("--version").output().is_ok() {
        "code-insiders"
    } else {
        return; // No VS Code CLI found, skip hint
    };

    // Check if extension is already installed
    let extension_id = "barkcli.barkcli-vscode";
    let installed = Command::new(vscode_cmd)
        .args(["--list-extensions"])
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.lines().any(|l| l.eq_ignore_ascii_case(extension_id))
        })
        .unwrap_or(false);

    if !installed {
        println!();
        println!(
            "{} VS Code extension not detected.",
            style::warn("Note:")
        );
        println!(
            "  Run {} to install the kanban editor for .board files:",
            style::accent("barkcli vscode-install")
        );
    }
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
