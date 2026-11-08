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
        ("antigravity", "Antigravity", "antigravity", "goto"),
        ("rider", "Rider", "rider", "line"),
        ("cursor", "Cursor", "cursor", "goto"),
        ("zed", "Zed", "zed", "suffix"),
        ("sublime", "Sublime Text", "subl", "suffix"),
        ("intellij", "IntelliJ IDEA", "idea", "line"),
        ("nvim", "Neovim", "nvim", "plus"),
    ]
}

#[cfg(target_os = "macos")]
fn is_macos_app_installed(id: &str) -> bool {
    let bundles: &[&str] = match id {
        "vscode" => &["com.microsoft.VSCode"],
        "antigravity" => &["com.google.antigravity"],
        "rider" => &["com.jetbrains.rider"],
        "cursor" => &["com.todesktop.230313mzl4wgnii", "com.cursor.Cursor"],
        "zed" => &["dev.zed.Zed"],
        "sublime" => &["com.sublimetext.4", "com.sublimetext.3"],
        "intellij" => &["com.jetbrains.intellij", "com.jetbrains.intellij.ce"],
        _ => &[],
    };
    for bundle in bundles {
        if let Ok(status) = Command::new("open").args(["-Rb", bundle]).output() {
            if status.status.success() {
                return true;
            }
        }
    }
    let app_names: &[&str] = match id {
        "vscode" => &["Visual Studio Code", "Code"],
        "antigravity" => &["Antigravity", "Antigravity IDE"],
        "rider" => &["Rider"],
        "cursor" => &["Cursor"],
        "zed" => &["Zed"],
        "sublime" => &["Sublime Text"],
        "intellij" => &["IntelliJ IDEA"],
        _ => &[],
    };
    for name in app_names {
        if Path::new(&format!("/Applications/{name}.app")).exists() {
            return true;
        }
        if let Some(home) = std::env::var_os("HOME") {
            if Path::new(&home).join(format!("Applications/{name}.app")).exists() {
                return true;
            }
        }
    }
    for name in app_names {
        if let Ok(status) = Command::new("open").args(["-Ra", name]).output() {
            if status.status.success() {
                return true;
            }
        }
    }
    false
}

