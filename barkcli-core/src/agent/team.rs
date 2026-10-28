//! Product-level roles and agent profiles.
//!
//! The existing `AgentRegistry` tracks live agent identity and task
//! bookkeeping. This module adds the product-level layer the Team surface
//! needs: a role catalog and editable, Markdown-backed agent profiles.
//!
//! Profiles live at `.board/agents/<id>.md` (the same folder as the legacy
//! registry). The registry remains the source of truth for active leases;
//! profiles describe who an agent is, what it can do, and how much it can run.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;

/// A product role. Roles are policy profiles, not running processes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoleDef {
    pub id: String,
    pub name: String,
    pub mission: String,
    #[serde(default)]
    pub outputs: Vec<String>,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub default_skills: Vec<String>,
    #[serde(default)]
    pub stop_condition: String,
    /// Whether this role is expected to edit production code by default.
    #[serde(default)]
    pub writes_code: bool,
    /// Built-in roles are always available; project roles override by id.
    #[serde(default, skip_serializing_if = "is_false")]
    pub builtin: bool,
    /// System prompt carried into runs and profile templates.
    #[serde(skip)]
    pub prompt: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RoleRegistry {
    pub roles: Vec<RoleDef>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn role(
    id: &str,
    name: &str,
    mission: &str,
    outputs: &[&str],
    tools: &[&str],
    skills: &[&str],
    stop: &str,
    writes_code: bool,
    prompt: &str,
) -> RoleDef {
    RoleDef {
        id: id.into(),
        name: name.into(),
        mission: mission.into(),
        outputs: outputs.iter().map(|s| s.to_string()).collect(),
        tools: tools.iter().map(|s| s.to_string()).collect(),
        default_skills: skills.iter().map(|s| s.to_string()).collect(),
        stop_condition: stop.into(),
        writes_code,
        builtin: true,
        prompt: prompt.into(),
    }
}

/// The default team that ships with Bark. First release: Product Owner,
/// Builder, Reviewer; the remaining roles are available but opt-in.
pub fn builtin_roles() -> Vec<RoleDef> {
    vec![
        role(
            "product-owner",
            "Product Owner",
            "Turn intent into a shippable slice",
            &["Plan", "Acceptance criteria", "Questions"],
            &["Board", "Specs", "Memory", "Research"],
            &["product-discovery", "acceptance-criteria"],
            "Plan approved or rejected",
            false,
            "You are the Product Owner for this project. Turn the user's intent into the smallest shippable slice. \
             Ask only blocking questions. Return a structured plan with acceptance criteria, task decomposition, \
             dependencies, risks, and a recommended team. Do not write production code.",
        ),
        role(
            "tech-lead",
            "Tech Lead",
            "Make the plan technically coherent",
            &["Architecture notes", "Task decomposition", "Review"],
            &["Code search", "Specs", "Diff"],
            &["architecture", "code-review"],
            "Plan validated or blocked",
            false,
            "You are the Tech Lead. Validate the plan against the codebase, propose the technical shape, \
             split work into independently testable tasks, and flag integration risks. Do not merge.",
        ),
        role(
            "builder",
            "Builder",
            "Implement one task",
            &["Code", "Tests", "Gate result"],
            &["Repo", "Terminal", "Git", "Tests"],
            &["implementation", "testing"],
            "Gate passes or blocked",
            true,
            "You are a Builder. Implement exactly one approved task in the smallest correct change. \
             Work only inside the current worktree. Run the project gate. Commit your work. Never merge or push.",
        ),
        role(
            "reviewer",
            "Reviewer",
            "Find defects before merge",
            &["Review verdict", "Comments"],
            &["Diff", "Tests", "Code search"],
            &["code-review", "security"],
            "Approved or changes requested",
            false,
            "You are the Reviewer. Inspect the run diff and gate evidence. Look for correctness, \
             security, and test gaps. Return a clear verdict and concrete fixes. Do not edit code.",
        ),
        role(
            "qa",
            "QA",
            "Verify acceptance criteria",
            &["Test matrix", "Evidence"],
            &["Tests", "App", "Screenshots"],
            &["qa", "edge-cases"],
            "All criteria evidenced",
            false,
            "You are QA. Map each acceptance criterion to evidence. Exercise edge cases and report gaps. \
             Do not change production behavior.",
        ),
        role(
            "release-captain",
            "Release Captain",
            "Ship safely",
            &["Commit/PR", "Merge", "Changelog"],
            &["Git", "PR CLI", "Gate"],
            &["release", "changelog"],
            "Merged or rolled back",
            false,
            "You are the Release Captain. Verify the gate, prepare the merge, update the changelog, \
             and stop on any destructive or ambiguous git operation.",
        ),
        role(
            "indie-hacker",
            "Indie Hacker",
            "Keep scope lean and distribution-aware",
            &["MVP cut", "Pricing/growth experiment"],
            &["Research", "Board", "Copy"],
            &["lean-scope", "growth"],
            "Recommendation delivered",
            false,
            "You are the Indie Hacker. Keep the slice lean. Challenge scope that does not improve \
             distribution, pricing, or learning velocity. Recommend the smallest experiment. Do not write production code.",
        ),
        role(
            "designer",
            "Designer",
            "Make the interface usable",
            &["UX notes", "Visual QA"],
            &["Screenshots", "Design tokens"],
            &["ui-review", "accessibility"],
            "Approved or changes requested",
            false,
            "You are the Designer. Review the interface against usability, accessibility, and the project's \
             design language. Give specific, implementable notes. Do not edit production code.",
        ),
    ]
}

impl RoleRegistry {
    pub fn builtin() -> Self {
        Self {
            roles: builtin_roles(),
        }
    }

    /// Load built-ins plus `.board/roles/*.md`. A project role with the same id
    /// overrides the built-in definition.
    pub fn load_at(board_dir: &Path) -> Self {
        let mut roles = builtin_roles();
        let dir = board_dir.join("roles");
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("md") {
                    continue;
                }
                if let Some(custom) = read_role_file(&path) {
                    if let Some(existing) = roles.iter_mut().find(|r| r.id == custom.id) {
                        *existing = RoleDef {
                            builtin: false,
                            ..custom
                        };
                    } else {
                        roles.push(RoleDef {
                            builtin: false,
                            ..custom
                        });
                    }
                }
            }
        }
        Self { roles }
    }

    pub fn from_project() -> Result<Self> {
        Ok(Self::load_at(&find_board_dir()?))
    }

    pub fn get(&self, id: &str) -> Option<&RoleDef> {
        self.roles.iter().find(|role| role.id == id)
    }

    pub fn validate_role(&self, id: &str) -> bool {
        self.get(id).is_some()
    }

    /// Markdown template for a project role. Useful for `barkcli roles init`
    /// and for showing the role contract in the UI.
    pub fn template(role: &RoleDef) -> String {
        let frontmatter = serde_json::json!({
            "id": role.id,
            "name": role.name,
            "mission": role.mission,
            "outputs": role.outputs,
            "tools": role.tools,
            "skills": role.default_skills,
            "stop_condition": role.stop_condition,
            "writes_code": role.writes_code,
        });
        format!(
            "---\n{}---\n\n{}\n",
            serde_yaml::to_string(&frontmatter).unwrap_or_default(),
            role.prompt
        )
    }
}

