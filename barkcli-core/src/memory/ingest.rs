//! Session → memory ingestion engine (the "brain" updater).
//!
//! For each new captured session, extract durable engineering knowledge
//! (decisions, conventions, pitfalls, architectural changes).
//! Ephemeral activity and blast-radius logs are excluded so the Brain
//! remains a high-signal knowledge base, not an activity dump.

use std::collections::HashSet;
use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::memory::store::{MemoryStore, MemoryTier};
use crate::models::SessionEntry;
use crate::storage::board_dir::find_board_dir;
use crate::storage::sessions::read_sessions;

const MAX_TRACKED_IDS: usize = 500;

const DECISION_KW: &[&str] = &[
    "decided", "decision", "because", "instead", "chose", "we will", "we'll", "approach",
    "trade-off", "tradeoff", "adr", "architecture", "migration", "refactor",
];

const CONVENTION_KW: &[&str] = &[
    "always", "never", "convention", "rule", "must not", "prefer ", "pattern", "standard",
];

const PITFALL_KW: &[&str] = &[
    "fix", "fixed", "bug", "trap", "crash", "deadlock", "race condition", "gotcha", "leak",
    "regression", "workaround", "failure", "resolve",
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
            let tmp = path.with_extension("json.tmp");
            if std::fs::write(&tmp, json).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
        }
    }
}

/// Ingest newly completed sessions into the memory store.
pub fn ingest(board: &str, consolidate: bool) -> Result<IngestReport> {
    ingest_new_sessions(board, consolidate)
}

/// Ingest newly completed sessions into the memory store.
pub fn ingest_new_sessions(board: &str, consolidate: bool) -> Result<IngestReport> {
    let sessions = read_sessions(board)?;
    let mut state = read_state(board);
    let seen: HashSet<String> = state.ingested.into_iter().collect();

    let uningested: Vec<&SessionEntry> = sessions
        .iter()
        .filter(|s| !seen.contains(&s.id))
        .collect();

    if uningested.is_empty() {
        return Ok(IngestReport::default());
    }

    let mut store = MemoryStore::open(board)?;
    let mut report = IngestReport {
        sessions_ingested: uningested.len(),
        memories_added: 0,
        consolidated: false,
    };

    let mut seen = seen;
    for s in uningested {
        seen.insert(s.id.clone());
        let candidates = extract(s);
        let refined = maybe_refine_with_llm(candidates);
        for c in refined {
            if store.add_candidate(c.content, c.tier, c.tags, c.source, c.importance) {
                report.memories_added += 1;
            }
        }
    }

    if consolidate {
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
    let mut base_tags = vec!["auto".to_string(), "knowledge".to_string()];
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
        } else if PITFALL_KW.iter().any(|k| lower.contains(k)) {
            let mut tags = base_tags.clone();
            tags.push("pitfall".into());
            out.push(Candidate {
                content: format!("Pitfall / Fix: {}", truncate(t, 400)),
                tier: MemoryTier::LongTerm,
                tags,
                source: source.clone(),
                importance: 0.80,
            });
        }
    }

    // Meaningful commits are recorded as architectural evolution
    if let Some(sha) = &session.commit_sha {
        if let Some(t) = text.as_deref() {
            let lower = t.to_lowercase();
            if lower.starts_with("feat") || lower.starts_with("fix") || lower.starts_with("refactor") || lower.starts_with("arch") {
                let mut tags = base_tags.clone();
                tags.push("commit".into());
                tags.push("architecture".into());
                out.push(Candidate {
                    content: format!("{}: {}", &sha[..sha.len().min(7)], truncate(t, 200)),
                    tier: MemoryTier::ShortTerm,
                    tags,
                    source: source.clone(),
                    importance: 0.65,
                });
            }
        }
    }

    // Default note only if nothing else was extracted and text exists
    if out.is_empty() {
        if let Some(t) = text.as_deref() {
            let mut tags = base_tags;
            tags.push("observation".into());
            out.push(Candidate {
                content: truncate(t, 200),
                tier: MemoryTier::ShortTerm,
                tags,
                source,
                importance: 0.45,
            });
        }
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
            content: "Rewrite each line as one concise, factual architectural memory (max 160 chars). Keep one bullet per line. No preamble.".into(),
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
    fn pitfall_keyword_extracts_pitfall_memory() {
        let mut s = SessionEntry::new("board");
        s.summary = Some("Fixed deadlock bug when cleaning up git worktrees".into());
        let cands = extract(&s);
        assert!(cands
            .iter()
            .any(|c| c.tier == MemoryTier::LongTerm && c.tags.iter().any(|t| t == "pitfall")));
    }

    #[test]
    fn commit_with_feat_extracts_architecture_memory() {
        let mut s = SessionEntry::new("board");
        s.commit_sha = Some("abcdef123456".into());
        s.summary = Some("feat(brain): integrate 3D knowledge graph".into());
        s.files_touched = vec!["src/a.rs".into()];
        let cands = extract(&s);
        assert!(cands
            .iter()
            .any(|c| c.tags.iter().any(|t| t == "architecture")));
    }

    #[test]
    fn truncate_caps_length() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world this is long", 5).chars().count(), 6);
    }
}
