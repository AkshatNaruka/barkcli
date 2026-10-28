//! Context compilation: stable prefix + task delta + reuse report.
//!
//! A pack is built from four inputs: the card's brief, a bounded set of
//! relevant files, the skills routed to this role/task, and the thread's
//! previous pack ledger. The stable prefix only contains inputs that do not
//! depend on the current instruction, which is what makes reuse meaningful.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::ledger::ContextStore;
use super::manifest::{
    hash_text, ContextExclusion, ContextManifest, ManifestFile, ManifestSection, ManifestSkill,
    MANIFEST_VERSION,
};
use super::repo_map::{is_allowed, project_relative, RepoMap};
use crate::context_file::estimate_tokens;
use crate::models::card::Card;
use crate::skills::registry::SkillSource;
use crate::skills::SkillRegistry;

pub const DEFAULT_BUDGET_TOKENS: usize = 12_000;
pub const DEFAULT_MAX_FILES: usize = 10;
pub const DEFAULT_MAX_FILE_BYTES: usize = 160_000;
const MAX_SKILLS: usize = 4;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSettings {
    #[serde(default = "default_budget")]
    pub budget_tokens: usize,
    #[serde(default = "default_max_files")]
    pub max_files: usize,
    #[serde(default = "default_max_file_bytes")]
    pub max_file_bytes: usize,
    /// Extra path globs to keep out of context (`.env*` and key material are
    /// always excluded).
    #[serde(default)]
    pub exclusions: Vec<String>,
    #[serde(default = "default_true")]
    pub include_repo_map: bool,
}

impl Default for ContextSettings {
    fn default() -> Self {
        Self {
            budget_tokens: default_budget(),
            max_files: default_max_files(),
            max_file_bytes: default_max_file_bytes(),
            exclusions: Vec::new(),
            include_repo_map: true,
        }
    }
}

fn default_budget() -> usize {
    DEFAULT_BUDGET_TOKENS
}
fn default_max_files() -> usize {
    DEFAULT_MAX_FILES
}
fn default_max_file_bytes() -> usize {
    DEFAULT_MAX_FILE_BYTES
}
fn default_true() -> bool {
    true
}

impl ContextSettings {
    pub fn load(board_dir: &Path) -> Self {
        let path = board_dir.join("context.json");
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<Self>(&raw) {
                return settings.sanitized();
            }
        }
        let mut settings = Self::default();
        if let Ok(config) = crate::storage::config_store::read_config(board_dir) {
            settings.budget_tokens = config.runtime.context_budget_tokens;
        }
        settings.sanitized()
    }

    pub fn sanitized(mut self) -> Self {
        self.budget_tokens = self.budget_tokens.clamp(1_000, 200_000);
        self.max_files = self.max_files.clamp(1, 40);
        self.max_file_bytes = self.max_file_bytes.clamp(8_000, 2_000_000);
        self
    }
}

