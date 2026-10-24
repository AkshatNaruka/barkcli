//! `barkcli context benchmark` — first-party numbers for the
//! "cold session vs context file" claim in docs and the launch post.
//!
//! Deterministic proxy of the standard cold-start ritual, no LLM involved:
//!   (1) listing — every file an agent sees before it knows where to go
//!   (2) locating — keyword search for the active card titles
//!   (3) reading — top candidate files, first N lines each
//! compared against one read of `project_context.md`. Repeatable on any
//! repo: `barkcli context benchmark [--hits N] [--lines N] [--json] [--markdown]`.
//!
//! Honesty rules the output follows: payloads are floors (size caps logged
//! in notes), the file set is gitignore-aware, and the ratio is called a
//! proxy — never "an agent measured".

use std::path::Path;

use anyhow::Result;
use chrono::Utc;
use serde::Serialize;
use walkdir::WalkDir;

use crate::code::index;
use crate::context_file::{estimate_tokens, file_path};
use crate::models::board::Board;
use crate::storage::board_file::read_board;
use crate::util::{git, style};

use super::context::project_root;

/// Tunables of the proxy ritual.
#[derive(Debug, Clone)]
pub struct BenchmarkConfig {
    /// Candidate files the locating step hands to the reading step.
    pub hits: usize,
    /// Lines read per candidate file.
    pub lines: usize,
    /// Directory-listing depth.
    pub depth: usize,
    /// Perf ceiling on keyword-scanned files.
    pub scan_cap: usize,
    /// Bytes cap per payload (estimates below a cap are floors when hit).
    pub payload_cap_bytes: usize,
}