fn split_frontmatter(content: &str) -> (String, String) {
    let trimmed = content.trim();
    if let Some(rest) = trimmed.strip_prefix("---") {
        if let Some((frontmatter, body)) = rest.split_once("---") {
            return (frontmatter.to_string(), body.trim().to_string());
        }
    }
    (String::new(), trimmed.to_string())
}

#[derive(Debug, Deserialize)]
struct RoleFrontmatter {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    mission: String,
    #[serde(default)]
    outputs: Vec<String>,
    #[serde(default)]
    tools: Vec<String>,
    #[serde(default, alias = "skills")]
    default_skills: Vec<String>,
    #[serde(default)]
    stop_condition: String,
    #[serde(default)]
    writes_code: bool,
}

fn read_role_file(path: &Path) -> Option<RoleDef> {
    let content = std::fs::read_to_string(path).ok()?;
    let (frontmatter, body) = split_frontmatter(&content);
    let mut fm: RoleFrontmatter = serde_yaml::from_str(&frontmatter).ok()?;
    if fm.id.trim().is_empty() {
        fm.id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("role")
            .to_string();
    }
    if fm.name.trim().is_empty() {
        fm.name = fm.id.clone();
    }
    Some(RoleDef {
        id: fm.id,
        name: fm.name,
        mission: fm.mission,
        outputs: fm.outputs,
        tools: fm.tools,
        default_skills: fm.default_skills,
        stop_condition: fm.stop_condition,
        writes_code: fm.writes_code,
        builtin: false,
        prompt: body,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProfileStatus {
    Active,
    Paused,
    Retired,
}

impl Default for ProfileStatus {
    fn default() -> Self {
        Self::Active
    }
}

impl ProfileStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Retired => "retired",
        }
    }
}

