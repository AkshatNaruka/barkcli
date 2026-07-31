use std::path::Path;

use anyhow::{Context, Result};

use crate::storage::board_dir::ensure_board_dir;
use crate::storage::config_store::init_config;

pub fn run() -> Result<()> {
    let board_dir = ensure_board_dir().context("failed to create .board directory")?;
    init_config(&board_dir).context("failed to create config.json")?;

    let project_root = board_dir.parent().unwrap();
    let gitignore_path = project_root.join(".gitignore");
    append_gitignore_entry(&gitignore_path, ".board/")?;

    install_git_hooks(project_root)?;

    println!("Initialized empty board project in {}", board_dir.display());
    Ok(())
}

fn install_git_hooks(root: &Path) -> Result<()> {
    let hooks_dir = root.join(".git").join("hooks");
    if !hooks_dir.exists() {
        return Ok(());
    }

    let pre_commit = hooks_dir.join("pre-commit");
    if !pre_commit.exists() {
        let content = "#!/bin/sh\n# board: validate all .board files before commit\nboard validate || exit 1\n";
        std::fs::write(&pre_commit, content)
            .context("failed to write pre-commit hook")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&pre_commit)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&pre_commit, perms).ok();
        }
        println!("  ✓ Installed .git/hooks/pre-commit (board validate)");
    }

    let commit_msg = hooks_dir.join("commit-msg");
    if !commit_msg.exists() {
        let content = "#!/bin/sh\n# board: prepend card ID to commit message\n# Usage: git commit -m \"Fix login\"  →  board will suggest card ID prefix\n# Uncomment below to auto-prepend:\n# CARD_ID=$(board hook-card-id 2>/dev/null | head -1)\n# if [ -n \"$CARD_ID\" ]; then\n#   echo \"[$CARD_ID] $(cat \"$1\")\" > \"$1\"\n# fi\n";
        std::fs::write(&commit_msg, content)
            .context("failed to write commit-msg hook")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&commit_msg)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&commit_msg, perms).ok();
        }
        println!("  ✓ Installed .git/hooks/commit-msg (template)");
    }

    Ok(())
}

fn append_gitignore_entry(path: &Path, entry: &str) -> Result<()> {
    let content = if path.exists() {
        let existing = std::fs::read_to_string(path).unwrap_or_default();
        if existing.lines().any(|l| l.trim() == entry) {
            return Ok(());
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
