//! Living `project_context.md` — the repo's central context file.
//!
//! The file sits at the repo root and is regenerated from tracked evidence
//! (board, sessions, memory tiers, code sidecar, specs) after every agent
//! session. Each section is wrapped in a provenance comment:
//!
//! ```text
//! <!-- ctx:block id="snapshot" src="sessions+cards" updated="2026-10-24T09:41Z" staleness="0.00" -->
//! ```
//!
//! The comment is invisible to the LLM reading the file but parseable by
//! barkcli, which uses it for staleness tracking, blame views and the web
//! heat map. Sections whose body the user hand-edited are preserved on
//! regeneration (hand-edit detection compares against the last auto-generated
//! body hash stored in `.board/context-file.<board>.json`).

pub mod digest;

use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;

/// The context file always lives at the repo root under this name so every
/// agent (Claude Code, Codex, opencode, Cline, Cursor) that already reads
/// project-root markdown picks it up.
pub const FILE_NAME: &str = "project_context.md";

/// Default token budget for the whole file (~input tokens billed each session).
pub const DEFAULT_BUDGET_TOKENS: usize = 4_000;

/// Timestamp format used in provenance stamps.
pub const STAMP_FMT: &str = "%Y-%m-%dT%H:%MZ";

/// Options for one digest run.
#[derive(Debug, Clone, Default)]
pub struct DigestOpts {
    /// Override the persisted token budget for this run (`--budget N`).
    pub budget: Option<usize>,
    /// Record this section id as permanently manual (`--manual <id>`).
    pub manual_add: Option<String>,
    /// Wire CLAUDE.md/AGENTS.md so every agent auto-reads the file.
    pub wire: bool,
    /// Create missing agent files when wiring (default: touch existing only).
    pub create_wires: bool,
    /// Hook/log invocation — suppress CLI reporting.
    pub quiet: bool,
    /// Only run when the file already exists (session-log auto-refresh).
    pub if_exists: bool,
}

// ─── State (`.board/context-file.<board>.json`) ─────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileState {
    pub version: u32,
    /// block id → hash of the last body we auto-generated. If the file's body
    /// hash no longer matches, the user edited it by hand and we must not
    /// overwrite their version.
    #[serde(default)]
    pub generated: HashMap<String, u64>,
    /// Section ids the digest never touches (flagged via `--manual <id>`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub manual: Vec<String>,
    #[serde(default)]
    pub budget_tokens: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_run: Option<String>,
    /// Sections trimmed to fit the budget on the last run.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evicted_last_run: Vec<String>,
    /// Sticky evictions: sections stubbed because the file is over budget.
    /// Stays until the budget is explicitly raised (`--budget`) so a fresh
    /// body can't regrow on the next run and oscillate the file.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evicted: Vec<String>,
    #[serde(default)]
    pub wired_claude: bool,
    #[serde(default)]
    pub wired_agents: bool,
}

pub fn file_path(root: &Path) -> PathBuf {
    root.join(FILE_NAME)
}

pub fn state_path(board_name: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    Ok(board_dir.join(format!("context-file.{}.json", board_name)))
}

pub fn read_state(board_name: &str) -> Result<FileState> {
    let path = state_path(board_name)?;
    if !path.exists() {
        return Ok(FileState {
            version: 1,
            budget_tokens: DEFAULT_BUDGET_TOKENS,
            ..Default::default()
        });
    }
    let content = std::fs::read_to_string(&path).context("failed to read context-file state")?;
    Ok(serde_json::from_str::<FileState>(&content).unwrap_or(FileState {
        version: 1,
        budget_tokens: DEFAULT_BUDGET_TOKENS,
        ..Default::default()
    }))
}

pub fn write_state(board_name: &str, state: &FileState) -> Result<()> {
    let path = state_path(board_name)?;
    let json = serde_json::to_string_pretty(state).context("failed to serialize context-file state")?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).context("failed to write tmp context-file state")?;
    std::fs::rename(&tmp, &path).context("failed to rename context-file state")?;
    Ok(())
}