/// Editable product profile for one agent instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProfile {
    pub id: String,
    pub name: String,
    pub role: String,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default = "default_capacity")]
    pub capacity: u32,
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default = "default_memory_scope")]
    pub memory_scope: String,
    #[serde(default)]
    pub status: ProfileStatus,
    /// System prompt from the Markdown body.
    #[serde(default)]
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<DateTime<Utc>>,
}

fn default_provider() -> String {
    "opencode".to_string()
}
fn default_capacity() -> u32 {
    1
}
fn default_permission_mode() -> String {
    "auto".to_string()
}
fn default_memory_scope() -> String {
    "project".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
struct ProfileFrontmatter {
    id: String,
    name: String,
    role: String,
    #[serde(default = "default_provider")]
    provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(default = "default_capacity")]
    capacity: u32,
    #[serde(default = "default_permission_mode")]
    permission_mode: String,
    #[serde(default)]
    skills: Vec<String>,
    #[serde(default = "default_memory_scope")]
    memory_scope: String,
    #[serde(default)]
    status: ProfileStatus,
}

impl AgentProfile {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        role: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            role: role.into(),
            provider: default_provider(),
            model: None,
            capacity: 1,
            permission_mode: default_permission_mode(),
            skills: Vec::new(),
            memory_scope: default_memory_scope(),
            status: ProfileStatus::Active,
            prompt: String::new(),
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
        }
    }

    pub fn is_available(&self) -> bool {
        self.status == ProfileStatus::Active && self.capacity > 0
    }

    fn frontmatter(&self) -> ProfileFrontmatter {
        ProfileFrontmatter {
            id: self.id.clone(),
            name: self.name.clone(),
            role: self.role.clone(),
            provider: self.provider.clone(),
            model: self.model.clone(),
            capacity: self.capacity,
            permission_mode: self.permission_mode.clone(),
            skills: self.skills.clone(),
            memory_scope: self.memory_scope.clone(),
            status: self.status.clone(),
        }
    }
}

/// Markdown-backed profile storage under `.board/agents`.
#[derive(Debug, Clone)]
pub struct ProfileStore {
    dir: PathBuf,
}

impl ProfileStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn from_project() -> Result<Self> {
        Ok(Self::new(find_board_dir()?.join("agents")))
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{}.md", crate::util::slug::to_slug(id)))
    }

    pub fn list(&self) -> Result<Vec<AgentProfile>> {
        if !self.dir.exists() {
            return Ok(Vec::new());
        }
        let mut profiles = Vec::new();
        for entry in std::fs::read_dir(&self.dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            if let Ok(profile) = read_profile_file(&path) {
                profiles.push(profile);
            }
        }
        profiles.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(profiles)
    }

    pub fn load(&self, id: &str) -> Result<AgentProfile> {
        let path = self.path(id);
        read_profile_file(&path)
            .with_context(|| format!("agent profile '{}' was not found", id))
    }

    pub fn save(&self, mut profile: AgentProfile) -> Result<AgentProfile> {
        if profile.id.trim().is_empty() {
            anyhow::bail!("agent id is required");
        }
        if profile.name.trim().is_empty() {
            anyhow::bail!("agent name is required");
        }
        if profile.role.trim().is_empty() {
            anyhow::bail!("agent role is required");
        }
        std::fs::create_dir_all(&self.dir)?;
        let now = Utc::now();
        if profile.created_at.is_none() {
            profile.created_at = Some(now);
        }
        profile.updated_at = Some(now);
        profile.capacity = profile.capacity.max(1);
        if profile.prompt.trim().is_empty() {
            let roles = RoleRegistry::load_at(
                self.dir
                    .parent()
                    .ok_or_else(|| anyhow::anyhow!("invalid agent directory"))?,
            );
            if let Some(role) = roles.get(&profile.role) {
                profile.prompt = role.prompt.clone();
            }
        }
        let frontmatter = serde_yaml::to_string(&profile.frontmatter())?;
        let body = format!(
            "---\n{}---\n\n{}\n",
            frontmatter,
            profile.prompt.trim()
        );
        let path = self.path(&profile.id);
        let tmp = path.with_extension("md.tmp");
        std::fs::write(&tmp, body)?;
        std::fs::rename(&tmp, &path)?;
        Ok(profile)
    }

    /// Idempotently hire the default team: Product Owner, two Builders, and a
    /// Reviewer. Returns the existing profiles when they are already present.
    pub fn ensure_default_team(&self) -> Result<Vec<AgentProfile>> {
        let existing = self.list()?;
        if !existing.is_empty() {
            return Ok(existing);
        }
        let roles = RoleRegistry::load_at(
            self.dir
                .parent()
                .ok_or_else(|| anyhow::anyhow!("invalid agent directory"))?,
        );
        let defaults = [
            ("product-owner", "Product Owner", "product-owner", 1u32),
            ("builder-1", "Builder One", "builder", 1u32),
            ("builder-2", "Builder Two", "builder", 1u32),
            ("reviewer", "Reviewer", "reviewer", 1u32),
        ];
        let mut hired = Vec::new();
        for (id, name, role_id, capacity) in defaults {
            let mut profile = AgentProfile::new(id, name, role_id);
            profile.capacity = capacity;
            profile.permission_mode = "supervised".into();
            if let Some(role) = roles.get(role_id) {
                profile.skills = role.default_skills.clone();
                profile.prompt = role.prompt.clone();
            }
            hired.push(self.save(profile)?);
        }
        Ok(hired)
    }

    pub fn set_status(&self, id: &str, status: ProfileStatus) -> Result<AgentProfile> {
        let mut profile = self.load(id)?;
        profile.status = status;
        self.save(profile)
    }
}

