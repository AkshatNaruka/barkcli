//! Content-addressed description of one compiled agent context.
//!
//! The manifest is deliberately small: it records what went into the prompt
//! (section hashes, file hashes, skills, exclusions) without duplicating the
//! prompt body. Packs are stored next to it and both are addressed by the
//! same id, so the Context tab can explain why a run did or did not reuse
//! the previous stable prefix.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestSection {
    pub id: String,
    pub title: String,
    /// `stable` sections can be reused across runs; `dynamic` sections carry
    /// the current instruction or ledger delta.
    pub kind: String,
    pub hash: String,
    pub tokens: usize,
    pub bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestSkill {
    pub id: String,
    pub name: String,
    /// explicit | role | always | trigger | file
    pub reason: String,
    pub source: String,
    pub hash: String,
    pub tokens: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestFile {
    pub path: String,
    pub hash: String,
    pub bytes: usize,
    pub tokens: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub symbols: Vec<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextExclusion {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextManifest {
    pub version: u32,
    pub id: String,
    pub thread_id: String,
    pub card_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_sha: Option<String>,
    pub role: String,
    pub provider: String,
    pub permission_mode: String,
    pub sections: Vec<ManifestSection>,
    #[serde(default)]
    pub skills: Vec<ManifestSkill>,
    #[serde(default)]
    pub files: Vec<ManifestFile>,
    #[serde(default)]
    pub exclusions: Vec<ContextExclusion>,
    /// Hash of all stable sections plus the file/skill hashes. A change here
    /// means the reusable prefix is no longer valid.
    pub stable_hash: String,
    /// Hash of the task-specific sections.
    pub dynamic_hash: String,
    pub budget_tokens: usize,
    pub estimated_tokens: usize,
}

impl ContextManifest {
    /// Fill `id` from the manifest contents. `created_at` is intentionally
    /// excluded so the same inputs produce the same content address.
    pub fn with_content_id(mut self) -> Self {
        let mut copy = self.clone();
        copy.id.clear();
        copy.created_at = DateTime::<Utc>::from_timestamp(0, 0).unwrap_or_else(Utc::now);
        if let Ok(json) = serde_json::to_vec(&copy) {
            self.id = sha256_hex(&json);
        }
        self
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub fn hash_text(text: &str) -> String {
    sha256_hex(text.as_bytes())
}

pub fn hash_file(path: &std::path::Path) -> std::io::Result<String> {
    let bytes = std::fs::read(path)?;
    Ok(sha256_hex(&bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_id_is_stable_across_timestamps() {
        let section = ManifestSection {
            id: "task".into(),
            title: "Task".into(),
            kind: "dynamic".into(),
            hash: "abc".into(),
            tokens: 2,
            bytes: 4,
        };
        let mut manifest = ContextManifest {
            version: MANIFEST_VERSION,
            id: String::new(),
            thread_id: "card".into(),
            card_id: "card".into(),
            run_id: None,
            created_at: Utc::now(),
            head_sha: Some("deadbeef".into()),
            role: "builder".into(),
            provider: "opencode".into(),
            permission_mode: "auto".into(),
            sections: vec![section],
            skills: vec![],
            files: vec![],
            exclusions: vec![],
            stable_hash: "stable".into(),
            dynamic_hash: "dynamic".into(),
            budget_tokens: 1000,
            estimated_tokens: 10,
        };
        let first = manifest.clone().with_content_id().id;
        manifest.created_at = Utc::now();
        let second = manifest.with_content_id().id;
        assert_eq!(first, second);
    }

    #[test]
    fn hashes_change_with_content() {
        assert_ne!(hash_text("a"), hash_text("b"));
    }
}
