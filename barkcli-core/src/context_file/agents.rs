//! Agent instruction files — the one line every coding agent is guaranteed to
//! read on startup.
//!
//! `project_context.md` only helps if the tool in front of you was told to read
//! it. Each tool looks at a different project file, so barkcli keeps one small
//! **managed block** in every one of them:
//!
//! ```text
//! <!-- barkcli:context:start -->
//! ## barkcli context
//! The living project context ... Read `project_context.md` before exploring.
//!
//! @project_context.md
//! <!-- barkcli:context:end -->
//! ```
//!
//! The block is delimited on purpose: re-running wiring replaces it in place
//! (format upgrades, a moved pointer) instead of appending a second copy, and
//! everything the human wrote outside the markers is never touched. Files
//! wired by barkcli <= 0.4.48 (a lone `<!-- barkcli-project-context -->`)
//! are migrated on the next sync.
//!
//! First-run setup creates the core files (CLAUDE.md, AGENTS.md) plus every
//! tool it can detect — a config directory in the repo, a known environment
//! variable from the agent that launched barkcli, or the project's configured
//! agent backends. `--all` seeds every known surface.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Opening marker of the managed block.
pub const BLOCK_START: &str = "<!-- barkcli:context:start -->";
/// Closing marker of the managed block.
pub const BLOCK_END: &str = "<!-- barkcli:context:end -->";
/// The marker barkcli wrote before 0.4.49. Migrated on the next sync.
const LEGACY_MARKER: &str = "<!-- barkcli-project-context -->";
/// Heading barkcli wrote before 0.4.49, next to the legacy marker.
const LEGACY_HEADING_PREFIX: &str = "# barkcli context (auto-maintained";

const POINTER: &str = "The living project context is auto-maintained by barkcli. \
Read `project_context.md` before exploring this repository.";

/// How a tool is told to read the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WireStyle {
    /// `@project_context.md` — Claude Code and Gemini CLI resolve `@path`.
    Import,
    /// A read-first sentence in the tool's own instruction file.
    Pointer,
}

/// One agent tool's project instruction file.
#[derive(Debug, Clone, Copy)]
pub struct AgentFileSpec {
    /// Stable id used in output and the web API.
    pub id: &'static str,
    /// Human label for the tool.
    pub label: &'static str,
    /// Path relative to the project root.
    pub path: &'static str,
    pub style: WireStyle,
    /// Created by first-run setup even when nothing detects the tool.
    pub core: bool,
    /// Directories whose presence means the tool is in use here.
    pub dirs: &'static [&'static str],
    /// Environment variables set by the tool when it launches a shell/agent.
    pub env: &'static [&'static str],
    /// Tools that require a rule-file header (Cursor, Windsurf).
    pub front_matter: Option<&'static str>,
}