impl Default for BenchmarkConfig {
    fn default() -> Self {
        Self { hits: 8, lines: 120, depth: 6, scan_cap: 4_000, payload_cap_bytes: 200_000 }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct BenchmarkResult {
    pub repo: String,
    pub commit: Option<String>,
    pub date: String,
    pub queries: Vec<String>,
    pub files_seen: usize,
    pub files_scanned: usize,
    pub cold_listing_tokens: usize,
    pub cold_locate_tokens: usize,
    pub cold_read_tokens: usize,
    pub cold_tokens: usize,
    pub warm_tokens: usize,
    pub warm_available: bool,
    /// Top candidates as the proxy reads them: (path, keyword hits, tokens).
    pub top_files: Vec<(String, u32, usize)>,
    /// Non-fatal observations (caps hit, thin hits).
    pub notes: Vec<String>,
}

/// `barkcli context benchmark` — measure + print the cold/warm comparison.
pub fn run(board: &str, args: &[String]) -> Result<()> {
    let cfg = BenchmarkConfig {
        hits: flag_usize(args, "--hits").unwrap_or(8),
        lines: flag_usize(args, "--lines").unwrap_or(120),
        ..Default::default()
    };
    let result = benchmark_core(board, &cfg)?;
    if args.iter().any(|a| a == "--json") {
        println!("{}", serde_json::to_string_pretty(&result)?);
        return Ok(());
    }
    if args.iter().any(|a| a == "--markdown") {
        print_markdown(&result);
        return Ok(());
    }
    print_table(&result, cfg.lines);
    Ok(())
}

/// The measurement itself: read-only, deterministic, no LLM.
pub fn benchmark_core(board: &str, cfg: &BenchmarkConfig) -> Result<BenchmarkResult> {
    let root = project_root()?;
    let board_model = read_board(board)?;
    let mut notes = Vec::new();

    // ── (1) Listing ──
    let files = walk_listing(&root, cfg.depth, &mut notes);
    let mut listing = String::new();
    for (rel, bytes) in &files {
        listing.push_str(rel);
        listing.push(' ');
        listing.push_str(&human_bytes(*bytes));
        listing.push('\n');
    }
    let listing = capped(&listing, cfg.payload_cap_bytes);
    if listing.capped {
        notes.push(format!("listing payload hit the {} byte cap — estimates are floors", cfg.payload_cap_bytes));
    }
    let cold_listing_tokens = estimate_tokens(&listing.text);

    // ── (2) Locating ──
    let queries = card_title_terms(&board_model);
    let search_surface: Vec<String> = files
        .iter()
        .filter(|(p, _)| {
            Path::new(p)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| index::BENCH_TEXT_EXTS.contains(&e))
                .unwrap_or(false)
        })
        .filter(|(rel, bytes)| {
            // Agent realism: nobody keyword-hunts inside lockfiles or
            // minified blobs; agents don't treat those as reading targets.
            *bytes <= 150_000 && !looks_like_artifact(rel)
        })
        .map(|(p, _)| p.clone())
        .collect();
    if search_surface.len() > cfg.scan_cap {
        notes.push(format!("keyword scan capped at {} files ({} eligible)", cfg.scan_cap, search_surface.len()));
    }
    let mut per_file_hits: Vec<(String, u32, Vec<usize>)> = Vec::new();
    let mut files_scanned = 0usize;
    for rel in search_surface.iter().take(cfg.scan_cap) {
        let Ok(content) = std::fs::read_to_string(root.join(rel)) else { continue };
        if content.len() > 2_000_000 {
            continue;
        }
        files_scanned += 1;
        let hay = content.to_lowercase();
        let mut total = 0u32;
        let mut matched: Vec<usize> = Vec::new();
        for (qi, q) in queries.iter().enumerate() {
            // Per-term cap so one hot keyword can't crown a config file.
            let n = hay.matches(q.as_str()).count().min(50) as u32;
            if n > 0 {
                total += n;
                matched.push(qi);
            }
        }
        if total > 0 {
            per_file_hits.push((rel.clone(), total, matched));
        }
    }
    // Rank: total hits desc, then path for stability.
    per_file_hits.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let locate_payload = build_locate_output(&queries, &per_file_hits);
    let located = capped(&locate_payload, cfg.payload_cap_bytes);
    let cold_locate_tokens = estimate_tokens(&located.text);

    // ── (3) Reading ──
    let mut top_files: Vec<(String, u32, usize)> = Vec::new();
    let mut read_payload = String::new();
    for (rel, hits, _) in per_file_hits.iter().take(cfg.hits) {
        let head = read_head(&root.join(rel), cfg.lines);
        if head.is_empty() {
            continue;
        }
        let tokens = estimate_tokens(&head);
        top_files.push((rel.clone(), *hits, tokens));
        read_payload.push_str(&head);
        if read_payload.len() > cfg.payload_cap_bytes {
            notes.push("read payload hit the size cap — cold estimate is a floor".to_string());
            break;
        }
    }
    if top_files.len() < cfg.hits {
        notes.push(format!("only {} keyword candidates found (small repo or thin card titles)", top_files.len()));
    }
    let cold_read_tokens = estimate_tokens(&read_payload);
    let cold_tokens = cold_listing_tokens + cold_locate_tokens + cold_read_tokens;

    // ── Warm ── one read of the context file, if the repo adopted one.
    let ctx_path = file_path(&root);
    let (warm_tokens, warm_available) = match std::fs::read_to_string(&ctx_path) {
        Ok(content) => (estimate_tokens(&content), true),
        Err(_) => (0, false),
    };

    let repo = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repo".to_string());
    let commit = git::current_commit(&root).map(|s| s.chars().take(9).collect::<String>());

    Ok(BenchmarkResult {
        repo,
        commit,
        date: Utc::now().format("%Y-%m-%d").to_string(),
        queries,
        files_seen: files.len(),
        files_scanned,
        cold_listing_tokens,
        cold_locate_tokens,
        cold_read_tokens,
        cold_tokens,
        warm_tokens,
        warm_available,
        top_files,
        notes,
    })
}

// ─── Payloads ───────────────────────────────────────────────────────────────

/// Walk the project for the listing payload: every file (any extension)
/// an agent could `ls`, skipping build/tool dirs, hidden entries, and
/// gitignore matches. Logs oversized-repo notes rather than failing.
fn walk_listing(root: &Path, depth: usize, notes: &mut Vec<String>) -> Vec<(String, u64)> {
    let ignores = index::load_gitignores(root);
    let mut out = Vec::new();
    let walker = WalkDir::new(root)
        .follow_links(false)
        .max_depth(depth)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                return !index::SKIP_DIRS.contains(&name.as_ref());
            }
            true
        });
    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if index::ignored_by_gitignore(path, &ignores) {
            continue;
        }
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if name.starts_with('.') {
            continue;
        }
        let rel = path.strip_prefix(root).unwrap_or(path).to_string_lossy().to_string();
        let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        out.push((rel, bytes));
    }
    if out.len() > 50_000 {
        notes.push(format!("listing covers {} files — real agent sessions rarely list that wide; consider --depth", out.len()));
    }
    out.sort();
    out
}