#[derive(Debug, Clone)]
pub struct CompileRequest {
    pub thread_id: String,
    pub card_id: String,
    pub card: Card,
    pub run_id: Option<String>,
    pub role: Option<String>,
    pub provider: String,
    pub permission_mode: String,
    pub extra_prompt: Option<String>,
    pub explicit_skills: Vec<String>,
    pub budget_tokens: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSection {
    pub id: String,
    pub title: String,
    /// stable | dynamic
    pub kind: String,
    pub content: String,
    pub hash: String,
    pub tokens: usize,
    pub bytes: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachedSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub reason: String,
    pub source: String,
    pub hash: String,
    pub tokens: usize,
    /// Full playbook used while rendering the stable prefix. It is not stored
    /// in the manifest or pack so run records stay small.
    #[serde(skip)]
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextReuse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_pack_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_stable_hash: Option<String>,
    pub stable_hash: String,
    pub reused: bool,
    pub reason: String,
    #[serde(default)]
    pub invalidations: Vec<String>,
    pub stable_prefix_tokens: usize,
    pub dynamic_tokens: usize,
    /// Tokens whose stable prefix was reused from the previous pack.
    #[serde(default)]
    pub reused_tokens: usize,
    #[serde(default)]
    pub cache_hits: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_invalidation_reason: Option<String>,
    /// True when a previous run in this thread has a provider session id that
    /// could be resumed by a capable adapter.
    pub resume_candidate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPack {
    pub id: String,
    pub manifest: ContextManifest,
    pub sections: Vec<ContextSection>,
    pub stable_prefix: String,
    pub dynamic_suffix: String,
    pub prompt: String,
    pub reuse: ContextReuse,
    pub tokens: usize,
}

impl ContextPack {
    pub fn section(&self, id: &str) -> Option<&ContextSection> {
        self.sections.iter().find(|section| section.id == id)
    }
}

#[derive(Debug, Clone)]
pub struct ContextEngine {
    pub root: PathBuf,
    pub board_name: String,
    pub store: ContextStore,
    pub skills: SkillRegistry,
    pub settings: ContextSettings,
}

impl ContextEngine {
    pub fn from_project(board_name: impl Into<String>) -> Result<Self> {
        let board_name = board_name.into();
        let root = crate::storage::board_dir::find_project_root()?;
        let board_dir = crate::storage::board_dir::find_board_dir()?;
        let settings = ContextSettings::load(&board_dir);
        let skills = SkillRegistry::load_all(Some(&board_name))?;
        Ok(Self {
            root,
            board_name,
            store: ContextStore::new(board_dir),
            skills,
            settings,
        })
    }

    pub fn new(
        root: impl Into<PathBuf>,
        board_name: impl Into<String>,
        store: ContextStore,
        skills: SkillRegistry,
        settings: ContextSettings,
    ) -> Self {
        Self {
            root: root.into(),
            board_name: board_name.into(),
            store,
            skills,
            settings: settings.sanitized(),
        }
    }

    /// Compile a pack without writing it or advancing the thread ledger.
    pub fn compile(&self, req: &CompileRequest) -> Result<ContextPack> {
        let budget = req
            .budget_tokens
            .unwrap_or(self.settings.budget_tokens)
            .clamp(1_000, 200_000);
        let role = req
            .role
            .as_deref()
            .map(str::trim)
            .filter(|role| !role.is_empty())
            .unwrap_or("builder")
            .to_string();

        let repo = RepoMap::build(&self.root, &self.settings.exclusions);
        let previous = self.store.previous_pack(&req.thread_id);
        let mut exclusions = repo
            .excluded
            .iter()
            .map(|(path, reason)| ContextExclusion {
                path: path.clone(),
                reason: reason.clone(),
            })
            .collect::<Vec<_>>();

        let candidates = self.select_candidates(
            &req.card,
            req.extra_prompt.as_deref(),
            &repo,
            &mut exclusions,
        );
        let explicit_skills = req
            .explicit_skills
            .iter()
            .map(|skill| skill.trim().to_string())
            .filter(|skill| !skill.is_empty())
            .collect::<Vec<_>>();
        let attached = self.route_skills(req, &role, &candidates, &explicit_skills);

        let stable_cap = budget.saturating_mul(64) / 100;
        let mut stable_sections = Vec::new();
        stable_sections.push(section(
            "identity",
            "Identity",
            "stable",
            identity_text(),
            Vec::new(),
        ));
        stable_sections.push(section(
            "role",
            "Role",
            "stable",
            role_text(&role),
            Vec::new(),
        ));
        stable_sections.push(section(
            "contract",
            "Worker contract",
            "stable",
            contract_text(&role),
            Vec::new(),
        ));

        let invariants_cap = (stable_cap / 7).max(220);
        let invariants = self.invariants_context(invariants_cap);
        if !invariants.trim().is_empty() {
            stable_sections.push(section(
                "invariants",
                "Project invariants",
                "stable",
                invariants,
                Vec::new(),
            ));
        }

        let memory_cap = (stable_cap / 10).max(180);
        let memory = self.memory_context(&req.card, memory_cap);
        if !memory.trim().is_empty() {
            stable_sections.push(section(
                "memory",
                "Relevant memory",
                "stable",
                memory,
                Vec::new(),
            ));
        }

        let project_cap = (stable_cap / 5).max(240);
        let project_text = self.project_context(project_cap);
        stable_sections.push(section(
            "project",
            "Project context",
            "stable",
            project_text,
            Vec::new(),
        ));

        let skills_cap = (stable_cap / 5).max(300);
        stable_sections.push(section(
            "skills",
            "Attached skills",
            "stable",
            render_skills(&attached, skills_cap),
            Vec::new(),
        ));

        if self.settings.include_repo_map {
            let map_cap = (stable_cap / 8).max(180);
            stable_sections.push(section(
                "repo_map",
                "Repository map",
                "stable",
                repo.render(chars_for_tokens(map_cap)),
                Vec::new(),
            ));
        }

        let mut used = stable_sections
            .iter()
            .map(|section| section.tokens)
            .sum::<usize>();
        let mut selected_files = Vec::new();
        for candidate in candidates {
            if selected_files.len() >= self.settings.max_files {
                exclusions.push(ContextExclusion {
                    path: candidate.path.clone(),
                    reason: format!("file limit reached ({} files)", self.settings.max_files),
                });
                continue;
            }
            let remaining = stable_cap.saturating_sub(used);
            if remaining < 40 {
                exclusions.push(ContextExclusion {
                    path: candidate.path.clone(),
                    reason: "stable context budget reached".into(),
                });
                continue;
            }
            match self.read_candidate(candidate, remaining) {
                Ok(selected) => {
                    used += selected.tokens;
                    selected_files.push(selected);
                }
                Err(reason) => exclusions.push(ContextExclusion {
                    path: reason.0,
                    reason: reason.1,
                }),
            }
        }
        for selected in &selected_files {
            stable_sections.push(ContextSection {
                id: format!("file:{}", selected.path),
                title: selected.path.clone(),
                kind: "stable".into(),
                content: selected.content.clone(),
                hash: selected.hash.clone(),
                tokens: selected.tokens,
                bytes: selected.bytes,
                files: vec![selected.path.clone()],
            });
        }

        let mut dynamic_sections = Vec::new();
        dynamic_sections.push(section(
            "task",
            "Task",
            "dynamic",
            task_text(&req.card, req.extra_prompt.as_deref()),
            Vec::new(),
        ));

        if let Some(previous) = previous.as_ref() {
            let delta = self.delta_context(previous, &repo, (budget / 12).max(160));
            if !delta.trim().is_empty() {
                dynamic_sections.push(section("delta", "Delta since last run", "dynamic", delta, Vec::new()));
            }
        }

        let ledger = self.store.load_ledger(&req.thread_id);
        let ledger_text = ledger.render(chars_for_tokens((budget / 16).max(120)));
        if !ledger_text.trim().is_empty() {
            dynamic_sections.push(section(
                "ledger",
                "Thread context ledger",
                "dynamic",
                format!("## Prior runs in this thread\n\n{ledger_text}"),
                Vec::new(),
            ));
        }

        // Guarantee the whole prompt stays inside the requested budget. Drop
        // the least valuable stable sections first (repo map, project, files)
        // before touching identity/contract/task.
        trim_to_budget(&mut stable_sections, &mut dynamic_sections, budget);

        let stable_hash = stable_hash(&repo.head_sha, &role, &stable_sections, &selected_files, &attached);
        let dynamic_hash = dynamic_hash(&dynamic_sections);
        let (invalidations, previous_reuse_reason, previous_pack_id, previous_stable_hash) =
            compare_previous(previous.as_ref(), &stable_hash, repo.head_sha.as_deref(), &stable_sections, &selected_files, &attached);
        let reused = previous.is_some() && previous_reuse_reason == "stable prefix unchanged";
        let reuse_reason = if let Some(previous) = previous.as_ref() {
            if reused {
                format!(
                    "stable prefix reused from {}",
                    previous
                        .manifest
                        .run_id
                        .as_deref()
                        .unwrap_or(previous.manifest.id.as_str())
                )
            } else {
                format!(
                    "stable prefix invalidated: {}",
                    invalidations
                        .first()
                        .cloned()
                        .unwrap_or_else(|| "inputs changed".into())
                )
            }
        } else {
            "first run on this thread; no previous stable prefix".to_string()
        };

        let stable_prefix = stable_sections
            .iter()
            .map(|section| section.content.trim_end())
            .collect::<Vec<_>>()
            .join("\n\n");
        let dynamic_suffix = dynamic_sections
            .iter()
            .map(|section| section.content.trim_end())
            .collect::<Vec<_>>()
            .join("\n\n");
        let prompt = format!("{stable_prefix}\n\n{dynamic_suffix}\n");
        let stable_tokens = stable_sections.iter().map(|section| section.tokens).sum::<usize>();
        let dynamic_tokens = dynamic_sections.iter().map(|section| section.tokens).sum::<usize>();

        let mut manifest = ContextManifest {
            version: MANIFEST_VERSION,
            id: String::new(),
            thread_id: req.thread_id.clone(),
            card_id: req.card_id.clone(),
            run_id: req.run_id.clone(),
            created_at: chrono::Utc::now(),
            head_sha: repo.head_sha.clone(),
            role: role.clone(),
            provider: req.provider.clone(),
            permission_mode: req.permission_mode.clone(),
            sections: stable_sections
                .iter()
                .chain(dynamic_sections.iter())
                .map(|section| ManifestSection {
                    id: section.id.clone(),
                    title: section.title.clone(),
                    kind: section.kind.clone(),
                    hash: section.hash.clone(),
                    tokens: section.tokens,
                    bytes: section.bytes,
                })
                .collect(),
            skills: attached.iter().map(ManifestSkill::from).collect(),
            files: selected_files.iter().map(ManifestFile::from).collect(),
            exclusions,
            stable_hash: stable_hash.clone(),
            dynamic_hash,
            budget_tokens: budget,
            estimated_tokens: stable_tokens + dynamic_tokens,
        };
        manifest = manifest.with_content_id();
        let pack_id = manifest.id.clone();
        let sections = stable_sections
            .into_iter()
            .chain(dynamic_sections)
            .collect::<Vec<_>>();

        Ok(ContextPack {
            id: pack_id,
            manifest,
            sections,
            stable_prefix,
            dynamic_suffix,
            prompt,
            reuse: ContextReuse {
                previous_pack_id,
                previous_stable_hash,
                stable_hash: stable_hash.clone(),
                reused,
                reason: reuse_reason,
                invalidations: invalidations.clone(),
                stable_prefix_tokens: stable_tokens,
                dynamic_tokens,
                reused_tokens: if reused { stable_tokens } else { 0 },
                cache_hits: if reused { 1 } else { 0 },
                last_invalidation_reason: invalidations.first().cloned(),
                resume_candidate: previous
                    .as_ref()
                    .map(|pack| pack.reuse.resume_candidate || pack.manifest.run_id.is_some())
                    .unwrap_or(false),
            },
            tokens: stable_tokens + dynamic_tokens,
        })
    }

    /// Compile, persist the pack/manifest, and advance the ledger.
    pub fn compile_and_store(&self, req: &CompileRequest) -> Result<ContextPack> {
        let pack = self.compile(req)?;
        self.store.save_pack(&pack)?;
        self.store
            .record(&pack, pack.reuse.invalidations.clone())?;
        Ok(pack)
    }

    /// Load the pack referenced by a persisted run.
    pub fn pack_for_run(&self, manifest_id: &str) -> Result<ContextPack> {
        self.store.load_pack(manifest_id)
    }

    pub fn previous_pack(&self, thread_id: &str) -> Option<ContextPack> {
        self.store.previous_pack(thread_id)
    }

    fn project_context(&self, cap_tokens: usize) -> String {
        let path = self.root.join(crate::context_file::FILE_NAME);
        let raw = std::fs::read_to_string(&path).unwrap_or_default();
        if raw.trim().is_empty() {
            return "No project_context.md yet. Use the repository map and the card brief.".into();
        }
        let text = truncate_tokens(raw.trim(), cap_tokens);
        format!("## Project context (`project_context.md`)\n\n{text}")
    }

    /// Repository-owned instructions that every agent must follow. These are
    /// deliberately never dropped by the budget trimmer.
    fn invariants_context(&self, cap_tokens: usize) -> String {
        let mut sections = Vec::new();
        for name in ["AGENTS.md", "CLAUDE.md"] {
            let path = self.root.join(name);
            let Ok(raw) = std::fs::read_to_string(&path) else {
                continue;
            };
            if raw.trim().is_empty() {
                continue;
            }
            sections.push(format!(
                "### {name}\n\n{}",
                truncate_tokens(raw.trim(), cap_tokens / 2 + 80)
            ));
        }
        if sections.is_empty() {
            String::new()
        } else {
            format!(
                "## Project invariants\n\n{}",
                truncate_tokens(&sections.join("\n\n"), cap_tokens)
            )
        }
    }

    fn memory_context(&self, card: &Card, cap_tokens: usize) -> String {
        let Ok(store) = crate::memory::store::MemoryStore::open_at(
            &self.board_name,
            self.store.board_dir(),
        ) else {
            return String::new();
        };
        let query = format!(
            "{} {} {}",
            card.title,
            card.description.as_deref().unwrap_or_default(),
            card.labels.join(" ")
        );
        let hits = store.search(&query, 5);
        let mut lines = Vec::new();
        for hit in hits {
            lines.push(format!("- [{}] {}", hit.tier.display_name(), hit.content.trim()));
        }
        let mut facts = store.memory.project_facts.clone();
        facts.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        for fact in facts.into_iter().take(6) {
            lines.push(format!("- [fact:{}] {}", fact.category, fact.fact.trim()));
        }
        if lines.is_empty() {
            return String::new();
        }
        format!(
            "## Relevant project memory\n\n{}",
            truncate_tokens(&lines.join("\n"), cap_tokens)
        )
    }

    fn delta_context(&self, previous: &ContextPack, repo: &RepoMap, cap_tokens: usize) -> String {
        let mut lines = Vec::new();
        let previous_head = previous.manifest.head_sha.as_deref();
        if previous_head != repo.head_sha.as_deref() {
            let range = match (previous_head, repo.head_sha.as_deref()) {
                (Some(from), Some(to)) => Some(format!("{from}..{to}")),
                _ => None,
            };
            if let Some(range) = range {
                if let Ok(output) = std::process::Command::new("git")
                    .args(["diff", "--name-only", &range])
                    .current_dir(&self.root)
                    .output()
                {
                    let files = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .filter(|line| !line.trim().is_empty())
                        .take(20)
                        .map(str::to_string)
                        .collect::<Vec<_>>();
                    if !files.is_empty() {
                        lines.push("Files changed on the base branch since the previous run:".into());
                        for file in files {
                            lines.push(format!("- {file}"));
                        }
                    }
                }
            }
        }
        if let Some(run_id) = previous.manifest.run_id.as_deref() {
            lines.push(format!("Previous run: {run_id}"));
        }
        if !previous.reuse.invalidations.is_empty() {
            lines.push("Why the previous prefix was invalidated:".into());
            for reason in previous.reuse.invalidations.iter().take(6) {
                lines.push(format!("- {reason}"));
            }
        }
        if let Ok(changed) = super::repo_map::changed_paths(&self.root, 10) {
            if !changed.is_empty() {
                lines.push("Working tree changes right now:".into());
                for path in changed {
                    lines.push(format!("- {path}"));
                }
            }
        }
        if lines.is_empty() {
            return String::new();
        }
        format!(
            "## Delta since last run\n\n{}",
            truncate_tokens(&lines.join("\n"), cap_tokens)
        )
    }

    fn select_candidates(
        &self,
        card: &Card,
        extra_prompt: Option<&str>,
        repo: &RepoMap,
        exclusions: &mut Vec<ContextExclusion>,
    ) -> Vec<Candidate> {
        let mut candidates = Vec::new();
        let mut seen = BTreeSet::new();

        // 0. Explicit @path references in the composer win over heuristics.
        for path in explicit_file_refs(extra_prompt.unwrap_or_default()) {
            let Some(rel) = project_relative(&self.root, Path::new(&path)) else {
                exclusions.push(ContextExclusion {
                    path,
                    reason: "explicit path is outside the project".into(),
                });
                continue;
            };
            if let Some(reason) = is_allowed(&rel, &self.settings.exclusions) {
                exclusions.push(ContextExclusion {
                    path: rel,
                    reason,
                });
                continue;
            }
            if seen.insert(rel.clone()) {
                candidates.push(Candidate {
                    path: rel,
                    reason: "explicit @file".into(),
                });
            }
        }

        // 1. Explicit code-context links on the card.
        for file in crate::agent::queue::populate_context_files(&card.id, &self.board_name) {
            let Some(rel) = project_relative(&self.root, Path::new(&file.path)) else {
                exclusions.push(ContextExclusion {
                    path: file.path.clone(),
                    reason: "outside project root".into(),
                });
                continue;
            };
            if let Some(reason) = is_allowed(&rel, &self.settings.exclusions) {
                exclusions.push(ContextExclusion {
                    path: rel,
                    reason,
                });
                continue;
            }
            if seen.insert(rel.clone()) {
                candidates.push(Candidate {
                    path: rel,
                    reason: "card code context".into(),
                });
            }
        }

        // 2. Symbol index matches against the card title and acceptance.
        let mut index_query = card.title.clone();
        if let Some(description) = card.description.as_deref() {
            index_query.push(' ');
            index_query.extend(description.chars().take(2_000));
        }
        for criterion in card.acceptance_criteria.iter().take(20) {
            index_query.push(' ');
            index_query.extend(criterion.chars().take(300));
        }
        let index = crate::code::index::SymbolIndex::build(&self.root);
        for scored in index.match_title(&index_query, 2, self.settings.max_files.max(6)) {
            if let Some(reason) = is_allowed(&scored.path, &self.settings.exclusions) {
                exclusions.push(ContextExclusion {
                    path: scored.path,
                    reason,
                });
                continue;
            }
            if seen.insert(scored.path.clone()) {
                candidates.push(Candidate {
                    path: scored.path,
                    reason: if scored.matched_symbols.is_empty() {
                        "repository match".into()
                    } else {
                        format!("symbols: {}", scored.matched_symbols.join(", "))
                    },
                });
            }
        }

        // 3. Orientation files for a cold project.
        for path in ["README.md", "Cargo.toml", "package.json", "pyproject.toml"] {
            if !self.root.join(path).is_file() {
                continue;
            }
            if let Some(reason) = is_allowed(path, &self.settings.exclusions) {
                exclusions.push(ContextExclusion {
                    path: path.to_string(),
                    reason,
                });
                continue;
            }
            if seen.insert(path.to_string()) {
                candidates.push(Candidate {
                    path: path.to_string(),
                    reason: "project orientation".into(),
                });
            }
        }

        // Any tracked source file is a last resort for empty/new repos.
        if candidates.is_empty() {
            if let Some(path) = repo
                .files
                .iter()
                .find(|path| {
                    matches!(
                        path.rsplit('.').next().unwrap_or_default(),
                        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go"
                    )
                })
                .cloned()
            {
                candidates.push(Candidate {
                    path,
                    reason: "fallback source file".into(),
                });
            }
        }
        candidates
    }

    fn route_skills(
        &self,
        req: &CompileRequest,
        role: &str,
        candidates: &[Candidate],
        explicit: &[String],
    ) -> Vec<AttachedSkill> {
        let mut context_text = format!(
            "{} {} {}",
            req.card.title,
            req.card
                .description
                .as_deref()
                .unwrap_or_default()
                .chars()
                .take(2_000)
                .collect::<String>(),
            req.card.acceptance_criteria.join(" ")
        );
        for label in &req.card.labels {
            context_text.push(' ');
            context_text.push_str(label);
        }
        if let Some(area) = &req.card.area {
            context_text.push(' ');
            context_text.push_str(area);
        }
        let context_tokens = crate::code::symbols::tokens_of(&context_text)
            .into_iter()
            .collect::<BTreeSet<_>>();
        let file_tokens = candidates
            .iter()
            .flat_map(|candidate| crate::code::symbols::tokens_of(&candidate.path))
            .collect::<BTreeSet<_>>();

        let role_fallback = match role.to_ascii_lowercase().as_str() {
            "product-owner" | "product" => vec!["planning", "mvp"],
            "scrum-master" | "scrum" => vec!["scrum-master"],
            "tech-lead" | "tech" => vec!["code-review", "architecture-review"],
            "project-manager" | "pm" => vec!["planning"],
            _ => Vec::new(),
        };

        let mut scored = Vec::<(u32, AttachedSkill)>::new();
        let mut seen_skills = BTreeSet::new();
        for skill in self.skills.skills.iter().filter(|skill| skill.enabled) {
            if !seen_skills.insert(skill.id.clone()) {
                continue;
            }
            let mut score = 0u32;
            let mut reason = None;

            if explicit.iter().any(|id| id == &skill.id) {
                score = 10_000;
                reason = Some("explicit".to_string());
            } else if skill.always {
                score = 9_000;
                reason = Some("always".to_string());
            } else {
                let trigger_hits = skill
                    .triggers
                    .iter()
                    .filter(|trigger| {
                        let trigger = trigger.to_ascii_lowercase();
                        let trigger_tokens = crate::code::symbols::tokens_of(&trigger);
                        trigger_tokens
                            .iter()
                            .any(|token| context_tokens.contains(token))
                            || context_tokens.contains(&trigger)
                    })
                    .count();
                let file_hits = skill
                    .triggers
                    .iter()
                    .filter(|trigger| {
                        let trigger = trigger.to_ascii_lowercase();
                        crate::code::symbols::tokens_of(&trigger)
                            .iter()
                            .any(|token| file_tokens.contains(token))
                    })
                    .count();
                if trigger_hits > 0 || file_hits > 0 {
                    score = (trigger_hits as u32 * 10) + (file_hits as u32 * 4);
                    reason = Some(if file_hits > 0 && trigger_hits == 0 {
                        "file".to_string()
                    } else {
                        "trigger".to_string()
                    });
                } else if role_fallback.contains(&skill.id.as_str()) {
                    score = 2;
                    reason = Some("role".to_string());
                }
            }

            let Some(reason) = reason else {
                continue;
            };
            let hash = hash_text(&skill.content);
            scored.push((
                score,
                AttachedSkill {
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    description: skill.description.clone(),
                    reason,
                    source: source_name(&skill.source),
                    hash,
                    tokens: estimate_tokens(&skill.content),
                    content: skill.content.clone(),
                },
            ));
        }
        scored.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.id.cmp(&b.1.id))
        });
        scored.into_iter().take(MAX_SKILLS).map(|(_, skill)| skill).collect()
    }

    fn read_candidate(&self, candidate: Candidate, max_tokens: usize) -> Result<SelectedFile, (String, String)> {
        let path = self.root.join(&candidate.path);
        let metadata = std::fs::metadata(&path).map_err(|error| {
            (
                candidate.path.clone(),
                format!("unreadable: {error}"),
            )
        })?;
        if metadata.len() as usize > self.settings.max_file_bytes {
            return Err((
                candidate.path,
                format!(
                    "file is {} bytes (limit {})",
                    metadata.len(),
                    self.settings.max_file_bytes
                ),
            ));
        }
        let content = std::fs::read_to_string(&path).map_err(|error| {
            (
                candidate.path.clone(),
                format!("not text or unreadable: {error}"),
            )
        })?;
        if content.contains('\0') {
            return Err((candidate.path, "binary file".into()));
        }
        let hash = hash_text(&content);
        let content = truncate_tokens(&content, max_tokens);
        let bytes = content.len();
        let symbols = crate::code::index::SymbolIndex::build(&self.root)
            .get(&candidate.path)
            .map(|entry| entry.symbols.iter().take(8).cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        let language = candidate
            .path
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_string();
        let content = format!(
            "### {}\n\n_Selected because: {}_\n\n```{}\n{}\n```",
            candidate.path,
            candidate.reason,
            language,
            content.trim_end()
        );
        let tokens = estimate_tokens(&content);
        Ok(SelectedFile {
            path: candidate.path,
            reason: candidate.reason,
            hash,
            content,
            tokens,
            bytes,
            symbols,
        })
    }
}

