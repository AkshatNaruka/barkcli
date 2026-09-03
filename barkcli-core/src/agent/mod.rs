pub mod backend;
pub mod capacity;
pub mod decompose;
pub mod fleet;
pub mod identity;
pub mod orchestrate;
pub mod prompt;
pub mod queue;
pub mod roles;
pub mod session;
pub mod verify;
pub mod worktree;

pub use backend::{auto_backend, backend_for, kill_pid, pid_alive, Backend};
pub use capacity::VelocityTracker;
pub use decompose::TaskPlan;
pub use fleet::{dispatch_scores, overlap, FleetReconciler, OverlapReport, ReadyItem};
pub use prompt::{build_task_prompt, skills_for_task};
pub use identity::{AgentIdentity, AgentRegistry};
pub use orchestrate::OrchestrationEngine;
pub use queue::{TaskQueue, TaskRequest, TaskResult, TaskResults, TaskStatus};
pub use roles::{AgentRole, Capability};
pub use session::{
    list_sessions, load_session, remove_session, resolve_session_id, save_session, session_path,
    sessions_dir, transcript_tail, Session, SessionBackend, SessionStatus,
};
pub use worktree::{acquire_worktree, release_worktree, worktrees_root};
