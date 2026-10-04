//! Session → memory ingestion engine (the "brain" updater).
//!
//! For each new captured session, extract candidate memories with smart
//! heuristics, optionally refine them with the configured LLM, dedup
//! near-duplicates via BM25, and consolidate tiers. All content passes
//! through `MemoryStore::add`, which redacts secrets.

use std::collections::HashSet;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::memory::store::{MemoryEntry, MemoryStore, MemoryTier};
use crate::models::SessionEntry;
use crate::storage::board_dir::find_board_dir;
use crate::storage::sessions::read_sessions;

const MAX_TRACKED_IDS: usize = 500;

const DECISION_KW: &[&str] = &[
    "decided", "decision", "because", "instead", "chose", "we will", "we'll", "approach",
    "trade-off", "tradeoff",
];

const CONVENTION_KW: &[&str] = &[
    "always", "never", "convention", "rule", "must not", "prefer ", "use ", "avoid ",
];

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct IngestState {
    ingested: Vec<String>,
}

/// What ingestion did for this run.
#[derive(Debug, Default, Clone, Copy)]
pub struct IngestReport {
    pub sessions_ingested: usize,
    pub memories_added: usize,
    pub consolidated: bool,
}

fn state_path(board: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    let dir = board_dir.join("memory");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.ingest.json", board)))
}