#[derive(Debug, Clone)]
struct Candidate {
    path: String,
    reason: String,
}

#[derive(Debug, Clone)]
struct SelectedFile {
    path: String,
    reason: String,
    hash: String,
    content: String,
    tokens: usize,
    bytes: usize,
    symbols: Vec<String>,
}

impl From<&SelectedFile> for ManifestFile {
    fn from(file: &SelectedFile) -> Self {
        Self {
            path: file.path.clone(),
            hash: file.hash.clone(),
            bytes: file.bytes,
            tokens: file.tokens,
            symbols: file.symbols.clone(),
            reason: file.reason.clone(),
        }
    }
}

impl From<&AttachedSkill> for ManifestSkill {
    fn from(skill: &AttachedSkill) -> Self {
        Self {
            id: skill.id.clone(),
            name: skill.name.clone(),
            reason: skill.reason.clone(),
            source: skill.source.clone(),
            hash: skill.hash.clone(),
            tokens: skill.tokens,
        }
    }
}

fn section(
    id: &str,
    title: &str,
    kind: &str,
    content: String,
    files: Vec<String>,
) -> ContextSection {
    ContextSection {
        id: id.to_string(),
        title: title.to_string(),
        kind: kind.to_string(),
        hash: hash_text(&content),
        tokens: estimate_tokens(&content),
        bytes: content.len(),
        content,
        files,
    }
}

