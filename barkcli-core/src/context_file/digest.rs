//! Section generators + shared orchestration for `project_context.md`.
//!
//! Everything here reads only from barkcli's own tracked evidence — board
//! YAML, session JSONL, memory store, code sidecar, spec store, git state —
//! so the digest is verifiable and cheap (no LLM, no repo re-scan).

use std::collections::{BTreeMap, HashSet};

use anyhow::{Context, Result};
use chrono::Utc;

use super::{
    estimate_tokens, file_path, merge, parse, project_root, read_state, render_file,
    wire_agent_files, write_state, Block, BlockMeta, DigestOpts, GeneratedSection, MergeReport,
    ParsedFile, STAMP_FMT,
};
use crate::memory::store::{MemoryStore, MemoryTier};
use crate::models::board::Board;
use crate::models::card::Card;
use crate::models::context::BoardContext;
use crate::models::session::SessionEntry;
use crate::models::spec::{RequirementStatus, Spec, SpecStatus};
use crate::storage::board_file::read_board;
use crate::storage::context::read_context;
use crate::storage::sessions::read_sessions;
use crate::storage::specs::read_specs;
use crate::util::git;

const VERIFY_BLOCK_ID: &str = "verify";

/// Generate all sections fresh from tracked evidence.
/// Order: snapshot → active → architecture → conventions → decisions →
/// specs → recent sessions. Empty sections are omitted (a board with no
/// decisions won't render a stub).
pub fn generate_sections(board: &str) -> Result<Vec<GeneratedSection>> {
    let b = read_board(board)?;
    let memory = MemoryStore::open(board)?;
    let sessions = read_sessions(board)?;
    let code_ctx = read_context(board)?;
    let specs = read_specs(board)?;
    let root = project_root().unwrap_or_else(|_| std::path::PathBuf::from("."));

    let mut sections = Vec::new();

    // ── Snapshot ── (staleness always 0 — recomputed every run)
    sections.push(GeneratedSection {
        id: "snapshot",
        title: "Snapshot",
        src: "board+sessions+git".into(),
        staleness: 0.0,
        body: snapshot_body(board, &b, &sessions, &root),
    });

    // ── Active now ── (staleness = worst code drift across active cards)
    let (active_body, active_stale) = active_section(&b, &code_ctx);
    sections.push(GeneratedSection {
        id: "active",
        title: "Active now",
        src: "board+code-index".into(),
        staleness: active_stale,
        body: active_body,
    });

    // ── Architecture map ── (staleness = share of drifted indexed files)
    let (arch_body, arch_stale) = architecture_section(&code_ctx);
    if !arch_body.is_empty() {
        sections.push(GeneratedSection {
            id: "architecture",
            title: "Architecture map",
            src: "code-index".into(),
            staleness: arch_stale,
            body: arch_body,
        });
    }

    // ── Conventions ── (facts + high-tier memory)
    let conv_body = conventions_section(&memory);
    if !conv_body.is_empty() {
        sections.push(GeneratedSection {
            id: "conventions",
            title: "Conventions & gotchas",
            src: "memory-facts".into(),
            staleness: 0.0,
            body: conv_body,
        });
    }

    // ── Decision log ── (facts category=decision)
    let dec_body = decisions_section(&memory);
    if !dec_body.is_empty() {
        sections.push(GeneratedSection {
            id: "decisions",
            title: "Decision log",
            src: "memory-facts".into(),
            staleness: 0.0,
            body: dec_body,
        });
    }

    // ── Specs ── (staleness = stale requirements present)
    let (spec_body, spec_stale) = specs_section(&specs);
    if !spec_body.is_empty() {
        sections.push(GeneratedSection {
            id: "specs",
            title: "Specs & requirements",
            src: "spec-store".into(),
            staleness: spec_stale,
            body: spec_body,
        });
    }

    // ── Recent sessions ── (staleness 0 — the evidence itself)
    let sess_body = sessions_section(&sessions);
    if !sess_body.is_empty() {
        sections.push(GeneratedSection {
            id: "sessions",
            title: "Recent agent sessions",
            src: "session-log".into(),
            staleness: 0.0,
            body: sess_body,
        });
    }

    Ok(sections)
}

