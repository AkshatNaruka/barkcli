//! Context assembly for one attempt: instruction layers, skills, and a budget.
//!
//! Claude Code builds its prompt from a hierarchy of instruction files and
//! loads skills lazily instead of pasting every body. The old runner did the
//! opposite: it concatenated matched skills, refused to launch once the prompt
//! crossed 120 KB, and had no idea what it had produced. Big repos silently
//! lost their project rules.
//!
//! This module assembles the same information on a token budget:
//!
//! 1. **Instruction layers** — managed policy, `project_context.md`,
//!    `AGENTS.md`/`CLAUDE.md` (project root + ancestors), `.board/rules/*.md`,
//!    and subtree rules next to the files being touched. HTML comments are
//!    stripped: they are authoring notes, not instructions.
//! 2. **Skills** — the top match keeps its full body; the rest become an index
//!    of `id — description — absolute path`, with bodies materialised into the
//!    session directory (never the worktree).
//! 3. **Budget** — default 8k tokens (~32 KB). Trimming drops, in order:
//!    subtree rules, the skill index, extra context files, board rules, agent
//!    files, then `project_context.md`. The task, its acceptance criteria, the
//!    branch and the retry verdict are never dropped.
//!
//! Every packet carries an id and is written to `context.json` next to
//! `prompt.md`, so a prompt can be reproduced and diffed after the fact.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::agent::queue::{FileContext, TaskRequest};
use crate::skills::registry::MatchContext;
use crate::skills::SkillRegistry;

/// Default per-attempt context budget, in tokens (~4 bytes/token).
pub const DEFAULT_BUDGET_TOKENS: usize = 8_000;

/// Rough bytes-per-token ratio used for budgeting. Deliberately pessimistic:
/// it trims a little early rather than overflowing a backend's argument limit.
pub const CHARS_PER_TOKEN: usize = 4;

/// Last-resort ceiling for the single CLI argument. Individual arguments are
/// capped well below `ARG_MAX`, and the budget keeps us far under this; the
/// cap only stops a pathological board card from breaking a spawn.
pub const HARD_MAX_BYTES: usize = 100_000;

// Drop priorities: a *higher* number is dropped *earlier*.
const P_SUBTREE: u8 = 50;
const P_SKILL_INDEX: u8 = 40;
const P_SKILL_BODY: u8 = 30;
const P_CONTEXT_FILE: u8 = 20;
// Code-index evidence is a fetch hint, not an instruction: it outlives the
// generic file list (a ranked range is worth more than a path guess) but is
// dropped before the project's own rules.
const P_CODE_INDEX: u8 = 18;
const P_BOARD_RULES: u8 = 15;
const P_AGENT_FILE: u8 = 10;
const P_PROJECT_CONTEXT: u8 = 5;
const P_POLICY: u8 = 4;

/// Wall-clock budget for one code-index question. Generous enough for a cold
/// index of a mid-size repo, small enough that a hung binary cannot stall a
/// spawn (the attempt proceeds without the section).
const CODEX_INDEX_TIMEOUT_SECS: u64 = 20;

const IDENTITY: &str = "\
# Identity and Operational Directives

You are an autonomous engineering agent managed by barkcli.
Your task is to satisfy the acceptance criteria with clean, verified code.

## Core Instructions

1. Inspect the designated files and symbols before modifying them.
2. Make the minimal clean change that satisfies the acceptance criteria.
3. Run the project's verification (tests, lint, build) and fix what you broke.
4. Commit your work on the task branch with a clear message.
5. Report back with a summary, files changed, commit SHA, test evidence, and an
   acceptance-criteria map (each criterion → met/how).

";

const CONTRACT: &str = "\
## Session contract

- Work entirely inside this checkout.
- Commit your work when done.
- The supervisor re-runs the project's tests after you exit; only a passing gate merges.
";

/// Knobs for one packet. `Default` builds a packet with no project root, which
/// is what unit tests and callers without a checkout want.
#[derive(Debug, Default)]
pub struct PacketOptions<'a> {
    /// Repository root the instruction layers are read from.
    pub project_root: Option<&'a Path>,
    /// Session directory that receives `skills/` and `context.json`.
    pub session_dir: Option<&'a Path>,
    /// Verdict from the previous attempt, injected last for retry runs.
    pub verdict: Option<&'a str>,
    /// 1-based attempt number (used in the retry heading and the packet id).
    pub attempt: usize,
    /// Token budget; `0` falls back to [`DEFAULT_BUDGET_TOKENS`].
    pub budget_tokens: usize,
    /// Include `project_context.md` / `AGENTS.md` / rules.
    pub instruction_layers: bool,
    /// Include matched skills.
    pub skill_context: bool,
    /// Strip HTML comments from instruction layers.
    pub strip_comments: bool,
    /// Override the managed policy path (tests).
    pub policy_path: Option<PathBuf>,
    /// `leantoken` binary to ask which ranges the task touches (None = off).
    pub code_index_bin: Option<PathBuf>,
    /// Token budget for that request.
    pub code_index_budget: usize,
    /// Paste the returned source instead of only pointing at ranges.
    pub code_index_snippets: bool,
    /// Extra paths or patterns excluded from code index evidence.
    pub code_index_blacklist: Vec<String>,
}