fn source_name(source: &SkillSource) -> String {
    match source {
        SkillSource::Builtin => "builtin".into(),
        SkillSource::Project => "project".into(),
        SkillSource::User => "user".into(),
    }
}

fn render_skills(skills: &[AttachedSkill], cap_tokens: usize) -> String {
    if skills.is_empty() {
        return "## Attached skills\n\nNo skill matched this task. Continue with the project's own conventions.".into();
    }
    let mut out = String::from("## Attached skills\n\n");
    let mut used = 0usize;
    for skill in skills {
        if used >= cap_tokens {
            break;
        }
        let remaining = cap_tokens.saturating_sub(used);
        let content = truncate_tokens(&skill_content(skill), remaining);
        used += estimate_tokens(&content);
        out.push_str(&format!(
            "### {} (`{}`) — {}\n\n{}\n\n",
            skill.name, skill.id, skill.reason, content
        ));
    }
    out
}

fn skill_content(skill: &AttachedSkill) -> String {
    if skill.content.trim().is_empty() {
        format!("{} — {}", skill.name, skill.description)
    } else {
        skill.content.clone()
    }
}

fn identity_text() -> String {
    "# Bark worker context\n\n\
     You are working in an isolated git worktree managed by Bark.\n\
     Your job is to satisfy the card brief with the smallest correct change.\n\
     Do not merge, push, or modify the board. Leave review to the human."
        .to_string()
}

