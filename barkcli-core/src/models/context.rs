use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Code-aware context sidecar for a board (`.board/context/<board>.json`).
/// Gitignored + regenerable — derived from code, not user-owned.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BoardContext {
    pub version: u32,
    #[serde(default)]
    pub cards: HashMap<String, CardContext>,
    /// Inverted index: file path → card ids touching it.
    #[serde(default)]
    pub index: HashMap<String, Vec<String>>,
}

impl BoardContext {
    pub fn new() -> Self {
        Self { version: 1, cards: HashMap::new(), index: HashMap::new() }
    }

    pub fn card_mut(&mut self, id: &str) -> &mut CardContext {
        self.cards.entry(id.to_string()).or_default()
    }

    pub fn rebuild_index(&mut self) {
        self.index.clear();
        for (card_id, ctx) in &self.cards {
            for f in &ctx.files {
                self.index.entry(f.path.clone()).or_default().push(card_id.clone());
            }
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CardContext {
    #[serde(default)]
    pub files: Vec<FileRef>,
    /// Session ids that touched this card's files.
    #[serde(default)]
    pub sessions: Vec<String>,
    /// Latest AI refresh (Pro).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai: Option<AiSummary>,
    /// Last commit the context was synced against.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_sync_commit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRef {
    pub path: String,
    #[serde(default)]
    pub symbols: Vec<String>,
    /// How this file was mapped: manual | scan.
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_commit: Option<String>,
    /// clean | changed | stale | deleted
    #[serde(default = "default_status")]
    pub status: String,
}

impl FileRef {
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            symbols: Vec::new(),
            source: "manual".into(),
            last_commit: None,
            status: "unknown".into(),
        }
    }
}

fn default_source() -> String {
    "manual".into()
}

fn default_status() -> String {
    "unknown".into()
}

/// AI-generated context summary for a card.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSummary {
    pub summary: String,
    pub at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub confidence: f32,
    #[serde(default)]
    pub next_steps: Vec<String>,
}