pub fn project_root() -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    board_dir
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| anyhow::anyhow!("cannot determine project root"))
}

// ─── Tokens / hashing ───────────────────────────────────────────────────────

/// Token estimate for a slice of markdown (~4 chars/token for code+English
/// prose). Good enough for budgeting without a tokenizer dependency.
pub fn estimate_tokens(text: &str) -> usize {
    const CHARS_PER_TOKEN: usize = 4;
    (text.chars().count() + CHARS_PER_TOKEN - 1) / CHARS_PER_TOKEN
}

/// Cheap change-detection hash for a block body.
pub fn hash_body(body: &[String]) -> u64 {
    let mut hasher = DefaultHasher::new();
    for line in body {
        line.hash(&mut hasher);
    }
    hasher.finish()
}

// ─── Block model ────────────────────────────────────────────────────────────

/// Provenance / freshness metadata for one block (the HTML comment).
#[derive(Debug, Clone)]
pub struct BlockMeta {
    pub id: String,
    pub manual: bool,
    pub src: String,
    /// 0.0 fresh … 1.0 certainly wrong (drift between text and its evidence).
    pub staleness: f32,
    pub updated: String,
}

/// One `## Section` inside the context file.
#[derive(Debug, Clone)]
pub struct Block {
    pub meta: BlockMeta,
    /// Heading line including its `##` prefix.
    pub heading: String,
    /// Body lines under the heading (trailing blank lines trimmed).
    pub body: Vec<String>,
}