/// Grep-style output the locating step produces:
/// `term → path:hits, path:hits` for the best hits per term.
pub(crate) fn build_locate_output(
    queries: &[String],
    scored: &[(String, u32, Vec<usize>)],
) -> String {
    let mut lines = Vec::new();
    for (qi, q) in queries.iter().enumerate() {
        let mut hits: Vec<&(String, u32, Vec<usize>)> =
            scored.iter().filter(|(_, _, m)| m.contains(&qi)).collect();
        if hits.is_empty() {
            continue;
        }
        hits.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        let files: Vec<String> =
            hits.iter().take(10).map(|(f, n, _)| format!("{}:{}", f, n)).collect();
        lines.push(format!("{} → {}", q, files.join(", ")));
    }
    lines.join("\n")
}

/// Lockfiles, minified bundles, snapshots — files agents never browse and
/// whose "hits" would poison the ranking. Pure function.
pub(crate) fn looks_like_artifact(rel: &str) -> bool {
    const NAMES: &[&str] = &[
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "pubspec.lock",
        "Podfile.lock", "composer.lock", "Gemfile.lock", "flake.lock",
    ];
    let name = rel.rsplit('/').next().unwrap_or(rel);
    if NAMES.iter().any(|n| name.eq_ignore_ascii_case(n)) {
        return true;
    }
    if name.ends_with(".min.js") || name.ends_with(".min.css") || name.ends_with(".map") {
        return true;
    }
    false
}

/// Extract meaningful lowercase search terms from active-work card titles
/// (doing/review/todo). Pure function.
pub(crate) fn card_title_terms(board: &Board) -> Vec<String> {
    const STOP: &[&str] = &[
        "the", "and", "for", "with", "that", "this", "from", "into", "when", "then", "than",
        "you", "your", "are", "not", "but", "one", "two", "our", "his", "her", "its", "via",
        "todo", "fixme", "wip", "some", "all", "any", "new", "add", "use",
    ];
    let mut terms: Vec<String> = Vec::new();
    for card in board.cards.iter() {
        let col = card.column.to_ascii_lowercase();
        if !matches!(col.as_str(), "doing" | "review" | "todo") {
            continue;
        }
        for raw in card.title.split(|c: char| !c.is_alphanumeric()) {
            let t = raw.trim().to_ascii_lowercase();
            if t.len() < 3 || STOP.contains(&t.as_str()) || terms.contains(&t) {
                continue;
            }
            terms.push(t);
            if terms.len() >= 10 {
                return terms;
            }
        }
    }
    terms
}

/// Read-tool-style head: first `lines` lines, ~2k chars/line, 16KB per file —
/// mirroring how agent Read tools actually truncate. UTF-8 safe.
fn read_head(path: &Path, lines: usize) -> String {
    let Ok(content) = std::fs::read_to_string(path) else { return String::new() };
    const FILE_BUDGET: usize = 16_000;
    const LINE_MAX: usize = 2_000;
    let mut budget = FILE_BUDGET;
    let mut out = String::new();
    for line in content.lines().take(lines) {
        let capped = safe_truncate(line, LINE_MAX);
        let cost = capped.len() + 1;
        if cost > budget || out.len() + cost > FILE_BUDGET {
            break;
        }
        out.push_str(capped);
        out.push('\n');
        budget -= cost;
    }
    out
}

