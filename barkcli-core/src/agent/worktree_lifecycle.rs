//! Worktree Lifecycle v2: persisted status, setup tracking, health, checkpoint.
//!
//! The lifecycle map (`.board/worktrees/status.json`) is the source of truth
//! for what state each managed worktree is in; `git worktree list` is the
//! ground truth for what exists on disk. Setup tracking records which
//! install/build command a worktree needs so agents don't guess.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::agent::worktree::{is_managed_worktree, list_worktrees};
use crate::storage::board_dir::find_board_dir;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeStatus {
    #[default]
    Provisioning,
    Ready,
    InUse,
    GatePassed,
    Merged,
    Failed,
    Stale,
    Removed,
    Checkpointed,
}

impl std::fmt::Display for WorktreeStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            WorktreeStatus::Provisioning => "provisioning",
            WorktreeStatus::Ready => "ready",
            WorktreeStatus::InUse => "in_use",
            WorktreeStatus::GatePassed => "gate_passed",
            WorktreeStatus::Merged => "merged",
            WorktreeStatus::Failed => "failed",
            WorktreeStatus::Stale => "stale",
            WorktreeStatus::Removed => "removed",
            WorktreeStatus::Checkpointed => "checkpointed",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub slug: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    #[serde(default)]
    pub status: WorktreeStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_id: Option<String>,
    /// Detected setup command (cargo build, npm install, ...) + outcome.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub setup_cmd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub setup_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub setup_duration_ms: Option<u64>,
    /// Checkpoint ref (`refs/bark/checkpoints/<slug>/<label>`) if saved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checkpoint_ref: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl WorktreeInfo {
    pub fn new(slug: impl Into<String>, path: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            slug: slug.into(),
            path: path.into(),
            branch: None,
            head_sha: None,
            status: WorktreeStatus::Provisioning,
            run_id: None,
            card_id: None,
            setup_cmd: None,
            setup_status: None,
            setup_duration_ms: None,
            checkpoint_ref: None,
            created_at: now,
            updated_at: now,
        }
    }
    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }
}

pub fn status_path() -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    Ok(board_dir.join("worktrees").join("status.json"))
}

pub fn load_status() -> HashMap<String, WorktreeInfo> {
    status_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_status(map: &HashMap<String, WorktreeInfo>) -> Result<()> {
    let path = status_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(map)?;
    crate::util::lock::with_lock(&path, || {
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    })
}

pub fn record_acquire(slug: &str, path: &Path, branch: Option<String>, run_id: Option<String>, card_id: Option<String>) -> Result<()> {
    let mut map = load_status();
    let mut info = WorktreeInfo::new(slug, path.to_string_lossy());
    info.branch = branch;
    info.run_id = run_id;
    info.card_id = card_id;
    info.status = WorktreeStatus::InUse;
    map.insert(slug.to_string(), info);
    save_status(&map)
}

pub fn record_status(slug: &str, status: WorktreeStatus) -> Result<()> {
    let mut map = load_status();
    if let Some(info) = map.get_mut(slug) {
        info.status = status;
        info.touch();
        save_status(&map)?;
    }
    Ok(())
}

/// Detect setup command for a worktree path.
pub fn detect_setup(path: &Path) -> Option<String> {
    if path.join("Cargo.toml").exists() {
        Some("cargo build --quiet".into())
    } else if path.join("package.json").exists() {
        Some("npm install --silent".into())
    } else if path.join("pyproject.toml").exists() {
        Some("pip install -e . --quiet".into())
    } else if path.join("go.mod").exists() {
        Some("go mod download".into())
    } else {
        None
    }
}

/// Record setup tracking for a slug.
pub fn record_setup(slug: &str, path: &Path) -> Result<Option<WorktreeInfo>> {
    let cmd = detect_setup(path);
    let mut map = load_status();
    let info = map.get_mut(slug);
    match info {
        Some(info) => {
            info.setup_cmd = cmd;
            if info.setup_cmd.is_some() {
                info.setup_status = Some("pending".into());
            }
            info.touch();
            let cloned = info.clone();
            save_status(&map)?;
            Ok(Some(cloned))
        }
        None => Ok(None),
    }
}

/// Snapshot all live worktrees with health. Reconciles disk vs persisted map.
pub fn list_with_health() -> Result<Vec<WorktreeInfo>> {
    let persisted = load_status();
    let live = list_worktrees().unwrap_or_default();
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (path, branch, commit) in live {
        if !is_managed_worktree(&path) {
            continue;
        }
        let slug = PathBuf::from(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        seen.insert(slug.clone());
        if let Some(info) = persisted.get(&slug) {
            let mut info = info.clone();
            if info.branch.is_none() {
                info.branch = Some(branch);
            }
            if info.head_sha.is_none() {
                info.head_sha = Some(commit);
            }
            out.push(info);
        } else {
            let mut info = WorktreeInfo::new(slug, path.clone());
            info.branch = Some(branch);
            info.head_sha = Some(commit);
            out.push(info);
        }
    }
    // Include persisted-but-missing as stale/removed for audit.
    for (slug, info) in persisted {
        if !seen.contains(&slug) {
            let mut info = info;
            if !matches!(info.status, WorktreeStatus::Removed | WorktreeStatus::Merged) {
                info.status = WorktreeStatus::Stale;
            }
            out.push(info);
        }
    }
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(out)
}

/// Save a hidden git ref checkpoint for a worktree.
pub fn checkpoint(slug: &str, label: &str) -> Result<String> {
    let map = load_status();
    let info = map.get(slug).ok_or_else(|| anyhow::anyhow!("worktree '{}' not tracked", slug))?;
    let path = PathBuf::from(&info.path);
    if !path.exists() {
        anyhow::bail!("worktree path missing: {}", info.path);
    }
    let clean_label = crate::util::slug::to_slug(label);
    let clean_label = if clean_label.is_empty() { "auto".to_string() } else { clean_label };
    let r#ref = format!("refs/bark/checkpoints/{}/{}", slug, clean_label);
    git_out(&path, &["update-ref", &r#ref, "HEAD"])?;
    let mut map = load_status();
    if let Some(info) = map.get_mut(slug) {
        info.checkpoint_ref = Some(r#ref.clone());
        info.status = WorktreeStatus::Checkpointed;
        info.touch();
        save_status(&map)?;
    }
    Ok(r#ref)
}

fn git_out(root: &Path, args: &[&str]) -> Result<String> {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .context("git failed")?;
    if !out.status.success() {
        anyhow::bail!("git {} failed: {}", args.join(" "), String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub fn root_for_slug(slug: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    Ok(board_dir.join("worktrees").join(slug))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_setup_cargo() {
        let dir = std::env::temp_dir().join(format!("bark-setup-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cargo.toml"), "[package]").unwrap();
        let cmd = detect_setup(&dir);
        assert_eq!(cmd.as_deref(), Some("cargo build --quiet"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn status_roundtrip() {
        let mut info = WorktreeInfo::new("test-slug", "/tmp/path");
        info.status = WorktreeStatus::Ready;
        let json = serde_json::to_string(&info).unwrap();
        let back: WorktreeInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.status, WorktreeStatus::Ready);
    }
}
