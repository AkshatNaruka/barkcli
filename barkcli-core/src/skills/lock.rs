//! `skills.lock` — pinned record of every externally-installed skill.
//!
//! Lives at the repo root (committed) so installs are reproducible: the lock
//! records where each skill came from, at which revision, and its content
//! hash. `barkcli skills install` upserts entries; `barkcli skills lock`
//! prints them.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockEntry {
    pub id: String,
    /// Resolved repo source (https URL, git@, or local path).
    pub source: String,
    /// Pinned revision — full commit sha (or "local" for a dir without git).
    pub rev: String,
    /// Path inside the source repo the skill file came from.
    pub origin_path: String,
    /// sha256 of the installed file bytes (hex), for drift detection.
    pub sha256: String,
    #[serde(rename = "installed_at")]
    pub installed_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LockFile {
    pub skills: Vec<LockEntry>,
}

/// Repo root — the lockfile is committed alongside the code (not inside
/// the gitignored `.board`).
pub fn lock_path() -> Result<PathBuf> {
    let root = crate::storage::board_dir::find_board_dir()?
        .parent()
        .context("fatal: .board is at filesystem root")?
        .to_path_buf();
    Ok(root.join("skills.lock"))
}

pub fn load() -> Result<LockFile> {
    let path = lock_path()?;
    if !path.exists() {
        return Ok(LockFile::default());
    }
    let json = std::fs::read_to_string(&path).context("Failed to read skills.lock")?;
    Ok(serde_json::from_str(&json).unwrap_or_default())
}

pub fn save(lock: &LockFile) -> Result<()> {
    let path = lock_path()?;
    let json = serde_json::to_string_pretty(lock)?;
    std::fs::write(&path, json).context("Failed to write skills.lock")?;
    Ok(())
}

impl LockFile {
    pub fn upsert(&mut self, entry: LockEntry) {
        match self.skills.iter_mut().find(|e| e.id == entry.id) {
            Some(existing) => *existing = entry,
            None => self.skills.push(entry),
        }
    }

    pub fn get(&self, id: &str) -> Option<&LockEntry> {
        self.skills.iter().find(|e| e.id == id)
    }
}

/// sha256 of a file's bytes, hex-encoded.
pub fn file_sha256(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_replaces_by_id() {
        let mut lock = LockFile::default();
        lock.upsert(LockEntry {
            id: "oauth".into(),
            source: "https://github.com/a/b.git".into(),
            rev: "rev1".into(),
            origin_path: "skills/oauth.md".into(),
            sha256: "aaa".into(),
            installed_at: now_iso(),
        });
        lock.upsert(LockEntry {
            id: "oauth".into(),
            source: "https://github.com/a/b.git".into(),
            rev: "rev2".into(),
            origin_path: "skills/oauth.md".into(),
            sha256: "bbb".into(),
            installed_at: now_iso(),
        });
        assert_eq!(lock.skills.len(), 1);
        assert_eq!(lock.skills[0].rev, "rev2");
        assert!(lock.get("oauth").is_some());
        assert!(lock.get("nope").is_none());
    }

    #[test]
    fn sha256_is_stable() {
        let dir = std::env::temp_dir().join(format!("bark_sha_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("x.txt");
        std::fs::write(&p, b"barkcli").unwrap();
        let a = file_sha256(&p).unwrap();
        let b = file_sha256(&p).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
    }
}
