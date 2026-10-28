//! Context pack storage and per-thread ledger.
//!
//! Packs are content-addressed by their manifest id, while the ledger keeps a
//! short, deterministic history for a thread. If the ledger or a pack is
//! unreadable we fall back to a cold compile instead of failing the run.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::manifest::ContextManifest;
use super::pack::ContextPack;

pub const COMPACTION_KEEP: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub pack_id: String,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    pub stable_hash: String,
    pub dynamic_hash: String,
    pub tokens: usize,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub invalidations: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContextLedger {
    pub thread_id: String,
    #[serde(default)]
    pub entries: Vec<LedgerEntry>,
    /// Deterministic summary of entries evicted by compaction.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compacted: Option<String>,
}

impl ContextLedger {
    pub fn latest(&self) -> Option<&LedgerEntry> {
        self.entries.last()
    }

    pub fn record(&mut self, manifest: &ContextManifest, invalidations: Vec<String>) {
        self.entries.push(LedgerEntry {
            pack_id: manifest.id.clone(),
            created_at: manifest.created_at,
            run_id: manifest.run_id.clone(),
            head_sha: manifest.head_sha.clone(),
            stable_hash: manifest.stable_hash.clone(),
            dynamic_hash: manifest.dynamic_hash.clone(),
            tokens: manifest.estimated_tokens,
            skills: manifest.skills.iter().map(|s| s.id.clone()).collect(),
            files: manifest.files.iter().map(|f| f.path.clone()).collect(),
            invalidations,
        });
        self.compact();
    }

    fn compact(&mut self) {
        if self.entries.len() <= COMPACTION_KEEP {
            return;
        }
        let drop_count = self.entries.len() - COMPACTION_KEEP;
        let dropped = self.entries.drain(0..drop_count).collect::<Vec<_>>();
        let mut lines = self
            .compacted
            .take()
            .map(|text| vec![text])
            .unwrap_or_default();
        lines.push(format!("Earlier context ({} runs):", dropped.len()));
        for entry in dropped {
            let files = if entry.files.is_empty() {
                "no files".to_string()
            } else {
                entry.files.iter().take(4).cloned().collect::<Vec<_>>().join(", ")
            };
            lines.push(format!(
                "- {} {}: {} ({} tok)",
                entry.run_id.as_deref().unwrap_or("run"),
                entry.head_sha.as_deref().map(|sha| &sha[..sha.len().min(8)]).unwrap_or("?"),
                files,
                entry.tokens
            ));
        }
        self.compacted = Some(lines.join("\n"));
    }

    /// Short history used in the dynamic prompt suffix.
    pub fn render(&self, limit_chars: usize) -> String {
        let mut out = String::new();
        if let Some(compacted) = &self.compacted {
            out.push_str(compacted);
            out.push('\n');
        }
        for entry in self.entries.iter().rev().take(4) {
            out.push_str(&format!(
                "- {} {} · {} tok",
                entry.run_id.as_deref().unwrap_or("run"),
                entry
                    .head_sha
                    .as_deref()
                    .map(|sha| &sha[..sha.len().min(8)])
                    .unwrap_or("no-head"),
                entry.tokens
            ));
            if !entry.files.is_empty() {
                out.push_str(" · ");
                out.push_str(
                    &entry
                        .files
                        .iter()
                        .take(5)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", "),
                );
            }
            if let Some(reason) = entry.invalidations.first() {
                out.push_str(&format!(" · invalidated: {reason}"));
            }
            out.push('\n');
            if out.chars().count() >= limit_chars {
                break;
            }
        }
        out
    }
}

#[derive(Debug, Clone)]
pub struct ContextStore {
    board_dir: PathBuf,
}

impl ContextStore {
    pub fn new(board_dir: impl Into<PathBuf>) -> Self {
        let board_dir = board_dir.into();
        let _ = std::fs::create_dir_all(board_dir.join("context/packs"));
        let _ = std::fs::create_dir_all(board_dir.join("context/manifests"));
        let _ = std::fs::create_dir_all(board_dir.join("context/ledger"));
        Self { board_dir }
    }

    pub fn from_project() -> Result<Self> {
        Ok(Self::new(crate::storage::board_dir::find_board_dir()?))
    }

    pub fn board_dir(&self) -> &Path {
        &self.board_dir
    }

    pub fn packs_dir(&self) -> PathBuf {
        self.board_dir.join("context/packs")
    }

    pub fn manifests_dir(&self) -> PathBuf {
        self.board_dir.join("context/manifests")
    }