fn role_text(role: &str) -> String {
    let policy = match role.to_ascii_lowercase().as_str() {
        "builder" | "indie-hacker" | "developer" => {
            "Act as the implementation owner. Read before writing, keep the change scoped, \
             and verify with the project's tests."
        }
        "reviewer" | "tech-lead" => {
            "Act as the reviewer. Look for correctness, regressions, security issues, and \
             missing tests before approving."
        }
        "product-owner" | "product" => {
            "Act as the product owner. Protect scope, clarify acceptance criteria, and keep \
             the increment shippable."
        }
        "scrum-master" | "scrum" => {
            "Act as the delivery lead. Remove blockers, keep work-in-progress bounded, and \
             report the next concrete action."
        }
        _ => "Act as a careful senior engineer. Prefer evidence over assumptions.",
    };
    if let Some(agent_role) = crate::agent::roles::AgentRole::from_str(role) {
        format!("## Role: {}\n\n{}\n\n{}", agent_role.display_name(), agent_role.system_prompt(), policy)
    } else {
        format!("## Role: {role}\n\n{policy}")
    }
}

fn contract_text(role: &str) -> String {
    format!(
        "## Contract\n\n\
         - Work only inside the current worktree and branch.\n\
         - Read the files above instead of re-reading the entire project unless something is missing.\n\
         - Make the smallest correct change; preserve the project's style.\n\
         - Run the relevant tests or build before reporting done.\n\
         - Commit locally. Do not merge or push.\n\
         - Report changed files, test evidence, and remaining risk.\n\
         - Role: {role}."
    )
}

