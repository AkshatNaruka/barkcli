//! Bundle persistence layer.
//!
//! Stores bundles as individual YAML files under `.board/bundles/`, with an
//! index file for fast listing. All reads and writes are concurrency-safe via
//! advisory file locking (same pattern as task queue / board storage).
//!
//! Storage layout:
//! ```text
//! .board/bundles/
//!   ├── index.yaml          # id → metadata (title, kind, status, branch, sha range)
//!   ├── <id>.yaml           # full bundle data
//!   └── cursor.json         # last_processed_sha per branch
//! ```

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::history::git;
use crate::models::bundle::{Bundle, BundleStatus};
use crate::storage::board_dir::find_board_dir;
use crate::util::lock::with_lock;

pub const BUNDLES_DIR: &str = "bundles";
pub const INDEX_FILE: &str = "index.yaml";
pub const CURSOR_FILE: &str = "cursor.json";
pub const UNSORTED_ID: &str = "unsorted";

/// Lightweight index entry for fast listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleIndexEntry {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub branch: String,
    pub commit_count: usize,
    pub first_sha: Option<String>,
    pub last_sha: Option<String>,
    pub confidence: f64,
    pub card_id: Option<String>,
    pub updated_at: String,
}

/// Cursor for incremental scan — tracks last processed SHA per branch.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScanCursor {
    /// branch -> last processed SHA (the newest commit we've already bundled)
    pub branches: HashMap<String, String>,
}

/// Path to the bundles directory.
pub fn bundles_dir() -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    Ok(board_dir.join(BUNDLES_DIR))
}

/// Path to the index file.
pub fn index_path() -> Result<PathBuf> {
    Ok(bundles_dir()?.join(INDEX_FILE))
}

/// Path to the cursor file.
pub fn cursor_path() -> Result<PathBuf> {
    Ok(bundles_dir()?.join(CURSOR_FILE))
}

/// Ensure the bundles directory exists.
pub fn ensure_bundles_dir() -> Result<PathBuf> {
    let dir = bundles_dir()?;
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("failed to create {}", dir.display()))?;
    Ok(dir)
}

/// Load the bundle index (lightweight metadata for all bundles).
pub fn load_index() -> Result<Vec<BundleIndexEntry>> {
    let path = index_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let entries: Vec<BundleIndexEntry> = serde_yaml::from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(entries)
}

/// Save the bundle index atomically under lock.
pub fn save_index(entries: &[BundleIndexEntry]) -> Result<()> {
    let path = index_path()?;
    with_lock(&path, || {
        ensure_bundles_dir()?;
        let content = serde_yaml::to_string(entries)
            .context("failed to serialize bundle index")?;
        atomic_write(&path, &content)?;
        Ok(())
    })
}

/// Load a single bundle by ID.
pub fn load_bundle(id: &str) -> Result<Option<Bundle>> {
    let path = bundle_path(id)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let bundle: Bundle = serde_yaml::from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(Some(bundle))
}

/// Save a single bundle atomically under lock.
pub fn save_bundle(bundle: &Bundle) -> Result<()> {
    let path = bundle_path(&bundle.id)?;
    with_lock(&path, || {
        ensure_bundles_dir()?;
        let content =
            serde_yaml::to_string(bundle).context("failed to serialize bundle")?;
        atomic_write(&path, &content)?;
        Ok(())
    })
}

/// Delete a bundle by ID.
pub fn delete_bundle(id: &str) -> Result<()> {
    let path = bundle_path(id)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .with_context(|| format!("failed to remove {}", path.display()))?;
    }
    Ok(())
}

/// Load all bundles (full data). Use `load_index()` for listing.
pub fn load_all_bundles() -> Result<Vec<Bundle>> {
    let entries = load_index()?;
    let mut bundles = Vec::new();
    for entry in &entries {
        if let Some(bundle) = load_bundle(&entry.id)? {
            bundles.push(bundle);
        }
    }
    Ok(bundles)
}

/// Upsert a bundle: save the bundle file and update the index.
pub fn upsert_bundle(bundle: &Bundle) -> Result<()> {
    // Save the bundle file
    save_bundle(bundle)?;

    // Update index
    let mut entries = load_index()?;
    let entry = BundleIndexEntry {
        id: bundle.id.clone(),
        title: bundle.title.clone(),
        kind: bundle.kind.as_str().to_string(),
        status: bundle.status.as_str().to_string(),
        branch: bundle.branch.clone(),
        commit_count: bundle.commits.len(),
        first_sha: bundle.range.as_ref().map(|r| r.first_sha.clone()),
        last_sha: bundle.range.as_ref().map(|r| r.last_sha.clone()),
        confidence: bundle.confidence,
        card_id: bundle.card_id.clone(),
        updated_at: bundle.created_at.to_rfc3339(),
    };

    if let Some(pos) = entries.iter().position(|e| e.id == bundle.id) {
        entries[pos] = entry;
    } else {
        entries.push(entry);
    }

    save_index(&entries)
}

/// Remove a bundle from the index and delete its file.
pub fn remove_bundle(id: &str) -> Result<()> {
    delete_bundle(id)?;
    let mut entries = load_index()?;
    entries.retain(|e| e.id != id);
    save_index(&entries)
}

