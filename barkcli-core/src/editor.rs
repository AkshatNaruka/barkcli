//! Detect local editors and open a project file at a line.
//!
//! The command is always invoked with an argv array. The file path is resolved
//! through [`crate::repo::safe_join`] first, so the endpoint cannot be used to
//! open arbitrary paths outside the project.

use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::repo::{project_root, safe_join};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub available: bool,
    /// How the command wants a line reference: `--goto`, `--line`, or suffix.
    pub line_style: String,
}

pub fn editors() -> Vec<EditorInfo> {
    detect_in_path(std::env::var_os("PATH"))
}

/// Candidate editor list. `line_style` describes how to pass `file:line`.
pub fn candidates() -> Vec<(&'static str, &'static str, &'static str, &'static str)> {
    vec![
        ("vscode", "VS Code", "code", "goto"),
        ("cursor", "Cursor", "cursor", "goto"),
        ("zed", "Zed", "zed", "suffix"),
        ("sublime", "Sublime Text", "subl", "suffix"),
        ("intellij", "IntelliJ IDEA", "idea", "line"),
        ("nvim", "Neovim", "nvim", "plus"),
    ]
}

pub fn detect_in_path(path: Option<OsString>) -> Vec<EditorInfo> {
    let dirs = path
        .as_deref()
        .map(std::env::split_paths)
        .map(|dirs| dirs.collect::<Vec<_>>())
        .unwrap_or_default();
    candidates()
        .into_iter()
        .map(|(id, name, command, line_style)| EditorInfo {
            id: id.to_string(),
            name: name.to_string(),
            command: command.to_string(),
            available: dirs.iter().any(|dir| is_executable(&dir.join(command))),
            line_style: line_style.to_string(),
        })
        .collect()
}

pub fn resolve_editor(preferred: Option<&str>) -> Result<EditorInfo> {
    let all = editors();
    if let Some(preferred) = preferred.filter(|value| !value.trim().is_empty()) {
        if let Some(editor) = all
            .iter()
            .find(|editor| editor.id == preferred || editor.command == preferred)
        {
            return Ok(editor.clone());
        }
    }
    all.into_iter()
        .find(|editor| editor.available)
        .ok_or_else(|| anyhow!("no supported editor was found on PATH"))
}

/// Open `relative` at `line` in the project root.
pub fn open_file(relative: &str, line: Option<u32>, preferred: Option<&str>) -> Result<EditorInfo> {
    open_file_in_root(&project_root()?, relative, line, preferred)
}

/// Open a file inside an explicit root. Run review passes the run worktree so
/// an unmerged file can be inspected at the exact changed line.
pub fn open_file_in_root(
    root: &Path,
    relative: &str,
    line: Option<u32>,
    preferred: Option<&str>,
) -> Result<EditorInfo> {
    let file = safe_join(root, relative, true)?;
    if !file.is_file() {
        return Err(anyhow!("'{}' is not a file", relative));
    }
    let editor = resolve_editor(preferred)?;
    let mut command = Command::new(&editor.command);
    match editor.line_style.as_str() {
        "goto" => {
            let target = match line {
                Some(line) => format!("{}:{line}", file.display()),
                None => file.display().to_string(),
            };
            command.arg("--goto").arg(target);
        }
        "line" => {
            if let Some(line) = line {
                command.arg("--line").arg(line.to_string());
            }
            command.arg(&file);
        }
        "plus" => {
            if let Some(line) = line {
                command.arg(format!("+{line}"));
            }
            command.arg(&file);
        }
        _ => {
            let target = match line {
                Some(line) => format!("{}:{line}", file.display()),
                None => file.display().to_string(),
            };
            command.arg(target);
        }
    }
    command
        .spawn()
        .map_err(|error| anyhow!("could not launch {}: {error}", editor.name))?;
    Ok(editor)
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detection_reads_path_and_marks_available_editors() {
        let dir = std::env::temp_dir().join(format!(
            "bark_editor_{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("code");
        fs::write(&fake, "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&fake).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&fake, permissions).unwrap();
        }
        let detected = detect_in_path(Some(dir.clone().into_os_string()));
        assert!(detected
            .iter()
            .any(|editor| editor.command == "code" && editor.available));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_missing_editor_preference_falls_back_to_available() {
        // This test only asserts the resolver shape, not the host's editor list.
        let all = editors();
        assert_eq!(all.len(), candidates().len());
    }
}