/// Parsed context file: free prose before the first block plus the blocks.
#[derive(Debug, Clone, Default)]
pub struct ParsedFile {
    pub preamble: Vec<String>,
    pub blocks: Vec<Block>,
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/// Parse `<!-- ctx:block id="x" src="y" staleness="0.4" updated="..." manual="true" -->`.
pub fn parse_block_comment(line: &str) -> Option<BlockMeta> {
    let start = line.find("<!-- ctx:block ")?;
    let rel_end = line[start..].find("-->")?;
    let attrs = &line[start + "<!-- ctx:block ".len()..start + rel_end];

    let mut id: Option<String> = None;
    let mut manual = false;
    let mut src = String::new();
    let mut staleness = 0.0f32;
    let mut updated = String::new();

    for part in attrs.split_whitespace() {
        let Some((k, v)) = part.split_once('=') else { continue };
        let v = v.trim_matches('"');
        match k {
            "id" => id = Some(v.to_string()),
            "manual" => manual = v == "true",
            "src" => src = v.to_string(),
            "staleness" => staleness = v.parse().unwrap_or(0.0),
            "updated" => updated = v.to_string(),
            _ => {}
        }
    }
    Some(BlockMeta {
        id: id?,
        manual,
        src,
        staleness,
        updated,
    })
}

/// Parse a context file into its preamble and provenance-stamped blocks.
/// Lines are preserved verbatim; the parser never reformats.
pub fn parse(content: &str) -> ParsedFile {
    let mut out = ParsedFile::default();
    let lines: Vec<&str> = content.lines().collect();

    let mut i = 0usize;
    while i < lines.len() && parse_block_comment(lines[i]).is_none() {
        out.preamble.push(lines[i].to_string());
        i += 1;
    }
    // Trim trailing blank lines from the preamble.
    while out
        .preamble
        .last()
        .map(|l| l.trim().is_empty())
        .unwrap_or(false)
    {
        out.preamble.pop();
    }

    while i < lines.len() {
        // Skip prose between blocks (keeps user comments/comments out of model).
        while i < lines.len() && parse_block_comment(lines[i]).is_none() {
            i += 1;
        }
        if i >= lines.len() {
            break;
        }
        let meta = parse_block_comment(lines[i]).expect("checked above");
        i += 1;

        let mut heading = String::new();
        while i < lines.len() && lines[i].trim().is_empty() {
            i += 1;
        }
        if i < lines.len() && lines[i].trim_start().starts_with('#') {
            heading = lines[i].trim_end().to_string();
            i += 1;
        }

        let mut body: Vec<String> = Vec::new();
        while i < lines.len() && parse_block_comment(lines[i]).is_none() {
            body.push(lines[i].to_string());
            i += 1;
        }
        // Trim blank edges (heading sits directly under the comment).
        while body
            .last()
            .map(|l| l.trim().is_empty())
            .unwrap_or(false)
        {
            body.pop();
        }
        while body
            .first()
            .map(|l| l.trim().is_empty())
            .unwrap_or(false)
        {
            body.remove(0);
        }
        out.blocks.push(Block { meta, heading, body });
    }
    out
}

// ─── Rendering ──────────────────────────────────────────────────────────────

impl Block {
    pub fn render(&self) -> String {
        let mut s = String::new();
        s.push_str(&format!(
            "<!-- ctx:block id=\"{}\" src=\"{}\" updated=\"{}\" staleness=\"{:.2}\"{} -->\n",
            self.meta.id,
            self.meta.src,
            self.meta.updated,
            self.meta.staleness,
            if self.meta.manual { " manual=\"true\"" } else { "" }
        ));
        s.push_str(self.heading.trim_end());
        s.push('\n');
        for line in &self.body {
            s.push_str(line.trim_end());
            s.push('\n');
        }
        s
    }
}

pub fn render_file(parsed: &ParsedFile) -> String {
    let mut out = String::new();
    for line in &parsed.preamble {
        out.push_str(line.trim_end());
        out.push('\n');
    }
    for block in &parsed.blocks {
        out.push('\n');
        out.push_str(&block.render());
    }
    out
}

// ─── Merge (section-diff + budget) ──────────────────────────────────────────

/// Outcome of one merge pass, for CLI reporting.
#[derive(Debug, Default, Clone)]
pub struct MergeReport {
    pub rewritten: Vec<String>,
    pub preserved_manual: Vec<String>,
    pub added: Vec<String>,
    pub evicted: Vec<String>,
    pub total_tokens: usize,
    pub flagged_stale: Vec<(String, f32)>,
    /// True when the run produced a byte-identical file (nothing written).
    pub unchanged: bool,
}

/// Fresh section produced by the generator (`digest::generate_sections`).
#[derive(Debug, Clone)]
pub struct GeneratedSection {
    pub id: &'static str,
    pub title: &'static str,
    pub src: String,
    pub staleness: f32,
    pub body: Vec<String>,
}

impl GeneratedSection {
    /// Eviction priority — higher = dropped first when over budget. `active`
    /// and the verify footer never go; speculative detail goes first.
    pub fn evict_rank(&self) -> i32 {
        match self.id {
            "specs" => 6,
            "sessions" => 5,
            "architecture" => 4,
            "decisions" => 3,
            "conventions" => 2,
            "snapshot" => 1,
            "active" => 0,
            _ => 7,
        }
    }