/// Every agent surface barkcli knows how to wire.
pub const AGENT_FILES: &[AgentFileSpec] = &[
    AgentFileSpec {
        id: "claude",
        label: "Claude Code",
        path: "CLAUDE.md",
        style: WireStyle::Import,
        core: true,
        dirs: &[".claude"],
        env: &["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"],
        front_matter: None,
    },
    AgentFileSpec {
        id: "agents",
        label: "Codex / OpenAI / opencode",
        path: "AGENTS.md",
        style: WireStyle::Pointer,
        core: true,
        dirs: &[".codex", ".opencode"],
        env: &["CODEX_SANDBOX", "OPENCODE_BIN_PATH"],
        front_matter: None,
    },
    AgentFileSpec {
        id: "cursor",
        label: "Cursor",
        path: ".cursor/rules/barkcli.mdc",
        style: WireStyle::Pointer,
        core: false,
        dirs: &[".cursor"],
        env: &["CURSOR_TRACE_ID", "CURSOR_AGENT"],
        front_matter: Some(
            "---\ndescription: barkcli living project context\nalwaysApply: true\n---\n",
        ),
    },
    AgentFileSpec {
        id: "copilot",
        label: "GitHub Copilot",
        path: ".github/copilot-instructions.md",
        style: WireStyle::Pointer,
        core: false,
        dirs: &[],
        env: &["COPILOT_AGENT"],
        front_matter: None,
    },
    AgentFileSpec {
        id: "gemini",
        label: "Gemini CLI",
        path: "GEMINI.md",
        style: WireStyle::Import,
        core: false,
        dirs: &[],
        env: &["GEMINI_CLI", "GEMINI_SANDBOX"],
        front_matter: None,
    },
    AgentFileSpec {
        id: "windsurf",
        label: "Windsurf",
        path: ".windsurf/rules/barkcli.md",
        style: WireStyle::Pointer,
        core: false,
        dirs: &[".windsurf"],
        env: &["WINDSURF_SESSION"],
        front_matter: Some("---\ntrigger: always_on\n---\n"),
    },
    AgentFileSpec {
        id: "cline",
        label: "Cline",
        path: ".clinerules",
        style: WireStyle::Pointer,
        core: false,
        dirs: &[],
        env: &["CLINE_TASK_ID"],
        front_matter: None,
    },
    AgentFileSpec {
        id: "zed",
        label: "Zed",
        path: ".rules",
        style: WireStyle::Pointer,
        core: false,
        dirs: &[".zed"],
        env: &["ZED_TERM"],
        front_matter: None,
    },
];

/// How far a sync is allowed to go.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WireMode {
    /// Refresh blocks in files that already exist. Creates nothing.
    Sync,
    /// Also create the core files plus every tool detected in this project.
    Create,
    /// Also create every known agent file.
    All,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WireStatus {
    /// File did not exist and was written.
    Created,
    /// Existing file had its block rewritten (legacy wiring, moved pointer).
    Updated,
    /// Already correct — nothing written.
    Synced,
    /// Existing file has wiring but it does not match the current block.
    Outdated,
    /// File exists but was never wired.
    Unwired,
    /// File does not exist and this mode does not create it.
    Missing,
    /// Writing failed (permissions, read-only checkout…).
    Failed,
}

impl WireStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            WireStatus::Created => "created",
            WireStatus::Updated => "updated",
            WireStatus::Synced => "wired",
            WireStatus::Outdated => "outdated",
            WireStatus::Unwired => "unwired",
            WireStatus::Missing => "missing",
            WireStatus::Failed => "failed",
        }
    }
}

/// Result of syncing (or inspecting) one agent file.
#[derive(Debug, Clone, Serialize)]
pub struct WiredFile {
    pub id: &'static str,
    pub label: &'static str,
    /// Path relative to the project root.
    pub path: String,
    pub style: WireStyle,
    pub status: WireStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl WiredFile {
    pub fn wrote(&self) -> bool {
        matches!(self.status, WireStatus::Created | WireStatus::Updated)
    }
}

/// The managed block, including its markers, without a trailing newline.
fn block_for(spec: &AgentFileSpec) -> String {
    match spec.style {
        WireStyle::Import => format!(
            "{}\n## barkcli context\n{}\n\n@project_context.md\n{}",
            BLOCK_START, POINTER, BLOCK_END
        ),
        WireStyle::Pointer => format!(
            "{}\n## barkcli context\n{}\n{}",
            BLOCK_START, POINTER, BLOCK_END
        ),
    }
}

fn front_matter(spec: &AgentFileSpec) -> &'static str {
    spec.front_matter.unwrap_or("")
}

/// Contents for a file we are about to create.
fn created_content(spec: &AgentFileSpec) -> String {
    let block = block_for(spec);
    let head = front_matter(spec);
    if head.is_empty() {
        format!("{}\n", block)
    } else {
        format!("{}\n\n{}\n", head.trim_end(), block)
    }
}

fn is_legacy_heading(line: &str) -> bool {
    line.trim_start().starts_with(LEGACY_HEADING_PREFIX)
}

/// Is this the leftover pointer line that followed the legacy marker?
fn is_legacy_wiring_line(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.starts_with("@project_context.md")
        || (trimmed.starts_with("- ") && trimmed.contains("project_context.md"))
}

