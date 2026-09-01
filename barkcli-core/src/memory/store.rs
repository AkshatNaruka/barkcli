use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;

use super::tiers::TierManager;

/// Memory tier determines how memories are managed and prioritized.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryTier {
    /// Always in context — current card, task context, recent history.
    Working,
    /// Session-level — decisions, files touched, errors encountered.
    ShortTerm,
    /// Project-level — code patterns, architecture decisions, conventions.
    LongTerm,
    /// Searchable archive — all past sessions, specs, code index.
    External,
}

impl MemoryTier {
    pub fn display_name(&self) -> &str {
        match self {
            MemoryTier::Working => "Working",
            MemoryTier::ShortTerm => "Short-term",
            MemoryTier::LongTerm => "Long-term",
            MemoryTier::External => "External",
        }
    }

    /// Max memories to keep in this tier before compression/eviction.
    pub fn max_entries(&self) -> usize {
        match self {
            MemoryTier::Working => 20,
            MemoryTier::ShortTerm => 100,
            MemoryTier::LongTerm => 500,
            MemoryTier::External => 10_000,
        }
    }
}

/// A single memory entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub content: String,
    pub tier: MemoryTier,
    pub tags: Vec<String>,
    /// Source context (card id, session id, agent id, etc.)
    pub source: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
    pub access_count: u32,
    /// Relevance score (computed during search, not persisted).
    #[serde(skip)]
    pub score: f32,
}

impl MemoryEntry {
    pub fn new(content: impl Into<String>, tier: MemoryTier) -> Self {
        let now = Utc::now();
        Self {
            id: format!("mem-{}", uuid::Uuid::new_v4()),
            content: content.into(),
            tier,
            tags: Vec::new(),
            source: None,
            created_at: now,
            last_accessed: now,
            access_count: 0,
            score: 0.0,
        }
    }

    /// Touch this memory (update access time and count).
    pub fn touch(&mut self) {
        self.last_accessed = Utc::now();
        self.access_count += 1;
    }
}

/// Complete memory state for a board.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Memory {
    pub version: u32,
    pub entries: Vec<MemoryEntry>,
    /// Project-level facts extracted from code and sessions.
    #[serde(default)]
    pub project_facts: Vec<ProjectFact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFact {
    pub fact: String,
    pub category: String, // convention | pattern | decision | preference
    pub confidence: f32,
    pub sources: Vec<String>,
    pub created_at: DateTime<Utc>,
}

/// Memory store with tiered management.
pub struct MemoryStore {
    board_name: String,
    pub memory: Memory,
    path: PathBuf,
}

impl MemoryStore {
    /// Open or create the memory store for a board.
    pub fn open(board_name: &str) -> Result<Self> {
        let path = memory_path(board_name)?;
        let memory = if path.exists() {
            let content = std::fs::read_to_string(&path).context("failed to read memory")?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Memory {
                version: 1,
                entries: Vec::new(),
                project_facts: Vec::new(),
            }
        };
        Ok(Self {
            board_name: board_name.to_string(),
            memory,
            path,
        })
    }

    /// Add a memory entry with automatic classification.
    pub fn add(&mut self, mut entry: MemoryEntry) {
        // Auto-classify tier if not already set appropriately
        if entry.source.is_some() {
            let classified = TierManager::classify_entry(
                &entry.content,
                &entry.tags,
                entry.source.as_deref().unwrap_or(""),
            );
            // Only override if classification suggests a more appropriate tier
            if classified as u8 > entry.tier as u8 {
                entry.tier = classified;
            }
        }

        // Evict if tier is full
        let tier = entry.tier;
        self.evict_if_needed(tier);
        self.memory.entries.push(entry);
    }

    /// Promote entries that meet criteria to higher tiers.
    pub fn promote_entries(&mut self) -> usize {
        let mut promoted = 0;
        let entries_clone: Vec<MemoryEntry> = self.memory.entries.clone();

        for (i, entry) in entries_clone.iter().enumerate() {
            if let Some(new_tier) = TierManager::should_promote(entry) {
                if new_tier as u8 > entry.tier as u8 {
                    self.memory.entries[i].tier = new_tier;
                    promoted += 1;
                }
            }
        }
        promoted
    }

    /// Evict entries that should be removed based on age and access patterns.
    pub fn evict_stale(&mut self) -> usize {
        let before = self.memory.entries.len();
        self.memory.entries.retain(|entry| {
            !TierManager::should_evict(entry, entry.tier)
        });
        before - self.memory.entries.len()
    }

    /// Search memories by query text (hybrid BM25 + semantic).
    pub fn search(&self, query: &str, top: usize) -> Vec<&MemoryEntry> {
        crate::memory::search::search_memories(&self.memory.entries, query, top)
    }