impl<'a> PacketOptions<'a> {
    /// Defaults with instruction layers and skills on, comment stripping on.
    pub fn new(project_root: &'a Path) -> Self {
        Self {
            project_root: Some(project_root),
            attempt: 1,
            budget_tokens: DEFAULT_BUDGET_TOKENS,
            instruction_layers: true,
            skill_context: true,
            strip_comments: true,
            ..Self::default()
        }
    }

    pub fn with_session_dir(mut self, dir: &'a Path) -> Self {
        self.session_dir = Some(dir);
        self
    }

    pub fn with_verdict(mut self, verdict: Option<&'a str>) -> Self {
        self.verdict = verdict;
        self
    }

    pub fn with_attempt(mut self, attempt: usize) -> Self {
        self.attempt = attempt;
        self
    }

    pub fn with_budget(mut self, tokens: usize) -> Self {
        self.budget_tokens = tokens;
        self
    }

    pub fn with_code_index_blacklist(mut self, list: Vec<String>) -> Self {
        self.code_index_blacklist = list;
        self
    }
}

/// One block of prompt text with a drop priority.
#[derive(Debug, Clone)]
struct Piece {
    name: String,
    text: String,
    priority: u8,
    trimmable: bool,
}

/// A heading plus the pieces rendered under it. A group whose pieces were all
/// dropped renders no heading at all.
#[derive(Debug, Clone)]
struct Group {
    heading: String,
    idx: Vec<usize>,
}

/// One instruction file that made it into the packet.
#[derive(Debug, Clone)]
struct Layer {
    label: String,
    path: String,
    body: String,
    priority: u8,
}

/// A skill the packet referenced, and how.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkillRef {
    pub id: String,
    /// `body` (full text in the prompt) or `index` (pointer only).
    pub mode: String,
    /// Where the body was materialised, when it was.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// Per-piece accounting in the manifest.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PacketSection {
    pub name: String,
    pub bytes: usize,
    /// `false` when the budget forced this section out.
    pub kept: bool,
}

/// The assembled prompt plus everything needed to reproduce it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPacket {
    /// `ctx-<hex>`, derived from task, attempt, branch and prompt bytes.
    pub id: String,
    pub bytes: usize,
    pub tokens_est: usize,
    pub budget_tokens: usize,
    pub attempt: usize,
    pub sections: Vec<PacketSection>,
    /// Names of sections the budget removed, in drop order.
    pub dropped: Vec<String>,
    /// Instruction files that were read, relative to the project root.
    pub instructions: Vec<String>,
    pub skills: Vec<SkillRef>,
    /// Code-index ranges included in the prompt, when one answered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code_index: Option<crate::harness::leantoken::Evidence>,
    /// True when even the hard cap had to cut text.
    #[serde(default)]
    pub truncated: bool,
    #[serde(skip)]
    pub prompt: String,
}

impl ContextPacket {
    /// Write `context.json` beside the prompt so the packet is auditable.
    pub fn write_manifest(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json).with_context(|| format!("failed to write {}", path.display()))
    }

    /// Human one-liner: `28.9 KB · ~7.2k tokens · 3 dropped`.
    pub fn summary(&self) -> String {
        let mut s = format!(
            "{} · ~{:.1}k tokens",
            compact_bytes(self.bytes),
            self.tokens_est as f64 / 1000.0
        );
        if !self.dropped.is_empty() {
            s.push_str(&format!(" · {} dropped", self.dropped.len()));
        }
        if self.truncated {
            s.push_str(" · truncated");
        }
        s
    }
}

fn compact_bytes(bytes: usize) -> String {
    if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{}B", bytes)
    }
}

/// Build a packet, loading the project's skill registry.
pub fn build(task: &TaskRequest, branch: &str, opts: &PacketOptions<'_>) -> ContextPacket {
    let registry = SkillRegistry::load_all(None).ok();
    build_with_registry(task, branch, opts, registry.as_ref())
}