fn read_profile_file(path: &Path) -> Result<AgentProfile> {
    let content = std::fs::read_to_string(path)?;
    let (frontmatter, body) = split_frontmatter(&content);
    let fm: ProfileFrontmatter = serde_yaml::from_str(&frontmatter)
        .with_context(|| format!("invalid profile frontmatter in {}", path.display()))?;
    Ok(AgentProfile {
        id: fm.id,
        name: fm.name,
        role: fm.role,
        provider: fm.provider,
        model: fm.model,
        capacity: fm.capacity.max(1),
        permission_mode: fm.permission_mode,
        skills: fm.skills,
        memory_scope: fm.memory_scope,
        status: fm.status,
        prompt: body,
        created_at: None,
        updated_at: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_board() -> PathBuf {
        std::env::temp_dir().join(format!("bark_team_{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn builtins_cover_first_release_roles() {
        let registry = RoleRegistry::builtin();
        assert!(registry.validate_role("product-owner"));
        assert!(registry.validate_role("builder"));
        assert!(registry.validate_role("reviewer"));
        assert!(registry.validate_role("indie-hacker"));
        assert!(registry.get("builder").unwrap().writes_code);
        assert!(!registry.get("indie-hacker").unwrap().writes_code);
    }

    #[test]
    fn default_team_is_idempotent_and_includes_two_builders() {
        let board = temp_board();
        let store = ProfileStore::new(board.join("agents"));
        let first = store.ensure_default_team().unwrap();
        assert_eq!(first.len(), 4);
        assert_eq!(
            first
                .iter()
                .filter(|profile| profile.role == "builder")
                .count(),
            2
        );
        assert!(first.iter().all(|profile| !profile.prompt.is_empty()));
        let second = store.ensure_default_team().unwrap();
        assert_eq!(second.len(), 4);
        let _ = std::fs::remove_dir_all(&board);
    }

    #[test]
    fn profile_roundtrips_markdown() {
        let board = temp_board();
        let store = ProfileStore::new(board.join("agents"));
        let mut profile = AgentProfile::new("builder-3", "Builder Three", "builder");
        profile.skills = vec!["rust".into(), "tests".into()];
        profile.capacity = 2;
        profile.prompt = "Build the smallest thing.".into();
        store.save(profile).unwrap();
        let loaded = store.load("builder-3").unwrap();
        assert_eq!(loaded.name, "Builder Three");
        assert_eq!(loaded.capacity, 2);
        assert_eq!(loaded.skills, vec!["rust", "tests"]);
        assert!(loaded.prompt.contains("smallest thing"));
        assert_eq!(loaded.status, ProfileStatus::Active);
        let _ = std::fs::remove_dir_all(&board);
    }

    #[test]
    fn custom_role_overrides_builtin() {
        let board = temp_board();
        std::fs::create_dir_all(board.join("roles")).unwrap();
        std::fs::write(
            board.join("roles/builder.md"),
            "---\nid: builder\nname: Senior Builder\nmission: Ship carefully\nwrites_code: true\n---\nCustom prompt\n",
        )
        .unwrap();
        let registry = RoleRegistry::load_at(&board);
        let builder = registry.get("builder").unwrap();
        assert_eq!(builder.name, "Senior Builder");
        assert!(!builder.builtin);
        assert_eq!(builder.prompt, "Custom prompt");
        let _ = std::fs::remove_dir_all(&board);
    }
}