fn task_text(card: &Card, extra: Option<&str>) -> String {
    let mut out = format!("## Task\n\n### {}\n", card.title);
    if let Some(description) = card.description.as_deref().filter(|text| !text.trim().is_empty()) {
        out.push_str("\n");
        out.push_str(description.trim());
        out.push('\n');
    }
    if !card.acceptance_criteria.is_empty() {
        out.push_str("\n### Acceptance criteria\n\n");
        for criterion in &card.acceptance_criteria {
            out.push_str(&format!("- [ ] {criterion}\n"));
        }
    }
    if let Some(extra) = extra.filter(|text| !text.trim().is_empty()) {
        out.push_str("\n### Additional instruction\n\n");
        out.push_str(extra.trim());
        out.push('\n');
    }
    out
}

fn stable_hash(
    head: &Option<String>,
    role: &str,
    sections: &[ContextSection],
    files: &[SelectedFile],
    skills: &[AttachedSkill],
) -> String {
    let mut key = String::from("bark-context-v1|");
    key.push_str(head.as_deref().unwrap_or("no-head"));
    key.push('|');
    key.push_str(role);
    for section in sections.iter().filter(|section| section.kind == "stable") {
        key.push('|');
        key.push_str(&section.id);
        key.push(':');
        key.push_str(&section.hash);
    }
    for file in files {
        key.push('|');
        key.push_str(&file.path);
        key.push(':');
        key.push_str(&file.hash);
    }
    for skill in skills {
        key.push('|');
        key.push_str(&skill.id);
        key.push(':');
        key.push_str(&skill.hash);
    }
    hash_text(&key)
}

fn dynamic_hash(sections: &[ContextSection]) -> String {
    let mut key = String::from("bark-context-dynamic-v1|");
    for section in sections {
        key.push('|');
        key.push_str(&section.id);
        key.push(':');
        key.push_str(&section.hash);
    }
    hash_text(&key)
}