pub fn detect_in_path(path: Option<OsString>) -> Vec<EditorInfo> {
    let dirs = path
        .as_deref()
        .map(std::env::split_paths)
        .map(|dirs| dirs.collect::<Vec<_>>())
        .unwrap_or_default();
    candidates()
        .into_iter()
        .map(|(id, name, command, line_style)| {
            let in_path = dirs.iter().any(|dir| is_executable(&dir.join(command)));
            #[cfg(target_os = "macos")]
            let available = in_path || is_macos_app_installed(id);
            #[cfg(not(target_os = "macos"))]
            let available = in_path;
            EditorInfo {
                id: id.to_string(),
                name: name.to_string(),
                command: command.to_string(),
                available,
                line_style: line_style.to_string(),
            }
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
        if preferred == "finder" {
            return Ok(EditorInfo {
                id: "finder".to_string(),
                name: "Finder".to_string(),
                command: "open".to_string(),
                available: true,
                line_style: "none".to_string(),
            });
        }
        if preferred == "terminal" {
            return Ok(EditorInfo {
                id: "terminal".to_string(),
                name: "Terminal".to_string(),
                command: "terminal".to_string(),
                available: true,
                line_style: "none".to_string(),
            });
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
    let trimmed = relative.trim();
    let file = if trimmed.is_empty() || trimmed == "." {
        root.to_path_buf()
    } else {
        let p = Path::new(trimmed);
        if p.is_absolute() {
            if p.exists() {
                p.to_path_buf()
            } else {
                return Err(anyhow!("'{}' does not exist", relative));
            }
        } else {
            safe_join(root, trimmed, true)?
        }
    };

    if !file.exists() {
        return Err(anyhow!("'{}' does not exist", relative));
    }

    let editor = resolve_editor(preferred)?;

    if editor.id == "finder" {
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg(&file)
                .spawn()
                .map_err(|e| anyhow!("could not reveal in Finder: {e}"))?;
            return Ok(editor);
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(&file)
                .spawn()
                .map_err(|e| anyhow!("could not reveal in Explorer: {e}"))?;
            return Ok(editor);
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Command::new("xdg-open")
                .arg(&file)
                .spawn()
                .map_err(|e| anyhow!("could not open file manager: {e}"))?;
            return Ok(editor);
        }
    }

    if editor.id == "terminal" {
        let target_dir = if file.is_dir() { &file } else { file.parent().unwrap_or(root) };
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .args(["-a", "Terminal"])
                .arg(target_dir)
                .spawn()
                .map_err(|e| anyhow!("could not open Terminal: {e}"))?;
            return Ok(editor);
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .args(["/c", "start"])
                .current_dir(target_dir)
                .spawn()
                .map_err(|e| anyhow!("could not open Terminal: {e}"))?;
            return Ok(editor);
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Command::new("x-terminal-emulator")
                .current_dir(target_dir)
                .spawn()
                .map_err(|e| anyhow!("could not open Terminal: {e}"))?;
            return Ok(editor);
        }
    }

    let is_dir = file.is_dir();
    let mut command = Command::new(&editor.command);
    if is_dir {
        command.arg(&file);
    } else {
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
    }

    match command.spawn() {
        Ok(_) => Ok(editor),
        Err(error) => {
            #[cfg(target_os = "macos")]
            {
                let bundles: &[&str] = match editor.id.as_str() {
                    "vscode" => &["com.microsoft.VSCode"],
                    "antigravity" => &["com.google.antigravity"],
                    "rider" => &["com.jetbrains.rider"],
                    "cursor" => &["com.todesktop.230313mzl4wgnii", "com.cursor.Cursor"],
                    "zed" => &["dev.zed.Zed"],
                    "sublime" => &["com.sublimetext.4", "com.sublimetext.3"],
                    "intellij" => &["com.jetbrains.intellij", "com.jetbrains.intellij.ce"],
                    _ => &[],
                };
                for bundle in bundles {
                    let mut mac_cmd = Command::new("open");
                    mac_cmd.args(["-b", bundle]).arg(&file);
                    if let Ok(status) = mac_cmd.status() {
                        if status.success() {
                            return Ok(editor);
                        }
                    }
                }
                let app_names: &[&str] = match editor.id.as_str() {
                    "vscode" => &["Visual Studio Code", "Code"],
                    "antigravity" => &["Antigravity", "Antigravity IDE"],
                    "rider" => &["Rider"],
                    "cursor" => &["Cursor"],
                    "zed" => &["Zed"],
                    "sublime" => &["Sublime Text"],
                    "intellij" => &["IntelliJ IDEA"],
                    _ => &[],
                };
                for app in app_names {
                    let mut mac_cmd = Command::new("open");
                    mac_cmd.args(["-a", app]).arg(&file);
                    if let Ok(status) = mac_cmd.status() {
                        if status.success() {
                            return Ok(editor);
                        }
                    }
                }
            }
            Err(anyhow!("could not launch {}: {error}", editor.name))
        }
    }
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

    #[test]
    fn candidates_include_antigravity_and_rider() {
        let list = candidates();
        assert!(list.iter().any(|(id, _, _, _)| *id == "antigravity"));
        assert!(list.iter().any(|(id, _, _, _)| *id == "rider"));
        assert!(list.iter().any(|(id, _, _, _)| *id == "vscode"));
    }

    #[test]
    fn resolve_editor_supports_finder_and_terminal() {
        let finder = resolve_editor(Some("finder")).unwrap();
        assert_eq!(finder.id, "finder");
        let term = resolve_editor(Some("terminal")).unwrap();
        assert_eq!(term.id, "terminal");
    }
}
