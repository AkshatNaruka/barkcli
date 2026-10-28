//! Structured plans and their persisted orchestra state.
//!
//! A plan is the contract between a founder and the team: summary,
//! assumptions, questions, acceptance criteria, tasks, dependencies, risks,
//! and a recommended team. Plans are persisted as JSON under
//! `.board/orchestra/<board>/plans/`.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::agent::team::{AgentProfile, RoleRegistry};
use crate::models::Card;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    Draft,
    AwaitingApproval,
    Approved,
    Running,
    NeedsAttention,
    Completed,
    Cancelled,
}

impl Default for PlanStatus {
    fn default() -> Self {
        Self::Draft
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanTaskStatus {
    Waiting,
    Ready,
    Running,
    Review,
    Merged,
    Failed,
    Blocked,
    Cancelled,
}

impl Default for PlanTaskStatus {
    fn default() -> Self {
        Self::Waiting
    }
}

impl PlanTaskStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Merged | Self::Failed | Self::Cancelled)
    }

    pub fn is_gate_passed(&self) -> bool {
        matches!(self, Self::Review | Self::Merged)
    }

    pub fn is_active(&self) -> bool {
        matches!(self, Self::Running)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanQuestion {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub blocking: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanTask {
    pub id: String,
    pub title: String,
    pub role: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub estimate: String,
    #[serde(default)]
    pub priority: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub status: PlanTaskStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub previous_run_ids: Vec<String>,
    #[serde(default)]
    pub gate_passed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl PlanTask {
    pub fn new(id: impl Into<String>, title: impl Into<String>, role: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            role: role.into(),
            description: String::new(),
            acceptance_criteria: Vec::new(),
            files: Vec::new(),
            depends_on: Vec::new(),
            estimate: "S".into(),
            priority: "medium".into(),
            labels: Vec::new(),
            status: PlanTaskStatus::Waiting,
            card_id: None,
            agent_id: None,
            run_id: None,
            branch: None,
            worktree: None,
            previous_run_ids: Vec::new(),
            gate_passed: false,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductPlan {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub board_name: String,
    #[serde(default)]
    pub parent_card_id: String,
    #[serde(default)]
    pub parent_thread_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub assumptions: Vec<String>,
    #[serde(default)]
    pub questions: Vec<PlanQuestion>,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub tasks: Vec<PlanTask>,
    #[serde(default)]
    pub risks: Vec<String>,
    #[serde(default)]
    pub recommended_team: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_slice: Option<String>,
    #[serde(default)]
    pub status: PlanStatus,
    #[serde(default)]
    pub source: String,
    #[serde(default = "now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "now")]
    pub updated_at: DateTime<Utc>,
}

fn now() -> DateTime<Utc> {
    Utc::now()
}

impl ProductPlan {
    pub fn new(
        board_name: impl Into<String>,
        parent_card_id: impl Into<String>,
        title: impl Into<String>,
    ) -> Self {
        let now = Utc::now();
        let parent_card_id = parent_card_id.into();
        Self {
            id: format!("plan_{}", uuid::Uuid::new_v4().simple()),
            board_name: board_name.into(),
            parent_thread_id: parent_card_id.clone(),
            parent_card_id,
            title: title.into(),
            summary: String::new(),
            assumptions: Vec::new(),
            questions: Vec::new(),
            acceptance_criteria: Vec::new(),
            tasks: Vec::new(),
            risks: Vec::new(),
            recommended_team: vec![
                "product-owner".into(),
                "builder".into(),
                "reviewer".into(),
            ],
            first_slice: None,
            status: PlanStatus::Draft,
            source: "manual".into(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Build an offline-safe, editable plan from a card. The provider plan
    /// can replace this later; the shape is the same.
    pub fn from_card(board_name: &str, card: &Card) -> Self {
        let plan = crate::commands::plan::heuristic_plan(&card.title, &card.description);
        let mut product = Self::new(board_name, &card.id, &card.title);
        product.summary = plan.rationale.clone();
        product.risks = vec![format!("Risk: {}", plan.risk_level)];
        product.source = "heuristic".into();
        product.acceptance_criteria = if card.acceptance_criteria.is_empty() {
            plan.requirements
                .iter()
                .flat_map(|requirement| requirement.acceptance_criteria.clone())
                .collect()
        } else {
            card.acceptance_criteria.clone()
        };

        let mut code_ids = Vec::new();
        for (index, child) in plan.child_cards.iter().enumerate() {
            let id = format!("t{}", index + 1);
            let role = role_for_task(&child.title, &child.labels);
            let mut task = PlanTask::new(&id, &child.title, role.clone());
            task.description = child.description.clone();
            task.acceptance_criteria = child.acceptance_criteria.clone();
            task.priority = child.priority.clone();
            task.labels = child.labels.clone();
            task.estimate = match child.effort {
                0..=2 => "S",
                3..=5 => "M",
                _ => "L",
            }
            .into();
            if role == "reviewer" || role == "designer" {
                task.depends_on = code_ids.clone();
            }
            if is_verification_task(&child.title, &child.labels) {
                task.depends_on = code_ids.clone();
            }
            if !task.acceptance_criteria.is_empty()
                && !task
                    .acceptance_criteria
                    .iter()
                    .any(|criterion| criterion == "Gate passes")
            {
                task.acceptance_criteria.push("Gate passes".into());
            }
            if role == "builder" && !is_verification_task(&child.title, &child.labels) {
                code_ids.push(id.clone());
            }
            product.tasks.push(task);
        }
        product.first_slice = product.tasks.first().map(|task| task.id.clone());
        product.status = PlanStatus::AwaitingApproval;
        product
    }

    pub fn task(&self, id: &str) -> Option<&PlanTask> {
        self.tasks.iter().find(|task| task.id == id)
    }

    pub fn task_mut(&mut self, id: &str) -> Option<&mut PlanTask> {
        self.tasks.iter_mut().find(|task| task.id == id)
    }

    /// Validate the plan contract. Errors block approval; warnings are shown
    /// in the UI but do not discard work.
    pub fn validate(&self, roles: &RoleRegistry) -> Result<()> {
        let mut errors = self.validation_errors(roles);
        if errors.is_empty() {
            Ok(())
        } else {
            errors.sort();
            errors.dedup();
            anyhow::bail!(errors.join("; "))
        }
    }

    pub fn validation_errors(&self, roles: &RoleRegistry) -> Vec<String> {
        let mut errors = Vec::new();
        if self.summary.trim().is_empty() {
            errors.push("plan summary is required".into());
        }
        if self.tasks.is_empty() {
            errors.push("plan needs at least one task".into());
        }

        let mut seen = HashSet::new();
        for task in &self.tasks {
            let id = task.id.trim();
            if id.is_empty() {
                errors.push("task id is required".into());
            } else if !seen.insert(id.to_string()) {
                errors.push(format!("duplicate task id '{id}'"));
            }
            if task.title.trim().is_empty() {
                errors.push(format!("task '{id}' needs a title"));
            }
            if task.role.trim().is_empty() {
                errors.push(format!("task '{id}' needs a role"));
            } else if !roles.validate_role(&task.role) {
                errors.push(format!("task '{id}' has unknown role '{}'", task.role));
            }
            if task.acceptance_criteria.is_empty() {
                errors.push(format!("task '{id}' needs acceptance criteria"));
            }
        }

        for task in &self.tasks {
            for dep in &task.depends_on {
                if dep == &task.id {
                    errors.push(format!("task '{}' depends on itself", task.id));
                } else if !seen.contains(dep) {
                    errors.push(format!("task '{}' depends on unknown task '{dep}'", task.id));
                }
            }
        }
        if let Some(first) = &self.first_slice {
            if !seen.contains(first) {
                errors.push(format!("first slice '{first}' is not a task"));
            }
        }

        // Cycle detection.
        let mut visiting = HashSet::new();
        let mut visited = HashSet::new();
        for task in &self.tasks {
            if has_cycle(task, &self.tasks, &mut visiting, &mut visited) {
                errors.push("task dependencies contain a cycle".into());
                break;
            }
        }
        errors
    }

    /// True when every dependency of `task` has passed its gate (or merged).
    pub fn dependencies_met(&self, task: &PlanTask) -> bool {
        task.depends_on.iter().all(|dep| {
            self.task(dep)
                .map(|dep| dep.gate_passed || dep.status == PlanTaskStatus::Merged)
                .unwrap_or(false)
        })
    }

    pub fn dependency_blocked(&self, task: &PlanTask) -> bool {
        task.depends_on.iter().any(|dep| {
            self.task(dep)
                .map(|dep| {
                    matches!(
                        dep.status,
                        PlanTaskStatus::Failed
                            | PlanTaskStatus::Blocked
                            | PlanTaskStatus::Cancelled
                    )
                })
                .unwrap_or(true)
        })
    }

    pub fn active_tasks(&self) -> usize {
        self.tasks
            .iter()
            .filter(|task| task.status == PlanTaskStatus::Running)
            .count()
    }

    pub fn all_finished(&self) -> bool {
        !self.tasks.is_empty()
            && self.tasks.iter().all(|task| {
                matches!(
                    task.status,
                    PlanTaskStatus::Merged | PlanTaskStatus::Failed | PlanTaskStatus::Cancelled
                )
            })
    }

    pub fn needs_attention(&self) -> bool {
        self.tasks.iter().any(|task| {
            matches!(
                task.status,
                PlanTaskStatus::Failed | PlanTaskStatus::Blocked
            )
        })
    }

    /// Recompute statuses that depend on dependencies and terminal runs.
    pub fn refresh_statuses(&mut self) {
        let next = self
            .tasks
            .iter()
            .map(|task| {
                if matches!(
                    task.status,
                    PlanTaskStatus::Merged
                        | PlanTaskStatus::Failed
                        | PlanTaskStatus::Cancelled
                        | PlanTaskStatus::Running
                        | PlanTaskStatus::Review
                ) {
                    return task.status.clone();
                }
                if self.dependency_blocked(task) {
                    PlanTaskStatus::Blocked
                } else if self.dependencies_met(task) {
                    PlanTaskStatus::Ready
                } else {
                    PlanTaskStatus::Waiting
                }
            })
            .collect::<Vec<_>>();
        for (task, status) in self.tasks.iter_mut().zip(next) {
            task.status = status;
        }
        if self.tasks.iter().all(|task| task.status == PlanTaskStatus::Merged)
            && !self.tasks.is_empty()
        {
            self.status = PlanStatus::Completed;
        } else if self.needs_attention() {
            self.status = PlanStatus::NeedsAttention;
        } else if self.tasks.iter().any(|task| task.status == PlanTaskStatus::Running) {
            self.status = PlanStatus::Running;
        }
        self.updated_at = Utc::now();
    }
}

fn role_for_task(title: &str, labels: &[String]) -> String {
    let haystack = format!(
        "{} {}",
        title.to_lowercase(),
        labels.join(" ").to_lowercase()
    );
    if haystack.contains("review") || haystack.contains("security") {
        "reviewer".into()
    } else if haystack.contains("design") || haystack.contains("ux") || haystack.contains("a11y") {
        "designer".into()
    } else if haystack.contains("docs") || haystack.contains("architecture") {
        "tech-lead".into()
    } else if haystack.contains("release") || haystack.contains("changelog") {
        "release-captain".into()
    } else {
        "builder".into()
    }
}

fn is_verification_task(title: &str, labels: &[String]) -> bool {
    let haystack = format!(
        "{} {}",
        title.to_lowercase(),
        labels.join(" ").to_lowercase()
    );
    haystack.contains("test")
        || haystack.contains("verify")
        || haystack.contains("qa")
        || haystack.contains("review")
        || haystack.contains("docs")
}

fn has_cycle(
    task: &PlanTask,
    tasks: &[PlanTask],
    visiting: &mut HashSet<String>,
    visited: &mut HashSet<String>,
) -> bool {
    if visited.contains(&task.id) {
        return false;
    }
    if !visiting.insert(task.id.clone()) {
        return true;
    }
    for dep in &task.depends_on {
        if let Some(next) = tasks.iter().find(|candidate| &candidate.id == dep) {
            if has_cycle(next, tasks, visiting, visited) {
                return true;
            }
        }
    }
    visiting.remove(&task.id);
    visited.insert(task.id.clone());
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestraConfig {
    #[serde(default = "default_max_parallel")]
    pub max_parallel: u32,
}

fn default_max_parallel() -> u32 {
    2
}

impl Default for OrchestraConfig {
    fn default() -> Self {
        Self {
            max_parallel: default_max_parallel(),
        }
    }
}

/// Persisted plan store for one board.
#[derive(Debug, Clone)]
pub struct OrchestraStore {
    board_dir: PathBuf,
    base: PathBuf,
}

impl OrchestraStore {
    pub fn new(board_dir: impl Into<PathBuf>, board_name: &str) -> Self {
        let board_dir = board_dir.into();
        let base = board_dir
            .join("orchestra")
            .join(crate::util::slug::to_slug(board_name));
        Self { board_dir, base }
    }

    pub fn board_dir(&self) -> &Path {
        &self.board_dir
    }

    pub fn from_project(board_name: &str) -> Result<Self> {
        Ok(Self::new(
            crate::storage::board_dir::find_board_dir()?,
            board_name,
        ))
    }

    pub fn base(&self) -> &Path {
        &self.base
    }

    fn plans_dir(&self) -> PathBuf {
        self.base.join("plans")
    }

    fn plan_path(&self, id: &str) -> PathBuf {
        self.plans_dir().join(format!("{}.json", crate::util::slug::to_slug(id)))
    }

    pub fn save_plan(&self, plan: &ProductPlan) -> Result<()> {
        std::fs::create_dir_all(self.plans_dir())?;
        let path = self.plan_path(&plan.id);
        crate::util::lock::with_lock(&path, || {
            let json = serde_json::to_string_pretty(plan)?;
            let tmp = path.with_extension("json.tmp");
            std::fs::write(&tmp, json)?;
            std::fs::rename(&tmp, &path)?;
            Ok(())
        })
    }

    pub fn load_plan(&self, id: &str) -> Result<ProductPlan> {
        let path = self.plan_path(id);
        let json = std::fs::read_to_string(&path)
            .with_context(|| format!("plan '{}' was not found", id))?;
        Ok(serde_json::from_str(&json)?)
    }

    pub fn list_plans(&self) -> Result<Vec<ProductPlan>> {
        let dir = self.plans_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut plans = Vec::new();
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(json) = std::fs::read_to_string(&path) {
                if let Ok(plan) = serde_json::from_str::<ProductPlan>(&json) {
                    plans.push(plan);
                }
            }
        }
        plans.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(plans)
    }

    pub fn find_plan_for_run(&self, run_id: &str) -> Result<Option<ProductPlan>> {
        Ok(self.list_plans()?.into_iter().find(|plan| {
            plan.tasks
                .iter()
                .any(|task| task.run_id.as_deref() == Some(run_id))
        }))
    }

    pub fn config(&self) -> OrchestraConfig {
        std::fs::read_to_string(self.base.join("config.json"))
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    pub fn save_config(&self, config: &OrchestraConfig) -> Result<()> {
        std::fs::create_dir_all(&self.base)?;
        std::fs::write(
            self.base.join("config.json"),
            serde_json::to_string_pretty(config)?,
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentRecommendation {
    pub agent_id: String,
    pub name: String,
    pub role: String,
    pub score: i32,
    pub available: bool,
    pub load: u32,
    pub capacity: u32,
    pub success_rate: f32,
    pub reasons: Vec<String>,
}

/// Score and rank agents for a task. Role match is required; everything else
/// is an explainable preference. Manual assignment bypasses this ranking.
pub fn rank_agents(
    task: &PlanTask,
    profiles: &[AgentProfile],
    loads: &HashMap<String, u32>,
    success: &HashMap<String, f32>,
) -> Vec<AssignmentRecommendation> {
    let mut out = Vec::new();
    for profile in profiles {
        if profile.status != crate::agent::team::ProfileStatus::Active {
            continue;
        }
        if profile.role != task.role {
            continue;
        }
        let load = loads.get(&profile.id).copied().unwrap_or(0);
        let capacity = profile.capacity.max(1);
        let rate = success.get(&profile.id).copied().unwrap_or(0.0);
        let available = load < capacity;
        let mut score = 100;
        let mut reasons = vec![format!("role match: {}", task.role)];
        let task_skills = task
            .files
            .iter()
            .chain(task.labels.iter())
            .chain(std::iter::once(&task.title))
            .chain(std::iter::once(&task.description))
            .map(|value| value.to_lowercase())
            .collect::<Vec<_>>();
        for skill in &profile.skills {
            if task_skills.iter().any(|text| text.contains(&skill.to_lowercase())) {
                score += 8;
                reasons.push(format!("skill match: {skill}"));
            }
        }
        if available {
            score += 10;
            reasons.push(format!("capacity {load}/{capacity}"));
        } else {
            score -= 30;
            reasons.push(format!("at capacity {load}/{capacity}"));
        }
        score += (rate * 20.0).round() as i32;
        if rate > 0.0 {
            reasons.push(format!("success rate {:.0}%", rate * 100.0));
        }
        score -= load as i32 * 4;
        if profile.provider.trim().is_empty() {
            score -= 20;
            reasons.push("provider missing".into());
        }
        out.push(AssignmentRecommendation {
            agent_id: profile.id.clone(),
            name: profile.name.clone(),
            role: profile.role.clone(),
            score,
            available,
            load,
            capacity,
            success_rate: rate,
            reasons,
        });
    }
    out.sort_by(|a, b| {
        b.available
            .cmp(&a.available)
            .then_with(|| b.score.cmp(&a.score))
            .then_with(|| a.agent_id.cmp(&b.agent_id))
    });
    out
}

/// Materialize one child card per plan task and link it to the parent card.
/// Idempotent: already-linked cards are kept.
pub fn materialize_cards(board_name: &str, plan: &mut ProductPlan) -> Result<()> {
    use crate::models::card::{CardLink, LinkType};
    use crate::storage::board_file::{read_board, update_board};

    let board = read_board(board_name)?;
    let parent = board
        .cards
        .iter()
        .find(|card| card.id == plan.parent_card_id)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("parent card '{}' not found", plan.parent_card_id))?;
    let mut existing = board
        .cards
        .iter()
        .map(|card| card.id.clone())
        .collect::<Vec<_>>();
    let mut planned = Vec::new();
    for task in &plan.tasks {
        if let Some(card_id) = &task.card_id {
            if board.cards.iter().any(|card| &card.id == card_id) {
                existing.push(card_id.clone());
                planned.push((task.id.clone(), card_id.clone()));
                continue;
            }
        }
        let base = format!("{}-{}", parent.id, task.id);
        let card_id = crate::util::slug::unique_slug(&base, &existing);
        existing.push(card_id.clone());
        planned.push((task.id.clone(), card_id));
    }

    update_board(board_name, |board| {
        for (task_id, card_id) in &planned {
            let Some(task) = plan.tasks.iter().find(|task| &task.id == task_id) else {
                continue;
            };
            if board.cards.iter().any(|card| &card.id == card_id) {
                continue;
            }
            let mut card = Card::new(card_id, &task.title, "todo");
            card.description = Some(format!(
                "Part of: {}\n\n{}\n\nPlan: {}\nTask: {}\nRole: {}",
                plan.title, task.description, plan.id, task.id, task.role
            ));
            card.priority = task.priority.clone();
            card.effort = match task.estimate.as_str() {
                "S" => Some(1),
                "M" => Some(3),
                "L" => Some(5),
                _ => None,
            };
            card.assignee = task.agent_id.clone();
            card.labels = task
                .labels
                .iter()
                .cloned()
                .chain(vec!["orchestra".to_string(), format!("role:{}", task.role)])
                .collect();
            card.acceptance_criteria = task.acceptance_criteria.clone();
            card.checklist = task
                .acceptance_criteria
                .iter()
                .map(|text| crate::models::card::ChecklistItem {
                    text: text.clone(),
                    done: false,
                })
                .collect();
            card.links.push(CardLink {
                ty: LinkType::Parent,
                target: plan.parent_card_id.clone(),
            });
            board.cards.push(card);
        }
        if let Some(parent) = board
            .cards
            .iter_mut()
            .find(|card| card.id == plan.parent_card_id)
        {
            for (_, card_id) in &planned {
                if !parent
                    .links
                    .iter()
                    .any(|link| &link.target == card_id && link.ty == LinkType::Child)
                {
                    parent.links.push(CardLink {
                        ty: LinkType::Child,
                        target: card_id.clone(),
                    });
                }
            }
        }
        Ok(())
    })?;

    for (task_id, card_id) in planned {
        if let Some(task) = plan.task_mut(&task_id) {
            task.card_id = Some(card_id);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::team::builtin_roles;

    fn registry() -> RoleRegistry {
        RoleRegistry {
            roles: builtin_roles(),
        }
    }

    fn plan_with(tasks: Vec<PlanTask>) -> ProductPlan {
        let mut plan = ProductPlan::new("test", "card-1", "Test");
        plan.summary = "Ship a slice".into();
        plan.tasks = tasks;
        plan
    }

    #[test]
    fn validator_rejects_missing_fields_and_cycles() {
        let mut registry = registry();
        let mut plan = ProductPlan::new("test", "card-1", "Test");
        assert!(plan.validate(&registry).is_err());

        let mut a = PlanTask::new("a", "A", "builder");
        a.acceptance_criteria = vec!["A done".into()];
        a.depends_on = vec!["b".into()];
        let mut b = PlanTask::new("b", "B", "builder");
        b.acceptance_criteria = vec!["B done".into()];
        b.depends_on = vec!["a".into()];
        plan.summary = "summary".into();
        plan.tasks = vec![a, b];
        let errors = plan.validation_errors(&registry);
        assert!(errors.iter().any(|error| error.contains("cycle")));

        registry.roles.clear();
        let mut one = PlanTask::new("a", "A", "builder");
        one.acceptance_criteria = vec!["done".into()];
        plan.tasks = vec![one];
        assert!(plan
            .validation_errors(&registry)
            .iter()
            .any(|error| error.contains("unknown role")));
    }

    #[test]
    fn dependencies_become_ready_only_after_gate() {
        let mut a = PlanTask::new("a", "A", "builder");
        a.acceptance_criteria = vec!["done".into()];
        let mut b = PlanTask::new("b", "B", "builder");
        b.acceptance_criteria = vec!["done".into()];
        b.depends_on = vec!["a".into()];
        let mut plan = plan_with(vec![a, b]);
        plan.refresh_statuses();
        assert_eq!(plan.task("a").unwrap().status, PlanTaskStatus::Ready);
        assert_eq!(plan.task("b").unwrap().status, PlanTaskStatus::Waiting);
        plan.task_mut("a").unwrap().gate_passed = true;
        plan.task_mut("a").unwrap().status = PlanTaskStatus::Review;
        plan.refresh_statuses();
        assert_eq!(plan.task("b").unwrap().status, PlanTaskStatus::Ready);
    }

    #[test]
    fn rank_prefers_matching_available_builder() {
        let mut task = PlanTask::new("a", "Build testing suite", "builder");
        task.acceptance_criteria = vec!["done".into()];
        task.labels = vec!["testing".into()];
        let mut one = AgentProfile::new("builder-1", "Builder One", "builder");
        one.skills = vec!["testing".into()];
        one.capacity = 1;
        let mut two = AgentProfile::new("builder-2", "Builder Two", "builder");
        two.skills = vec!["testing".into()];
        two.capacity = 1;
        let mut loads = HashMap::new();
        loads.insert("builder-1".to_string(), 1);
        loads.insert("builder-2".to_string(), 0);
        let ranked = rank_agents(&task, &[one, two], &loads, &HashMap::new());
        assert_eq!(ranked[0].agent_id, "builder-2");
        assert!(ranked[0].reasons.iter().any(|reason| reason.contains("skill")));
    }

    #[test]
    fn plans_roundtrip_store() {
        let dir = std::env::temp_dir().join(format!("bark_plan_{}", uuid::Uuid::new_v4()));
        let store = OrchestraStore::new(&dir, "demo");
        let mut plan = ProductPlan::new("demo", "card", "Demo");
        plan.summary = "Ship".into();
        store.save_plan(&plan).unwrap();
        let loaded = store.load_plan(&plan.id).unwrap();
        assert_eq!(loaded.id, plan.id);
        assert_eq!(store.list_plans().unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn from_card_creates_verification_dependency() {
        let mut card = Card::new("feature", "Ship the feature", "todo");
        card.description = Some("Build it".into());
        let plan = ProductPlan::from_card("demo", &card);
        assert!(!plan.tasks.is_empty());
        let tests = plan
            .tasks
            .iter()
            .find(|task| task.title.to_lowercase().contains("tests"));
        assert!(tests.is_some());
        assert!(!tests.unwrap().depends_on.is_empty());
    }
}
