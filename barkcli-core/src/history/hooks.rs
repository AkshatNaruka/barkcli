//! Git hook installation for Smart History Bundles.
//!
//! Installs hooks that are safe and non-destructive:
//! - NEVER overwrites existing hooks (chains safely)
//! - Only reads git state, never modifies it
//! - Uninstall removes only our appended lines

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

const HOOKS: &[(&str, &str)] = &[
    ("post-commit", "barkcli history scan"),
    ("post-merge", "barkcli history scan"),
    ("post-rewrite", "barkcli history scan"),
    ("prepare-commit-msg", "barkcli history prepare-msg"),
];

const BARK_MARKER: &str = "# >>> barkcli history >>>";
const BARK_END: &str = "# <<< barkcli history <<<";

/// Get the git hooks directory for the repo.
fn hooks_dir(root: &Path) -> Result<PathBuf> {
    let output = std::process::Command::new("git")
        .arg("-C")
            .arg(root.to_str().unwrap_or("."))
            .args(["rev-parse", "--git-path", "hooks"])
        .output()?;
    if !output.status.success() {
        anyhow::bail!("not a git repository");
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(PathBuf::from(path))
}

/// Install barkcli history hooks. Never overwrites existing hooks.
/// If a hook already exists, our commands are appended safely.
pub fn install_hooks(root: &Path) -> Result<Vec<String>> {
    let hooks_dir = hooks_dir(root)?;
    std::fs::create_dir_all(&hooks_dir)?;

    let mut installed = Vec::new();

    for (hook_name, command) in HOOKS {
        let hook_path = hooks_dir.join(hook_name);
        let existing = std::fs::read_to_string(&hook_path).unwrap_or_default();

        if existing.contains(BARK_MARKER) {
            // Already installed — skip
            installed.push(format!("{} (already installed)", hook_name));
            continue;
        }

        // Build the hook content
        let mut content = existing.clone();

        // Ensure shebang exists for new hooks
        if content.is_empty() {
            content.push_str("#!/bin/sh\n");
        }

        // Add our marker + command
        content.push('\n');
        content.push_str(BARK_MARKER);
        content.push('\n');
        content.push_str(command);
        content.push('\n');
        content.push_str(BARK_END);
        content.push('\n');

        std::fs::write(&hook_path, content)
            .with_context(|| format!("failed to write hook: {}", hook_name))?;

        // Make executable (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&hook_path)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&hook_path, perms)?;
        }

        installed.push(hook_name.to_string());
    }

    Ok(installed)
}

/// Uninstall barkcli history hooks. Removes only our appended lines.
pub fn uninstall_hooks(root: &Path) -> Result<Vec<String>> {
    let hooks_dir = hooks_dir(root)?;
    let mut uninstalled = Vec::new();

    for (hook_name, _) in HOOKS {
        let hook_path = hooks_dir.join(hook_name);
        if !hook_path.exists() {
            continue;
        }

        let content = std::fs::read_to_string(&hook_path)?;
        if !content.contains(BARK_MARKER) {
            continue;
        }

        // Remove our section
        let mut new_content = String::new();
        let mut in_bark_section = false;
        for line in content.lines() {
            if line.trim() == BARK_MARKER {
                in_bark_section = true;
                continue;
            }
            if line.trim() == BARK_END {
                in_bark_section = false;
                continue;
            }
            if !in_bark_section {
                new_content.push_str(line);
                new_content.push('\n');
            }
        }

        if new_content.trim().is_empty() {
            std::fs::remove_file(&hook_path)?;
        } else {
            std::fs::write(&hook_path, new_content)?;
        }

        uninstalled.push(hook_name.to_string());
    }

    Ok(uninstalled)
}

/// Generate the prepare-commit-msg hook content.
/// This appends Bark-Card / Bark-Bundle trailers when a card or open bundle is known.
pub fn generate_prepare_msg_hook() -> String {
    r#"#!/bin/sh
# Barkcli: append Bark-Card / Bark-Bundle trailers when known.
# Reads from env vars or .board/ state. Never blocks the commit.

CARD="${BARKCLI_CARD_ID:-}"
BUNDLE="${BARKCLI_BUNDLE_ID:-}"

if [ -n "$CARD" ] || [ -n "$BUNDLE" ]; then
    echo "" >> "$1"
    [ -n "$CARD" ] && echo "Bark-Card: $CARD" >> "$1"
    [ -n "$BUNDLE" ] && echo "Bark-Bundle: $BUNDLE" >> "$1"
fi
"#
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_marker_format() {
        assert_eq!(BARK_MARKER, "# >>> barkcli history >>>");
        assert_eq!(BARK_END, "# <<< barkcli history <<<");
    }

    #[test]
    fn prepare_msg_hook_content() {
        let hook = generate_prepare_msg_hook();
        assert!(hook.contains("Bark-Card"));
        assert!(hook.contains("Bark-Bundle"));
        assert!(hook.contains("BARKCLI_CARD_ID"));
    }

    #[test]
    fn hooks_list() {
        assert_eq!(HOOKS.len(), 4);
        assert_eq!(HOOKS[0].0, "post-commit");
        assert_eq!(HOOKS[1].0, "post-merge");
        assert_eq!(HOOKS[2].0, "post-rewrite");
        assert_eq!(HOOKS[3].0, "prepare-commit-msg");
    }
}