/// Build a packet against an explicit registry (tests, callers that already
/// loaded one).
pub fn build_with_registry(
    task: &TaskRequest,
    branch: &str,
    opts: &PacketOptions<'_>,
    registry: Option<&SkillRegistry>,
) -> ContextPacket {
    let root = opts.project_root.unwrap_or_else(|| Path::new("."));
    let budget_tokens = if opts.budget_tokens == 0 {
        DEFAULT_BUDGET_TOKENS
    } else {
        opts.budget_tokens
    };

    let mut pieces: Vec<Piece> = Vec::new();
    let mut groups: Vec<Group> = Vec::new();
    let mut instructions: Vec<String> = Vec::new();
    let mut skills: Vec<SkillRef> = Vec::new();

    // ── 0. code-index evidence (optional, best-effort) ──
    // Asked before the task is rendered: the index wants the task text, and a
    // slow or missing index must not change the shape of anything else.
    let code_index = opts.code_index_bin.as_deref().and_then(|bin| {
        let query = task_query(task);
        let timeout = std::time::Duration::from_secs(CODEX_INDEX_TIMEOUT_SECS);
        match crate::harness::leantoken::evidence_with_blacklist(
            bin,
            root,
            &query,
            if opts.code_index_budget == 0 {
                crate::harness::leantoken::DEFAULT_BUDGET_TOKENS
            } else {
                opts.code_index_budget
            },
            timeout,
            &opts.code_index_blacklist,
        ) {
            Ok(evidence) if !evidence.is_empty() => Some(evidence),
            Ok(_) => None,
            Err(err) => {
                println!("  {} code index unavailable: {}", crate::util::style::warn("·"), err);
                None
            }
        }
    });

    // ── 1. instruction layers ──
    if opts.instruction_layers {
        let layers = collect_layers(root, &task.context_files, opts);
        if !layers.is_empty() {
            let mut idx = Vec::new();
            for layer in layers {
                instructions.push(layer.path);
                idx.push(push_piece(
                    &mut pieces,
                    layer.label,
                    layer.body,
                    layer.priority,
                    true,
                ));
            }
            groups.push(Group {
                heading: "## Project Instructions".into(),
                idx,
            });
        }
    }

    // ── 2. skills: top body, then an index ──
    if opts.skill_context {
        if let Some(reg) = registry {
            let matched = reg.matching(&MatchContext {
                labels: vec![task.priority.clone()],
                area: None,
                title: task.title.clone(),
                pipeline_phase: "dispatch".into(),
            });
            if let Some((top, rest)) = matched.split_first() {
                let skill_dir = opts.session_dir.map(|d| d.join("skills"));
                let top_path = materialise(skill_dir.as_deref(), top);
                let mut idx = Vec::new();
                let body = format!("### Skill: {} ({})\n{}", top.name, top.id, top.content.trim());
                idx.push(push_piece(
                    &mut pieces,
                    format!("skill:{}", top.id),
                    body,
                    P_SKILL_BODY,
                    true,
                ));
                skills.push(SkillRef {
                    id: top.id.clone(),
                    mode: "body".into(),
                    path: top_path,
                });

                if !rest.is_empty() {
                    let mut index = String::from(
                        "### Skill index\n\nRead these skill files before editing:\n",
                    );
                    for skill in rest {
                        let path = materialise(skill_dir.as_deref(), skill);
                        let where_ = path
                            .clone()
                            .or_else(|| skill.path.as_ref().map(|p| p.display().to_string()))
                            .unwrap_or_else(|| "(inline)".into());
                        index.push_str(&format!(
                            "- `{}` — {} — {}\n",
                            skill.id,
                            one_line(&skill.description),
                            where_
                        ));
                        skills.push(SkillRef {
                            id: skill.id.clone(),
                            mode: "index".into(),
                            path,
                        });
                    }
                    idx.push(push_piece(
                        &mut pieces,
                        "skill-index".into(),
                        index,
                        P_SKILL_INDEX,
                        true,
                    ));
                }
                groups.push(Group {
                    heading: "## Project Skills".into(),
                    idx,
                });
            }
        }
    }

    // ── 3. the task itself (never trimmed) ──
    let mut task_text = format!("## Task: {}", task.title);
    if !task.description.trim().is_empty() {
        task_text.push_str(&format!("\n\n{}", task.description.trim()));
    }
    groups.push(Group {
        heading: String::new(),
        idx: vec![push_piece(&mut pieces, "task".into(), task_text, 0, false)],
    });

    if !task.acceptance_criteria.is_empty() {
        let mut text = String::new();
        for ac in &task.acceptance_criteria {
            text.push_str(&format!("- [ ] {}\n", ac));
        }
        groups.push(Group {
            heading: "## Acceptance Criteria".into(),
            idx: vec![push_piece(&mut pieces, "acceptance".into(), text, 0, false)],
        });
    }

    if !task.context_files.is_empty() {
        let mut idx = Vec::new();
        for (n, f) in task.context_files.iter().enumerate() {
            let mut text = format!("- `{}`", f.path);
            if !f.symbols.is_empty() {
                text.push_str(&format!(" (symbols: {})", f.symbols.join(", ")));
            }
            // Later files are less important: give them a bigger number so the
            // budget thins the tail of the list first.
            idx.push(push_piece(
                &mut pieces,
                format!("context_file:{}", f.path),
                text,
                P_CONTEXT_FILE + (n.min(5) as u8),
                true,
            ));
        }
        groups.push(Group {
            heading: "## Files to Modify".into(),
            idx,
        });
    }

    if let Some(evidence) = &code_index {
        let mut text = String::from(
            "Ranges the code index ranked for this task. Read them before searching:\n\n",
        );
        text.push_str(&evidence.render(opts.code_index_snippets, 4_000));
        if evidence.omitted > 0 {
            text.push_str(&format!(
                "\n({} further range(s) were left out of the index budget.)\n",
                evidence.omitted
            ));
        }
        groups.push(Group {
            heading: "## Relevant code".into(),
            idx: vec![push_piece(
                &mut pieces,
                "code-index".into(),
                text,
                P_CODE_INDEX,
                true,
            )],
        });
    }

    groups.push(Group {
        heading: "## Branch".into(),
        idx: vec![push_piece(
            &mut pieces,
            "branch".into(),
            branch.to_string(),
            0,
            false,
        )],
    });

    // ── 4. retry verdict, last so a warm backend keeps its cache prefix ──
    if let Some(verdict) = opts.verdict.filter(|v| !v.trim().is_empty()) {
        let mut text = String::from("## Previous attempt failed\n\n");
        text.push_str(&format!(
            "Attempt {} failed the acceptance gate:\n\n{}\n\n",
            opts.attempt.saturating_sub(1),
            verdict.trim()
        ));

        // Intelligent failure diagnosis across common error topologies
        let v = verdict.to_lowercase();
        if v.contains("error[e")
            || v.contains("syntaxerror")
            || v.contains("compileerror")
            || v.contains("cannot find")
            || v.contains("unresolved import")
        {
            text.push_str("### Diagnostic Guidance: Compilation / Syntax Failure\n");
            text.push_str("- The code failed compilation. Inspect specific compiler diagnostics and line citations above.\n");
            text.push_str("- Fix type definitions and missing symbols surgically; do not re-scaffold untouched files.\n\n");
        } else if v.contains("assertion failed")
            || v.contains("failures:")
            || v.contains("test result: failed")
        {
            text.push_str("### Diagnostic Guidance: Acceptance Test Failure\n");
            text.push_str("- Verification failed an assertion. Review actual vs expected outcomes in the test tail above.\n");
            text.push_str("- Adapt logic to satisfy edge cases and boundary criteria without breaking passing tests.\n\n");
        } else if v.contains("panicked at") {
            text.push_str("### Diagnostic Guidance: Runtime Panic\n");
            text.push_str("- The process crashed with a panic. Add defensive bounds checks and guard unwraps.\n\n");
        } else if v.contains("timed out") || v.contains("deadline") {
            text.push_str("### Diagnostic Guidance: Timeout / Hang\n");
            text.push_str("- The gate exceeded its time ceiling. Investigate blocking locks, infinite loops, or network waits.\n\n");
        }

        text.push_str(
            "Fix the reported failure. Rerun the project's tests yourself before finishing.",
        );
        groups.push(Group {
            heading: String::new(),
            idx: vec![push_piece(&mut pieces, "verdict".into(), text, 0, false)],
        });
    }

    // ── 5. budget: drop highest priority number first ──
    let budget_bytes = budget_tokens.saturating_mul(CHARS_PER_TOKEN);
    let mut dropped = vec![false; pieces.len()];
    let mut dropped_names: Vec<String> = Vec::new();

    let mut order: Vec<usize> = (0..pieces.len()).filter(|&i| pieces[i].trimmable).collect();
    order.sort_by(|&a, &b| {
        pieces[b]
            .priority
            .cmp(&pieces[a].priority)
            .then(b.cmp(&a))
    });

    let mut prompt = render(&groups, &pieces, &dropped);
    let mut cursor = 0usize;
    while prompt.len() > budget_bytes && cursor < order.len() {
        let i = order[cursor];
        cursor += 1;
        if dropped[i] {
            continue;
        }
        dropped[i] = true;
        dropped_names.push(pieces[i].name.clone());
        prompt = render(&groups, &pieces, &dropped);
    }

    // Last resort: the task text alone can exceed the hard cap. Never bail —
    // cut the tail and record it, so the run still starts.
    let mut truncated = false;
    if prompt.len() > HARD_MAX_BYTES {
        let mut cut = HARD_MAX_BYTES;
        while cut > 0 && !prompt.is_char_boundary(cut) {
            cut -= 1;
        }
        prompt.truncate(cut);
        prompt.push_str("\n\n[context truncated: prompt exceeded the hard limit]\n");
        truncated = true;
    }

    let id = packet_id(task, branch, opts.attempt, &prompt);
    let sections = pieces
        .iter()
        .zip(dropped.iter())
        .map(|(p, gone)| PacketSection {
            name: p.name.clone(),
            bytes: p.text.len() + 2,
            kept: !*gone,
        })
        .collect();

    ContextPacket {
        id,
        bytes: prompt.len(),
        tokens_est: prompt.len().div_ceil(CHARS_PER_TOKEN),
        budget_tokens,
        attempt: opts.attempt,
        sections,
        dropped: dropped_names,
        instructions,
        skills,
        code_index,
        truncated,
        prompt,
    }
}