/// Rewrite the managed block in `original`, migrating legacy wiring and
/// collapsing duplicate blocks. Everything outside the markers is preserved.
/// Returns the new contents plus whether they differ from `original`.
pub fn upsert_block(original: &str, spec: &AgentFileSpec) -> (String, bool) {
    if original.is_empty() {
        return (created_content(spec), true);
    }
    let had_trailing_newline = original.ends_with('\n');
    let mut kept: Vec<String> = Vec::new();
    let mut insert_at: Option<usize> = None;
    let mut in_block = false;
    // Set after a legacy marker/heading so the stale pointer line goes too.
    let mut drop_next_wiring = false;

    for line in original.lines() {
        let trimmed = line.trim();

        if in_block {
            if trimmed == BLOCK_END {
                in_block = false;
            }
            continue;
        }
        if trimmed == BLOCK_START {
            in_block = true;
            if insert_at.is_none() {
                insert_at = Some(kept.len());
            }
            continue;
        }

        if drop_next_wiring {
            drop_next_wiring = false;
            if trimmed.is_empty() || is_legacy_wiring_line(line) {
                continue;
            }
        }

        if trimmed == LEGACY_MARKER {
            if insert_at.is_none() {
                insert_at = Some(kept.len());
            }
            drop_next_wiring = true;
            continue;
        }
        if is_legacy_heading(line) {
            if insert_at.is_none() {
                insert_at = Some(kept.len());
            }
            // The marker (and then the pointer) follow the heading.
            drop_next_wiring = false;
            continue;
        }

        kept.push(line.to_string());
    }

    // Keep a bare marker from leaving a duplicate one behind.
    let block_lines: Vec<String> = block_for(spec).lines().map(str::to_string).collect();

    let at = match insert_at {
        Some(at) => at.min(kept.len()),
        None => kept.len(),
    };
    let mut before: Vec<String> = kept[..at].to_vec();
    while before.last().is_some_and(|line| line.trim().is_empty()) {
        before.pop();
    }
    let mut after: Vec<String> = kept[at..].to_vec();
    while after.first().is_some_and(|line| line.trim().is_empty()) {
        after.remove(0);
    }

    let mut out: Vec<String> = before;
    if !out.is_empty() {
        out.push(String::new());
    }
    out.extend(block_lines);
    if !after.is_empty() {
        out.push(String::new());
        out.extend(after);
    }

    let mut rendered = out.join("\n");
    if had_trailing_newline || !rendered.is_empty() {
        rendered.push('\n');
    }
    let changed = rendered != original;
    (rendered, changed)
}

fn is_detected(spec: &AgentFileSpec, root: &Path) -> bool {
    if spec.core {
        return true;
    }
    if root.join(spec.path).exists() {
        return true;
    }
    if spec.dirs.iter().any(|dir| root.join(dir).exists()) {
        return true;
    }
    spec.env
        .iter()
        .any(|key| std::env::var_os(key).is_some_and(|value| !value.is_empty()))
}

fn create_allowed(spec: &AgentFileSpec, root: &Path, mode: WireMode) -> bool {
    match mode {
        WireMode::Sync => false,
        WireMode::All => true,
        WireMode::Create => is_detected(spec, root),
    }
}

fn write_file(path: &Path, content: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(path, content)
}

