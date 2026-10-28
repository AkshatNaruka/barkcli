//! Bounded, secret-aware view of the repository.
//!
//! Agent prompts need orientation, not a second copy of the checkout. The repo
//! map lists tracked files (falling back to a walk for non-git directories),
//! while the sensitive-file filter is shared by the file selector and the
//! exclusion report in the Context tab.

use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use anyhow::Result;

pub const BUILTIN_IGNORED_DIRS: &[&str] = &[
    ".git",
    ".board",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "out",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    ".claude",
    ".opencode",
    ".vscode",
    "coverage",
    ".gradle",
    ".idea",
    ".build",
    ".swiftpm",
    ".dart_tool",
    "Pods",
    "desktop/target",
];

const SENSITIVE_NAMES: &[&str] = &[
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".npmrc",
    ".netrc",
    ".pgpass",
    ".DS_Store",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "credentials",
    "credentials.json",
    "secrets",
    "secrets.json",
];

const SENSITIVE_EXTENSIONS: &[&str] = &["pem", "key", "p12", "pfx", "keystore", "jks"];

#[derive(Debug, Clone)]
pub struct RepoMap {
    pub root: PathBuf,
    pub head_sha: Option<String>,
    pub files: Vec<String>,
    /// Paths deliberately kept out of the map, with the reason.
    pub excluded: Vec<(String, String)>,
    pub tracked: bool,
}

impl RepoMap {
    pub fn build(root: &Path, extra_exclusions: &[String]) -> Self {
        let head_sha = head_sha(root);
        let mut files = BTreeSet::new();
        let mut tracked = false;

        if let Ok(output) = Command::new("git")
            .args(["ls-files", "-z"])
            .current_dir(root)
            .output()
        {
            if output.status.success() {
                tracked = true;
                for raw in String::from_utf8_lossy(&output.stdout).split('\0') {
                    let path = raw.trim();
                    if !path.is_empty() {
                        files.insert(path.replace('\\', "/"));
                    }
                }
            }
        }

        if !tracked {
            collect_walk(root, root, &mut files, 0);
        }

        let files = files
            .into_iter()
            .filter(|path| is_allowed(path, extra_exclusions).is_none())
            .collect::<Vec<_>>();

        let mut excluded = Vec::new();
        // Keep the omitted set alongside the map so the Context tab can
        // explain why a file did not enter the prompt.
        if tracked {
            if let Ok(output) = Command::new("git")
                .args(["ls-files", "-z"])
                .current_dir(root)
                .output()
            {
                if output.status.success() {
                    for raw in String::from_utf8_lossy(&output.stdout).split('\0') {
                        let path = raw.trim().replace('\\', "/");
                        if path.is_empty() {
                            continue;
                        }
                        if let Some(reason) = is_allowed(&path, extra_exclusions) {
                            excluded.push((path, reason));
                        }
                    }
                }
            }
        } else {
            let mut walked = BTreeSet::new();
            collect_walk(root, root, &mut walked, 0);
            for path in walked {
                if let Some(reason) = is_allowed(&path, extra_exclusions) {
                    excluded.push((path, reason));
                }
            }
        }

        Self {
            root: root.to_path_buf(),
            head_sha,
            files,
            excluded,
            tracked,
        }
    }

    /// Compact markdown map for prompt injection. Groups paths by their first
    /// two directories and caps the rendered size.
    pub fn render(&self, max_chars: usize) -> String {
        let mut out = String::from("Repository files (tracked; secrets and build output omitted):\n");
        let mut last_group = String::new();
        for path in &self.files {
            let group = path
                .split('/')
                .take(2)
                .collect::<Vec<_>>()
                .join("/");
            if group != last_group {
                out.push_str(&format!("\n{group}/\n"));
                last_group = group;
            }
            out.push_str("  ");
            out.push_str(path);
            out.push('\n');
            if out.chars().count() >= max_chars {
                out.push_str("  … truncated\n");
                break;
            }
        }
        if self.files.is_empty() {
            out.push_str("(no tracked files)\n");
        }
        out
    }

    pub fn count(&self) -> usize {
        self.files.len()
    }
}