fn push_piece(
    pieces: &mut Vec<Piece>,
    name: String,
    text: String,
    priority: u8,
    trimmable: bool,
) -> usize {
    pieces.push(Piece {
        name,
        text,
        priority,
        trimmable,
    });
    pieces.len() - 1
}

fn render(groups: &[Group], pieces: &[Piece], dropped: &[bool]) -> String {
    let mut out = String::with_capacity(IDENTITY.len() + CONTRACT.len() + 4096);
    out.push_str(IDENTITY);
    for g in groups {
        let body: Vec<&Piece> = g
            .idx
            .iter()
            .filter(|&&i| !dropped[i])
            .map(|&i| &pieces[i])
            .collect();
        if !body.iter().any(|p| !p.text.trim().is_empty()) {
            continue;
        }
        if !g.heading.is_empty() {
            out.push_str(&g.heading);
            out.push_str("\n\n");
        }
        for p in body {
            if p.text.trim().is_empty() {
                continue;
            }
            out.push_str(p.text.trim_end());
            out.push_str("\n\n");
        }
    }
    out.push_str(CONTRACT);
    out
}

fn packet_id(task: &TaskRequest, branch: &str, attempt: usize, prompt: &str) -> String {
    let mut h = DefaultHasher::new();
    task.id.hash(&mut h);
    branch.hash(&mut h);
    attempt.hash(&mut h);
    prompt.hash(&mut h);
    format!("ctx-{:016x}", h.finish())
}

