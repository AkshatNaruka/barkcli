pub mod backend;
pub mod autopilot;
pub mod capacity;
pub mod decompose;
pub mod fleet;
pub mod identity;
pub mod liveness;
pub mod orchestrate;
pub mod orchestra_service;
pub mod product_plan;
pub mod prompt;
pub mod queue;
pub mod recipe;
pub mod roles;
pub mod session;
pub mod team;
pub mod verify;
pub mod worktree;

pub use autopilot::{evaluate as autopilot_evaluate, AutopilotPhase, AutopilotState, AutopilotStatus, PlanProposal};
pub use backend::{auto_backend, backend_for, kill_pid, pid_alive, Backend};
pub use capacity::VelocityTracker;
pub use decompose::TaskPlan;
pub use fleet::{dispatch_scores, overlap, FleetReconciler, OverlapReport, ReadyItem};
pub use prompt::{build_task_prompt, skills_for_task};
pub use identity::{AgentIdentity, AgentRegistry};
pub use liveness::BoardLiveness;
pub use orchestra_service::{
    CapacityView, DispatchReport, MergeTrainItem, OrchestraService, OrchestraSnapshot, PlanLauncher,
    StartedTask, TeamMemberView, WaitingTask,
};
pub use orchestrate::OrchestrationEngine;
pub use product_plan::{
    materialize_cards, rank_agents, AssignmentRecommendation, OrchestraConfig, OrchestraStore,
    PlanQuestion, PlanStatus, PlanTask, PlanTaskStatus, ProductPlan,
};
pub use queue::{TaskQueue, TaskRequest, TaskResult, TaskResults, TaskStatus};
pub use roles::{AgentRole, Capability};
pub use team::{AgentProfile, ProfileStatus, ProfileStore, RoleDef, RoleRegistry};
pub use session::{
    list_sessions, live_sessions, load_session, remove_session, resolve_session_id, save_session,
    session_path, sessions_dir, transcript_tail, LiveSession, Session, SessionBackend,
    SessionStatus,
};
pub use worktree::{acquire_worktree, release_worktree, worktrees_root};