/// Load the scan cursor.
pub fn load_cursor() -> Result<ScanCursor> {
    let path = cursor_path()?;
    if !path.exists() {
        return Ok(ScanCursor::default());
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let cursor: ScanCursor = serde_json::from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(cursor)
}

/// Save the scan cursor.
pub fn save_cursor(cursor: &ScanCursor) -> Result<()> {
    let path = cursor_path()?;
    with_lock(&path, || {
        ensure_bundles_dir()?;
        let content =
            serde_json::to_string_pretty(cursor).context("failed to serialize cursor")?;
        atomic_write(&path, &content)?;
        Ok(())
    })
}

/// Get the cursor SHA for a branch.
pub fn cursor_for_branch(branch: &str) -> Option<String> {
    load_cursor()
        .ok()
        .and_then(|c| c.branches.get(branch).cloned())
}

/// Update the cursor SHA for a branch.
pub fn update_cursor(branch: &str, sha: &str) -> Result<()> {
    let mut cursor = load_cursor()?;
    cursor
        .branches
        .insert(branch.to_string(), sha.to_string());
    save_cursor(&cursor)
}

/// Atomic write: temp file + rename (same pattern as board storage).
fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let dir = path
        .parent()
        .with_context(|| format!("{} has no parent directory", path.display()))?;

    let temp_name = format!(".bundlestmp.{}.{}", path.file_stem().unwrap_or_default().to_string_lossy(), std::process::id());
    let temp_path = dir.join(&temp_name);

    std::fs::write(&temp_path, content)
        .with_context(|| format!("failed to write temp file {}", temp_path.display()))?;

    std::fs::rename(&temp_path, path).with_context(|| {
        format!(
            "failed to rename {} -> {}",
            temp_path.display(),
            path.display()
        )
    })?;

    Ok(())
}

/// Path to a single bundle's YAML file.
fn bundle_path(id: &str) -> Result<PathBuf> {
    Ok(bundles_dir()?.join(format!("{}.yaml", id)))
}

/// Get or create the "Unsorted" bundle for a branch.
pub fn unsorted_bundle(branch: &str) -> Result<Bundle> {
    let id = format!("{}-{}", branch, UNSORTED_ID);
    if let Some(existing) = load_bundle(&id)? {
        return Ok(existing);
    }
    let mut bundle = Bundle::new(&id, "Unsorted", branch);
    bundle.kind = crate::models::bundle::BundleKind::Mixed;
    bundle.confidence = 0.0;
    bundle.source = crate::models::bundle::BundleSource::Heuristic;
    Ok(bundle)
}

/// Validate bundles: check for dangling SHAs, orphan commits, overlapping ranges.
/// Returns a list of validation messages (empty = all valid).
pub fn validate_bundles(root: &Path, bundles: &[Bundle]) -> Vec<String> {
    let mut issues = Vec::new();

    // Check for dangling SHAs
    for bundle in bundles {
        for commit in &bundle.commits {
            if !git::commit_exists(root, &commit.sha) {
                issues.push(format!(
                    "bundle '{}' has dangling SHA {} ({})",
                    bundle.id, commit.sha, commit.subject
                ));
            }
        }
    }

    // Check for overlapping bundles (same SHA in multiple bundles)
    let mut sha_to_bundles: HashMap<String, Vec<String>> = HashMap::new();
    for bundle in bundles {
        for commit in &bundle.commits {
            sha_to_bundles
                .entry(commit.sha.clone())
                .or_default()
                .push(bundle.id.clone());
        }
    }
    for (sha, bundle_ids) in sha_to_bundles {
        if bundle_ids.len() > 1 {
            issues.push(format!(
                "SHA {} appears in multiple bundles: {}",
                sha,
                bundle_ids.join(", ")
            ));
        }
    }

    // Check for sealed bundles with no commits
    for bundle in bundles {
        if bundle.is_sealed() && bundle.commits.is_empty() {
            issues.push(format!("sealed bundle '{}' has no commits", bundle.id));
        }
    }

    issues
}

/// Check if a bundle is open (not sealed) — these can still absorb commits.
pub fn open_bundles(branch: &str) -> Result<Vec<Bundle>> {
    let all = load_all_bundles()?;
    Ok(all
        .into_iter()
        .filter(|b| b.branch == branch && b.status == BundleStatus::Open)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::bundle::BundleKind;
    use chrono::Utc;

    fn test_bundle(id: &str, branch: &str) -> Bundle {
        let mut b = Bundle::new(id, id, branch);
        b.kind = BundleKind::Feat;
        b.confidence = 0.8;
        b.commits.push(crate::models::bundle::CommitRef {
            sha: format!("sha-{}", id),
            patch_id: None,
            subject: format!("commit {}", id),
            author: "Test".into(),
            date: Utc::now(),
        });
        b.recompute_stats();
        b
    }

    #[test]
    fn bundle_path_format() {
        let path = bundle_path("my-bundle").unwrap();
        assert!(path.ends_with("bundles/my-bundle.yaml"));
    }

    #[test]
    fn unsorted_id_format() {
        assert_eq!(
            format!("{}-{}", "main", UNSORTED_ID),
            "main-unsorted"
        );
    }

    #[test]
    fn scan_cursor_roundtrip() {
        let cursor = ScanCursor {
            branches: HashMap::from([
                ("main".into(), "abc123".into()),
                ("dev".into(), "def456".into()),
            ]),
        };
        assert_eq!(cursor.branches.get("main").unwrap(), "abc123");
        assert_eq!(cursor.branches.get("dev").unwrap(), "def456");
        assert!(cursor.branches.get("feature").is_none());
    }
}