    pub fn ledger_path(&self, thread_id: &str) -> PathBuf {
        self.board_dir
            .join("context/ledger")
            .join(format!("{}.json", safe_id(thread_id)))
    }

    pub fn pack_path(&self, pack_id: &str) -> PathBuf {
        self.packs_dir().join(format!("{pack_id}.json"))
    }

    pub fn manifest_path(&self, manifest_id: &str) -> PathBuf {
        self.manifests_dir().join(format!("{manifest_id}.json"))
    }

    pub fn save_pack(&self, pack: &ContextPack) -> Result<()> {
        let path = self.pack_path(&pack.manifest.id);
        write_atomic(&path, &serde_json::to_vec_pretty(pack)?)?;
        let manifest_path = self.manifest_path(&pack.manifest.id);
        write_atomic(&manifest_path, &serde_json::to_vec_pretty(&pack.manifest)?)?;
        Ok(())
    }

    pub fn load_pack(&self, pack_id: &str) -> Result<ContextPack> {
        let path = self.pack_path(pack_id);
        let raw = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read context pack {}", path.display()))?;
        Ok(serde_json::from_str(&raw)?)
    }

    pub fn load_manifest(&self, manifest_id: &str) -> Result<ContextManifest> {
        let path = self.manifest_path(manifest_id);
        let raw = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read context manifest {}", path.display()))?;
        Ok(serde_json::from_str(&raw)?)
    }

    pub fn load_ledger(&self, thread_id: &str) -> ContextLedger {
        let path = self.ledger_path(thread_id);
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str::<ContextLedger>(&raw).ok())
            .unwrap_or_else(|| ContextLedger {
                thread_id: thread_id.to_string(),
                ..Default::default()
            })
    }

    pub fn save_ledger(&self, ledger: &ContextLedger) -> Result<()> {
        let path = self.ledger_path(&ledger.thread_id);
        write_atomic(&path, &serde_json::to_vec_pretty(ledger)?)
    }

    pub fn record(&self, pack: &ContextPack, invalidations: Vec<String>) -> Result<()> {
        let mut ledger = self.load_ledger(&pack.manifest.thread_id);
        ledger.thread_id = pack.manifest.thread_id.clone();
        ledger.record(&pack.manifest, invalidations);
        self.save_ledger(&ledger)
    }

    /// Load the previous pack for a thread. Unreadable packs are skipped so a
    /// corrupt cache can never block a run.
    pub fn previous_pack(&self, thread_id: &str) -> Option<ContextPack> {
        let ledger = self.load_ledger(thread_id);
        let entry = ledger.latest()?;
        self.load_pack(&entry.pack_id).ok()
    }

    pub fn previous_manifest(&self, thread_id: &str) -> Option<ContextManifest> {
        let ledger = self.load_ledger(thread_id);
        let entry = ledger.latest()?;
        self.load_manifest(&entry.pack_id).ok()
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("json")
    ));
    std::fs::write(&tmp, bytes).with_context(|| format!("writing {}", tmp.display()))?;
    std::fs::rename(&tmp, path).with_context(|| format!("committing {}", path.display()))?;
    Ok(())
}

fn safe_id(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = cleaned.trim_matches('-');
    if trimmed.is_empty() {
        "thread".to_string()
    } else {
        trimmed.chars().take(96).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ledger_compaction_is_deterministic() {
        let mut ledger = ContextLedger {
            thread_id: "card".into(),
            ..Default::default()
        };
        for index in 0..COMPACTION_KEEP + 5 {
            let manifest = ContextManifest {
                version: 1,
                id: format!("pack-{index}"),
                thread_id: "card".into(),
                card_id: "card".into(),
                run_id: Some(format!("run-{index}")),
                created_at: Utc::now(),
                head_sha: Some("abcdef1234567890".into()),
                role: "builder".into(),
                provider: "fake".into(),
                permission_mode: "auto".into(),
                sections: vec![],
                skills: vec![],
                files: vec![],
                exclusions: vec![],
                stable_hash: "s".into(),
                dynamic_hash: "d".into(),
                budget_tokens: 100,
                estimated_tokens: 10,
            };
            ledger.record(&manifest, vec![]);
        }
        assert_eq!(ledger.entries.len(), COMPACTION_KEEP);
        assert!(ledger.compacted.as_deref().unwrap_or("").contains("Earlier context"));
    }

    #[test]
    fn safe_ids_cannot_escape_the_ledger_directory() {
        assert_eq!(safe_id("../etc/passwd"), "etc-passwd");
        assert_eq!(safe_id("a/b c"), "a-b-c");
    }
}