/// Byte-length truncation that never lands mid-character.
pub(crate) fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Byte-cap a payload without panicking on UTF-8 char boundaries.
fn capped(text: &str, cap: usize) -> Caps {
    if text.len() <= cap {
        return Caps { text: text.to_string(), capped: false };
    }
    // Trim from the end to a char boundary ≤ cap.
    let mut end = cap;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    Caps { text: text[..end].to_string(), capped: true }
}

struct Caps {
    text: String,
    capped: bool,
}

fn human_bytes(b: u64) -> String {
    if b >= 10_000 {
        format!("{}k", b / 1000)
    } else if b >= 1000 {
        format!("{}.{}k", b / 1000, (b % 1000) / 100)
    } else {
        format!("{}", b)
    }
}

fn flag_usize(args: &[String], flag: &str) -> Option<usize> {
    let idx = args.iter().position(|a| a == flag)?;
    args.get(idx + 1)?.parse::<usize>().ok()
}

// ─── Printing ───────────────────────────────────────────────────────────────

fn print_table(result: &BenchmarkResult, read_lines: usize) {
    let ratio = result.cold_tokens as f64 / result.warm_tokens.max(1) as f64;
    println!(
        "{} {} @ {}",
        style::strong("Token benchmark"),
        style::accent(&result.repo),
        result.commit.as_deref().unwrap_or("no-git")
    );
    println!("cold start (no context file):");
    println!("  listing   {} files · ~{} tokens", result.files_seen, result.cold_listing_tokens);
    println!(
        "  locating  {} terms over {} files · ~{} tokens",
        result.queries.len(),
        result.files_scanned,
        result.cold_locate_tokens
    );
    println!(
        "  reading   {} candidates × {} lines · ~{} tokens",
        result.top_files.len(),
        read_lines,
        result.cold_read_tokens
    );
    println!(
        "  {}   {}",
        style::strong("total"),
        style::warn(format!("~{} tokens", result.cold_tokens))
    );
    if result.warm_available {
        println!(
            "warm start (project_context.md): ~{} tokens ({:.1}% of cold)",
            result.warm_tokens,
            100.0 * result.warm_tokens as f64 / result.cold_tokens.max(1) as f64
        );
        println!(
            "  {} cold payload is {:.1}× the warm read — ~{} extra tokens per session start",
            style::strong("ratio:"),
            ratio,
            style::warn((result.cold_tokens.saturating_sub(result.warm_tokens)).to_string())
        );
    } else {
        println!(
            "warm start: {} — run {} to adopt one",
            style::warn("no context file"),
            style::accent("barkcli context prime")
        );
    }
    for note in &result.notes {
        println!("  {} {}", style::muted("note:"), note);
    }
    println!(
        "{}",
        style::muted(
            "method: deterministic proxy — dir listing → keyword search for active card titles → read top candidates · re-run any repo: `barkcli context benchmark --json`"
        )
    );
}