/// What the code index is asked. Title plus acceptance criteria, because the
/// criteria are the part that names the code ("the redirect test"), while the
/// description is often prose.
fn task_query(task: &TaskRequest) -> String {
    let mut query = task.title.trim().to_string();
    if !task.acceptance_criteria.is_empty() {
        query.push_str(". ");
        query.push_str(
            &task
                .acceptance_criteria
                .iter()
                .map(|ac| ac.trim())
                .collect::<Vec<_>>()
                .join("; "),
        );
    }
    let query = query.trim().to_string();
    let raw = if query.is_empty() {
        task.description.trim().to_string()
    } else {
        query
    };
    crate::harness::leantoken::sanitize_query(&raw)
}

fn one_line(text: &str) -> String {
    let line = text.lines().next().unwrap_or("").trim();
    if line.chars().count() > 100 {
        let cut = line
            .char_indices()
            .nth(100)
            .map(|(i, _)| i)
            .unwrap_or(line.len());
        format!("{}…", &line[..cut])
    } else {
        line.to_string()
    }
}

/// Write a skill body into the session dir and return its absolute path.
fn materialise(dir: Option<&Path>, skill: &crate::skills::Skill) -> Option<String> {
    let dir = dir?;
    let name = skill
        .id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>();
    let path = dir.join(format!("{}.md", name));
    if std::fs::create_dir_all(dir).is_err() {
        return None;
    }
    let body = format!("# {}\n\n{}\n", skill.name, skill.content.trim_end());
    std::fs::write(&path, body).ok()?;
    Some(absolutise(&path).display().to_string())
}

fn absolutise(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()
                .map(|cwd| cwd.join(path))
                .unwrap_or_else(|_| path.to_path_buf())
        }
    })
}

// ── instruction layers ──

fn collect_layers(root: &Path, touched: &[FileContext], opts: &PacketOptions<'_>) -> Vec<Layer> {
    let mut out: Vec<Layer> = Vec::new();
    let mut seen_paths: HashSet<PathBuf> = HashSet::new();
    let mut seen_bodies: HashSet<u64> = HashSet::new();

    let policy = opts.policy_path.clone().or_else(default_policy_path);
    if let Some(p) = policy {
        add_layer(&mut out, &mut seen_paths, &mut seen_bodies, root, &p, "policy.md", P_POLICY, opts);
    }

    add_layer(
        &mut out,
        &mut seen_paths,
        &mut seen_bodies,
        root,
        &root.join("project_context.md"),
        "project_context.md",
        P_PROJECT_CONTEXT,
        opts,
    );

    // Root first, then ancestors (monorepos keep shared rules above the
    // project root). Home and `/` are excluded: those are user-level policy,
    // which belongs in the managed policy file.
    for dir in ancestor_dirs(root) {
        for name in ["AGENTS.md", "CLAUDE.md"] {
            add_layer(
                &mut out,
                &mut seen_paths,
                &mut seen_bodies,
                root,
                &dir.join(name),
                &dir.join(name).display().to_string(),
                P_AGENT_FILE,
                opts,
            );
        }
    }

    for rule in board_rules(root) {
        let label = rule
            .strip_prefix(root)
            .unwrap_or(&rule)
            .display()
            .to_string();
        add_layer(
            &mut out,
            &mut seen_paths,
            &mut seen_bodies,
            root,
            &rule,
            &label,
            P_BOARD_RULES,
            opts,
        );
    }

    for file in touched {
        for dir in subtree_dirs(root, &file.path) {
            for name in ["AGENTS.md", "CLAUDE.md"] {
                let path = dir.join(name);
                let label = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .display()
                    .to_string();
                add_layer(
                    &mut out,
                    &mut seen_paths,
                    &mut seen_bodies,
                    root,
                    &path,
                    &label,
                    P_SUBTREE,
                    opts,
                );
            }
        }
    }

    out
}