/// Return the reason a path must not enter context, if any.
pub fn is_allowed(path: &str, extra_exclusions: &[String]) -> Option<String> {
    let normalized = path.replace('\\', "/");
    let shallow = normalized.trim_start_matches("./");

    for component in shallow.split('/') {
        if BUILTIN_IGNORED_DIRS.contains(&component) {
            return Some(format!("ignored directory: {component}"));
        }
    }

    let name = shallow.rsplit('/').next().unwrap_or(shallow);
    if name.starts_with(".env") {
        return Some("environment file".into());
    }
    if SENSITIVE_NAMES.contains(&name) {
        return Some("secret-bearing file".into());
    }
    if let Some(ext) = name.rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase()) {
        if SENSITIVE_EXTENSIONS.contains(&ext.as_str()) {
            return Some(format!("key material (.{ext})"));
        }
    }

    for pattern in extra_exclusions {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            continue;
        }
        if wildcard_match(pattern, shallow) || wildcard_match(pattern, name) {
            return Some(format!("configured exclusion: {pattern}"));
        }
    }
    None
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    let p = pattern.replace('\\', "/").to_ascii_lowercase();
    let v = value.replace('\\', "/").to_ascii_lowercase();
    if p == v {
        return true;
    }
    if !p.contains('*') {
        return v.ends_with(&format!("/{p}"));
    }
    let parts = p.split('*').collect::<Vec<_>>();
    let mut cursor = 0usize;
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        let Some(found) = v[cursor..].find(part) else {
            return false;
        };
        if index == 0 && !p.starts_with('*') && found != 0 {
            return false;
        }
        cursor += found + part.len();
    }
    p.ends_with('*') || cursor == v.len()
}

/// Stable, project-relative path. Returns `None` for paths that escape root.
pub fn project_relative(root: &Path, path: &Path) -> Option<String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    };
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let absolute = absolute
        .canonicalize()
        .unwrap_or_else(|_| absolute.to_path_buf());
    let rel = absolute.strip_prefix(&root).ok()?;
    if rel.components().any(|c| matches!(c, Component::ParentDir)) {
        return None;
    }
    Some(rel.to_string_lossy().replace('\\', "/"))
}

pub fn head_sha(root: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(root)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if sha.is_empty() {
        None
    } else {
        Some(sha)
    }
}

fn collect_walk(root: &Path, dir: &Path, files: &mut BTreeSet<String>, depth: usize) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if BUILTIN_IGNORED_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                continue;
            }
            collect_walk(root, &path, files, depth + 1);
        } else if let Some(rel) = project_relative(root, &path) {
            files.insert(rel);
        }
    }
}

/// Read the git HEAD from a board project without failing on non-git folders.
pub fn git_toplevel(root: &Path) -> Option<PathBuf> {
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(root)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(PathBuf::from(
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
    ))
}

/// Best-effort git status summary used by the invalidation report.
pub fn changed_paths(root: &Path, max: usize) -> Result<Vec<String>> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(root)
        .output()?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let path = line.get(3..).unwrap_or("").trim();
            if path.is_empty() {
                None
            } else {
                Some(path.replace('\\', "/"))
            }
        })
        .take(max)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_files_are_always_excluded() {
        assert!(is_allowed(".env", &[]).is_some());
        assert!(is_allowed(".env.local", &[]).is_some());
        assert!(is_allowed("config/.env.production", &[]).is_some());
        assert!(is_allowed("src/env.rs", &[]).is_none());
    }

    #[test]
    fn node_modules_and_key_material_are_excluded() {
        assert!(is_allowed("web/node_modules/react/index.js", &[]).is_some());
        assert!(is_allowed("certs/server.pem", &[]).is_some());
        assert!(is_allowed("web/src/App.tsx", &[]).is_none());
    }

    #[test]
    fn configured_patterns_match_names_and_paths() {
        let exclusions = vec!["*.snap".into(), "fixtures/large".into()];
        assert!(is_allowed("web/src/__snapshots__/app.snap", &exclusions).is_some());
        assert!(is_allowed("fixtures/large", &exclusions).is_some());
    }

    #[test]
    fn project_relative_rejects_escape() {
        let root = std::env::current_dir().unwrap();
        assert!(project_relative(&root, Path::new("../outside")).is_none());
    }
}