    /// Sections the budget may trim (stub + pointer left behind).
    pub const EVICTABLE: [&'static str; 6] = [
        "specs",
        "sessions",
        "architecture",
        "decisions",
        "conventions",
        "snapshot",
    ];
}

/// Merge freshly generated sections into the existing parsed file:
/// 1. `manual` blocks (flagged in-file or in state) are never touched.
/// 2. A generated block the user hand-edited (body-hash mismatch) keeps their
///    text; the fresh body is pinned so future runs keep preserving it.
/// 3. Everything else is replaced by the fresh body.
/// 4. Over `state.budget_tokens`, evictable blocks are trimmed in evict order.
pub fn merge(
    parsed: &mut ParsedFile,
    fresh: Vec<GeneratedSection>,
    state: &mut FileState,
    now_stamp: &str,
) -> MergeReport {
    let mut report = MergeReport::default();
    if state.budget_tokens == 0 {
        state.budget_tokens = DEFAULT_BUDGET_TOKENS;
    }

    // Seed / normalize the file preamble.
    let has_header = parsed
        .preamble
        .first()
        .map(|l| l.starts_with("# "))
        .unwrap_or(false)
        && parsed.preamble.iter().any(|l| l.contains("Auto-maintained by barkcli"));
    if !has_header {
        parsed.preamble = header_lines().into_iter().map(|s| s.to_string()).collect();
    }

    // Partition existing blocks: managed ids (generated this run or before) →
    // kept in order; anything else is user block prose preserved verbatim.
    let mut existing: HashMap<String, Block> = HashMap::new();
    let mut unknown_blocks: Vec<Block> = Vec::new();
    for block in std::mem::take(&mut parsed.blocks) {
        if state.generated.contains_key(&block.meta.id) || fresh.iter().any(|f| f.id == block.meta.id) {
            existing.insert(block.meta.id.clone(), block);
        } else {
            unknown_blocks.push(block);
        }
    }

    for sec in &fresh {
        let fresh_block = Block {
            meta: BlockMeta {
                id: sec.id.to_string(),
                manual: false,
                src: sec.src.clone(),
                staleness: sec.staleness,
                updated: now_stamp.to_string(),
            },
            heading: format!("## {}", sec.title),
            body: sec.body.clone(),
        };

        // 1) manual-flagged (state list, in-file comment, or seeded) → preserve.
        let in_file_manual = existing.get(sec.id).map(|b| b.meta.manual).unwrap_or(false);
        if in_file_manual || state.manual.iter().any(|m| m == sec.id) {            match existing.get_mut(sec.id) {
                Some(b) => {
                    b.meta.manual = true;
                }
                None => {
                    let seed = Block {
                        meta: BlockMeta {
                            id: sec.id.to_string(),
                            manual: true,
                            src: format!("{}+manual", sec.src),
                            staleness: 0.0,
                            updated: now_stamp.to_string(),
                        },
                        heading: format!("## {} (manual)", sec.title),
                        body: vec![
                            "_Your notes — the digest preserves this section verbatim._".into()
                        ],
                    };
                    existing.insert(sec.id.to_string(), seed);
                }
            }
            report.preserved_manual.push(sec.id.to_string());
            continue;
        }

        // 1.5) sticky eviction — the file is over budget and this section was
        // trimmed. Keep the stub; regenerating a fresh body here would regrow
        // the file and oscillate every run.
        if state.evicted.iter().any(|e| e == sec.id) {
            match existing.get_mut(sec.id) {
                Some(_b) => {} // stub stays as-is on disk
                None => {
                    // State lost / first run after eviction: seed the stub.
                    let seed = Block {
                        meta: BlockMeta {
                            id: sec.id.to_string(),
                            manual: false,
                            src: sec.src.clone(),
                            staleness: 0.0,
                            updated: now_stamp.to_string(),
                        },
                        heading: format!("## {}", sec.title),
                        body: vec![evicted_stub_body(state.budget_tokens)],
                    };
                    existing.insert(sec.id.to_string(), seed);
                    state.evicted_last_run.push(sec.id.to_string());
                }
            }
            continue;
        }

        // 2) user hand-edited a generated body → preserve, pin forever.
        let user_edited = existing.get(sec.id).map(|b| {
            state
                .generated
                .get(sec.id)
                .map(|h| *h != hash_body(&b.body))
                .unwrap_or(false)
        });
        if user_edited == Some(true) {
            existing.get_mut(sec.id).unwrap().meta.manual = true;
            state.manual.push(sec.id.to_string());
            report.preserved_manual.push(sec.id.to_string());
            continue;
        }

        // 3) replace with fresh content.
        let unchanged = existing
            .get(sec.id)
            .map(|b| b.body == sec.body)
            .unwrap_or(false);
        if unchanged {
            // Content-idempotence: an unchanged section keeps its last-change
            // stamp so no-op digests never dirty the file (and never trip
            // file-watcher loops). Only src/staleness refresh in place — they
            // are digest's *read* of the evidence, not authored content.
            let b = existing.get_mut(sec.id).unwrap();
            b.meta.src = fresh_block.meta.src;
            b.meta.staleness = fresh_block.meta.staleness;
        } else {
            if existing.contains_key(sec.id) {
                report.rewritten.push(sec.id.to_string());
            } else {
                report.added.push(sec.id.to_string());
            }
            existing.insert(sec.id.to_string(), fresh_block);
        }
        state.generated.insert(sec.id.to_string(), hash_body(&sec.body));
    }

    // Assemble in generation order, then preserved user blocks.
    let mut blocks: Vec<Block> = Vec::new();
    for sec in &fresh {
        if let Some(b) = existing.remove(sec.id) {
            blocks.push(b);
        }
    }
    let mut leftovers: Vec<Block> = existing.into_values().collect();
    leftovers.sort_by(|a, b| a.meta.id.cmp(&b.meta.id));
    blocks.extend(leftovers);
    blocks.extend(unknown_blocks.drain(..));
    parsed.blocks = blocks;

    // Re-flag manual from state (covers imports from other states etc.).
    for b in parsed.blocks.iter_mut() {
        if state.manual.iter().any(|m| *m == b.meta.id) {
            b.meta.manual = true;
        }
    }

    // ── Budget eviction ──
    report.total_tokens = estimate_tokens(&render_file(parsed));
    let mut evictable: Vec<&'static str> = fresh
        .iter()
        .filter(|s| GeneratedSection::EVICTABLE.contains(&s.id))
        .filter(|s| {
            parsed
                .blocks
                .iter()
                .any(|b| b.meta.id == s.id && !b.meta.manual)
        })
        .map(|s| s.id)
        .collect();
    evictable.sort_by_key(|id| {
        -fresh
            .iter()
            .find(|s| s.id == *id)
            .map(|s| s.evict_rank())
            .unwrap_or(-1)
    });

    let floor = state.budget_tokens.max(400);
    while report.total_tokens > floor {
        let Some(victim) = evictable.first().copied() else { break };
        evictable.remove(0);
        if let Some(b) = parsed.blocks.iter_mut().find(|b| b.meta.id == victim) {
            b.body = vec![evicted_stub_body(state.budget_tokens)];
            b.meta.staleness = 0.0;
            b.meta.updated = now_stamp.to_string();
            state.generated.remove(victim);
            if !state.evicted.iter().any(|e| e == victim) {
                state.evicted.push(victim.to_string());
            }
            if !report.evicted.iter().any(|e| e == victim) {
                report.evicted.push(victim.to_string());
            }
        }
        report.total_tokens = estimate_tokens(&render_file(parsed));
    }
    // Report the full current trim set (this run's new evictions plus any
    // still-stubbed sections from earlier runs).
    report.evicted = state.evicted.clone();
    state.evicted_last_run = state.evicted.clone();

    // Flag drifted sections (threshold 0.4).
    for b in &parsed.blocks {
        if !b.meta.manual && b.meta.staleness >= 0.4 {
            report.flagged_stale.push((b.meta.id.clone(), b.meta.staleness));
        }
    }
    report
}

/// Stable stub body for a budget-evicted section. Content is deterministic
/// per budget so sticky evictions stay byte-stable across runs.
fn evicted_stub_body(budget: usize) -> String {
    format!(
        "_Evicted to fit the {} token budget — raise it with `barkcli context digest --budget N` to restore._",
        budget
    )
}

fn header_lines() -> Vec<&'static str> {    vec![
        "# project_context.md",
        "",
        "Auto-maintained by barkcli (`barkcli context digest`) — regenerated from tracked work",
        "(board, agent sessions, memory, specs, code map) so agent sessions start warm instead of",
        "re-exploring the repository from scratch. Sections marked `manual=\"true\"` — or any section",
        "you edit by hand — are always preserved verbatim.",
        "",
        "Read this file FIRST when starting a session; drill into only what it points at.",
    ]
}