// ─── Section builders ───────────────────────────────────────────────────────

fn short(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

fn snapshot_body(
    board: &str,
    b: &Board,
    sessions: &[SessionEntry],
    root: &std::path::Path,
) -> Vec<String> {
    let mut body = Vec::new();
    body.push(format!(
        "- Task board: \"{}\" — {}",
        b.title,
        b.description
            .clone()
            .unwrap_or_else(|| format!("tracked work via barkcli ({}.board)", board))
    ));
    let mut by_col: BTreeMap<String, usize> = BTreeMap::new();
    for card in &b.cards {
        *by_col.entry(card.column.clone()).or_default() += 1;
    }
    let cols: Vec<String> = b
        .columns
        .iter()
        .map(|c| format!("{} {}", c.id, by_col.get(&c.id).copied().unwrap_or(0)))
        .collect();
    body.push(format!("- Cards: {} total ({})", b.cards.len(), cols.join(" · ")));

    match git::current_commit(root) {
        Some(sha) => body.push(format!("- Last commit: {}", short(&sha, 7))),
        None => body.push("- Last commit: none (no git history)".into()),
    }

    match sessions.last() {
        Some(s) => {
            let agent = s.agent.as_deref().unwrap_or("agent");
            let when = s.at.split('T').next().unwrap_or(&s.at).to_string();
            body.push(format!(
                "- Last agent session: {} · {} · {} file(s) touched",
                when,
                agent,
                s.files_touched.len()
            ));
        }
        None => body.push(
            "- Last agent session: none logged — `barkcli hooks install` makes agents auto-log sessions".into(),
        ),
    }
    body
}

fn staleness_from_status(status: &str) -> f32 {
    match status {
        "clean" => 0.0,
        "stale" => 0.4,
        "changed" => 0.7,
        "deleted" => 1.0,
        _ => 0.0,
    }
}

fn active_section(b: &Board, code_ctx: &BoardContext) -> (Vec<String>, f32) {
    let done_cols = ["done", "archive", "shipped"];
    let active: Vec<&Card> = b
        .cards
        .iter()
        .filter(|c| !done_cols.contains(&c.column.as_str()))
        .collect();
    if active.is_empty() {
        return (vec!["- No active cards — board is clear.".into()], 0.0);
    }

    // Order: in-flight (non-backlog) columns first in board order, then the
    // backlog column itself — agents should see in-progress work first.
    let col_position = |card: &Card| {
        b.columns
            .iter()
            .position(|c| c.id == card.column)
            .unwrap_or(usize::MAX)
    };
    let backlog_id = b.columns.first().map(|c| c.id.clone()).unwrap_or_default();
    let mut ordered = active.clone();
    ordered.sort_by_key(|c| (c.column == backlog_id, col_position(c), !c.pinned, c.id.clone()));

    let mut body = Vec::new();
    let mut worst = 0.0f32;
    for card in ordered.iter().take(8) {
        let blocked: Vec<String> = card
            .links
            .iter()
            .filter(|l| l.ty == crate::models::card::LinkType::BlockedBy)
            .map(|l| l.target.clone())
            .collect();
        let mut line = format!("- [{}] {} — {}", card.column, card.id, card.title);
        if !blocked.is_empty() {
            line.push_str(&format!("  ⛔ blocked: {}", blocked.join(", ")));
        }
        body.push(line);

        if let Some(entry) = code_ctx.cards.get(&card.id) {
            let paths: Vec<String> = entry.files.iter().take(3).map(|f| f.path.to_string()).collect();
            if !paths.is_empty() {
                body.push(format!("    → {}", paths.join(", ")));
            }
            for f in &entry.files {
                let s = staleness_from_status(&f.status);
                if s > worst {
                    worst = s;
                }
            }
        }
    }
    if ordered.len() > 8 {
        body.push(format!(
            "- …{} more active cards (`barkcli list`)",
            ordered.len() - 8
        ));
    }
    (body, worst)
}

fn architecture_section(code_ctx: &BoardContext) -> (Vec<String>, f32) {
    // Dedup files across cards, group by parent directory.
    let mut seen = HashSet::new();
    let mut all: Vec<&crate::models::context::FileRef> = Vec::new();
    for entry in code_ctx.cards.values() {
        for f in &entry.files {
            if seen.insert(f.path.clone()) {
                all.push(f);
            }
        }
    }
    if all.is_empty() {
        return (
            vec!["- No code map yet — run `barkcli context scan` then `barkcli context digest` at least once per big change.".into()],
            0.0,
        );
    }
    // Unknown status means "never verified" — not evidence of drift. Only
    // real drift signals (changed/stale/deleted from context sync) count.
    let drifted = all
        .iter()
        .filter(|f| matches!(f.status.as_str(), "changed" | "stale" | "deleted"))
        .count();
    let staleness = (drifted as f32 / all.len() as f32).min(1.0);

    let mut groups: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for f in &all {
        let g = groups.entry(parent_dir(&f.path)).or_insert((0, 0));
        g.0 += 1;
        if matches!(f.status.as_str(), "changed" | "stale" | "deleted") {
            g.1 += 1;
        }
    }
    let mut rows: Vec<(String, usize, usize)> = groups
        .into_iter()
        .map(|(dir, (n, changed))| (dir, n, changed))
        .collect();
    rows.sort_by_key(|(_, n, _)| std::cmp::Reverse(*n));

    let mut body = Vec::new();
    for (dir, n, changed) in rows.iter().take(6) {
        let drift = if *changed > 0 {
            format!(", {} changed", changed)
        } else {
            String::new()
        };
        body.push(format!("- {} — {} file(s){}", dir, n, drift));
    }
    if rows.len() > 6 {
        body.push(format!("- …{} more directories", rows.len() - 6));
    }
    (body, staleness)
}

fn parent_dir(path: &str) -> String {
    match path.trim_start_matches("./").rfind('/') {
        Some(i) => path[..i].to_string(),
        None => "(root)".into(),
    }
}

fn conventions_section(memory: &MemoryStore) -> Vec<String> {
    let mut body = Vec::new();
    for fact in memory
        .memory
        .project_facts
        .iter()
        .filter(|f| matches!(f.category.as_str(), "convention" | "pattern" | "preference"))
        .filter(|f| f.confidence >= 0.5)
        .take(6)
    {
        let src_n = fact.sources.len();
        body.push(format!(
            "- [{}] {} (confidence {:.2}{})",
            fact.category,
            fact.fact,
            fact.confidence,
            if src_n > 0 {
                format!(", {} source(s)", src_n)
            } else {
                String::new()
            }
        ));
    }
    // Backfill from high-tier memory when facts are thin.
    if body.len() < 3 {
        let need = 6 - body.len();
        for entry in memory
            .memory
            .entries
            .iter()
            .filter(|e| matches!(e.tier, MemoryTier::Working | MemoryTier::LongTerm))
            .take(need)
        {
            body.push(format!(
                "- [{}] {}",
                entry.tier.display_name(),
                trim_line(&entry.content, 130)
            ));
        }
    }
    body
}

fn decisions_section(memory: &MemoryStore) -> Vec<String> {
    let mut facts: Vec<&crate::memory::store::ProjectFact> = memory
        .memory
        .project_facts
        .iter()
        .filter(|f| f.category == "decision")
        .collect();
    facts.sort_by_key(|f| std::cmp::Reverse(f.created_at));
    let mut body: Vec<String> = facts
        .into_iter()
        .take(8)
        .map(|f| format!("- {} — {} (confidence {:.2})", f.created_at.format("%Y-%m-%d"), f.fact, f.confidence))
        .collect();
    // Also decisions stored only as tagged memory entries.
    if body.len() < 4 {
        let need = 4 - body.len();
        for entry in memory
            .memory
            .entries
            .iter()
            .filter(|e| e.tags.iter().any(|t| t == "decision"))
            .take(need)
        {
            body.push(format!(
                "- {} — {}",
                entry.created_at.format("%Y-%m-%d"),
                trim_line(&entry.content, 130)
            ));
        }
    }
    body
}

fn specs_section(specs: &[Spec]) -> (Vec<String>, f32) {
    let mut body = Vec::new();
    let mut worst = 0.0f32;
    for spec in specs
        .iter()
        .filter(|s| s.status != SpecStatus::Deprecated)
        .take(4)
    {
        let total = spec.requirements.len();
        let done = spec
            .requirements
            .iter()
            .filter(|r| {
                matches!(
                    r.status,
                    RequirementStatus::Implemented | RequirementStatus::Verified
                )
            })
            .count();
        let mut line = format!(
            "- [{}] {} — {}/{} requirements",
            spec.status, spec.title, done, total
        );
        let stale: Vec<&str> = spec
            .requirements
            .iter()
            .filter(|r| r.stale)
            .map(|r| r.title.as_str())
            .collect();
        if !stale.is_empty() {
            line.push_str(&format!("  ⚠ stale: {}", stale.join("; ")));
            worst = worst.max(0.5);
        }
        body.push(line);
    }
    (body, worst)
}

fn sessions_section(sessions: &[SessionEntry]) -> Vec<String> {
    let mut body = Vec::new();
    for s in sessions.iter().rev().take(4) {
        let when = s.at.split('T').next().unwrap_or(&s.at).to_string();
        let agent = s.agent.as_deref().unwrap_or("agent");
        let summary = s
            .summary
            .as_deref()
            .map(|x| trim_line(&x.replace('\n', " "), 120))
            .unwrap_or_else(|| "—".into());
        let cards = if s.matched_card_ids.is_empty() {
            String::new()
        } else {
            format!(
                " · cards: {}",
                s.matched_card_ids
                    .iter()
                    .map(|c| short(c, 18))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        body.push(format!(
            "- {} {} — \"{}\" ({} file(s){})",
            when,
            agent,
            summary,
            s.files_touched.len(),
            cards
        ));
    }
    body
}

fn trim_line(s: &str, max: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= max {
        t.to_string()
    } else {
        let cut: String = t.chars().take(max).collect();
        format!("{}…", cut.trim_end())
    }
}

// ─── Verify footer ──────────────────────────────────────────────────────────

fn verify_body_parts(report: &MergeReport, root: &std::path::Path) -> Vec<String> {
    // NOTE: no wall-clock timestamp in the body — the freshness stamp lives in
    // the block's `updated` meta. This keeps verdict rendering content-stable
    // so no-op digest runs never rewrite the file (watcher-safe, diff-quiet).
    let sha = git::current_commit(root)
        .map(|s| short(&s, 7))
        .unwrap_or_else(|| "no-git".into());
    let guide = "- Guide: staleness 0 fresh · ≥0.4 review the section · ≥0.8 likely wrong.".to_string();
    if report.flagged_stale.is_empty() {
        vec![
            format!(
                "- Verified @ {} · all sections fresh (staleness < 0.4)",
                sha
            ),
            guide,
        ]
    } else {
        let flagged: Vec<String> = report
            .flagged_stale
            .iter()
            .map(|(id, s)| format!("{} ({:.2})", id, s))
            .collect();
        vec![
            format!(
                "- Verified @ {} · sections flagged: {} — run `barkcli context sync` + `barkcli context digest`.",
                sha,
                flagged.join(", ")
            ),
            guide,
        ]
    }
}

fn drop_verify_block(parsed: &mut ParsedFile) {
    parsed.blocks.retain(|b| b.meta.id != VERIFY_BLOCK_ID);
}

fn append_verify_block(
    parsed: &mut ParsedFile,
    report: &MergeReport,
    root: &std::path::Path,
    now: &str,
    prev: Option<&Block>,
) {
    let body = verify_body_parts(report, root);
    // Content-idempotence: an identical verdict keeps the previous stamp,
    // so nothing in the file changes on a no-op run.
    let (body, updated) = match prev {
        Some(pv) if pv.body == body => (pv.body.clone(), pv.meta.updated.clone()),
        _ => (body, now.to_string()),
    };
    parsed.blocks.push(Block {
        meta: BlockMeta {
            id: VERIFY_BLOCK_ID.into(),
            manual: false,
            src: "barkcli context digest".into(),
            staleness: 0.0,
            updated,
        },
        heading: "## Verification status".into(),
        body,
    });
}

// ─── Orchestration ──────────────────────────────────────────────────────────

/// Full digest run: generate → merge (hand-edit-aware) → budget → write file
/// + state. Returns the merge report for CLI rendering.
pub fn run_digest_core(board: &str, opts: &DigestOpts) -> Result<MergeReport> {
    let root = project_root()?;
    let path = file_path(&root);
    if opts.if_exists && !path.exists() {
        return Ok(MergeReport::default());
    }

    let mut state = read_state(board)?;
    if let Some(budget) = opts.budget {
        state.budget_tokens = budget.max(400);
        // Explicit budget change: let evicted sections regrow so the user
        // can raise/lower the trim set deterministically.
        state.evicted.clear();
    }
    if let Some(manual) = &opts.manual_add {
        if !state.manual.contains(manual) {
            state.manual.push(manual.clone());
        }
    }

    let mut existing = if path.exists() {
        parse(&std::fs::read_to_string(&path).unwrap_or_default())
    } else {
        ParsedFile::default()
    };
    let prev_verify = existing
        .blocks
        .iter()
        .find(|b| b.meta.id == VERIFY_BLOCK_ID)
        .cloned();
    drop_verify_block(&mut existing);

    let fresh = generate_sections(board)?;
    let now = Utc::now().format(STAMP_FMT).to_string();
    let mut report = merge(&mut existing, fresh, &mut state, &now);
    append_verify_block(&mut existing, &report, &root, &now, prev_verify.as_ref());
    report.total_tokens = estimate_tokens(&render_file(&existing));
    let final_markdown = render_file(&existing);

    // Content-idempotence: only touch disk when the rendered file actually
    // changed. Keeps daemon/watcher runs quiet and `git diff` clean for
    // no-op refreshes.
    let mut content_changed = true;
    if path.exists() {
        if let Ok(prev) = std::fs::read_to_string(&path) {
            content_changed = prev != final_markdown;
        }
    }
    if content_changed {
        std::fs::write(&path, &final_markdown)
            .with_context(|| format!("failed to write {}", path.display()))?;
        state.last_run = Some(now.clone());
        write_state(board, &state)?;
    } else if opts.budget.is_some() || opts.manual_add.is_some() {
        // Explicit knobs changed even though the rendered file didn't —
        // persist them so the next run budgets correctly.
        write_state(board, &state)?;
    }
    report.unchanged = !content_changed;

    if opts.wire {
        let _ = wire_agent_files(&root, &mut state, opts.create_wires);
        write_state(board, &state)?;
    }
    Ok(report)
}

/// Silent post-session refresh (called from `session log` after ingest).
/// Never fatal — callers log failures and move on.
pub fn refresh_after_session(board: &str) {
    if let Err(e) = run_digest_core(board, &DigestOpts { quiet: true, ..Default::default() }) {
        eprintln!("barkcli context digest: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn staleness_mapping_is_monotonic() {
        assert!(staleness_from_status("clean") < staleness_from_status("stale"));
        assert!(staleness_from_status("stale") < staleness_from_status("changed"));
        assert!(staleness_from_status("changed") < staleness_from_status("deleted"));
        assert_eq!(staleness_from_status("unknown"), 0.0); // unverified ≠ drifted
    }
}