    /// Pure keyword search (BM25 only).
    pub fn search_keyword(&self, query: &str, top: usize) -> Vec<&MemoryEntry> {
        crate::memory::search::bm25_search(&self.memory.entries, query, top)
    }

    /// Pure semantic search (TF-IDF cosine similarity only).
    pub fn search_semantic(&self, query: &str, top: usize) -> Vec<&MemoryEntry> {
        crate::memory::search::semantic_search(&self.memory.entries, query, top)
    }

    /// Get memories for a specific tier.
    pub fn by_tier(&self, tier: MemoryTier) -> Vec<&MemoryEntry> {
        self.memory
            .entries
            .iter()
            .filter(|e| e.tier == tier)
            .collect()
    }

    /// Get memories tagged with a specific tag.
    pub fn by_tag(&self, tag: &str) -> Vec<&MemoryEntry> {
        self.memory
            .entries
            .iter()
            .filter(|e| e.tags.iter().any(|t| t == tag))
            .collect()
    }

    /// Get recent memories (sorted by creation time, descending).
    pub fn recent(&self, limit: usize) -> Vec<&MemoryEntry> {
        let mut entries: Vec<&MemoryEntry> = self.memory.entries.iter().collect();
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        entries.into_iter().take(limit).collect()
    }

    /// Add a project fact.
    pub fn add_fact(&mut self, fact: ProjectFact) {
        self.memory.project_facts.push(fact);
    }

    /// Get facts by category.
    pub fn facts_by_category(&self, category: &str) -> Vec<&ProjectFact> {
        self.memory
            .project_facts
            .iter()
            .filter(|f| f.category == category)
            .collect()
    }

    /// Compress short-term memories into long-term.
    ///
    /// Takes all short-term entries, summarizes them into a single long-term
    /// memory, and removes the originals.
    pub fn compress_short_term(&mut self) -> Option<String> {
        let short_term: Vec<MemoryEntry> = self
            .memory
            .entries
            .iter()
            .filter(|e| e.tier == MemoryTier::ShortTerm)
            .cloned()
            .collect();

        if short_term.is_empty() {
            return None;
        }

        // Build a summary from short-term entries
        let summary = short_term
            .iter()
            .map(|e| e.content.as_str())
            .collect::<Vec<_>>()
            .join("; ");

        // Remove short-term entries
        self.memory
            .entries
            .retain(|e| e.tier != MemoryTier::ShortTerm);

        // Add as long-term memory
        let mut entry = MemoryEntry::new(&summary, MemoryTier::LongTerm);
        entry.tags.push("compressed".into());
        entry.tags.push("session-summary".into());
        self.memory.entries.push(entry);

        Some(summary)
    }

    /// Evict oldest entries from a tier if it exceeds max_entries.
    fn evict_if_needed(&mut self, tier: MemoryTier) {
        let max = tier.max_entries();
        let count = self.memory.entries.iter().filter(|e| e.tier == tier).count();
        if count >= max {
            // Remove oldest entries (by last_accessed)
            let to_remove = count - max + 10; // Remove a buffer
            let mut tier_entries: Vec<(usize, DateTime<Utc>)> = self
                .memory
                .entries
                .iter()
                .enumerate()
                .filter(|(_, e)| e.tier == tier)
                .map(|(i, e)| (i, e.last_accessed))
                .collect();
            tier_entries.sort_by_key(|(_, t)| *t);

            let indices_to_remove: Vec<usize> = tier_entries
                .into_iter()
                .take(to_remove)
                .map(|(i, _)| i)
                .collect();

            // Remove in reverse order to preserve indices
            for &idx in indices_to_remove.iter().rev() {
                self.memory.entries.remove(idx);
            }
        }
    }

    /// Save memory to disk.
    pub fn save(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.memory)
            .context("failed to serialize memory")?;
        std::fs::write(&self.path, json).context("failed to write memory")?;
        Ok(())
    }

    /// Get the board name.
    pub fn board_name(&self) -> &str {
        &self.board_name
    }

    /// Get total entry count.
    pub fn len(&self) -> usize {
        self.memory.entries.len()
    }

    /// Check if memory is empty.
    pub fn is_empty(&self) -> bool {
        self.memory.entries.is_empty()
    }

    /// Clear all memories.
    pub fn clear(&mut self) {
        self.memory.entries.clear();
        self.memory.project_facts.clear();
    }

    /// Clear memories for a specific tier.
    pub fn clear_tier(&mut self, tier: MemoryTier) {
        self.memory.entries.retain(|e| e.tier != tier);
    }
}

/// Get the memory file path for a board.
fn memory_path(board_name: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    let dir = board_dir.join("memory");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.json", board_name)))
}