// ─── Distribution wiring (CLAUDE.md / AGENTS.md) ────────────────────────────

/// Make every agent read the file automatically. Idempotent: appends the
/// Claude Code `@project_context.md` import to CLAUDE.md and a pointer line
/// to AGENTS.md. Only touches files that already exist unless `create_missing`.
pub fn wire_agent_files(
    root: &Path,
    state: &mut FileState,
    create_missing: bool,
) -> Result<(bool, bool)> {
    const WIRE_MARKER: &str = "<!-- barkcli-project-context -->";

    let claude = root.join("CLAUDE.md");
    if !state.wired_claude || !needle_present(&claude, WIRE_MARKER) {
        state.wired_claude = append_marker_line(
            &claude,
            "@project_context.md",
            "# barkcli context (auto-maintained — `barkcli context digest`)",
            WIRE_MARKER,
            create_missing,
        )?;
    }
    let agents = root.join("AGENTS.md");
    if !state.wired_agents || !needle_present(&agents, WIRE_MARKER) {
        state.wired_agents = append_marker_line(
            &agents,
            "- `project_context.md` — auto-maintained central project context (barkcli). Read before exploring the codebase.",
            "# barkcli context (auto-maintained — `barkcli context digest`)",
            WIRE_MARKER,
            create_missing,
        )?;
    }
    Ok((state.wired_claude, state.wired_agents))
}