fn compare_previous(
    previous: Option<&ContextPack>,
    stable_hash: &str,
    head: Option<&str>,
    sections: &[ContextSection],
    files: &[SelectedFile],
    skills: &[AttachedSkill],
) -> (Vec<String>, String, Option<String>, Option<String>) {
    let Some(previous) = previous else {
        return (Vec::new(), "no previous pack".into(), None, None);
    };
    let previous_id = Some(previous.manifest.id.clone());
    let previous_stable = Some(previous.manifest.stable_hash.clone());
    if previous.manifest.stable_hash == stable_hash {
        return (
            Vec::new(),
            "stable prefix unchanged".into(),
            previous_id,
            previous_stable,
        );
    }

    let mut reasons = Vec::new();
    if previous.manifest.head_sha.as_deref() != head {
        reasons.push(format!(
            "HEAD changed from {} to {}",
            previous
                .manifest
                .head_sha
                .as_deref()
                .map(short_sha)
                .unwrap_or("none"),
            head.map(short_sha).unwrap_or("none")
        ));
    }

    let previous_sections = previous
        .manifest
        .sections
        .iter()
        .filter(|section| section.kind == "stable")
        .map(|section| (section.id.clone(), section.hash.clone()))
        .collect::<BTreeMap<_, _>>();
    for section in sections.iter().filter(|section| section.kind == "stable") {
        match previous_sections.get(&section.id) {
            Some(hash) if hash == &section.hash => {}
            Some(_) => reasons.push(format!("stable section `{}` changed", section.id)),
            None => reasons.push(format!("stable section `{}` added", section.id)),
        }
    }
    for id in previous_sections.keys() {
        if !sections.iter().any(|section| &section.id == id) {
            reasons.push(format!("stable section `{id}` removed"));
        }
    }

    let previous_files = previous
        .manifest
        .files
        .iter()
        .map(|file| (file.path.clone(), file.hash.clone()))
        .collect::<BTreeMap<_, _>>();
    for file in files {
        match previous_files.get(&file.path) {
            Some(hash) if hash == &file.hash => {}
            Some(_) => reasons.push(format!("file `{}` changed", file.path)),
            None => reasons.push(format!("file `{}` added to context", file.path)),
        }
    }
    for path in previous_files.keys() {
        if !files.iter().any(|file| &file.path == path) {
            reasons.push(format!("file `{path}` left context"));
        }
    }

    let previous_skills = previous
        .manifest
        .skills
        .iter()
        .map(|skill| (skill.id.clone(), skill.hash.clone()))
        .collect::<BTreeMap<_, _>>();
    for skill in skills {
        match previous_skills.get(&skill.id) {
            Some(hash) if hash == &skill.hash => {}
            Some(_) => reasons.push(format!("skill `{}` content changed", skill.id)),
            None => reasons.push(format!("skill `{}` attached", skill.id)),
        }
    }
    for id in previous_skills.keys() {
        if !skills.iter().any(|skill| &skill.id == id) {
            reasons.push(format!("skill `{id}` detached"));
        }
    }

    if reasons.is_empty() {
        reasons.push("context inputs changed".into());
    }
    reasons.truncate(12);
    (
        reasons,
        "stable prefix changed".into(),
        previous_id,
        previous_stable,
    )
}

fn short_sha(sha: &str) -> &str {
    &sha[..sha.len().min(8)]
}

fn explicit_file_refs(prompt: &str) -> Vec<String> {
    let mut refs = Vec::new();
    for raw in prompt.split_whitespace() {
        let token = raw.trim_matches(|ch: char| {
            ch.is_whitespace()
                || matches!(
                    ch,
                    '`' | '\'' | '"' | '(' | ')' | '[' | ']' | '<' | '>' | ',' | ';' | ':'
                )
        });
        let Some(path) = token.strip_prefix('@') else {
            continue;
        };
        let path = path.trim_end_matches(|ch: char| {
            matches!(
                ch,
                '`' | '\'' | '"' | '(' | ')' | '[' | ']' | '<' | '>' | ',' | ';' | ':' | '.'
            )
        });
        if path.is_empty() || path.contains("://") {
            continue;
        }
        if !refs.iter().any(|existing| existing == path) {
            refs.push(path.to_string());
        }
    }
    refs
}

fn trim_to_budget(
    stable: &mut Vec<ContextSection>,
    dynamic: &mut Vec<ContextSection>,
    budget: usize,
) {
    let dynamic_tokens = dynamic.iter().map(|section| section.tokens).sum::<usize>();
    let stable_budget = budget.saturating_sub(dynamic_tokens).max(200);
    // Keep the stable prefix bounded. Drop the least specific sections first.
    let drop_order = ["memory", "repo_map", "project", "skills"];
    for id in drop_order {
        let total = stable.iter().map(|section| section.tokens).sum::<usize>();
        if total <= stable_budget {
            break;
        }
        if let Some(index) = stable.iter().position(|section| section.id == id) {
            stable.remove(index);
        }
    }
    while stable.iter().map(|section| section.tokens).sum::<usize>() > stable_budget {
        if let Some(index) = stable
            .iter()
            .rposition(|section| section.id.starts_with("file:"))
        {
            stable.remove(index);
        } else {
            break;
        }
    }
    let total = stable.iter().map(|section| section.tokens).sum::<usize>()
        + dynamic.iter().map(|section| section.tokens).sum::<usize>();
    if total > budget {
        let task_index = dynamic.iter().position(|section| section.id == "task");
        if let Some(index) = task_index {
            let available = budget.saturating_sub(
                stable.iter().map(|section| section.tokens).sum::<usize>()
                    + dynamic
                        .iter()
                        .enumerate()
                        .filter(|(i, _)| *i != index)
                        .map(|(_, section)| section.tokens)
                        .sum::<usize>(),
            );
            let section = &mut dynamic[index];
            section.content = truncate_tokens(&section.content, available.max(80));
            section.tokens = estimate_tokens(&section.content);
            section.bytes = section.content.len();
            section.hash = hash_text(&section.content);
        }
    }
}

