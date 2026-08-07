use std::io::Write;

use anyhow::{Context, Result};

use crate::models::session::SessionEntry;
use crate::storage::board_dir::find_board_dir;
use crate::util::redact::redact_text;

const SESSIONS_DIR: &str = "sessions";

/// Append a session entry to `.board/sessions/<board>.jsonl`.
/// All free-text fields are redacted before hitting disk. Cards whose mapped
/// files the session touched are computed and stored on `matched_card_ids`.
pub fn append(entry: &SessionEntry) -> Result<()> {
    let board_dir = find_board_dir()?;
    let sessions_dir = board_dir.join(SESSIONS_DIR);
    std::fs::create_dir_all(&sessions_dir).ok();

    let mut matched = entry.clone();
    if matched.matched_card_ids.is_empty() && !matched.files_touched.is_empty() {
        matched.matched_card_ids = match_files_to_cards(&matched.board, &matched.files_touched);
        // Also record the session ids on the card contexts (sidecar).
        link_sessions_to_cards(&matched.board, &matched);
    }

    let redacted = SessionEntry {
        prompt: matched.prompt.as_deref().map(redact_text),
        summary: matched.summary.as_deref().map(redact_text),
        files_touched: matched
            .files_touched
            .iter()
            .map(|f| redact_text(f))
            .collect(),
        ..matched
    };

    let path = sessions_dir.join(format!("{}.jsonl", redacted.board));
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .context(format!("failed to open sessions log {}", path.display()))?;

    let json = serde_json::to_string(&redacted).context("failed to serialize session entry")?;
    writeln!(file, "{}", json).context("failed to write session entry")?;

    Ok(())
}

/// Map touched files → cards using the board's context index (file → cards).
fn match_files_to_cards(board: &str, files: &[String]) -> Vec<String> {
    let Ok(ctx) = crate::storage::context::read_context(board) else {
        return Vec::new();
    };
    let mut cards: Vec<String> = Vec::new();
    for f in files {
        // exact path match
        if let Some(ids) = ctx.index.get(f) {
            for id in ids {
                if !cards.contains(id) {
                    cards.push(id.clone());
                }
            }
            continue;
        }
        // suffix match (touched file may be absolute or include ./)
        for (path, ids) in &ctx.index {
            let rel_f = f.trim_start_matches("./");
            let rel_path = path.trim_start_matches("./");
            if rel_f == rel_path || rel_f.ends_with(&format!("/{}", rel_path)) || rel_path.ends_with(&format!("/{}", rel_f)) {
                for id in ids {
                    if !cards.contains(id) {
                        cards.push(id.clone());
                    }
                }
            }
        }
    }
    cards
}

/// Record session ids on each matched card's context sidecar entry.
fn link_sessions_to_cards(board: &str, entry: &SessionEntry) {
    if entry.matched_card_ids.is_empty() {
        return;
    }
    if let Ok(mut ctx) = crate::storage::context::read_context(board) {
        for id in &entry.matched_card_ids {
            let card_ctx = ctx.card_mut(id);
            if !card_ctx.sessions.contains(&entry.id) {
                card_ctx.sessions.push(entry.id.clone());
            }
        }
        let _ = crate::storage::context::write_context(board, &ctx);
    }
}

/// Read all session entries for a board, newest last (append order).
pub fn read_sessions(board_name: &str) -> Result<Vec<SessionEntry>> {
    let board_dir = find_board_dir()?;
    let path = board_dir.join(SESSIONS_DIR).join(format!("{}.jsonl", board_name));
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).context("failed to read sessions log")?;
    let mut entries = Vec::new();
    for line in content.lines() {
        if let Ok(entry) = serde_json::from_str::<SessionEntry>(line) {
            entries.push(entry);
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::context::{BoardContext, FileRef};
    use crate::storage::context::write_context;
    use crate::storage::board_dir::find_board_dir;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn tmp_project() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("bark_core_sess_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(dir.join(".board")).unwrap();
        let _ = std::process::Command::new("git").args(["init", "-q"]).current_dir(&dir).output();
        std::env::set_current_dir(&dir).unwrap();
        dir
    }

    #[test]
    fn matches_files_to_context_cards() {
        let root = tmp_project();
        let mut ctx = BoardContext::new();
        let entry = ctx.card_mut("auth-pbi");
        let mut fr = FileRef::new("src/auth.rs");
        fr.source = "scan".into();
        entry.files.push(fr);
        ctx.rebuild_index();
        write_context("sess-board", &ctx).unwrap();

        let cards = match_files_to_cards("sess-board", &["src/auth.rs".to_string()]);
        assert!(cards.contains(&"auth-pbi".to_string()));

        let cards2 = match_files_to_cards("sess-board", &["./src/auth.rs".to_string()]);
        assert!(cards2.contains(&"auth-pbi".to_string()));

        let cards3 = match_files_to_cards("sess-board", &["other.rs".to_string()]);
        assert!(cards3.is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn append_links_session_to_card_context() {
        let root = tmp_project();
        let mut ctx = BoardContext::new();
        let entry = ctx.card_mut("card-crud");
        let mut fr = FileRef::new("src/cards.rs");
        fr.source = "scan".into();
        entry.files.push(fr);
        ctx.rebuild_index();
        write_context("sess2", &ctx).unwrap();

        let mut s = SessionEntry::new("sess2");
        s.id = "barkcli-test-00000001".into();
        s.files_touched = vec!["src/cards.rs".into()];
        append(&s).unwrap();

        let ctx_after = crate::storage::context::read_context("sess2").unwrap();
        let card_ctx = ctx_after.cards.get("card-crud").unwrap();
        assert!(card_ctx.sessions.contains(&"barkcli-test-00000001".to_string()));
        let _ = std::fs::remove_dir_all(&root);
    }
}