/// Bring every agent file in line with the current managed block.
///
/// `Sync` only refreshes files that exist; `Create` also creates the core
/// files and anything detected in this project; `All` creates everything.
pub fn sync_agent_files(root: &Path, mode: WireMode) -> Vec<WiredFile> {
    AGENT_FILES
        .iter()
        .map(|spec| {
            let mut file = WiredFile {
                id: spec.id,
                label: spec.label,
                path: spec.path.to_string(),
                style: spec.style,
                status: WireStatus::Missing,
                error: None,
            };
            let path: PathBuf = root.join(spec.path);

            let existing = match std::fs::read_to_string(&path) {
                Ok(content) => Some(content),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => {
                    file.status = WireStatus::Failed;
                    file.error = Some(error.to_string());
                    return file;
                }
            };

            match existing {
                Some(content) => {
                    let (next, changed) = upsert_block(&content, spec);
                    if !changed {
                        file.status = WireStatus::Synced;
                        return file;
                    }
                    match write_file(&path, &next) {
                        Ok(()) => file.status = WireStatus::Updated,
                        Err(error) => {
                            file.status = WireStatus::Failed;
                            file.error = Some(error.to_string());
                        }
                    }
                }
                None => {
                    if !create_allowed(spec, root, mode) {
                        file.status = WireStatus::Missing;
                        return file;
                    }
                    match write_file(&path, &created_content(spec)) {
                        Ok(()) => file.status = WireStatus::Created,
                        Err(error) => {
                            file.status = WireStatus::Failed;
                            file.error = Some(error.to_string());
                        }
                    }
                }
            }
            file
        })
        .collect()
}

/// Read-only view: what is wired, what drifted, what is missing. Never writes.
pub fn inspect_agent_files(root: &Path) -> Vec<WiredFile> {
    AGENT_FILES
        .iter()
        .map(|spec| {
            let path = root.join(spec.path);
            let mut file = WiredFile {
                id: spec.id,
                label: spec.label,
                path: spec.path.to_string(),
                style: spec.style,
                status: WireStatus::Missing,
                error: None,
            };
            let content = match std::fs::read_to_string(&path) {
                Ok(content) => content,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return file,
                Err(error) => {
                    file.status = WireStatus::Failed;
                    file.error = Some(error.to_string());
                    return file;
                }
            };
            if !content.contains("project_context.md") && !content.contains(LEGACY_MARKER) {
                file.status = WireStatus::Unwired;
                return file;
            }
            let (next, changed) = upsert_block(&content, spec);
            let _ = next;
            file.status = if changed {
                WireStatus::Outdated
            } else {
                WireStatus::Synced
            };
            file
        })
        .collect()
}

/// True when at least one file already carries the managed block.
pub fn any_wired(files: &[WiredFile]) -> bool {
    files
        .iter()
        .any(|file| matches!(file.status, WireStatus::Synced | WireStatus::Outdated | WireStatus::Updated))
}

/// True when the core files (CLAUDE.md + AGENTS.md) are wired.
pub fn core_wired(files: &[WiredFile]) -> bool {
    let (claude, agents) = core_flags(files);
    claude && agents
}