/// Markdown block for docs/landing claims. Self-describing + dated so the
/// claims stay attributable.
fn print_markdown(result: &BenchmarkResult) {
    let denom = result.cold_tokens.max(1);
    println!("### Context benchmark — {} @ {} ({})", result.repo, result.commit.as_deref().unwrap_or("no-git"), result.date);
    println!();
    if result.warm_available {
        println!(
            "| | cold session start | with project_context.md |",
        );
        println!("|---|---|---|");
        println!(
            "| context payload | ~{} tokens | ~{} tokens ({:.0}%) |",
            result.cold_tokens,
            result.warm_tokens,
            100.0 * result.warm_tokens as f64 / denom as f64
        );
        println!(
            "| breakdown | {} locating + {} reading + {} listing | one verified file |",
            result.cold_locate_tokens,
            result.cold_read_tokens,
            result.cold_listing_tokens
        );
        println!("| ratio | — | cold payload is **{:.1}×** larger |", denom as f64 / result.warm_tokens.max(1) as f64);
        println!();
        println!(
            "Reproduce: `barkcli context benchmark --json` · deterministic proxy: directory listing → keyword search over the active card titles → read top candidates. No LLM measured, no model vendors involved."
        );
    } else {
        println!("No `project_context.md` adopted — run `barkcli context prime`, then re-run.");
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn board_with(cards: &[(&str, &str)]) -> Board {
        let cards_json: Vec<serde_json::Value> = cards
            .iter()
            .map(|(id, col)| {
                serde_json::json!({
                    "id": id,
                    "title": id,
                    "column": col,
                })
            })
            .collect();
        serde_json::from_value(serde_json::json!({
            "title": "b",
            "columns": [
                { "id": "todo", "name": "Todo" },
                { "id": "doing", "name": "Doing" },
                { "id": "review", "name": "Review" },
                { "id": "done", "name": "Done" }
            ],
            "cards": cards_json,
        }))
        .unwrap()
    }

    #[test]
    fn queries_come_from_active_columns_only() {
        let b = board_with(&[
            ("Build the login flow", "doing"),
            ("JWT-based session handling", "todo"),
            ("Add polish pass", "done"),      // excluded
            ("Retire legacy API", "backlog"), // excluded
        ]);
        let terms = card_title_terms(&b);
        assert!(terms.contains(&"login".to_string()));
        assert!(terms.contains(&"flow".to_string()));
        assert!(terms.contains(&"jwt".to_string()) && terms.contains(&"session".to_string()));
        // done/backlog titles never contribute
        assert!(!terms.contains(&"polish".to_string()));
        assert!(!terms.contains(&"legacy".to_string()));
        assert!(!terms.contains(&"the".to_string()));
    }

    #[test]
    fn locate_output_groups_and_ranks() {
        let q = vec!["engine".to_string(), "zebra".to_string()];
        let scored = vec![
            ("src/engine.rs".to_string(), 9u32, vec![0usize]),
            ("docs/engine-notes.md".to_string(), 3u32, vec![0usize]),
        ];
        let out = build_locate_output(&q, &scored);
        // zebra has no hits → no line; engine ranked by hits
        assert!(!out.contains("zebra"));
        let line = out.lines().next().unwrap();
        assert!(line.starts_with("engine → src/engine.rs:9"), "got: {}", line);
        assert!(line.contains("docs/engine-notes.md:3"));
    }

    #[test]
    fn capped_is_utf8_safe_and_flags() {
        let s = "ábc".repeat(50); // 150 bytes, multibyte boundary at 149
        let low = capped(&s, 148);
        assert!(low.capped);
        assert!(s.starts_with(&low.text)); // clean prefix, no panic
        assert!(low.text.len() <= 148);
        let untouched = capped(&s, 10_000);
        assert!(!untouched.capped);
        assert_eq!(untouched.text, s);
    }

    #[test]
    fn human_bytes_is_stable() {
        assert_eq!(human_bytes(999), "999");
        assert_eq!(human_bytes(12_345), "12k");
        assert_eq!(human_bytes(1_234), "1.2k");
    }

    #[test]
    fn lockfiles_and_bundles_are_never_reading_targets() {
        for p in [
            "package-lock.json",
            "web/node_modules/../../Cargo.lock",
            "docs/yarn.lock",
            "app/vendor.libraries.min.js",
            "assets/app.1234.map",
        ] {
            assert!(looks_like_artifact(p), "{}", p);
        }
        assert!(!looks_like_artifact("web/src/components/ContextView.tsx"));
        assert!(!looks_like_artifact("package.json"));
    }

    #[test]
    fn safe_truncate_never_panic_on_multibyte() {
        let s = "字".repeat(5); // each 3 bytes = 15 bytes
        assert_eq!(safe_truncate(&s, 7), "字字"); // 6 bytes, clean boundary
        assert_eq!(safe_truncate(&s, 15), s);
        assert_eq!(safe_truncate("abc", 10), "abc");
    }

    #[test]
    fn read_head_caps_file_and_lines() {
        // Steal a real file with known content shape in this repo for the
        // budget behavior.
        let dir = std::env::current_dir().unwrap();
        let target = dir.join("../Cargo.toml");
        if target.exists() {
            let head = read_head(&target, 3);
            assert!(head.lines().count() <= 3);
        }
    }
}