fn truncate_tokens(text: &str, max_tokens: usize) -> String {
    let max_chars = chars_for_tokens(max_tokens);
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut out = text.chars().take(max_chars.saturating_sub(1)).collect::<String>();
    out.push('…');
    out
}

fn chars_for_tokens(tokens: usize) -> usize {
    tokens.saturating_mul(4)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("bark_ctx_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".board")).unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("README.md"), "# Demo\n").unwrap();
        std::fs::write(root.join("src/lib.rs"), "pub fn add(a: i32, b: i32) -> i32 { a + b }\n").unwrap();
        std::fs::write(root.join(".env"), "TOKEN=should-not-leak\n").unwrap();
        (root.clone(), root.join(".board"))
    }

    fn engine(root: &Path, board: &Path) -> ContextEngine {
        let settings = ContextSettings {
            budget_tokens: 3000,
            ..Default::default()
        };
        ContextEngine::new(
            root,
            "dev",
            ContextStore::new(board),
            SkillRegistry {
                skills: crate::skills::builtin::builtin_skills(),
            },
            settings,
        )
    }

    fn request(card: Card, prompt: &str) -> CompileRequest {
        CompileRequest {
            thread_id: card.id.clone(),
            card_id: card.id.clone(),
            card,
            run_id: None,
            role: Some("builder".into()),
            provider: "fake".into(),
            permission_mode: "auto".into(),
            extra_prompt: Some(prompt.into()),
            explicit_skills: Vec::new(),
            budget_tokens: None,
        }
    }

    #[test]
    fn secrets_are_excluded_from_prompt_and_reported() {
        let (root, board) = temp_root();
        let mut card = Card::new("add-auth", "Add auth token validation", "todo");
        card.labels = vec!["feature".into()];
        let pack = engine(&root, &board).compile(&request(card, "focus on security")).unwrap();
        assert!(!pack.prompt.contains("should-not-leak"));
        assert!(pack
            .manifest
            .exclusions
            .iter()
            .any(|exclusion| exclusion.path == ".env"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn second_compile_reports_reused_prefix() {
        let (root, board) = temp_root();
        let engine = engine(&root, &board);
        let card = Card::new("add-math", "Add a math helper", "todo");
        let first = engine.compile_and_store(&request(card.clone(), "first")).unwrap();
        let second = engine.compile(&request(card, "second")).unwrap();
        assert!(second.reuse.reused, "{:?}", second.reuse);
        assert_eq!(second.reuse.previous_pack_id.as_deref(), Some(first.id.as_str()));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn changing_a_pinned_file_invalidates_the_prefix() {
        let (root, board) = temp_root();
        let engine = engine(&root, &board);
        let card = Card::new("add-math", "Add a math helper", "todo");
        let _ = engine.compile_and_store(&request(card.clone(), "first")).unwrap();
        std::fs::write(root.join("README.md"), "# Demo\n\nChanged\n").unwrap();
        let second = engine.compile(&request(card, "second")).unwrap();
        assert!(!second.reuse.reused);
        assert!(second
            .reuse
            .invalidations
            .iter()
            .any(|reason| reason.contains("README.md") || reason.contains("section")));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn unrelated_skill_is_not_attached() {
        let (root, board) = temp_root();
        let engine = engine(&root, &board);
        let card = Card::new("logo", "Update the logo", "todo");
        let pack = engine.compile(&request(card, "")).unwrap();
        assert!(!pack.manifest.skills.iter().any(|skill| skill.id == "security-audit"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn matching_skill_is_attached_with_a_reason() {
        let (root, board) = temp_root();
        let engine = engine(&root, &board);
        let card = Card::new("auth", "Add auth token validation", "todo");
        let pack = engine.compile(&request(card, "")).unwrap();
        let skill = pack
            .manifest
            .skills
            .iter()
            .find(|skill| skill.id == "security-audit")
            .expect("security skill should match auth/token");
        assert_eq!(skill.reason, "trigger");
        assert!(pack.prompt.contains("Security Auditor") || pack.prompt.contains("security"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn explicit_skill_wins_for_an_unrelated_task() {
        let (root, board) = temp_root();
        let engine = engine(&root, &board);
        let card = Card::new("logo", "Update the logo", "todo");
        let mut req = request(card, "");
        req.explicit_skills = vec!["tdd".into()];
        let pack = engine.compile(&req).unwrap();
        let skill = pack
            .manifest
            .skills
            .iter()
            .find(|skill| skill.id == "tdd")
            .expect("explicit skill should attach");
        assert_eq!(skill.reason, "explicit");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn changing_a_skill_invalidates_the_prefix() {
        let (root, board) = temp_root();
        let mut engine = engine(&root, &board);
        let card = Card::new("auth", "Add auth token validation", "todo");
        let _ = engine.compile_and_store(&request(card.clone(), "first")).unwrap();
        if let Some(skill) = engine
            .skills
            .skills
            .iter_mut()
            .find(|skill| skill.id == "security-audit")
        {
            skill.content.push_str("\n- New invariant: rotate tokens after every test run.\n");
        }
        let second = engine.compile(&request(card, "second")).unwrap();
        assert!(!second.reuse.reused);
        assert!(second
            .reuse
            .invalidations
            .iter()
            .any(|reason| reason.contains("skill `security-audit`")));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn prompt_respects_the_budget() {
        let (root, board) = temp_root();
        let engine = engine(&root, &board);
        let mut card = Card::new("large", "Add a large change", "todo");
        card.description = Some("word ".repeat(20_000));
        let mut req = request(card, "");
        req.budget_tokens = Some(1_000);
        let pack = engine.compile(&req).unwrap();
        assert!(
            pack.tokens <= 1_000,
            "pack used {} tokens over the 1000 budget",
            pack.tokens
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