#[allow(clippy::too_many_arguments)]
fn add_layer(
    out: &mut Vec<Layer>,
    seen_paths: &mut HashSet<PathBuf>,
    seen_bodies: &mut HashSet<u64>,
    root: &Path,
    path: &Path,
    label: &str,
    priority: u8,
    opts: &PacketOptions<'_>,
) {
    if !path.is_file() {
        return;
    }
    let key = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    if !seen_paths.insert(key) {
        return;
    }
    let Ok(raw) = std::fs::read_to_string(path) else {
        return;
    };
    let body = if opts.strip_comments {
        strip_html_comments(&raw)
    } else {
        raw
    };
    if body.trim().is_empty() {
        return;
    }
    // `AGENTS.md` and `CLAUDE.md` are frequently byte-identical symlinks of
    // each other; including both wastes budget and confuses agents.
    let mut hasher = DefaultHasher::new();
    body.trim().hash(&mut hasher);
    if !seen_bodies.insert(hasher.finish()) {
        return;
    }

    let label = label
        .strip_prefix(&format!("{}/", root.display()))
        .unwrap_or(label)
        .to_string();
    let body = format!("### Instructions: {}\n{}", label, body.trim());
    out.push(Layer {
        label,
        path: path.display().to_string(),
        body,
        priority,
    });
}

/// Root, then up to four ancestors, skipping ties to `$HOME` and `/`.
fn ancestor_dirs(root: &Path) -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut dirs = vec![root.to_path_buf()];
    let mut cur = root.parent();
    let mut depth = 1;
    while let Some(dir) = cur {
        if depth > 4 || dir == Path::new("/") {
            break;
        }
        if let Some(home) = &home {
            if dir == home.as_path() {
                break;
            }
        }
        dirs.push(dir.to_path_buf());
        cur = dir.parent();
        depth += 1;
    }
    dirs
}

fn board_rules(root: &Path) -> Vec<PathBuf> {
    let dir = root.join(".board").join("rules");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut rules: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|e| e == "md"))
        .collect();
    rules.sort();
    rules
}

/// Directories between the project root and a touched file (nearest first).
fn subtree_dirs(root: &Path, file: &str) -> Vec<PathBuf> {
    let Some(parent) = root.join(file).parent().map(Path::to_path_buf) else {
        return Vec::new();
    };
    let mut dirs = Vec::new();
    let mut cur = Some(parent);
    while let Some(dir) = cur {
        if dir == root || !dir.starts_with(root) {
            break;
        }
        dirs.push(dir.clone());
        cur = dir.parent().map(Path::to_path_buf);
    }
    dirs
}

fn default_policy_path() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("BARKCLI_HOME").filter(|v| !v.is_empty()) {
        let p = PathBuf::from(home).join("policy.md");
        if p.is_file() {
            return Some(p);
        }
    }
    let home = std::env::var_os("HOME")?;
    let p = PathBuf::from(home).join(".bark").join("policy.md");
    p.is_file().then_some(p)
}