fn read_state(board: &str) -> IngestState {
    let path = match state_path(board) {
        Ok(p) => p,
        Err(_) => return IngestState::default(),
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_state(board: &str, state: &IngestState) {
    if let Ok(path) = state_path(board) {
        if let Ok(json) = serde_json::to_string_pretty(state) {
            let _ = std::fs::write(path, json);
        }
    }
}

/// Ingest all sessions not yet ingested for `board`.
pub fn ingest(board: &str, consolidate: bool) -> Result<IngestReport> {
    let sessions = read_sessions(board)?;
    let mut state = read_state(board);
    let mut seen: HashSet<String> = state.ingested.iter().cloned().collect();

    let mut store = MemoryStore::open(board)?;
    let mut report = IngestReport::default();

    for session in &sessions {
        if seen.contains(&session.id) {
            continue;
        }
        let candidates = extract(session);
        let candidates = maybe_refine_with_llm(candidates);

        for cand in candidates {
            if store.add_candidate(cand.content, cand.tier, cand.tags, cand.source, cand.importance) {
                report.memories_added += 1;
            }
        }

        seen.insert(session.id.clone());
        report.sessions_ingested += 1;
    }

    if consolidate && report.sessions_ingested > 0 {
        store.consolidate();
        report.consolidated = true;
    }

    store.save()?;

    state.ingested = seen.into_iter().collect();
    state.ingested.sort();
    if state.ingested.len() > MAX_TRACKED_IDS {
        let drain = state.ingested.len() - MAX_TRACKED_IDS;
        state.ingested.drain(..drain);
    }
    write_state(board, &state);

    Ok(report)
}

/// Candidate memory before store insertion.
struct Candidate {
    content: String,
    tier: MemoryTier,
    tags: Vec<String>,
    source: String,
    importance: f32,
}

/// Extract candidate memories from a session entry using heuristics.
fn extract(session: &SessionEntry) -> Vec<Candidate> {
    let mut out = Vec::new();
    let source = format!("session:{}", session.id);
    let mut base_tags = vec!["auto".to_string(), "session".to_string()];
    if let Some(agent) = &session.agent {
        base_tags.push(format!("agent:{}", agent));
    }
    for card in &session.matched_card_ids {
        base_tags.push(format!("card:{}", card));
    }

    let text = match (&session.summary, &session.prompt) {
        (Some(s), _) => Some(s.clone()),
        (None, Some(p)) => Some(p.clone()),
        _ => None,
    };

    if let Some(t) = text.as_deref() {
        let lower = t.to_lowercase();

        if DECISION_KW.iter().any(|k| lower.contains(k)) {
            let mut tags = base_tags.clone();
            tags.push("decision".into());
            out.push(Candidate {
                content: format!("Decision: {}", truncate(t, 400)),
                tier: MemoryTier::LongTerm,
                tags,
                source: source.clone(),
                importance: 0.85,
            });
        } else if CONVENTION_KW.iter().any(|k| lower.contains(k)) {
            let mut tags = base_tags.clone();
            tags.push("convention".into());
            out.push(Candidate {
                content: format!("Convention: {}", truncate(t, 400)),
                tier: MemoryTier::LongTerm,
                tags,
                source: source.clone(),
                importance: 0.75,
            });
        }
    }

    if let Some(sha) = &session.commit_sha {
        let files = if session.files_touched.is_empty() {
            "no tracked files".to_string()
        } else {
            session
                .files_touched
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        };
        out.push(Candidate {
            content: format!(
                "Committed {} via {}: touched {}",
                &sha[..sha.len().min(7)],
                session.agent.as_deref().unwrap_or("agent"),
                files
            ),
            tier: MemoryTier::ShortTerm,
            tags: {
                let mut t = base_tags.clone();
                t.push("commit".into());
                t
            },
            source: source.clone(),
            importance: 0.55,
        });
    }

    if session.files_touched.len() >= 4 {
        let dirs: Vec<String> = session
            .files_touched
            .iter()
            .filter_map(|f| f.rsplit('/').nth(1).map(|d| d.to_string()))
            .collect::<HashSet<_>>()
            .into_iter()
            .take(3)
            .collect();
        if !dirs.is_empty() {
            out.push(Candidate {
                content: format!(
                    "Session worked broadly in {} ({} files)",
                    dirs.join(", "),
                    session.files_touched.len()
                ),
                tier: MemoryTier::ShortTerm,
                tags: {
                    let mut t = base_tags.clone();
                    t.push("blast-radius".into());
                    t
                },
                source: source.clone(),
                importance: 0.4,
            });
        }
    }

    if out.is_empty() {
        // Fallback session note so something is always captured.
        let note = text
            .as_deref()
            .map(|t| truncate(t, 160))
            .unwrap_or_else(|| format!("{} files touched", session.files_touched.len()));
        out.push(Candidate {
            content: format!(
                "{} session: {}",
                session.agent.as_deref().unwrap_or("agent"),
                note
            ),
            tier: MemoryTier::ShortTerm,
            tags: base_tags,
            source,
            importance: 0.35,
        });
    }

    out
}

/// If an LLM provider is configured, ask it to rewrite candidates as concise
/// bullet facts. Falls back to the heuristic text on any failure.
fn maybe_refine_with_llm(candidates: Vec<Candidate>) -> Vec<Candidate> {
    if candidates.is_empty() {
        return candidates;
    }
    let cfg = match crate::ai::provider::resolve_config() {
        Ok(c) => c,
        Err(_) => return candidates,
    };
    if cfg.api_key.is_none() {
        return candidates;
    }

    let prompt = candidates
        .iter()
        .map(|c| format!("- {}", c.content))
        .collect::<Vec<_>>()
        .join("\n");

    let messages = vec![
        crate::ai::provider::ChatMessage {
            role: "system".into(),
            content: "Rewrite each line as one concise, factual memory (max 160 chars). Keep one bullet per line. No preamble.".into(),
        },
        crate::ai::provider::ChatMessage {
            role: "user".into(),
            content: prompt,
        },
    ];

    let Ok(resp) = crate::ai::provider::chat(&cfg, &messages) else {
        return candidates;
    };

    let rewritten: Vec<String> = resp
        .lines()
        .filter_map(|l| {
            let t = l.trim().trim_start_matches("- ").trim_start_matches("* ");
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        })
        .collect();

    // Map back positionally; keep heuristics when counts mismatch.
    if rewritten.len() == candidates.len() {
        candidates
            .into_iter()
            .zip(rewritten)
            .map(|(mut c, text)| {
                c.content = truncate(&text, 400);
                c
            })
            .collect()
    } else {
        candidates
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decision_keyword_extracts_long_term_memory() {
        let mut s = SessionEntry::new("board");
        s.summary = Some("We decided to use snake_case because it matches Rust style".into());
        let cands = extract(&s);
        assert!(cands
            .iter()
            .any(|c| c.tier == MemoryTier::LongTerm && c.tags.iter().any(|t| t == "decision")));
    }

    #[test]
    fn commit_extracts_short_term_memory() {
        let mut s = SessionEntry::new("board");
        s.commit_sha = Some("abcdef123456".into());
        s.files_touched = vec!["src/a.rs".into()];
        let cands = extract(&s);
        assert!(cands
            .iter()
            .any(|c| c.tags.iter().any(|t| t == "commit")));
    }

    #[test]
    fn fallback_note_for_plain_session() {
        let s = SessionEntry::new("board");
        let cands = extract(&s);
        assert!(!cands.is_empty());
        assert_eq!(cands[0].tier, MemoryTier::ShortTerm);
    }

    #[test]
    fn truncate_caps_length() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world this is long", 5).chars().count(), 6);
    }
}
