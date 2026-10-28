//! Orchestra dispatcher: turn an approved plan into child cards and bounded,
//! dependency-aware runs, then reconcile run state back into the plan tree.

use std::collections::HashMap;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use crate::agent::product_plan::{
    materialize_cards, rank_agents, AssignmentRecommendation, OrchestraStore, PlanStatus,
    PlanTaskStatus, ProductPlan,
};
use crate::agent::team::{AgentProfile, ProfileStatus, ProfileStore, RoleRegistry};
use crate::runtime::event::{RunRecord, RunStatus};
use crate::runtime::runner::CreateRunRequest;
use crate::runtime::{RunService, ThreadSink};
use crate::storage::board_file::read_board;
use crate::threads::{append_event_to_dir, ThreadEvent, ThreadEventKind};

/// Anything that can start, stop, and inspect a run. The production adapter
/// is `RunService`; tests use an in-memory launcher.
pub trait PlanLauncher: Send {
    fn start_plan_run(
        &self,
        card_id: &str,
        request: CreateRunRequest,
        sink: Option<ThreadSink>,
    ) -> Result<RunRecord>;
    fn stop_plan_run(&self, run_id: &str) -> Result<RunRecord>;
    fn load_plan_run(&self, run_id: &str) -> Result<RunRecord>;
}

impl PlanLauncher for RunService {
    fn start_plan_run(
        &self,
        card_id: &str,
        request: CreateRunRequest,
        sink: Option<ThreadSink>,
    ) -> Result<RunRecord> {
        self.start_for_card(card_id, request, sink)
    }

    fn stop_plan_run(&self, run_id: &str) -> Result<RunRecord> {
        self.stop(run_id)
    }