/// Remove `<!-- … -->` comments and collapse runs of blank lines.
pub fn strip_html_comments(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let mut rest = src;
    while let Some(start) = rest.find("<!--") {
        out.push_str(&rest[..start]);
        match rest[start..].find("-->") {
            Some(end) => rest = &rest[start + end + 3..],
            None => {
                rest = "";
                break;
            }
        }
    }
    out.push_str(rest);

    let mut clean = String::with_capacity(out.len());
    let mut blanks = 0;
    for line in out.lines() {
        if line.trim().is_empty() {
            blanks += 1;
            if blanks > 2 {
                continue;
            }
        } else {
            blanks = 0;
        }
        clean.push_str(line);
        clean.push('\n');
    }
    clean
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::queue::create_task;
    use crate::skills::{Skill, SkillSource};

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "bark-packet-{}-{}",
                tag,
                uuid::Uuid::new_v4()
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn path(&self) -> &Path {
            &self.0
        }
        fn write(&self, name: &str, body: &str) -> PathBuf {
            let path = self.0.join(name);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&path, body).unwrap();
            path
        }
        fn write_exec(&self, name: &str, body: &str) -> PathBuf {
            let path = self.write(name, body);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(&path).unwrap().permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(&path, perms).unwrap();
            }
            path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn task() -> TaskRequest {
        create_task(
            "card-7",
            "Fix login",
            "Login is broken for SSO users",
            vec!["SSO login succeeds".into(), "Tests cover the redirect".into()],
            vec![FileContext {
                path: "src/auth/login.rs".into(),
                content: None,
                symbols: vec!["login".into()],
                call_graph: None,
                test_coverage: None,
            }],
            "high",
        )
    }

    fn skill(id: &str, content: &str) -> Skill {
        Skill {
            id: id.into(),
            name: id.to_uppercase(),
            description: format!("{} skill", id),
            content: content.into(),
            triggers: vec!["high".into()],
            source: SkillSource::Builtin,
            path: None,
            always: false,
            enabled: true,
        }
    }

    #[test]
    fn layers_include_root_rules_and_strip_comments() {
        let dir = TempDir::new("layers");
        dir.write(
            "project_context.md",
            "# Context\n<!-- authoring note, not an instruction -->\nUse the repo runtime.\n",
        );
        dir.write("AGENTS.md", "Root rules: run cargo test.\n");
        dir.write("src/auth/AGENTS.md", "Auth rules: never log tokens.\n");
        dir.write(".board/rules/style.md", "Style: small PRs.\n");

        let t = task();
        let packet = build_with_registry(
            &t,
            "bark/fix-login",
            &PacketOptions::new(dir.path()),
            None,
        );

        assert!(packet.prompt.contains("Use the repo runtime."));
        assert!(!packet.prompt.contains("authoring note"));
        assert!(packet.prompt.contains("Root rules: run cargo test."));
        assert!(packet.prompt.contains("Auth rules: never log tokens."));
        assert!(packet.prompt.contains("Style: small PRs."));
        // root context → root agents → board rules → subtree
        let ctx_at = packet.prompt.find("Use the repo runtime.").unwrap();
        let root_at = packet.prompt.find("Root rules").unwrap();
        let board_at = packet.prompt.find("Style: small PRs.").unwrap();
        let sub_at = packet.prompt.find("Auth rules").unwrap();
        assert!(ctx_at < root_at && root_at < board_at && board_at < sub_at);
        assert!(packet.instructions.iter().any(|p| p.ends_with("project_context.md")));
    }

    #[test]
    fn top_skill_keeps_body_and_rest_become_an_index() {
        let dir = TempDir::new("skills");
        let session = TempDir::new("skills-session");
        let registry = SkillRegistry {
            skills: vec![
                skill("alpha", "ALPHA BODY: always pin dependencies\n"),
                skill("beta", "BETA BODY\n"),
                skill("gamma", "GAMMA BODY\n"),
            ],
        };
        let t = task();
        let packet = build_with_registry(
            &t,
            "bark/fix-login",
            &PacketOptions::new(dir.path()).with_session_dir(session.path()),
            Some(&registry),
        );

        assert!(packet.prompt.contains("ALPHA BODY"));
        assert!(!packet.prompt.contains("BETA BODY"));
        assert!(packet.prompt.contains("- `beta` — beta skill — "));
        assert!(packet.prompt.contains("Read these skill files before editing"));
        assert_eq!(packet.skills[0].mode, "body");
        // every matched skill body lands in the session dir, never the worktree
        for id in ["alpha", "beta", "gamma"] {
            let path = session.path().join("skills").join(format!("{}.md", id));
            assert!(path.is_file(), "missing {}", path.display());
        }
        assert!(packet
            .skills
            .iter()
            .all(|s| s.path.as_deref().is_some_and(|p| p.contains("skills/"))));
    }

    #[test]
    fn budget_drops_context_but_never_the_task_or_verdict() {
        let dir = TempDir::new("budget");
        dir.write("project_context.md", &"context line\n".repeat(4000));
        dir.write("src/auth/AGENTS.md", &"subtree line\n".repeat(4000));

        let t = task();
        let packet = build_with_registry(
            &t,
            "bark/fix-login",
            &PacketOptions::new(dir.path())
                .with_budget(600)
                .with_attempt(2)
                .with_verdict(Some("error[E0432]: unresolved import `sso`")),
            None,
        );

        assert!(packet.bytes <= 600 * CHARS_PER_TOKEN + 200);
        assert!(packet.prompt.contains("## Task: Fix login"));
        assert!(packet.prompt.contains("SSO login succeeds"));
        assert!(packet.prompt.contains("## Branch\n\nbark/fix-login"));
        assert!(packet.prompt.contains("unresolved import `sso`"));
        assert!(!packet.dropped.is_empty());
        // subtree rules go before project context
        let first = packet.dropped.first().map(String::as_str).unwrap_or("");
        assert!(first.contains("AGENTS.md"), "dropped order: {:?}", packet.dropped);
    }

    #[test]
    fn huge_context_never_bails_and_manifest_roundtrips() {
        let dir = TempDir::new("huge");
        let session = TempDir::new("huge-session");
        dir.write("project_context.md", &"x".repeat(400_000));

        let t = task();
        let packet = build_with_registry(
            &t,
            "bark/fix-login",
            &PacketOptions::new(dir.path()).with_session_dir(session.path()),
            None,
        );

        assert!(packet.bytes < HARD_MAX_BYTES);
        assert!(!packet.truncated, "budget trimming should be enough");
        assert!(packet.dropped.iter().any(|n| n == "project_context.md"));

        let manifest = session.path().join("context.json");
        packet.write_manifest(&manifest).unwrap();
        let parsed: ContextPacket =
            serde_json::from_str(&std::fs::read_to_string(&manifest).unwrap()).unwrap();
        assert_eq!(parsed.id, packet.id);
        assert_eq!(parsed.bytes, packet.bytes);
        assert!(parsed.prompt.is_empty(), "prompt must not be duplicated");
        assert!(packet.summary().contains("dropped"));
    }

    #[test]
    fn packet_id_tracks_prompt_content() {
        let dir = TempDir::new("id");
        let t = task();
        let base = build_with_registry(&t, "bark/x", &PacketOptions::new(dir.path()), None);
        let same = build_with_registry(&t, "bark/x", &PacketOptions::new(dir.path()), None);
        let retry = build_with_registry(
            &t,
            "bark/x",
            &PacketOptions::new(dir.path())
                .with_attempt(2)
                .with_verdict(Some("gate failed")),
            None,
        );
        assert_eq!(base.id, same.id);
        assert_ne!(base.id, retry.id);
        assert!(base.id.starts_with("ctx-") && base.id.len() == 20);
    }

    /// A stand-in for the `leantoken` CLI: answers `context` with two ranges.
    fn fake_code_index(dir: &TempDir) -> PathBuf {
        dir.write_exec(
            "leantoken",
            r#"#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "context" ]; then
    cat <<'JSON'
{"fragments":[
  {"path":"src/auth/login.rs","start_line":12,"end_line":40,"reason":"text; symbol","content":"fn login() {}\n"},
  {"path":"src/auth/sso.rs","start_line":3,"end_line":9,"reason":"symbol"}
],"omission_summary":{"budget_or_result_limit":4},
 "meta":{"source_tokens":321,"total_response_tokens":410}}
JSON
    exit 0
  fi
done
exit 0
"#,
        )
    }

    #[test]
    fn code_index_adds_a_ranked_code_section_and_manifest_entry() {
        let dir = TempDir::new("code-index");
        dir.write("AGENTS.md", "Root rules: run cargo test.\n");
        let bin = fake_code_index(&dir);

        let t = task();
        let packet = build_with_registry(
            &t,
            "bark/fix-login",
            &PacketOptions {
                code_index_bin: Some(bin),
                code_index_budget: 400,
                ..PacketOptions::new(dir.path())
            },
            None,
        );

        assert!(packet.prompt.contains("## Relevant code"));
        assert!(packet.prompt.contains("- `src/auth/login.rs:12-40` — text; symbol"));
        assert!(packet.prompt.contains("- `src/auth/sso.rs:3-9` — symbol"));
        // pointers by default: no source pasted
        assert!(!packet.prompt.contains("fn login() {}"));
        assert!(packet.prompt.contains("4 further range(s) were left out"));

        let code = packet.code_index.as_ref().expect("manifest entry");
        assert_eq!(code.fragments.len(), 2);
        assert_eq!(code.omitted, 4);
        assert_eq!(code.source_tokens, 321);

        // the query is the title plus the acceptance criteria, not the prose
        assert!(packet.prompt.contains("## Task: Fix login"));
    }

    #[test]
    fn code_index_snippets_paste_bounded_source_when_enabled() {
        let dir = TempDir::new("code-index-snippets");
        let bin = fake_code_index(&dir);
        let t = task();
        let packet = build_with_registry(
            &t,
            "bark/fix-login",
            &PacketOptions {
                code_index_bin: Some(bin),
                code_index_snippets: true,
                ..PacketOptions::new(dir.path())
            },
            None,
        );
        assert!(packet.prompt.contains("fn login() {}"));
    }

    #[test]
    fn missing_code_index_is_silent_and_packet_unchanged() {
        let dir = TempDir::new("code-index-missing");
        let t = task();
        let without = build_with_registry(&t, "bark/x", &PacketOptions::new(dir.path()), None);
        let disabled = build_with_registry(
            &t,
            "bark/x",
            &PacketOptions {
                code_index_bin: Some(dir.path().join("does-not-exist")),
                ..PacketOptions::new(dir.path())
            },
            None,
        );
        assert!(without.code_index.is_none());
        assert!(disabled.code_index.is_none());
        assert!(!disabled.prompt.contains("## Relevant code"));
    }

    #[test]
    fn code_index_is_dropped_before_the_projects_own_rules() {
        let dir = TempDir::new("code-index-budget");
        dir.write("project_context.md", "context line\n");
        dir.write(".board/rules/style.md", "Style: small PRs.\n");
        // A chatty index: one long pointer list.
        let bin = dir.write_exec(
            "leantoken",
            r#"#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "context" ]; then
    printf '{"fragments":['
    i=0
    while [ $i -lt 40 ]; do
      printf '{"path":"src/file%s.rs","start_line":1,"end_line":2,"reason":"text"},' "$i"
      i=$((i+1))
    done
    printf '{"path":"src/last.rs","start_line":1,"end_line":2}]}'
    exit 0
  fi
done
exit 0
"#,
        );
        let t = task();
        let packet = build_with_registry(
            &t,
            "bark/x",
            &PacketOptions {
                code_index_bin: Some(bin),
                ..PacketOptions::new(dir.path()).with_budget(400)
            },
            None,
        );

        assert!(packet.dropped.iter().any(|n| n == "code-index"));
        // rules and context survive a dropped code index
        assert!(packet.prompt.contains("Style: small PRs."));
        assert!(packet.prompt.contains("context line"));
    }

    #[test]
    fn comments_are_stripped_and_blank_runs_collapsed() {
        let out = strip_html_comments("a\n<!-- hidden\nmultiline -->\nb\n\n\n\nc\n");
        assert!(!out.contains("hidden"));
        assert!(out.starts_with("a\n"));
        assert!(out.contains("\nb\n"));
        assert!(out.ends_with("c\n"));
        assert!(!out.contains("\n\n\n\n"));
        assert_eq!(strip_html_comments("no comments"), "no comments\n");
        assert_eq!(strip_html_comments("open <!-- never closed").trim(), "open");
    }
}