/// Wiring flags for the two core files, for the persisted `FileState`.
pub fn core_flags(files: &[WiredFile]) -> (bool, bool) {
    let wired = |id: &str| {
        files.iter().find(|file| file.id == id).is_some_and(|file| {
            matches!(
                file.status,
                WireStatus::Synced
                    | WireStatus::Outdated
                    | WireStatus::Updated
                    | WireStatus::Created
            )
        })
    };
    (wired("claude"), wired("agents"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bark_agents_{}_{}",
            tag,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn spec(id: &str) -> &'static AgentFileSpec {
        AGENT_FILES.iter().find(|spec| spec.id == id).unwrap()
    }

    #[test]
    fn create_writes_core_files_with_blocks() {
        let root = tmp("create");
        let files = sync_agent_files(&root, WireMode::Create);
        let claude = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        assert!(claude.contains(BLOCK_START));
        assert!(claude.contains("@project_context.md"));
        assert!(claude.contains(BLOCK_END));

        let agents = std::fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(agents.contains("Read `project_context.md`"));
        assert!(!agents.contains("@project_context.md"));

        // Only the core two are created when nothing detects a tool.
        let created: Vec<_> = files
            .iter()
            .filter(|f| f.status == WireStatus::Created)
            .map(|f| f.id)
            .collect();
        assert_eq!(created, vec!["claude", "agents"]);
    }

    #[test]
    fn second_sync_is_byte_identical() {
        let root = tmp("idempotent");
        sync_agent_files(&root, WireMode::All);
        let first = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        let files = sync_agent_files(&root, WireMode::All);
        let second = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        assert_eq!(first, second);
        assert!(!files.iter().any(|f| f.wrote()), "nothing should be rewritten");
    }

    #[test]
    fn hand_written_content_survives_and_duplicates_collapse() {
        let root = tmp("preserve");
        let original = "# Rules\n\n- keep PRs small\n";
        std::fs::write(root.join("AGENTS.md"), original).unwrap();
        sync_agent_files(&root, WireMode::Sync);

        let wired = std::fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert!(wired.starts_with("# Rules\n\n- keep PRs small\n"));
        assert_eq!(wired.matches(BLOCK_START).count(), 1);

        // Append the block a second time by hand — sync heals it back to one.
        let duplicated = format!("{}\n{}{}\n", wired, block_for(spec("agents")), "\n");
        std::fs::write(root.join("AGENTS.md"), &duplicated).unwrap();
        sync_agent_files(&root, WireMode::Sync);
        let healed = std::fs::read_to_string(root.join("AGENTS.md")).unwrap();
        assert_eq!(healed, wired);
        assert_eq!(healed.matches(BLOCK_START).count(), 1);
    }

    #[test]
    fn legacy_wiring_is_migrated() {
        let root = tmp("legacy");
        let legacy = "# Rules\n\n- keep PRs small\n\n\
# barkcli context (auto-maintained — `barkcli context digest`)\n\
<!-- barkcli-project-context -->\n\
@project_context.md\n";
        std::fs::write(root.join("CLAUDE.md"), legacy).unwrap();
        sync_agent_files(&root, WireMode::Sync);

        let migrated = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        assert!(!migrated.contains(LEGACY_MARKER));
        assert!(!migrated.contains(LEGACY_HEADING_PREFIX));
        assert_eq!(migrated.matches(BLOCK_START).count(), 1);
        assert!(migrated.starts_with("# Rules\n\n- keep PRs small\n"));
    }

    #[test]
    fn cursor_file_keeps_valid_front_matter() {
        let root = tmp("cursor");
        std::fs::create_dir_all(root.join(".cursor")).unwrap();
        sync_agent_files(&root, WireMode::Create);
        let path = root.join(".cursor/rules/barkcli.mdc");
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.starts_with("---\n"));
        assert!(content.contains("alwaysApply: true"));
        assert!(content.contains(BLOCK_START));

        // A rule file that already exists keeps its own header.
        let existing = "---\ndescription: team rules\nalwaysApply: true\n---\n\n# House rules\n";
        std::fs::write(&path, existing).unwrap();
        sync_agent_files(&root, WireMode::Sync);
        let synced = std::fs::read_to_string(&path).unwrap();
        assert!(synced.starts_with(existing));
        assert_eq!(synced.matches(BLOCK_START).count(), 1);
    }

    #[test]
    fn all_creates_every_known_surface() {
        let root = tmp("all");
        let files = sync_agent_files(&root, WireMode::All);
        for file in &files {
            assert_eq!(file.status, WireStatus::Created, "{} not created", file.id);
            assert!(root.join(&file.path).exists(), "{} missing on disk", file.path);
        }
    }

    #[test]
    fn sync_never_creates_missing_files() {
        let root = tmp("sync-only");
        let files = sync_agent_files(&root, WireMode::Sync);
        assert!(files.iter().all(|file| file.status == WireStatus::Missing));
        assert!(!root.join("CLAUDE.md").exists());
    }

    #[test]
    fn inspect_reports_wired_and_outdated_without_writing() {
        let root = tmp("inspect");
        sync_agent_files(&root, WireMode::Create);
        let states = inspect_agent_files(&root);
        assert!(core_wired(&states));
        assert!(any_wired(&states));
        assert_eq!(
            states.iter().find(|f| f.id == "cline").unwrap().status,
            WireStatus::Missing
        );

        std::fs::write(root.join("AGENTS.md"), "# Rules\n").unwrap();
        let states = inspect_agent_files(&root);
        let agents = states.iter().find(|f| f.id == "agents").unwrap();
        assert_eq!(agents.status, WireStatus::Unwired);
    }
}