    fn load_plan_run(&self, run_id: &str) -> Result<RunRecord> {
        self.store().load_run(run_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMemberView {
    pub profile: AgentProfile,
    pub load: u32,
    pub success_rate: f32,
    pub active_task_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapacityView {
    pub max_parallel: u32,
    pub active_tasks: usize,
    pub available_slots: u32,
    pub active_agents: usize,
    pub team_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeTrainItem {
    pub plan_id: String,
    pub plan_title: String,
    pub task_id: String,
    pub task_title: String,
    pub run_id: String,
    pub branch: Option<String>,
    pub agent_id: Option<String>,
    pub gate_passed: bool,
    pub status: PlanTaskStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestraSnapshot {
    pub board_name: String,
    pub plans: Vec<ProductPlan>,
    pub team: Vec<TeamMemberView>,
    pub capacity: CapacityView,
    pub merge_train: Vec<MergeTrainItem>,
    pub pending_approvals: Vec<MergeTrainItem>,
    pub roles: Vec<crate::agent::team::RoleDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartedTask {
    pub task_id: String,
    pub title: String,
    pub run_id: String,
    pub agent_id: String,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitingTask {
    pub task_id: String,
    pub title: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DispatchReport {
    pub plan: ProductPlan,
    pub started: Vec<StartedTask>,
    pub waiting: Vec<WaitingTask>,
    pub active_runs: usize,
    pub max_parallel: u32,
}

pub struct OrchestraService {
    board_name: String,
    store: OrchestraStore,
    launcher: Box<dyn PlanLauncher>,
}

impl OrchestraService {
    pub fn new(
        board_name: impl Into<String>,
        store: OrchestraStore,
        launcher: Box<dyn PlanLauncher>,
    ) -> Self {
        Self {
            board_name: board_name.into(),
            store,
            launcher,
        }
    }

    pub fn from_project(board_name: impl Into<String>) -> Result<Self> {
        let board_name = board_name.into();
        let store = OrchestraStore::from_project(&board_name)?;
        let launcher = Box::new(RunService::from_project(&board_name)?);
        Ok(Self::new(board_name, store, launcher))
    }

    pub fn store(&self) -> &OrchestraStore {
        &self.store
    }

    pub fn board_name(&self) -> &str {
        &self.board_name
    }

    pub fn create_plan(&self, card_id: &str) -> Result<ProductPlan> {
        let board = read_board(&self.board_name)
            .with_context(|| format!("board '{}' could not be read", self.board_name))?;
        let card = board
            .cards
            .iter()
            .find(|card| card.id == card_id)
            .cloned()
            .ok_or_else(|| anyhow!("card '{}' not found", card_id))?;
        let plan = ProductPlan::from_card(&self.board_name, &card);
        let roles = self.role_registry();
        plan.validate(&roles)?;
        self.store.save_plan(&plan)?;
        self.append_parent_event(
            &plan,
            ThreadEventKind::PlanProposed,
            format!("Proposed {} tasks for {}", plan.tasks.len(), plan.title),
            serde_json::json!({ "plan": plan }),
        );
        Ok(plan)
    }

    /// Accept a structured plan from a planner (or the UI) and persist it as
    /// awaiting approval. Questions are mirrored into the parent thread so the
    /// founder sees them beside the intent.
    pub fn create_plan_from(&self, mut plan: ProductPlan) -> Result<ProductPlan> {
        if plan.parent_card_id.trim().is_empty() {
            anyhow::bail!("plan needs a parent card");
        }
        let board = read_board(&self.board_name)?;
        let card = board
            .cards
            .iter()
            .find(|card| card.id == plan.parent_card_id)
            .ok_or_else(|| anyhow!("parent card '{}' not found", plan.parent_card_id))?;
        plan.board_name = self.board_name.clone();
        if plan.parent_thread_id.trim().is_empty() {
            plan.parent_thread_id = plan.parent_card_id.clone();
        }
        if plan.title.trim().is_empty() {
            plan.title = card.title.clone();
        }
        if plan.summary.trim().is_empty() {
            plan.summary = card
                .description
                .clone()
                .unwrap_or_else(|| card.title.clone());
        }
        if plan.id.trim().is_empty() {
            plan.id = format!("plan_{}", uuid::Uuid::new_v4().simple());
        }
        if plan.first_slice.is_none() {
            plan.first_slice = plan.tasks.first().map(|task| task.id.clone());
        }
        for (index, question) in plan.questions.iter_mut().enumerate() {
            if question.id.trim().is_empty() {
                question.id = format!("q{}", index + 1);
            }
        }
        plan.status = PlanStatus::AwaitingApproval;
        plan.updated_at = chrono::Utc::now();
        plan.validate(&self.role_registry())?;
        self.store.save_plan(&plan)?;
        self.append_parent_event(
            &plan,
            ThreadEventKind::PlanProposed,
            format!("Proposed {} tasks for {}", plan.tasks.len(), plan.title),
            serde_json::json!({ "plan": plan }),
        );
        for question in &plan.questions {
            self.append_parent_event(
                &plan,
                ThreadEventKind::Question,
                question.text.clone(),
                serde_json::json!({
                    "plan_id": plan.id,
                    "question_id": question.id,
                    "blocking": question.blocking,
                }),
            );
        }
        Ok(plan)
    }

    pub fn save_plan(&self, mut plan: ProductPlan) -> Result<ProductPlan> {
        let roles = self.role_registry();
        plan.validate(&roles)?;
        plan.updated_at = chrono::Utc::now();
        self.store.save_plan(&plan)?;
        Ok(plan)
    }

    pub fn plan(&self, plan_id: &str) -> Result<ProductPlan> {
        self.store.load_plan(plan_id)
    }

    pub fn plans(&self) -> Result<Vec<ProductPlan>> {
        self.store.list_plans()
    }

    pub fn approve_plan(&self, plan_id: &str) -> Result<ProductPlan> {
        let mut plan = self.store.load_plan(plan_id)?;
        if matches!(plan.status, PlanStatus::Cancelled | PlanStatus::Completed) {
            anyhow::bail!("plan is already {}", status_name(&plan.status));
        }
        let roles = self.role_registry();
        plan.validate(&roles)?;
        materialize_cards(&self.board_name, &mut plan)?;
        plan.status = PlanStatus::Approved;
        plan.refresh_statuses();
        self.store.save_plan(&plan)?;
        self.append_parent_event(
            &plan,
            ThreadEventKind::PlanApproved,
            format!("Approved plan with {} tasks", plan.tasks.len()),
            serde_json::json!({ "plan": plan }),
        );
        Ok(plan)
    }

    /// Manual assignment always wins over the recommendation, provided the
    /// agent is active and has the task's role.
    pub fn assign_task(
        &self,
        plan_id: &str,
        task_id: &str,
        agent_id: &str,
    ) -> Result<ProductPlan> {
        let mut plan = self.store.load_plan(plan_id)?;
        let task = plan
            .task(task_id)
            .cloned()
            .ok_or_else(|| anyhow!("task '{}' not found", task_id))?;
        let profile = self.profile_store().load(agent_id)?;
        if profile.status != ProfileStatus::Active {
            anyhow::bail!("agent '{}' is not active", agent_id);
        }
        if profile.role != task.role {
            anyhow::bail!(
                "agent '{}' has role '{}', task needs '{}'",
                agent_id,
                profile.role,
                task.role
            );
        }
        if let Some(task) = plan.task_mut(task_id) {
            task.agent_id = Some(agent_id.to_string());
            task.error = None;
        }
        self.store.save_plan(&plan)?;
        Ok(plan)
    }

    pub fn assignments(
        &self,
        plan_id: &str,
        task_id: &str,
    ) -> Result<Vec<AssignmentRecommendation>> {
        let plan = self.store.load_plan(plan_id)?;
        let task = plan
            .task(task_id)
            .ok_or_else(|| anyhow!("task '{}' not found", task_id))?;
        let profiles = self.profiles()?;
        let loads = self.loads(&profiles);
        let success = self.success_rates(&profiles);
        Ok(rank_agents(task, &profiles, &loads, &success))
    }

    pub fn dispatch_plan(
        &self,
        plan_id: &str,
        sink: Option<ThreadSink>,
    ) -> Result<DispatchReport> {
        let config = self.store.config();
        let mut plan = self.store.load_plan(plan_id)?;
        if matches!(
            plan.status,
            PlanStatus::Draft | PlanStatus::AwaitingApproval | PlanStatus::Cancelled
        ) {
            anyhow::bail!("plan must be approved before dispatch");
        }
        let roles = self.role_registry();
        plan.validate(&roles)?;
        if plan.tasks.iter().any(|task| task.card_id.is_none()) {
            materialize_cards(&self.board_name, &mut plan)?;
        }
        plan.refresh_statuses();
        if plan.status == PlanStatus::Approved {
            plan.status = PlanStatus::Running;
        }
        let profiles = self.profiles()?;
        let mut loads = self.loads(&profiles);
        let success = self.success_rates(&profiles);
        let mut started = Vec::new();
        let mut waiting = Vec::new();
        let mut active = plan.active_tasks();
        let max_parallel = config.max_parallel.max(1) as usize;

        let mut order = plan
            .tasks
            .iter()
            .filter(|task| task.status == PlanTaskStatus::Ready)
            .map(|task| task.id.clone())
            .collect::<Vec<_>>();
        order.sort_by_key(|id| {
            let preferred = plan.first_slice.as_deref() == Some(id.as_str());
            (!preferred, id.clone())
        });

        for task_id in order {
            if active >= max_parallel {
                if let Some(task) = plan.task(&task_id) {
                    waiting.push(WaitingTask {
                        task_id: task.id.clone(),
                        title: task.title.clone(),
                        reason: "waiting for a parallel slot".into(),
                    });
                }
                continue;
            }
            let task = plan.task(&task_id).cloned().expect("task exists");
            if plan.dependency_blocked(&task) {
                if let Some(task) = plan.task_mut(&task_id) {
                    task.status = PlanTaskStatus::Blocked;
                }
                continue;
            }
            if !plan.dependencies_met(&task) {
                if let Some(task) = plan.task_mut(&task_id) {
                    task.status = PlanTaskStatus::Waiting;
                }
                continue;
            }

            let profile = if let Some(agent_id) = task.agent_id.as_deref() {
                match profiles.iter().find(|profile| profile.id == agent_id) {
                    Some(profile)
                        if profile.status == ProfileStatus::Active
                            && profile.role == task.role
                            && loads.get(agent_id).copied().unwrap_or(0)
                                < profile.capacity.max(1) =>
                    {
                        profile
                    }
                    _ => {
                        waiting.push(WaitingTask {
                            task_id: task.id.clone(),
                            title: task.title.clone(),
                            reason: format!(
                                "agent '{}' is unavailable or at capacity",
                                agent_id
                            ),
                        });
                        continue;
                    }
                }
            } else {
                let ranked = rank_agents(&task, &profiles, &loads, &success);
                let Some(recommended) = ranked.into_iter().find(|candidate| candidate.available)
                else {
                    waiting.push(WaitingTask {
                        task_id: task.id.clone(),
                        title: task.title.clone(),
                        reason: format!("waiting for an available {}", task.role),
                    });
                    continue;
                };
                profiles
                    .iter()
                    .find(|profile| profile.id == recommended.agent_id)
                    .expect("recommended profile exists")
            };

            let card_id = task
                .card_id
                .clone()
                .ok_or_else(|| anyhow!("task '{}' has no child card", task.id))?;
            let request = CreateRunRequest {
                provider: Some(profile.provider.clone()),
                model: profile.model.clone(),
                role: Some(task.role.clone()),
                agent_id: Some(profile.id.clone()),
                permission_mode: Some(profile.permission_mode.clone()),
                prompt: Some(format!(
                    "## Orchestra task\n\nPlan: {}\nTask: {} ({})\nRole: {}\n\n{}\n\nAcceptance criteria:\n{}",
                    plan.title,
                    task.title,
                    task.id,
                    task.role,
                    task.description,
                    task.acceptance_criteria
                        .iter()
                        .map(|criterion| format!("- [ ] {criterion}"))
                        .collect::<Vec<_>>()
                        .join("\n")
                )),
                test_cmd: None,
                skills: profile.skills.clone(),
                resume: true,
                parent_run_id: None,
                skip_gate: false,
            };

            match self.launcher.start_plan_run(&card_id, request, sink.clone()) {
                Ok(run) => {
                    if let Some(stored) = plan.task_mut(&task_id) {
                        if let Some(old) = stored.run_id.take() {
                            stored.previous_run_ids.push(old);
                        }
                        stored.status = PlanTaskStatus::Running;
                        stored.agent_id = Some(profile.id.clone());
                        stored.run_id = Some(run.id.clone());
                        stored.branch = run.branch.clone();
                        stored.worktree = run.worktree.clone();
                        stored.error = None;
                    }
                    loads.insert(
                        profile.id.clone(),
                        loads.get(&profile.id).copied().unwrap_or(0) + 1,
                    );
                    active += 1;
                    started.push(StartedTask {
                        task_id: task.id.clone(),
                        title: task.title.clone(),
                        run_id: run.id.clone(),
                        agent_id: profile.id.clone(),
                        branch: run.branch.clone(),
                    });
                    self.append_parent_event(
                        &plan,
                        ThreadEventKind::TaskSpawned,
                        format!("Spawned {} → {}", task.title, profile.name),
                        serde_json::json!({
                            "plan_id": plan.id,
                            "task_id": task.id,
                            "run_id": run.id,
                            "agent_id": profile.id,
                            "role": task.role,
                            "branch": run.branch,
                        }),
                    );
                }
                Err(error) => {
                    if let Some(stored) = plan.task_mut(&task_id) {
                        stored.status = PlanTaskStatus::Blocked;
                        stored.error = Some(format!("could not start run: {error}"));
                    }
                    waiting.push(WaitingTask {
                        task_id: task.id.clone(),
                        title: task.title.clone(),
                        reason: format!("run could not start: {error}"),
                    });
                }
            }
        }

        plan.refresh_statuses();
        if plan.needs_attention() {
            plan.status = PlanStatus::NeedsAttention;
        } else if plan
            .tasks
            .iter()
            .any(|task| task.status == PlanTaskStatus::Running)
        {
            plan.status = PlanStatus::Running;
        }
        self.store.save_plan(&plan)?;
        Ok(DispatchReport {
            plan,
            started,
            waiting,
            active_runs: active,
            max_parallel: max_parallel as u32,
        })
    }

    /// Poll run state and fold it back into the plan. This is called by the
    /// `GET /api/orchestra` handler and by the UI's refresh tick.
    pub fn reconcile_plan(&self, plan_id: &str) -> Result<ProductPlan> {
        let mut plan = self.store.load_plan(plan_id)?;
        let was_cancelled = plan.status == PlanStatus::Cancelled;
        let mut changed = false;
        for task in plan.tasks.clone() {
            let Some(run_id) = task.run_id.as_deref() else {
                continue;
            };
            let run = match self.launcher.load_plan_run(run_id) {
                Ok(run) => run,
                Err(_) => continue,
            };
            let Some(stored) = plan.task_mut(&task.id) else {
                continue;
            };
            let mut task_changed = false;
            if stored.branch.is_none() {
                stored.branch = run.branch.clone();
            }
            if stored.worktree.is_none() {
                stored.worktree = run.worktree.clone();
            }
            let next = match run.status {
                RunStatus::Passed => Some(PlanTaskStatus::Review),
                RunStatus::Merged => Some(PlanTaskStatus::Merged),
                RunStatus::Failed | RunStatus::Interrupted => Some(PlanTaskStatus::Failed),
                RunStatus::Cancelled => Some(PlanTaskStatus::Cancelled),
                _ => None,
            };
            if let Some(next) = next {
                if was_cancelled {
                    if next == PlanTaskStatus::Cancelled {
                        stored.status = next;
                        task_changed = true;
                    }
                } else if stored.status != next {
                    stored.status = next.clone();
                    stored.gate_passed =
                        matches!(next, PlanTaskStatus::Review | PlanTaskStatus::Merged);
                    if next == PlanTaskStatus::Failed {
                        stored.error = run.error.clone().or_else(|| {
                            Some(format!(
                                "run {} ended with {}",
                                run.id,
                                run.status.as_str()
                            ))
                        });
                    }
                    task_changed = true;
                    changed = true;
                    if next == PlanTaskStatus::Review {
                        self.append_task_event(
                            &plan,
                            &task,
                            ThreadEventKind::ApprovalRequested,
                            "Gate passed — merge approval requested",
                            serde_json::json!({
                                "run_id": run.id,
                                "kind": "merge",
                                "plan_id": plan.id,
                                "task_id": task.id,
                                "branch": run.branch,
                            }),
                        );
                    }
                }
            }
            if task_changed {
                changed = true;
            }
        }
        if changed || plan.status != PlanStatus::Cancelled {
            plan.refresh_statuses();
            if was_cancelled {
                plan.status = PlanStatus::Cancelled;
            } else if plan
                .tasks
                .iter()
                .all(|task| task.status == PlanTaskStatus::Merged)
            {
                plan.status = PlanStatus::Completed;
            } else if plan.needs_attention() {
                plan.status = PlanStatus::NeedsAttention;
            } else if plan
                .tasks
                .iter()
                .any(|task| task.status == PlanTaskStatus::Running)
            {
                plan.status = PlanStatus::Running;
            }
            self.store.save_plan(&plan)?;
        }
        Ok(plan)
    }

    /// Reconcile every plan and, when requested, immediately dispatch ready
    /// work within capacity. The web app calls this on its refresh tick.
    pub fn tick(&self, auto_dispatch: bool) -> Result<Vec<ProductPlan>> {
        let mut plans = self.store.list_plans()?;
        for plan in &mut plans {
            *plan = self
                .reconcile_plan(&plan.id)
                .unwrap_or_else(|_| plan.clone());
        }
        if auto_dispatch {
            for plan in &plans {
                if matches!(plan.status, PlanStatus::Running | PlanStatus::Approved) {
                    let _ = self.dispatch_plan(&plan.id, None);
                }
            }
            plans = self.store.list_plans()?;
        }
        Ok(plans)
    }

    pub fn snapshot(&self, auto_dispatch: bool) -> Result<OrchestraSnapshot> {
        let plans = self.tick(auto_dispatch)?;
        let profiles = self.profiles()?;
        let loads = self.loads(&profiles);
        let success = self.success_rates(&profiles);
        let active_tasks = plans.iter().map(|plan| plan.active_tasks()).sum::<usize>();
        let active_agents = plans
            .iter()
            .flat_map(|plan| plan.tasks.iter())
            .filter(|task| task.status == PlanTaskStatus::Running)
            .filter_map(|task| task.agent_id.clone())
            .collect::<std::collections::HashSet<_>>()
            .len();
        let team = profiles
            .iter()
            .map(|profile| TeamMemberView {
                profile: profile.clone(),
                load: loads.get(&profile.id).copied().unwrap_or(0),
                success_rate: success.get(&profile.id).copied().unwrap_or(0.0),
                active_task_ids: plans
                    .iter()
                    .flat_map(|plan| plan.tasks.iter())
                    .filter(|task| {
                        task.status == PlanTaskStatus::Running
                            && task.agent_id.as_deref() == Some(profile.id.as_str())
                    })
                    .map(|task| task.id.clone())
                    .collect(),
            })
            .collect();
        let merge_train = plans
            .iter()
            .flat_map(|plan| merge_train_items(plan))
            .collect::<Vec<_>>();
        let pending_approvals = merge_train
            .iter()
            .filter(|item| item.status == PlanTaskStatus::Review && item.gate_passed)
            .cloned()
            .collect();
        let max_parallel = self.store.config().max_parallel.max(1);
        let available_slots = (max_parallel as usize).saturating_sub(active_tasks) as u32;
        Ok(OrchestraSnapshot {
            board_name: self.board_name.clone(),
            plans,
            team,
            capacity: CapacityView {
                max_parallel,
                active_tasks,
                available_slots,
                active_agents,
                team_size: profiles.len(),
            },
            merge_train,
            pending_approvals,
            roles: self.role_registry().roles,
        })
    }

    /// Retry a failed or blocked task in a new worktree. The previous run is
    /// retained for inspection.
    pub fn retry_task(&self, plan_id: &str, task_id: &str) -> Result<ProductPlan> {
        let mut plan = self.store.load_plan(plan_id)?;
        let task = plan
            .task(task_id)
            .cloned()
            .ok_or_else(|| anyhow!("task '{}' not found", task_id))?;
        if task.status == PlanTaskStatus::Running {
            anyhow::bail!("task '{}' is still running", task_id);
        }
        if let Some(stored) = plan.task_mut(task_id) {
            if let Some(old) = stored.run_id.take() {
                stored.previous_run_ids.push(old);
            }
            stored.status = PlanTaskStatus::Ready;
            stored.gate_passed = false;
            stored.error = None;
            stored.branch = None;
            stored.worktree = None;
        }
        plan.status = PlanStatus::Running;
        self.store.save_plan(&plan)?;
        Ok(plan)
    }

    /// Stop a plan and every live run it owns. This is the cascade used by
    /// the parent thread's stop action.
    pub fn cancel_plan(&self, plan_id: &str) -> Result<ProductPlan> {
        let mut plan = self.store.load_plan(plan_id)?;
        for task in &plan.tasks {
            if task.status == PlanTaskStatus::Running {
                if let Some(run_id) = task.run_id.as_deref() {
                    let _ = self.launcher.stop_plan_run(run_id);
                }
            }
        }
        for task in &mut plan.tasks {
            if task.status == PlanTaskStatus::Running
                || task.status == PlanTaskStatus::Ready
                || task.status == PlanTaskStatus::Waiting
                || task.status == PlanTaskStatus::Review
            {
                task.status = PlanTaskStatus::Cancelled;
            }
        }
        plan.status = PlanStatus::Cancelled;
        plan.updated_at = chrono::Utc::now();
        self.store.save_plan(&plan)?;
        self.append_parent_event(
            &plan,
            ThreadEventKind::PlanRejected,
            "Plan stopped".to_string(),
            serde_json::json!({ "plan_id": plan.id }),
        );
        Ok(plan)
    }

    /// If a run belongs to an orchestra plan, stop the whole plan. Runs that
    /// are not in a plan are left to the caller.
    pub fn stop_run_cascade(&self, run_id: &str) -> Result<Option<ProductPlan>> {
        let Some(plan) = self.store.find_plan_for_run(run_id)? else {
            return Ok(None);
        };
        Ok(Some(self.cancel_plan(&plan.id)?))
    }

    pub fn answer_question(
        &self,
        plan_id: &str,
        question_id: &str,
        answer: &str,
    ) -> Result<ProductPlan> {
        let mut plan = self.store.load_plan(plan_id)?;
        let question = plan
            .questions
            .iter_mut()
            .find(|question| question.id == question_id)
            .ok_or_else(|| anyhow!("question '{}' not found", question_id))?;
        let text = question.text.clone();
        question.answer = Some(answer.to_string());
        plan.updated_at = chrono::Utc::now();
        self.store.save_plan(&plan)?;
        self.append_parent_event(
            &plan,
            ThreadEventKind::Answer,
            format!("Answered: {text}"),
            serde_json::json!({
                "plan_id": plan.id,
                "question_id": question_id,
                "answer": answer,
            }),
        );
        Ok(plan)
    }

    fn role_registry(&self) -> RoleRegistry {
        RoleRegistry::load_at(self.store.board_dir())
    }

    fn profile_store(&self) -> ProfileStore {
        ProfileStore::new(self.store.board_dir().join("agents"))
    }

    fn profiles(&self) -> Result<Vec<AgentProfile>> {
        self.profile_store().list()
    }

    fn loads(&self, profiles: &[AgentProfile]) -> HashMap<String, u32> {
        let mut loads = HashMap::new();
        for profile in profiles {
            loads.insert(profile.id.clone(), 0);
        }
        if let Ok(plans) = self.store.list_plans() {
            for plan in plans {
                for task in plan.tasks {
                    if task.status == PlanTaskStatus::Running {
                        if let Some(agent_id) = task.agent_id {
                            *loads.entry(agent_id).or_insert(0) += 1;
                        }
                    }
                }
            }
        }
        loads
    }

    fn success_rates(&self, profiles: &[AgentProfile]) -> HashMap<String, f32> {
        let mut merged = HashMap::new();
        let mut failed = HashMap::new();
        if let Ok(plans) = self.store.list_plans() {
            for plan in plans {
                for task in plan.tasks {
                    let Some(agent_id) = task.agent_id else {
                        continue;
                    };
                    match task.status {
                        PlanTaskStatus::Merged => {
                            *merged.entry(agent_id).or_insert(0u32) += 1;
                        }
                        PlanTaskStatus::Failed => {
                            *failed.entry(agent_id).or_insert(0u32) += 1;
                        }
                        _ => {}
                    }
                }
            }
        }
        profiles
            .iter()
            .map(|profile| {
                let done = merged.get(&profile.id).copied().unwrap_or(0);
                let bad = failed.get(&profile.id).copied().unwrap_or(0);
                let rate = if done + bad == 0 {
                    0.0
                } else {
                    done as f32 / (done + bad) as f32
                };
                (profile.id.clone(), rate)
            })
            .collect()
    }

    fn append_parent_event(
        &self,
        plan: &ProductPlan,
        kind: ThreadEventKind,
        text: impl Into<String>,
        data: serde_json::Value,
    ) {
        let event = ThreadEvent::new(
            &plan.parent_thread_id,
            kind,
            "orchestra",
            text.into(),
            Some(data),
        );
        let _ = append_event_to_dir(
            &self.store.board_dir().join("threads"),
            &plan.parent_thread_id,
            &event,
        );
    }

    fn append_task_event(
        &self,
        plan: &ProductPlan,
        task: &crate::agent::product_plan::PlanTask,
        kind: ThreadEventKind,
        text: impl Into<String>,
        data: serde_json::Value,
    ) {
        let Some(card_id) = task.card_id.as_deref() else {
            return;
        };
        let mut event = ThreadEvent::new(card_id, kind, "orchestra", text.into(), Some(data));
        event.run_id = task.run_id.clone();
        event.thread_id = Some(card_id.to_string());
        let _ = append_event_to_dir(
            &self.store.board_dir().join("threads"),
            card_id,
            &event,
        );
        let _ = plan;
    }
}

fn merge_train_items(plan: &ProductPlan) -> Vec<MergeTrainItem> {
    plan.tasks
        .iter()
        .filter_map(|task| {
            let run_id = task.run_id.clone()?;
            Some(MergeTrainItem {
                plan_id: plan.id.clone(),
                plan_title: plan.title.clone(),
                task_id: task.id.clone(),
                task_title: task.title.clone(),
                run_id,
                branch: task.branch.clone(),
                agent_id: task.agent_id.clone(),
                gate_passed: task.gate_passed,
                status: task.status.clone(),
            })
        })
        .collect()
}

fn status_name(status: &PlanStatus) -> &'static str {
    match status {
        PlanStatus::Draft => "draft",
        PlanStatus::AwaitingApproval => "awaiting approval",
        PlanStatus::Approved => "approved",
        PlanStatus::Running => "running",
        PlanStatus::NeedsAttention => "needs attention",
        PlanStatus::Completed => "completed",
        PlanStatus::Cancelled => "cancelled",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::product_plan::{OrchestraConfig, PlanTask};
    use crate::runtime::event::{RunRecord, StartRun};
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct FakeLauncher {
        runs: Arc<Mutex<HashMap<String, RunRecord>>>,
        started: Arc<Mutex<Vec<(String, CreateRunRequest)>>>,
        stops: Arc<Mutex<Vec<String>>>,
    }

    impl FakeLauncher {
        fn set_status(&self, run_id: &str, status: RunStatus) {
            let mut runs = self.runs.lock().unwrap();
            let run = runs.get_mut(run_id).unwrap();
            let terminal = status.is_terminal();
            run.status = status;
            if terminal {
                run.ended_at = Some(chrono::Utc::now());
            }
        }

        fn started_agents(&self) -> Vec<String> {
            self.started
                .lock()
                .unwrap()
                .iter()
                .filter_map(|(_, request)| request.agent_id.clone())
                .collect()
        }
    }

    impl PlanLauncher for FakeLauncher {
        fn start_plan_run(
            &self,
            card_id: &str,
            request: CreateRunRequest,
            _sink: Option<ThreadSink>,
        ) -> Result<RunRecord> {
            let id = format!("run-{}", self.runs.lock().unwrap().len() + 1);
            let mut run = RunRecord::new(&StartRun {
                run_id: id.clone(),
                thread_id: card_id.to_string(),
                card_id: card_id.to_string(),
                prompt: request.prompt.clone().unwrap_or_default(),
                cwd: "/tmp".into(),
                provider: request.provider.clone().unwrap_or_else(|| "fake".into()),
                model: request.model.clone(),
                role: request.role.clone(),
                agent_id: request.agent_id.clone(),
                permission_mode: request
                    .permission_mode
                    .clone()
                    .unwrap_or_else(|| "auto".into()),
                provider_session_id: None,
                raw_log_path: None,
            });
            run.status = RunStatus::Running;
            run.branch = Some(format!("bark/{id}"));
            run.worktree = Some(format!("/tmp/{id}"));
            self.runs.lock().unwrap().insert(id.clone(), run.clone());
            self.started
                .lock()
                .unwrap()
                .push((card_id.to_string(), request));
            Ok(run)
        }

        fn stop_plan_run(&self, run_id: &str) -> Result<RunRecord> {
            self.stops.lock().unwrap().push(run_id.to_string());
            self.set_status(run_id, RunStatus::Cancelled);
            Ok(self.runs.lock().unwrap().get(run_id).unwrap().clone())
        }

        fn load_plan_run(&self, run_id: &str) -> Result<RunRecord> {
            self.runs
                .lock()
                .unwrap()
                .get(run_id)
                .cloned()
                .ok_or_else(|| anyhow!("run '{}' not found", run_id))
        }
    }

    fn setup(name: &str) -> (std::path::PathBuf, OrchestraStore, Arc<FakeLauncher>) {
        let board = std::env::temp_dir().join(format!(
            "bark_orchestra_{}_{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(board.join("agents")).unwrap();
        let profiles = ProfileStore::new(board.join("agents"));
        profiles.ensure_default_team().unwrap();
        let store = OrchestraStore::new(&board, "test");
        store
            .save_config(&OrchestraConfig { max_parallel: 2 })
            .unwrap();
        let fake = Arc::new(FakeLauncher::default());
        (board, store, fake)
    }

    fn task(id: &str, title: &str, role: &str) -> PlanTask {
        let mut task = PlanTask::new(id, title, role);
        task.acceptance_criteria = vec![format!("{title} done")];
        task.card_id = Some(format!("card-{id}"));
        task
    }

    fn approved_plan(store: &OrchestraStore, tasks: Vec<PlanTask>) -> ProductPlan {
        let mut plan = ProductPlan::new("test", "parent", "Test feature");
        plan.summary = "Ship it".into();
        plan.tasks = tasks;
        plan.status = PlanStatus::Approved;
        plan.first_slice = plan.tasks.first().map(|task| task.id.clone());
        store.save_plan(&plan).unwrap();
        plan
    }

    #[test]
    fn two_builders_start_in_parallel_and_respect_capacity() {
        let (board, store, fake) = setup("parallel");
        let plan = approved_plan(
            &store,
            vec![
                task("a", "Implement the API", "builder"),
                task("b", "Implement the UI", "builder"),
            ],
        );
        let service = OrchestraService::new(
            "test",
            store.clone(),
            Box::new((*fake).clone()),
        );
        let report = service.dispatch_plan(&plan.id, None).unwrap();
        assert_eq!(report.started.len(), 2);
        assert_eq!(report.active_runs, 2);
        assert_eq!(report.plan.status, PlanStatus::Running);
        let agents = fake.started_agents();
        assert_eq!(agents.len(), 2);
        assert_ne!(agents[0], agents[1]);
        assert!(agents.iter().all(|agent| agent.starts_with("builder-")));
        let _ = std::fs::remove_dir_all(board);
    }

    #[test]
    fn dependency_waits_for_gate_then_starts() {
        let (board, store, fake) = setup("dependency");
        let mut dependent = task("c", "Verify the feature", "builder");
        dependent.depends_on = vec!["a".into()];
        let plan = approved_plan(
            &store,
            vec![task("a", "Implement the API", "builder"), dependent],
        );
        let service = OrchestraService::new(
            "test",
            store.clone(),
            Box::new((*fake).clone()),
        );
        let report = service.dispatch_plan(&plan.id, None).unwrap();
        assert_eq!(report.started.len(), 1);
        let first_run = report.started[0].run_id.clone();
        fake.set_status(&first_run, RunStatus::Passed);
        let reconciled = service.reconcile_plan(&plan.id).unwrap();
        assert_eq!(
            reconciled.task("a").unwrap().status,
            PlanTaskStatus::Review
        );
        assert_eq!(
            reconciled.task("c").unwrap().status,
            PlanTaskStatus::Ready
        );
        let report = service.dispatch_plan(&plan.id, None).unwrap();
        assert_eq!(report.started.len(), 1);
        assert_eq!(report.started[0].task_id, "c");
        let _ = std::fs::remove_dir_all(board);
    }

    #[test]
    fn capacity_limit_defers_second_task() {
        let (board, store, fake) = setup("capacity");
        store
            .save_config(&OrchestraConfig { max_parallel: 1 })
            .unwrap();
        let plan = approved_plan(
            &store,
            vec![
                task("a", "Implement the API", "builder"),
                task("b", "Implement the UI", "builder"),
            ],
        );
        let service = OrchestraService::new(
            "test",
            store.clone(),
            Box::new((*fake).clone()),
        );
        let report = service.dispatch_plan(&plan.id, None).unwrap();
        assert_eq!(report.started.len(), 1);
        assert!(report
            .waiting
            .iter()
            .any(|waiting| waiting.reason.contains("parallel slot")));
        let _ = std::fs::remove_dir_all(board);
    }

    #[test]
    fn stop_cascade_cancels_live_runs() {
        let (board, store, fake) = setup("stop");
        let plan = approved_plan(
            &store,
            vec![
                task("a", "Implement the API", "builder"),
                task("b", "Implement the UI", "builder"),
            ],
        );
        let service = OrchestraService::new(
            "test",
            store.clone(),
            Box::new((*fake).clone()),
        );
        let report = service.dispatch_plan(&plan.id, None).unwrap();
        let cancelled = service.cancel_plan(&plan.id).unwrap();
        assert_eq!(cancelled.status, PlanStatus::Cancelled);
        assert_eq!(fake.stops.lock().unwrap().len(), report.started.len());
        assert!(cancelled
            .tasks
            .iter()
            .all(|task| task.status == PlanTaskStatus::Cancelled));
        let _ = std::fs::remove_dir_all(board);
    }

    #[test]
    fn retry_creates_new_attempt_and_keeps_old_run() {
        let (board, store, fake) = setup("retry");
        let plan = approved_plan(&store, vec![task("a", "Implement the API", "builder")]);
        let service = OrchestraService::new(
            "test",
            store.clone(),
            Box::new((*fake).clone()),
        );
        let report = service.dispatch_plan(&plan.id, None).unwrap();
        let first_run = report.started[0].run_id.clone();
        fake.set_status(&first_run, RunStatus::Failed);
        service.reconcile_plan(&plan.id).unwrap();
        let retried = service.retry_task(&plan.id, "a").unwrap();
        assert_eq!(retried.task("a").unwrap().status, PlanTaskStatus::Ready);
        assert_eq!(
            retried.task("a").unwrap().previous_run_ids,
            vec![first_run.clone()]
        );
        let report = service.dispatch_plan(&plan.id, None).unwrap();
        assert_eq!(report.started.len(), 1);
        assert_ne!(report.started[0].run_id, first_run);
        let _ = std::fs::remove_dir_all(board);
    }
}