fn needle_present(path: &Path, needle: &str) -> bool {
    path.exists() && std::fs::read_to_string(path).map(|c| c.contains(needle)).unwrap_or(false)
}

fn append_marker_line(
    path: &Path,
    line: &str,
    marker: &str,
    wire_marker: &str,
    create_missing: bool,
) -> Result<bool> {
    if !path.exists() {
        if !create_missing {
            return Ok(false);
        }
        std::fs::write(path, format!("{}\n{}\n{}\n{}\n", marker, wire_marker, line, "")).with_context(
            || format!("failed to write {}", path.display()),
        )?;
        return Ok(true);
    }
    let existing = std::fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    if existing.contains(wire_marker) {
        return Ok(true);
    }
    let mut content = existing;
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content.push('\n');
    content.push_str(marker);
    content.push('\n');
    content.push_str(wire_marker);
    content.push('\n');
    content.push_str(line);
    content.push('\n');
    std::fs::write(path, content).with_context(|| format!("failed to write {}", path.display()))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_file() -> String {
        let mut s = String::new();
        s.push_str("Auto-maintained by barkcli (`barkcli context digest`) — regenerated.\n");
        s.push('\n');
        s.push_str("<!-- ctx:block id=\"snapshot\" src=\"sessions+cards\" updated=\"2026-10-24T09:41Z\" staleness=\"0.00\" -->\n");
        s.push_str("## Snapshot\n");
        s.push_str("\n");
        s.push_str("- 12 cards (todo 4 / doing 2 / done 12)\n");
        s.push('\n');
        s.push_str("<!-- ctx:block id=\"team\" src=\"user\" updated=\"2026-10-20T10:00Z\" staleness=\"0.00\" manual=\"true\" -->\n");
        s.push_str("## Team conventions (manual)\n");
        s.push_str("\n");
        s.push_str("- hand-written rule that must survive\n");
        s
    }

    #[test]
    fn parses_blocks_and_preamble() {
        let parsed = parse(&sample_file());
        assert_eq!(parsed.blocks.len(), 2);
        assert_eq!(parsed.preamble.first().map(|s| s.as_str()), Some("Auto-maintained by barkcli (`barkcli context digest`) — regenerated."));
        let snapshot = &parsed.blocks[0];
        assert_eq!(snapshot.meta.id, "snapshot");
        assert_eq!(snapshot.heading, "## Snapshot");
        assert_eq!(snapshot.body, vec!["- 12 cards (todo 4 / doing 2 / done 12)"]);
        let team = &parsed.blocks[1];
        assert_eq!(team.meta.id, "team");
        assert!(team.meta.manual);
        assert!(team.body.iter().any(|l| l.contains("hand-written rule")));
    }

    #[test]
    fn staleness_and_manual_attrs_parse() {
        let m = parse_block_comment("<!-- ctx:block id=\"arch\" src=\"scan\" updated=\"x\" staleness=\"0.41\" manual=\"true\" -->").unwrap();
        assert_eq!(m.id, "arch");
        assert!((m.staleness - 0.41).abs() < 1e-6);
        assert!(m.manual);
    }

    #[test]
    fn render_parses_roundtrip() {
        let parsed = parse(&sample_file());
        let rendered = render_file(&parsed);
        let reparsed = parse(&rendered);
        assert_eq!(reparsed.blocks.len(), 2);
        assert_eq!(reparsed.blocks[0].meta.id, "snapshot");
        assert_eq!(reparsed.blocks[0].body, parsed.blocks[0].body);
        assert!(reparsed.blocks[1].meta.manual);
    }

    #[test]
    fn manual_block_survives_merge() {
        let mut parsed = parse(&sample_file());
        let mut state = FileState { version: 1, budget_tokens: DEFAULT_BUDGET_TOKENS, ..Default::default() };
        let fresh = vec![GeneratedSection {
            id: "snapshot",
            title: "Snapshot",
            src: "test".into(),
            staleness: 0.1,
            body: vec!["- fresh snapshot body".into()],
        }];
        let report = merge(&mut parsed, fresh, &mut state, "2026-10-25T00:00Z");
        // "team" block stays (user block prose preserved).
        let team = parsed.blocks.iter().find(|b| b.meta.id == "team").expect("team block kept");
        assert!(team.body.iter().any(|l| l.contains("hand-written rule")));
        assert!(team.meta.manual);
        // bodies raw (no manual flag in disc) — merge re-flags only if in state; "team" id not
        // generated this run so carried as unknown block verbatim.
        assert!(report.rewritten.contains(&"snapshot".to_string()));
        let snap = parsed.blocks.iter().find(|b| b.meta.id == "snapshot").unwrap();
        assert_eq!(snap.body, vec!["- fresh snapshot body".to_string()]);
    }

    #[test]
    fn hand_edited_generated_body_is_preserved_and_pinned() {
        let mut state = FileState { version: 1, budget_tokens: DEFAULT_BUDGET_TOKENS, ..Default::default() };
        let sec = || GeneratedSection {
            id: "snapshot",
            title: "Snapshot",
            src: "test".into(),
            staleness: 0.0,
            body: vec!["- Original snapshot A".into(), "- newer line".into()],
        };
        let mut parsed = ParsedFile::default();
        let _ = merge(&mut parsed, vec![sec()], &mut state, "2026-10-25T00:00Z");
        // User edits the generated body on disk afterwards.
        let mut edited = parse(&render_file(&parsed));
        let b = edited.blocks.iter_mut().find(|b| b.meta.id == "snapshot").unwrap();
        assert!(b.meta.manual == false);
        b.body = vec!["- User hand note in snapshot".into()];
        let report = merge(&mut edited, vec![sec()], &mut state, "2026-10-25T01:00Z");
        assert!(report.preserved_manual.contains(&"snapshot".to_string()));
        let b = edited.blocks.iter().find(|b| b.meta.id == "snapshot").unwrap();
        assert!(b.body.iter().any(|l| l.contains("User hand note")));
        assert!(b.meta.manual);
        // ...and it stays preserved on the next run too.
        let report2 = merge(&mut edited, vec![sec()], &mut state, "2026-10-25T02:00Z");
        assert!(report2.preserved_manual.contains(&"snapshot".to_string()));
    }

    #[test]
    fn budget_eviction_drops_lowest_priority_first() {
        // Each section body ≈ 540 tokens; stub ≈ 30. Budget 950 fits the
        // header + active + 4 stubs but no full section pair.
        let fill = || vec!["lorem ipsum filler body line token filler token filler ".repeat(40)];
        let fresh = vec![
            GeneratedSection { id: "snapshot", title: "Snapshot", src: "t".into(), staleness: 0.0, body: fill() },
            GeneratedSection { id: "active", title: "Active now", src: "t".into(), staleness: 0.0, body: fill() },
            GeneratedSection { id: "specs", title: "Specs", src: "t".into(), staleness: 0.0, body: fill() },
            GeneratedSection { id: "sessions", title: "Recent sessions", src: "t".into(), staleness: 0.0, body: fill() },
        ];
        let mut parsed = ParsedFile::default();
        let mut state = FileState { version: 1, budget_tokens: 950, ..Default::default() };
        let report = merge(&mut parsed, fresh, &mut state, "2026-10-25T00:00Z");

        // Eviction order: worst rank first — specs(6) → sessions(5) → snapshot(1).
        assert_eq!(report.evicted.join(","), "specs,sessions,snapshot", "evicted: {:?}", report.evicted);
        // zero-rank sections are never evictable — active survives intact…
        assert!(parsed.blocks.iter().any(|b| b.meta.id == "active" && !b.body[0].contains("Evicted")));
        // …and first-evicted sections are stubbed in place.
        for id in ["specs", "sessions", "snapshot"] {
            let b = parsed.blocks.iter().find(|b| b.meta.id == id).unwrap();
            assert!(b.body[0].contains("Evicted to fit"), "section {} not stubbed: {:?}", id, b.body);
        }
        assert!(state.generated.contains_key("active"), "surviving sections stay generated: {:?}", state.generated.keys());
        assert!(report.evicted.iter().all(|e| !state.generated.contains_key(e.as_str())));
    }

    #[test]
    fn eviction_is_sticky_across_runs() {
        let fill = || vec!["lorem ipsum filler body line token filler token filler ".repeat(40)];
        let fresh = vec![
            GeneratedSection { id: "snapshot", title: "Snapshot", src: "t".into(), staleness: 0.0, body: fill() },
            GeneratedSection { id: "active", title: "Active now", src: "t".into(), staleness: 0.0, body: fill() },
            GeneratedSection { id: "specs", title: "Specs", src: "t".into(), staleness: 0.0, body: fill() },
            GeneratedSection { id: "sessions", title: "Recent sessions", src: "t".into(), staleness: 0.0, body: fill() },
        ];
        let mut parsed = ParsedFile::default();
        let mut state = FileState { version: 1, budget_tokens: 950, ..Default::default() };
        let r1 = merge(&mut parsed, fresh.clone(), &mut state, "t1");
        assert_eq!(r1.evicted.join(","), "specs,sessions,snapshot");
        let file1 = render_file(&parsed);

        // Second run with the same inputs (different stamp): evicted sections
        // must stay stubbed — no regrowth — and everything else byte-stable.
        let r2 = merge(&mut parsed, fresh.clone(), &mut state, "t2");
        assert!(r2.rewritten.is_empty());
        let file2 = render_file(&parsed);
        assert_eq!(file1, file2, "sticky eviction must render identically across runs");
        let specs = parsed.blocks.iter().find(|b| b.meta.id == "specs").unwrap();
        assert!(specs.body[0].contains("Evicted to fit"), "still stubbed: {:?}", specs.body);
        // State carries the persistent trim set.
        assert_eq!(state.evicted.join(","), "specs,sessions,snapshot");
    }

    #[test]
    fn token_estimate_is_reasonable() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("abcd"), 1);
        assert!(estimate_tokens("x".repeat(400).as_str()) >= 95);
    }
}
