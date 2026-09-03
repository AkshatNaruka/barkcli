use anyhow::Result;

use super::fleet::{load_queue, load_registry, resolve_board_arg};
use crate::agent::FleetReconciler;

/// `barkcli prime` — one-shot boot context for an agent (<8KB, no LLM).
pub fn run_prime(args: &[String]) -> Result<()> {
    let board = resolve_board_arg(args)?;
    println!("{}", prime_text(&board)?);
    Ok(())
}

/// Build the prime text (shared with MCP `prime`).
pub fn prime_text(board: &str) -> Result<String> {
    let mut out = String::new();
    out.push_str(&format!("# Prime: {}\n\n", board));

    // Board state.
    let b = crate::storage::board_file::read_board(board)?;
    let mut cols: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for c in &b.cards {
        *cols.entry(c.column.as_str()).or_insert(0) += 1;
    }
    out.push_str(&format!("## Board ({} cards)\n", b.cards.len()));
    for col in ["todo", "doing", "review", "done"] {
        out.push_str(&format!("- {}: {}\n", col, cols.get(col).copied().unwrap_or(0)));
    }

    // Mind next actions (best-effort).
    if let Ok(snap) = crate::mind::snapshot::build(board) {
        out.push_str("\n## Next actions\n");
        for a in snap.next_actions.iter().take(5) {
            out.push_str(&format!("- `{}` — {}\n", a.action, a.reason));
        }
        if !snap.blockers.is_empty() {
            out.push_str("\n## Blockers\n");
            for blk in snap.blockers.iter().take(5) {
                out.push_str(&format!("- {} blocked by {}\n", blk.card_id, blk.blocked_by.join(", ")));
            }
        }
    }

    // Top memories.
    if let Ok(store) = crate::memory::MemoryStore::open(board) {
        let hits = store.search("project conventions patterns decisions", 5);
        if !hits.is_empty() {
            out.push_str("\n## Memory (top 5)\n");
            for h in hits {
                let one_line: String = h.content.chars().take(160).collect();
                out.push_str(&format!("- [{}] {}\n", h.tier.display_name(), one_line));
            }
        }
    }

    // Skills.
    if let Ok(reg) = crate::skills::SkillRegistry::load_all(Some(board)) {
        out.push_str("\n## Skills\n");
        for s in reg.list() {
            out.push_str(&format!("- {} ({}) — {}\n", s.id, s.source, s.description));
        }
    }

    // Queue + agents.
    let queue = load_queue(board).unwrap_or_default();
    let registry = load_registry().unwrap_or_default();
    out.push_str("\n## Queue\n");
    for (status, count) in FleetReconciler::task_counts(&queue) {
        out.push_str(&format!("- {}: {}\n", status, count));
    }
    out.push_str("\n## Agents\n");
    if registry.agents.is_empty() {
        out.push_str("- none registered\n");
    }
    for a in &registry.agents {
        out.push_str(&format!(
            "- {} ({:?}) — {} · active {}/{}\n",
            a.id,
            a.status,
            a.role,
            a.active_tasks.len(),
            a.metadata.max_concurrent_tasks
        ));
    }

    // Verify profile.
    match crate::agent::verify::load_profile() {
        Ok(p) if !p.steps.is_empty() => {
            out.push_str("\n## Verify (run before reporting done)\n");
            for s in &p.steps {
                out.push_str(&format!("- {}: `{}`\n", s.name, s.cmd.join(" ")));
            }
        }
        _ => out.push_str("\n## Verify\n- none configured (run `barkcli verify --init` after implementing)\n"),
    }

    // Git state.
    if let Ok(root) = crate::storage::board_dir::find_project_root() {
        let commit = crate::util::git::current_commit(&root).unwrap_or_else(|| "-".into());
        let dirty = crate::util::git::dirty_files(&root);
        out.push_str(&format!("\n## Git\n- HEAD: {}\n- dirty files: {}\n", commit, dirty.len()));
        for f in dirty.iter().take(10) {
            out.push_str(&format!("  - {}\n", f));
        }
    }

    // Code index summary.
    if let Ok(root) = crate::storage::board_dir::find_project_root() {
        let index = crate::code::SymbolIndex::build(&root);
        let mut langs: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for f in &index.files {
            let ext = f.path.rsplit('.').next().unwrap_or("?");
            *langs.entry(ext).or_insert(0) += 1;
        }
        let mut pairs: Vec<(&str, usize)> = langs.into_iter().collect();
        pairs.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
        out.push_str(&format!("\n## Code ({} files indexed)\n", index.files.len()));
        for (ext, n) in pairs.iter().take(8) {
            out.push_str(&format!("- .{}: {}\n", ext, n));
        }
    }

    // Truncate to ~8KB.
    if out.len() > 8192 {
        out.truncate(8192);
        out.push_str("\n…(truncated)");
    }
    Ok(out)
}
