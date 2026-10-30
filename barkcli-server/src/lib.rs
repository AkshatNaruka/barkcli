use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, Request, State,
    },
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
    routing::{delete, get, post, put},
    Router,
};
use chrono::{DateTime, Local, Utc};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, Mutex};
use tower_http::services::ServeDir;

use barkcli_core::agent::{
    AgentIdentity, AgentRegistry, AgentRole, TaskQueue, TaskRequest, TaskStatus,
};
use barkcli_core::code::SymbolIndex;
use barkcli_core::commands::hooks;
use barkcli_core::memory::store::{MemoryEntry, MemoryStore, MemoryTier, ProjectFact};
use barkcli_core::models::card::Comment;
use barkcli_core::models::spec::{Requirement, RequirementStatus, Spec, SpecStatus};
use barkcli_core::models::{Board, Sprint};
use barkcli_core::storage::board_file;
use barkcli_core::storage::board_file::{list_board_files, read_board};
use barkcli_core::storage::config_store;
use barkcli_core::storage::context::read_context;
use barkcli_core::storage::sessions;
use barkcli_core::storage::sprints;

#[allow(dead_code)]
static INDEX_HTML_FALLBACK: &str = include_str!("./index.html");

static RELOAD_VERSION: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
struct ChatRuntime {
    pid: Option<u32>,
    turn_id: String,
    provider: String,
}

#[derive(Clone)]
struct AppState {
    board_name: Option<String>,
    host: String,
    token: Option<String>,
    tx: broadcast::Sender<String>,
    thread_tx: broadcast::Sender<barkcli_core::threads::ThreadEvent>,
    code_cache: Arc<Mutex<Option<CodeCache>>>,
    /// One live read-only chat turn per thread. Chat turns run in the project
    /// root, not a worktree, so they must be stopped explicitly.
    chat: Arc<StdMutex<HashMap<String, ChatRuntime>>>,
    /// Monotonic process start time; feeds `uptime_seconds` on `/api/ping`.
    started_at: Instant,
}

struct CodeCache {
    root: String,
    built_at: Instant,
    index: Arc<SymbolIndex>,
}

pub async fn run(
    port: u16,
    board_name: Option<&str>,
    open_browser: bool,
    host: &str,
    token: Option<String>,
) -> Result<()> {
    run_with_shutdown(
        port,
        board_name,
        open_browser,
        host,
        token,
        std::future::pending::<()>(),
    )
    .await
}

/// Same as [`run`], but stops accepting connections when `shutdown` resolves.
/// The desktop app uses this to guarantee the server dies with the window.
pub async fn run_with_shutdown<F>(
    port: u16,
    board_name: Option<&str>,
    open_browser: bool,
    host: &str,
    token: Option<String>,
    shutdown: F,
) -> Result<()>
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    // Auto-init: create .board/ if it doesn't exist
    auto_init().await;
    reconcile_runtime_runs();

    let (tx, _) = broadcast::channel::<String>(16);
    let (thread_tx, _) = broadcast::channel::<barkcli_core::threads::ThreadEvent>(128);

    let state = Arc::new(AppState {
        board_name: board_name.map(|s| s.to_string()),
        host: host.to_string(),
        token,
        tx: tx.clone(),
        thread_tx: thread_tx.clone(),
        code_cache: Arc::new(Mutex::new(None)),
        chat: Arc::new(StdMutex::new(HashMap::new())),
        started_at: Instant::now(),
    });

    let app = Router::new()
        .route("/api/project", get(project_handler))
        .route("/api/project/onboard", post(onboard_project_handler))
        .route("/api/project/init-git", post(init_git_handler))
        .route("/api/hooks", get(hooks_status_handler))
        .route("/api/hooks/install", post(install_hooks_handler))
        .route("/api/boards", get(list_boards_handler))
        .route("/api/board", get(get_board_handler).put(save_board_handler))
        .route("/api/threads", get(list_threads_handler).post(create_thread_handler))
        .route("/api/threads/{id}", get(get_thread_handler).patch(update_thread_handler).delete(delete_thread_handler))
        .route("/api/threads/{id}/fork", post(fork_thread_handler))
        .route("/api/threads/{id}/messages", post(post_thread_message_handler))
        .route("/api/threads/{id}/chat", post(chat_thread_handler))
        .route("/api/threads/{id}/chat/stop", post(stop_chat_handler))
        .route("/api/threads/{id}/stream", get(stream_thread_handler))
        .route(
            "/api/threads/{id}/runs",
            get(list_thread_runs_handler).post(start_thread_run_handler),
        )
        .route("/api/providers", get(list_providers_handler))
        .route("/api/providers/{id}/probe", post(probe_provider_handler))
        .route("/api/providers/{id}/models", get(provider_models_handler))
        .route("/api/runs/{id}", get(get_run_handler))
        .route("/api/runs/{id}/ancestry", get(run_ancestry_handler))
        .route("/api/runs/{id}/link", post(link_run_handler))
        .route("/api/runs/{id}/verify", post(verify_run_handler))
        .route(
            "/api/contributions",
            get(contributions_handler).post(create_contribution_handler),
        )
        .route("/api/contributions/analyze", get(contributions_handler))
        .route("/api/contributions/duplicates", get(contribution_duplicates_handler))
        .route("/api/runs/{id}/diff", get(run_diff_handler))
        .route("/api/runs/{id}/gate", get(run_gate_handler).post(check_run_handler))
        .route("/api/runs/{id}/context", get(run_context_handler))
        .route("/api/runs/{id}/stop", post(stop_run_handler))
        .route("/api/runs/{id}/merge", post(merge_run_handler))
        .route("/api/context/preview", post(context_preview_handler))
        .route("/api/sessions/{id}/transcript", get(session_transcript_handler))
        .route("/api/sessions/{id}/stop", post(session_stop_handler))
        .route("/api/sessions/{id}/steer", post(session_steer_handler))
        .route("/api/sessions/{id}/fork", post(session_fork_handler))
        .route("/api/sessions/{id}/eval", get(session_eval_handler))
        .route("/api/tasks/{id}/race", post(task_race_handler))
        .route("/api/tasks/{id}/diff", get(task_diff_handler))
        .route("/api/sprints", get(sprints_handler).post(start_sprint_handler))
        .route("/api/sprints/end", post(end_sprint_handler))
        .route("/api/history", get(history_handler))
        .route("/api/sessions", get(sessions_handler))
        .route("/api/sessions/stats", get(session_stats_handler))
        .route("/api/agenda", get(agenda_handler))
        .route("/api/reports", get(reports_handler))
        .route("/api/run/live", get(run_live_handler))
        .route("/api/context", get(context_handler))
        .route("/api/context/sync", post(sync_context_handler))
        .route("/api/context/clear", post(clear_context_handler))
        .route("/api/context/file", get(context_file_handler))
        .route("/api/context/file/digest", post(context_file_digest_handler))
        .route("/api/code", get(code_handler))
        .route("/api/config", get(config_handler))
        // Review, repository, editor, and ship actions (M4)
        .route("/api/reviews/{id}", get(review_state_handler))
        .route("/api/reviews/{id}/viewed", post(review_viewed_handler))
        .route(
            "/api/reviews/{id}/comments",
            post(review_add_comment_handler),
        )
        .route(
            "/api/reviews/{id}/comments/{comment_id}",
            delete(review_delete_comment_handler),
        )
        .route(
            "/api/reviews/{id}/comments/{comment_id}/resolve",
            post(review_resolve_comment_handler),
        )
        .route("/api/runs/{id}/request-changes", post(request_changes_handler))
        .route("/api/runs/{id}/ask", post(ask_about_run_handler))
        // Trust layer: receipts, guard, review queue (SPEC-007)
        .route("/api/receipts", get(list_receipts_handler))
        .route("/api/receipts/{id}", get(get_receipt_handler))
        .route("/api/receipts/{id}/verify", post(verify_receipt_handler))
        .route("/api/guard/scan", post(guard_scan_handler))
        .route("/api/review/queue", get(review_queue_handler))
        .route("/api/editor/detect", get(editor_detect_handler))
        .route("/api/open", post(open_file_handler))
        .route("/api/repo/tree", get(repo_tree_handler))
        .route("/api/repo/file", get(repo_file_handler))
        .route("/api/exec", post(exec_handler))
        .route("/api/rules", get(list_rules_handler).post(add_rule_handler))
        .route("/api/rules/{title}", delete(delete_rule_handler))
        .route(
            "/api/schedules",
            get(list_schedules_handler).post(add_schedule_handler),
        )
        .route("/api/schedules/{id}", delete(delete_schedule_handler))
        .route("/api/schedules-run-due", post(run_schedules_handler))
        .route("/api/git/status", get(git_status_handler))
        .route("/api/git/worktrees", get(git_worktrees_handler))
        .route("/api/git/commit", post(git_commit_handler))
        .route("/api/git/push", post(git_push_handler))
        .route("/api/git/merge", post(git_merge_handler))
        .route("/api/git/pr", post(git_pr_handler))
        // Liveness probe (public — see `auth_layer`); no disk access.
        .route("/api/ping", get(ping_handler))
        // Management layer endpoints
        .route("/api/tasks", get(list_tasks_handler).post(create_task_handler))
        .route(
            "/api/tasks/{task_id}",
            get(get_task_handler)
                .put(update_task_handler)
                .delete(delete_task_handler),
        )
        .route("/api/tasks/{task_id}/claim", post(claim_task_handler))
        .route("/api/tasks/{task_id}/complete", post(complete_task_handler))
        .route("/api/tasks/{task_id}/fail", post(fail_task_handler))
        .route("/api/tasks/create-and-run", post(create_and_run_task_handler))
        .route("/api/board/cards/{card_id}/plan-and-run", post(card_plan_and_run_handler))
        .route("/api/agents", get(list_agents_handler).post(register_agent_handler))
        .route(
            "/api/agents/{agent_id}",
            get(get_agent_handler).delete(delete_agent_handler),
        )
        .route("/api/agents/{agent_id}/status", get(agent_status_handler))
        .route("/api/roles", get(list_roles_handler))
        .route(
            "/api/agents/profiles",
            get(list_profiles_handler).post(save_profile_handler),
        )
        .route("/api/agents/profiles/default", post(default_team_handler))
        .route(
            "/api/agents/profiles/{profile_id}/status",
            post(profile_status_handler),
        )
        .route("/api/agents/assign", post(assign_agent_handler))
        .route("/api/orchestra", get(orchestra_snapshot_handler))
        .route("/api/orchestra/tick", post(orchestra_tick_handler))
        .route("/api/orchestra/plans", post(create_orchestra_plan_handler))
        .route(
            "/api/orchestra/plans/{plan_id}",
            get(get_orchestra_plan_handler),
        )
        .route(
            "/api/orchestra/plans/{plan_id}/approve",
            post(approve_orchestra_plan_handler),
        )
        .route(
            "/api/orchestra/plans/{plan_id}/dispatch",
            post(dispatch_orchestra_plan_handler),
        )
        .route(
            "/api/orchestra/plans/{plan_id}/cancel",
            post(cancel_orchestra_plan_handler),
        )
        .route(
            "/api/orchestra/plans/{plan_id}/tasks/{task_id}/assign",
            post(assign_orchestra_task_handler),
        )
        .route(
            "/api/orchestra/plans/{plan_id}/tasks/{task_id}/assignments",
            get(orchestra_task_assignments_handler),
        )
        .route(
            "/api/orchestra/plans/{plan_id}/tasks/{task_id}/retry",
            post(retry_orchestra_task_handler),
        )
        .route(
            "/api/orchestra/plans/{plan_id}/questions/{question_id}/answer",
            post(answer_orchestra_question_handler),
        )
        .route("/api/runs/{id}/approve", post(approve_run_handler))
        .route("/api/runs/{id}/answer", post(answer_run_handler))
        .route("/api/orchestrate/next", post(orchestrate_next_handler))
        .route("/api/orchestrate/cycle", post(orchestrate_cycle_handler))
        .route("/api/orchestrate/status", get(orchestrate_status_handler))
        // Memory endpoints
        .route("/api/memory", get(list_memory_handler).post(add_memory_handler))
        .route("/api/memory/{id}", delete(delete_memory_handler))
        .route("/api/memory/stats", get(memory_stats_handler))
        .route("/api/memory/fact", post(add_fact_handler))
        .route("/api/memory/facts", get(list_facts_handler))
        .route("/api/memory/ingest", post(ingest_memory_handler))
        .route("/api/memory/consolidate", post(consolidate_memory_handler))
        // Brain graph endpoints
        .route("/api/brain", get(brain_graph_handler))
        .route("/api/brain/node/{id}", get(brain_node_handler))
        // Specs endpoints
        .route("/api/specs", get(list_specs_handler).post(create_spec_handler))
        .route("/api/specs/coverage", get(specs_coverage_handler))
        .route(
            "/api/specs/{spec_id}",
            get(get_spec_handler)
                .put(update_spec_handler)
                .delete(delete_spec_handler),
        )
        .route("/api/specs/{spec_id}/requirements", post(add_requirement_handler))
        .route(
            "/api/specs/{spec_id}/requirements/{req_id}",
            put(update_requirement_handler),
        )
        .route("/api/specs/{spec_id}/trace", get(trace_spec_handler))
        .route("/api/specs/scan-stale", post(scan_stale_handler))
        // Checkpoint endpoints
        .route("/api/checkpoints", get(list_checkpoints_handler).post(save_checkpoint_handler))
        .route("/api/checkpoints/{id}/restore", post(restore_checkpoint_handler))
        // Undo/Diff/Blame endpoints
        .route("/api/undo", post(undo_handler))
        .route("/api/diff", get(diff_handler))
        .route("/api/blame/{card_id}", get(blame_handler))
        .route("/api/snapshot", post(snapshot_handler))
        // Import/Export endpoints
        .route("/api/export", get(export_handler))
        .route("/api/import", post(import_handler))
        // Validate/Doctor endpoints
        .route("/api/validate", get(validate_handler))
        .route("/api/doctor", post(doctor_handler))
        // Board CRUD
        .route("/api/boards/create", post(create_board_handler))
        .route("/api/boards/{name}", delete(delete_board_handler))
        // Card comments
        .route("/api/board/cards/{card_id}/comments", post(add_comment_handler))
        // Mind endpoints (SPEC-004 R2)
        .route("/api/mind", get(mind_snapshot_handler))
        .route("/api/mind/digest", get(mind_digest_handler))
        // Autopilot endpoints (agent-driven loop with human gates)
        .route("/api/autopilot/status", get(autopilot_status_handler))
        .route("/api/intake", post(intake_handler))
        .route("/api/autopilot/propose", post(autopilot_propose_handler))
        .route("/api/autopilot/approve", post(autopilot_approve_handler))
        .route("/api/autopilot/reject", post(autopilot_reject_handler))
        .route("/api/review", post(review_handler))

        // Smart History Bundles
        .route("/api/bundles", get(list_bundles_handler))
        .route("/api/bundles/scan", post(scan_bundles_handler))
        .route("/api/bundles/tree", get(bundle_tree_handler))
        .route("/api/bundles/export", get(export_bundles_handler))
        .route("/api/bundles/export-branch", post(export_branch_handler))
        .route("/api/bundles/{id}", get(get_bundle_handler).delete(delete_bundle_handler))
        .route("/api/bundles/{id}/approve", post(approve_bundle_handler))
        .route("/api/bundles/{id}/reject", post(reject_bundle_handler))
        .route("/api/bundles/{id}/seal", post(seal_bundle_handler))
        .route("/api/bundles/{id}/rename", put(rename_bundle_handler))
        .route("/api/bundles/merge", post(merge_bundles_handler))
        .route("/api/bundles/split", post(split_bundle_handler))
        .route("/api/bundles/move", post(move_commit_handler))
        // Git history & visualizer
        .route("/api/git/commits", get(git_commits_handler))
        .route("/api/git/diff/{sha}", get(git_diff_handler))
        .route("/api/git/assign", post(git_assign_handler))
        // Skills endpoints (SPEC-004 R2)
        .route("/api/skills", get(list_skills_handler).post(create_skill_handler))
        .route("/api/skills/install", post(install_skills_handler))
        .route("/api/skills/discover", get(discover_skills_handler))
        .route("/api/skills/discover/import", post(import_discovered_skill_handler))
        .route(
            "/api/skills/{id}",
            get(get_skill_handler)
                .patch(update_skill_handler)
                .delete(delete_skill_handler),
        )
        // Documentation endpoints
        .route("/api/docs", get(list_docs_handler))
        .route("/api/docs/{file}", get(get_doc_handler))
        .route("/ws", get(ws_handler))
        .fallback_service(ServeDir::new(static_dir("web/dist")).fallback(
            // Fallback to old VS Code extension assets.
            ServeDir::new(static_dir("vscode-extension/dist")),
        ))
        .layer(middleware::from_fn_with_state(state.clone(), auth_layer))
        .with_state(state.clone());

    let watch_tx = tx.clone();
    let watch_board_name = board_name.map(|s| s.to_string());
    tokio::spawn(async move {
        watch_board_files(watch_tx, watch_board_name).await;
    });

    // Sleep-time reconciler: fingerprint the evidence files every few
    // seconds; when anything changed, regenerate each adopted board's
    // project_context.md so the file is always trustworthy at the next
    // session start. Digest is content-idempotent — no-op runs write nothing
    // and produce no watcher echo.
    let recon_board = board_name.map(|s| s.to_string());
    tokio::spawn(async move {
        context_reconciler_loop(recon_board).await;
    });

    let loopback = host == "127.0.0.1" || host == "localhost" || host == "::1";
    if !loopback {
        eprintln!(
            "warning: binding to {} — the board API is exposed on your network.\n\
             warning: use `--token <token>` to require an access token.",
            host
        );
    }
    if let Some(t) = &state.token {
        eprintln!("note: API access requires token '{}'", t);
    }

    let addr = format!("{}:{}", host, port);
    // Bind first so port 0 (desktop / tests) reports the real port, and a
    // failed bind never announces a URL that is not listening.
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .context(format!("failed to bind to {}", addr))?;
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
    println!("Board server listening on http://localhost:{}", port);

    if open_browser {
        let url = match &state.token {
            Some(t) => format!("http://localhost:{}/?token={}", port, t),
            None => format!("http://localhost:{}", port),
        };
        if let Err(e) = open::that(url) {
            eprintln!("Failed to open browser: {}", e);
        }
    }

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await
        .context("server error")?;

    Ok(())
}

/// Locate a static asset directory from the executable, not just the cwd.
///
/// A double-clicked `.app` runs with cwd `/`, so the old `ServeDir::new("web/dist")`
/// silently served nothing. Walk up from the binary (and check the macOS
/// `Resources` folder) so web and desktop share the same bundle.
fn static_dir(rel: &str) -> std::path::PathBuf {
    if rel == "web/dist" {
        if let Some(dir) = std::env::var_os("BARKCLI_WEB_DIST") {
            let path = std::path::PathBuf::from(dir);
            if path.is_dir() {
                return path;
            }
        }
    }

    let cwd = std::env::current_dir().unwrap_or_default();
    let from_cwd = cwd.join(rel);
    if from_cwd.is_dir() {
        return from_cwd;
    }

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..5 {
            let Some(current) = dir else { break };
            let candidate = current.join(rel);
            if candidate.is_dir() {
                return candidate;
            }
            // macOS bundle: Contents/MacOS/barkcli → Contents/Resources/...
            let resources = current.join("..").join("Resources").join(rel);
            if resources.is_dir() {
                return resources;
            }
            dir = current.parent().map(|p| p.to_path_buf());
        }
    }

    from_cwd
}

/// Auto-initialize `.board/` directory and create a default board if needed.
async fn auto_init() {
    let root = match barkcli_core::storage::board_dir::find_project_root() {
        Ok(dir) => dir,
        Err(_) => {
            // No project root found, try to init from CWD
            let cwd = std::env::current_dir().unwrap_or_default();
            let board_dir = cwd.join(".board");
            if !board_dir.exists() {
                if let Ok(()) = std::fs::create_dir_all(&board_dir) {
                    let config = barkcli_core::models::Config {
                        version: 1,
                        default_board: None,
                        default_columns: vec!["todo".into(), "doing".into(), "review".into(), "done".into()],
                        default_labels: vec!["bug".into(), "feature".into(), "urgent".into()],
                        priorities: vec!["low".into(), "medium".into(), "high".into()],
                        ai: None,
                        runtime: Default::default(),
                        guard: Default::default(),
                        receipts: Default::default(),
                    };
                    let config_json = serde_json::to_string_pretty(&config).unwrap_or_default();
                    let _ = std::fs::write(board_dir.join("config.json"), config_json);

                    // Create .gitignore
                    let _ = std::fs::write(
                        board_dir.join(".gitignore"),
                        "history/\nsessions/\ncontext/\nundo/\nsnapshots/\nlocks/\nmemory/\n",
                    );

                    eprintln!("barkcli: initialized .board/ directory");
                }
            }
            return;
        }
    };

    // Check if any boards exist
    let boards = list_board_files().unwrap_or_default();
    if boards.is_empty() {
        // Create a default board
        let board = Board {
            title: "My Project".into(),
            description: Some("Default board created by barkcli serve".into()),
            columns: vec![
                barkcli_core::models::Column::new("todo", "To Do"),
                barkcli_core::models::Column::new("doing", "Doing"),
                barkcli_core::models::Column::new("review", "Review"),
                barkcli_core::models::Column::new("done", "Done"),
            ],
            cards: vec![],
        };
        if let Ok(()) = board_file::write_board("my-project", &board) {
            eprintln!("barkcli: created default board 'my-project.board'");
        }
    }

    // Pin default_board when unambiguous (fresh serve / single board) so
    // CLI, MCP, and server all resolve the same board without flags.
    if let Ok(board_dir) = barkcli_core::storage::board_dir::find_board_dir() {
        if let Ok(cfg) = config_store::read_config(&board_dir) {
            if cfg.default_board.is_none() {
                if let Ok(boards) = list_board_files() {
                    if boards.len() == 1 {
                        let mut cfg = cfg;
                        cfg.default_board = Some(boards[0].clone());
                        let _ = config_store::write_config(&board_dir, &cfg);
                    }
                }
            }
        }
    }
}

// ── Project lifecycle ──

fn broadcast_contribution(
    tx: &broadcast::Sender<String>,
    event: &str,
    run_id: &str,
) {
    let _ = tx.send(
        serde_json::json!({
            "type": event,
            "run_id": run_id,
        })
        .to_string(),
    );
}

fn reconcile_runtime_runs() {
    let Ok(store) = barkcli_core::runtime::RuntimeStore::from_project() else {
        return;
    };
    for mut run in store.list_runs(None).unwrap_or_default() {
        if run.status.is_terminal() {
            continue;
        }
        let alive = run
            .pid
            .map(barkcli_core::agent::backend::pid_alive)
            .unwrap_or(false);
        if alive {
            continue;
        }
        run.status = barkcli_core::runtime::RunStatus::Interrupted;
        run.ended_at = Some(chrono::Utc::now());
        if run.error.is_none() {
            run.error = Some("Interrupted while the server was offline".into());
        }
        let _ = store.save_run(&run);
    }
}

fn project_root_or_cwd() -> std::path::PathBuf {
    barkcli_core::storage::board_dir::find_project_root()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
}

/// Build the real project snapshot used by Workspace, setup, and onboarding.
fn project_snapshot(state: &AppState) -> serde_json::Value {
    let root = project_root_or_cwd();
    let boards = list_board_files().unwrap_or_default();
    let active_board = resolve_board_name(state, None).ok();
    let is_git = root.join(".git").exists();
    let git = barkcli_core::repo::git_status(&root).ok();

    let board = active_board
        .as_ref()
        .and_then(|name| read_board(name).ok());
    let cards = board.as_ref().map(|b| b.cards.len()).unwrap_or(0);
    let done = board
        .as_ref()
        .map(|b| b.cards.iter().filter(|c| c.column == "done").count())
        .unwrap_or(0);
    let doing = board
        .as_ref()
        .map(|b| b.cards.iter().filter(|c| c.column == "doing").count())
        .unwrap_or(0);
    let specs = active_board
        .as_ref()
        .and_then(|name| barkcli_core::storage::specs::read_specs(name).ok())
        .map(|s| s.len())
        .unwrap_or(0);
    let sessions = active_board
        .as_ref()
        .and_then(|name| sessions::read_sessions(name).ok())
        .map(|s| s.len())
        .unwrap_or(0);
    let profiles = barkcli_core::agent::ProfileStore::from_project()
        .and_then(|store| store.list())
        .unwrap_or_default();
    let hooks = hooks::status_for_root(&root);

    let context_path = barkcli_core::context_file::file_path(&root);
    let context = if context_path.exists() {
        let content = std::fs::read_to_string(&context_path).unwrap_or_default();
        let parsed = barkcli_core::context_file::parse(&content);
        let stale = parsed
            .blocks
            .iter()
            .filter(|b| b.meta.staleness >= 0.4)
            .count();
        let cf_state = active_board
            .as_ref()
            .and_then(|name| barkcli_core::context_file::read_state(name).ok())
            .unwrap_or_default();
        serde_json::json!({
            "exists": true,
            "file": context_path.display().to_string(),
            "tokens": barkcli_core::context_file::estimate_tokens(&content),
            "blocks": parsed.blocks.len(),
            "stale_blocks": stale,
            "last_run": cf_state.last_run,
            "budget_tokens": cf_state.budget_tokens,
        })
    } else {
        serde_json::json!({
            "exists": false,
            "file": context_path.display().to_string(),
        })
    };

    let board_ready = !boards.is_empty();
    let team_ready = !profiles.is_empty();
    let hooks_ready = hooks.opencode || hooks.claude_code;
    let context_ready = context_path.exists();
    let setup_complete = board_ready && team_ready && hooks_ready && context_ready;

    serde_json::json!({
        "root": root.display().to_string(),
        "name": root.file_name().and_then(|n| n.to_str()).unwrap_or("project"),
        "board_dir": root.join(".board").display().to_string(),
        "boards": boards,
        "active_board": active_board,
        "is_git": is_git,
        "git": git.map(|g| serde_json::json!({
            "branch": g.branch,
            "head": g.head,
            "upstream": g.upstream,
            "ahead": g.ahead,
            "behind": g.behind,
            "clean": g.clean,
            "changes": g.changes.len(),
        })),
        "context": context,
        "hooks": hooks,
        "setup": {
            "board": board_ready,
            "context": context_ready,
            "team": team_ready,
            "hooks": hooks_ready,
            "complete": setup_complete,
        },
        "counts": {
            "cards": cards,
            "done": done,
            "doing": doing,
            "specs": specs,
            "sessions": sessions,
            "agents": profiles.len(),
        },
        "commands": barkcli_core::repo::detect_commands(&root),
        "verification_command": barkcli_core::runtime::runner::detect_test_cmd(&root),
    })
}

async fn project_handler(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(project_snapshot(&state))
}

fn setup_step(id: &str, label: &str, ok: bool, detail: String) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "label": label,
        "ok": ok,
        "detail": detail,
    })
}

/// Idempotent basic setup. This is intentionally deterministic: it never asks
/// an AI to create cards or code. The desktop app calls it once per project
/// load; the Workspace button calls it again on demand.
async fn onboard_project_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let mut steps = Vec::new();

    auto_init().await;
    let boards = list_board_files().unwrap_or_default();
    steps.push(setup_step(
        "board",
        "Board",
        !boards.is_empty(),
        if boards.is_empty() {
            "No board could be created".into()
        } else {
            format!("{} board(s) ready", boards.len())
        },
    ));

    let active_board = resolve_board_name(&state, None).ok();
    let root = project_root_or_cwd();

    if let Some(board_name) = active_board.as_ref() {
        let context_path = barkcli_core::context_file::file_path(&root);
        if context_path.exists() {
            steps.push(setup_step(
                "context",
                "Living context",
                true,
                "project_context.md already exists".into(),
            ));
        } else {
            let opts = barkcli_core::context_file::DigestOpts {
                quiet: true,
                ..Default::default()
            };
            match barkcli_core::context_file::digest::run_digest_core(board_name, &opts) {
                Ok(report) => steps.push(setup_step(
                    "context",
                    "Living context",
                    true,
                    format!("generated project_context.md ({} tokens)", report.total_tokens),
                )),
                Err(error) => steps.push(setup_step(
                    "context",
                    "Living context",
                    false,
                    format!("could not generate project_context.md: {error}"),
                )),
            }
        }

        let profiles_before = barkcli_core::agent::ProfileStore::from_project()
            .and_then(|store| store.list())
            .unwrap_or_default();
        let team_result = if profiles_before.is_empty() {
            barkcli_core::agent::ProfileStore::from_project()
                .and_then(|store| store.ensure_default_team())
        } else {
            Ok(profiles_before.clone())
        };
        match team_result {
            Ok(profiles) => steps.push(setup_step(
                "team",
                "Agent team",
                !profiles.is_empty(),
                format!("{} agent profile(s) ready", profiles.len()),
            )),
            Err(error) => steps.push(setup_step(
                "team",
                "Agent team",
                false,
                format!("could not create the default team: {error}"),
            )),
        }
    } else {
        for (id, label) in [("context", "Living context"), ("team", "Agent team")] {
            steps.push(setup_step(
                id,
                label,
                false,
                "No board is active, so this step was skipped".into(),
            ));
        }
    }

    let hooks_before = hooks::status_for_root(&root);
    let hooks_result = if hooks_before.opencode || hooks_before.claude_code {
        Ok(())
    } else {
        hooks::install_default_for_root(&root)
    };
    let hooks_after = hooks::status_for_root(&root);
    steps.push(setup_step(
        "hooks",
        "Session hooks",
        hooks_after.opencode || hooks_after.claude_code,
        match hooks_result {
            Ok(()) => "opencode / Claude Code session hooks ready".into(),
            Err(error) => format!("could not install session hooks: {error}"),
        },
    ));

    let providers = barkcli_core::runtime::ProviderRegistry::standard().statuses();
    let ready = providers
        .iter()
        .filter(|p| p.available && p.authenticated != Some(false))
        .count();
    steps.push(setup_step(
        "providers",
        "Local agents",
        ready > 0,
        format!("{ready} local agent(s) ready to run"),
    ));

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "steps": steps,
        "project": project_snapshot(&state),
    })))
}

#[derive(Deserialize, Default)]
struct InitGitRequest {
    #[serde(default)]
    confirm: bool,
}

async fn init_git_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<InitGitRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if !req.confirm {
        return Err(ServerError::bad(
            "git initialization requires explicit confirmation",
        ));
    }
    let root = project_root_or_cwd();
    if root.join(".git").exists() {
        return Ok(Json(serde_json::json!({
            "ok": true,
            "already": true,
            "root": root.display().to_string(),
        })));
    }
    let output = std::process::Command::new("git")
        .args(["init", "-q"])
        .current_dir(&root)
        .output()
        .map_err(|e| ServerError::internal(format!("git is not available: {e}")))?;
    if !output.status.success() {
        return Err(ServerError::internal(format!(
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "already": false,
        "root": root.display().to_string(),
    })))
}

async fn hooks_status_handler() -> Json<serde_json::Value> {
    let root = project_root_or_cwd();
    Json(serde_json::to_value(hooks::status_for_root(&root)).unwrap_or_else(|_| serde_json::json!({})))
}

#[derive(Deserialize, Default)]
struct HooksInstallRequest {
    #[serde(default)]
    agents: Vec<String>,
}

async fn install_hooks_handler(
    Json(req): Json<HooksInstallRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = project_root_or_cwd();
    let agents = if req.agents.is_empty() {
        vec!["opencode".to_string(), "claude-code".to_string()]
    } else {
        req.agents
    };
    hooks::install_for_root(&root, &agents).map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "status": hooks::status_for_root(&root),
    })))
}

// ── Security middleware ──

async fn auth_layer(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    // Static assets (index.html, js, css) are public — the app carries the
    // token on its own /api requests. Protect only data + websocket routes.
    let path = req.uri().path();
    // `/api/ping` is the one public API route: uptime monitors cannot carry a
    // token, and the payload (time, version, uptime) holds no project data.
    // Exact literal, not a prefix, so it cannot widen to `/api/ping/...`.
    let is_protected =
        path == "/ws" || (path.starts_with("/api/") && path != "/api/ping");
    if !is_protected {
        return Ok(next.run(req).await);
    }

    // Token check (when configured): Authorization: Bearer <token> or ?token=
    if let Some(expected) = &state.token {
        let mut ok = false;
        if let Some(ah) = req.headers().get(header::AUTHORIZATION) {
            if let Ok(s) = ah.to_str() {
                if let Some(bearer) = s.strip_prefix("Bearer ") {
                    ok = const_eq(bearer, expected);
                }
            }
        }
        if !ok {
            if let Some(q) = req.uri().query() {
                for pair in q.split('&') {
                    if let Some((k, v)) = pair.split_once('=') {
                        if k == "token" {
                            let decoded = percent_decode(v);
                            if const_eq(&decoded, expected) {
                                ok = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if !ok {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "unauthorized: missing or invalid token"})),
            )
                .into_response());
        }
    }

    // Same-origin check when exposed on a non-loopback interface.
    let loopback = state.host == "127.0.0.1" || state.host == "localhost" || state.host == "::1";
    if !loopback {
        if let Some(origin) = req.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
            let origin_authority = origin
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .split('/')
                .next()
                .unwrap_or("");
            let host_hdr = req
                .headers()
                .get(header::HOST)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if !origin_authority.is_empty()
                && !host_hdr.is_empty()
                && origin_authority != host_hdr
            {
                return Err((
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({"error": "cross-origin request rejected"})),
                )
                    .into_response());
            }
        }
    }

    Ok(next.run(req).await)
}

fn const_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut acc: u8 = 0;
    for (x, y) in a.bytes().zip(b.bytes()) {
        acc |= x ^ y;
    }
    acc == 0
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Validate a board name supplied by the client. Blocks path traversal
/// (`../`, absolute paths, null bytes) by only allowing safe characters.
fn sanitize_name(name: &str) -> Result<String, ServerError> {
    if name.is_empty() {
        return Err(ServerError::bad("board name is empty"));
    }
    if name.len() > 64 {
        return Err(ServerError::bad("board name too long (max 64 chars)"));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(ServerError::bad(format!(
            "invalid board name '{}': only letters, digits, '.', '_' and '-' allowed",
            name
        )));
    }
    Ok(name.to_string())
}

#[derive(serde::Serialize)]
struct BoardListResponse { boards: Vec<String> }

async fn list_boards_handler() -> Result<Json<BoardListResponse>, ServerError> {
    let boards = list_board_files().map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(BoardListResponse { boards }))
}

#[derive(serde::Serialize)]
struct BoardResponse { yaml: String }

#[derive(Deserialize)]
struct BoardQuery { name: Option<String> }

/// Query params for `POST /api/context/file/digest`.
#[derive(serde::Deserialize)]
struct ContextDigestQuery { name: Option<String>, polish: Option<bool> }

/// Resolve the board name: explicit query param > state default > single board.
fn resolve_board_name(state: &AppState, query: Option<String>) -> Result<String, ServerError> {
    let name = match query.or(state.board_name.clone()).unwrap_or_default() {
        n if !n.is_empty() => sanitize_name(&n)?,
        _ => {
            // Respect config default_board like the CLI (not just first file).
            let def = barkcli_core::storage::board_dir::find_board_dir()
                .ok()
                .and_then(|d| config_store::read_config(&d).ok())
                .and_then(|c| c.default_board);
            if let Some(n) = def {
                n
            } else {
                let boards = list_board_files().map_err(|e| ServerError::internal(e.to_string()))?;
                boards
                    .first()
                    .cloned()
                    .ok_or_else(|| ServerError::bad("No boards found. Create one with `board create <name>`."))?
            }
        }
    };
    if !board_file::board_exists(&name) {
        return Err(ServerError::bad(format!("board '{}' not found", name)));
    }
    Ok(name)
}

async fn get_board_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<BoardResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board = read_board(&board_name).map_err(|e| ServerError::internal(format!("read: {}", e)))?;
    let yaml = serde_yaml::to_string(&board).map_err(|e| ServerError::internal(format!("serialize: {}", e)))?;
    Ok(Json(BoardResponse { yaml }))
}

#[derive(Deserialize)]
struct SaveRequest { yaml: String, name: Option<String> }

async fn save_board_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SaveRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let explicit = req.name.or(state.board_name.clone());
    let name = match explicit {
        Some(n) if !n.is_empty() => sanitize_name(&n)?,
        _ => {
            let boards = list_board_files().map_err(|e| ServerError::internal(e.to_string()))?;
            boards
                .first()
                .cloned()
                .ok_or_else(|| ServerError::bad("No boards found."))?
        }
    };

    // Validate that the payload is a well-formed board before touching disk.
    let board: Board = serde_yaml::from_str(&req.yaml)
        .map_err(|e| ServerError::bad(format!("invalid board YAML: {}", e)))?;
    if board.columns.is_empty() {
        return Err(ServerError::bad("invalid board YAML: at least one column required"));
    }
    // A stale client must never be able to erase a populated board with an
    // empty card list. Deleting the final card (existing len == 1) stays legal.
    if board.cards.is_empty() {
        if let Ok(existing) = read_board(&name) {
            if existing.cards.len() > 1 {
                return Err(ServerError::bad(format!(
                    "refusing to overwrite {} cards with an empty board",
                    existing.cards.len()
                )));
            }
        }
    }

    let path = board_file::board_path(&name).map_err(|e| ServerError::internal(format!("path: {}", e)))?;
    let tmp = path.with_extension("board.tmp");
    std::fs::write(&tmp, &req.yaml).map_err(|e| ServerError::internal(format!("write: {}", e)))?;
    std::fs::rename(&tmp, &path).map_err(|e| ServerError::internal(format!("commit: {}", e)))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true, "name": name})))
}

#[derive(serde::Serialize)]
struct SprintsResponse { sprints: Vec<Sprint> }

async fn sprints_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<SprintsResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let sprints = sprints::read_sprints(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(SprintsResponse { sprints }))
}

#[derive(Deserialize)]
struct SprintStartRequest {
    name: String,
    start: Option<String>,
    end: Option<String>,
}

async fn start_sprint_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
    Json(req): Json<SprintStartRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if req.name.is_empty() || req.name.len() > 64 {
        return Err(ServerError::bad("sprint name must be 1-64 chars"));
    }
    let board_name = resolve_board_name(&state, query.name)?;
    let mut board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let today = Local::now().format("%Y-%m-%d").to_string();
    let existing = sprints::read_sprints(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?
        .into_iter()
        .find(|s| s.name == req.name);
    let sprint = Sprint {
        name: req.name.clone(),
        start: Some(req.start.unwrap_or(today)),
        end: req
            .end
            .or_else(|| existing.as_ref().and_then(|s| s.end.clone())),
        created_at: existing.as_ref().map(|s| s.created_at).unwrap_or_else(Utc::now),
    };
    sprints::upsert_sprint(&board_name, sprint).map_err(|e| ServerError::internal(e.to_string()))?;

    let sprint_label = format!("sprint:{}", req.name);
    let mut tagged = 0;
    for card in &mut board.cards {
        if card.column == "todo" || card.column == "doing" {
            if !card.labels.iter().any(|l| l == &sprint_label) {
                card.labels.push(sprint_label.clone());
                tagged += 1;
            }
        }
    }
    let name_for_write = board_name.clone();
    board_file::write_board(&name_for_write, &board)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true, "tagged": tagged, "name": req.name})))
}

#[derive(Deserialize)]
struct SprintEndRequest { name: Option<String> }

async fn end_sprint_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
    Json(req): Json<SprintEndRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let all = sprints::read_sprints(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let today = Local::now().format("%Y-%m-%d").to_string();
    let name = match req.name {
        Some(n) => n,
        None => all
            .iter()
            .filter(|s| s.start.as_deref().map(|st| st <= today.as_str()).unwrap_or(false))
            .filter(|s| s.end.is_none())
            .max_by_key(|s| s.start.clone().unwrap_or_default())
            .map(|s| s.name.clone())
            .ok_or_else(|| ServerError::bad("no active sprint to end"))?,
    };

    let mut board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    let sprint_label = format!("sprint:{}", name);
    let total = board.cards.iter().filter(|c| c.labels.contains(&sprint_label)).count();
    let done = board
        .cards
        .iter()
        .filter(|c| c.labels.contains(&sprint_label) && c.column == "done")
        .count();

    for card in &mut board.cards {
        if card.labels.contains(&sprint_label) && card.column != "done" {
            card.labels.retain(|l| l != &sprint_label);
            card.updated_at = Utc::now();
        }
    }
    board_file::write_board(&board_name, &board).map_err(|e| ServerError::internal(e.to_string()))?;

    if let Ok(mut sprints) = sprints::read_sprints(&board_name) {
        if let Some(s) = sprints.iter_mut().find(|s| s.name == name) {
            if s.end.is_none() {
                s.end = Some(today);
            }
        }
        let _ = sprints::write_sprints(&board_name, &sprints);
    }

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true, "name": name, "total": total, "done": done,
        "pct": if total > 0 { done as f64 / total as f64 * 100.0 } else { 0.0 },
    })))
}

#[derive(serde::Serialize)]
struct HistoryResponse {
    entries: Vec<barkcli_core::storage::history::HistoryEntry>,
}

#[derive(Deserialize)]
struct CardQuery {
    name: Option<String>,
    card: Option<String>,
    limit: Option<usize>,
    since: Option<String>,
}

fn filter_entries<T>(
    entries: Vec<T>,
    since: &Option<String>,
    limit: Option<usize>,
    at: impl Fn(&T) -> &String,
) -> Vec<T> {
    let entries = match since {
        Some(s) => match DateTime::parse_from_rfc3339(s) {
            Ok(dt) => {
                let utc = dt.with_timezone(&Utc);
                entries
                    .into_iter()
                    .filter(|e| {
                        DateTime::parse_from_rfc3339(at(e))
                            .map(|d| d.with_timezone(&Utc) >= utc)
                            .unwrap_or(true)
                    })
                    .collect()
            }
            Err(_) => entries,
        },
        None => entries,
    };
    match limit {
        Some(n) => entries.into_iter().take(n).collect(),
        None => entries,
    }
}

async fn history_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CardQuery>,
) -> Result<Json<HistoryResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut entries = barkcli_core::storage::history::read_history(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    entries.reverse(); // newest first
    if let Some(card) = &query.card {
        entries.retain(|e| &e.card == card);
    }
    let entries = filter_entries(entries, &query.since, query.limit, |e| &e.at);
    Ok(Json(HistoryResponse { entries }))
}

#[derive(serde::Serialize)]
struct SessionsResponse {
    sessions: Vec<barkcli_core::models::SessionEntry>,
}

#[derive(Deserialize)]
struct SessionsQuery {
    name: Option<String>,
    limit: Option<usize>,
    since: Option<String>,
    q: Option<String>,
    agent: Option<String>,
    card_id: Option<String>,
}

async fn sessions_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SessionsQuery>,
) -> Result<Json<SessionsResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let all = sessions::filter_sessions(
        &board_name,
        query.q.as_deref(),
        query.agent.as_deref(),
        query.card_id.as_deref(),
        None,
    ).map_err(|e| ServerError::internal(e.to_string()))?;
    let all = filter_entries(all, &query.since, query.limit, |e| &e.at);
    Ok(Json(SessionsResponse { sessions: all }))
}

async fn session_stats_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<barkcli_core::storage::sessions::SessionStats>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let stats = sessions::session_stats(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(stats))
}

async fn agenda_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<barkcli_core::commands::agenda::AgendaSummary>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let summary = barkcli_core::commands::agenda::get_agenda_summary(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(summary))
}

#[derive(serde::Serialize)]
struct ReportsResponse {
    board_name: String,
    total_cards: usize,
    completed_cards: usize,
    in_progress_cards: usize,
    blocked_cards: usize,
    todo_cards: usize,
    completion_rate: f32,
    total_effort: u32,
    completed_effort: u32,
    by_priority: std::collections::HashMap<String, usize>,
    by_column: std::collections::HashMap<String, usize>,
}

async fn reports_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<ReportsResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board = read_board(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let total_cards = board.cards.len();
    let completed_cards = board.cards.iter().filter(|c| c.column == "done").count();
    let in_progress_cards = board.cards.iter().filter(|c| c.column == "doing" || c.column == "review").count();
    let blocked_cards = board.cards.iter().filter(|c| c.blocked_by.is_some() || c.links.iter().any(|l| l.ty == barkcli_core::models::card::LinkType::BlockedBy)).count();
    let todo_cards = board.cards.iter().filter(|c| c.column == "todo").count();
    let completion_rate = board.completion_rate();
    let total_effort = board.total_effort();
    let completed_effort = board.completed_effort();

    let mut by_priority = std::collections::HashMap::new();
    let mut by_column = std::collections::HashMap::new();
    for c in &board.cards {
        *by_priority.entry(c.priority.clone()).or_insert(0) += 1;
        *by_column.entry(c.column.clone()).or_insert(0) += 1;
    }

    Ok(Json(ReportsResponse {
        board_name,
        total_cards,
        completed_cards,
        in_progress_cards,
        blocked_cards,
        todo_cards,
        completion_rate,
        total_effort,
        completed_effort,
        by_priority,
        by_column,
    }))
}

#[derive(serde::Serialize)]
struct RunLiveResponse {
    sessions: Vec<barkcli_core::agent::LiveSession>,
}

/// Live snapshot of runner-owned sessions (the attempts `barkcli run` is
/// currently watching). Powers the web UI's live panel.
async fn run_live_handler() -> Result<Json<RunLiveResponse>, ServerError> {
    let sessions = barkcli_core::agent::live_sessions()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(RunLiveResponse { sessions }))
}

#[derive(serde::Serialize)]
struct ContextResponse {
    cards: std::collections::HashMap<String, barkcli_core::models::context::CardContext>,
    index: std::collections::HashMap<String, Vec<String>>,
}

async fn context_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<ContextResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let ctx = read_context(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(ContextResponse { cards: ctx.cards, index: ctx.index }))
}

#[derive(serde::Serialize)]
struct SyncResponse {
    ok: bool,
    touched: usize,
    message: String,
}

async fn sync_context_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<SyncResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let board = read_board(&board_name).map_err(|e| ServerError::internal(format!("read: {}", e)))?;
    if board.cards.is_empty() {
        return Ok(Json(SyncResponse { ok: true, touched: 0, message: "no cards".into() }));
    }
    let mut ctx = read_context(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let head = barkcli_core::util::git::current_commit(&root);
    let last_commit_files = barkcli_core::util::git::last_commit_files(&root);
    let dirty = barkcli_core::util::git::dirty_files(&root);

    let mut touched = 0usize;
    for (_card_id, entry) in ctx.cards.iter_mut() {
        if entry.files.is_empty() {
            continue;
        }
        let mut card_touched = false;
        for f in entry.files.iter_mut() {
            let in_last_commit = last_commit_files.iter().any(|p| paths_match(p, &f.path));
            let is_dirty = dirty.iter().any(|p| paths_match(p, &f.path));
            if in_last_commit {
                f.last_commit = head.clone();
                f.status = "clean".into();
                card_touched = true;
            } else if is_dirty {
                f.status = "changed".into();
                card_touched = true;
            } else if f.status == "unknown" || f.status == "changed" {
                f.status = "clean".into();
            }
        }
        if card_touched {
            touched += 1;
        }
    }
    ctx.rebuild_index();
    barkcli_core::storage::context::write_context(&board_name, &ctx)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(SyncResponse {
        ok: true,
        touched,
        message: format!("{} card(s) touched", touched),
    }))
}

async fn clear_context_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    barkcli_core::storage::context::remove_context(&board_name);
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true})))
}

/// `GET /api/context/file` — the living project_context.md: raw content plus
/// parsed block metadata (staleness, src, manual flag, tokens) for the web
/// heat map. Auto-generates the file on first call.
async fn context_file_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let root = barkcli_core::context_file::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let path = barkcli_core::context_file::file_path(&root);

    let mut generated = false;
    if !path.exists() {
        let opts = barkcli_core::context_file::DigestOpts {
            quiet: true,
            ..Default::default()
        };
        if barkcli_core::context_file::digest::run_digest_core(&board_name, &opts).is_ok() {
            generated = true;
        }
    }
    if !path.exists() {
        return Ok(Json(serde_json::json!({
            "exists": false,
            "board": board_name,
            "hint": "run `barkcli context prime` to bootstrap it"
        })));
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let parsed = barkcli_core::context_file::parse(&content);
    let cf_state = barkcli_core::context_file::read_state(&board_name).unwrap_or_default();

    let blocks: Vec<serde_json::Value> = parsed
        .blocks
        .iter()
        .map(|b| {
            serde_json::json!({
                "id": b.meta.id,
                "heading": b.heading.trim_start_matches('#').trim(),
                "src": b.meta.src,
                "updated": b.meta.updated,
                "staleness": b.meta.staleness,
                "manual": b.meta.manual,
                "tokens": barkcli_core::context_file::estimate_tokens(&b.body.join("\n")),
                "body": b.body.join("\n"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "exists": true,
        "generated": generated,
        "board": board_name,
        "file": path.display().to_string(),
        "content": content,
        "blocks": blocks,
        "total_tokens": barkcli_core::context_file::estimate_tokens(&content),
        "budget_tokens": cf_state.budget_tokens,
        "last_run": cf_state.last_run,
        "evicted_last_run": cf_state.evicted_last_run,
    })))
}

/// `POST /api/context/file/digest` — trigger a regeneration from the web app.
async fn context_file_digest_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ContextDigestQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    // Opt-in LLM brief rewrite (?polish=1) — facts-only guard inside digest.
    let polish = query
        .polish
        .unwrap_or(false);
    let opts = barkcli_core::context_file::DigestOpts {
        quiet: true,
        polish,
        ..Default::default()
    };
    let report = barkcli_core::context_file::digest::run_digest_core(&board_name, &opts)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "regenerated": true,
        "board": board_name,
        "tokens": report.total_tokens,
        "added": report.added,
        "rewritten": report.rewritten,
        "evicted": report.evicted,
        "preserved_manual": report.preserved_manual,
        "flagged_stale": report
            .flagged_stale
            .iter()
            .map(|(id, s)| format!("{} ({:.2})", id, s))
            .collect::<Vec<_>>(),
    })))
}

#[derive(serde::Serialize)]
struct ConfigResponse {
    ai: ConfigAi,
    runtime: ConfigRuntime,
}

#[derive(serde::Serialize)]
struct ConfigAi {
    base_url: String,
    model: String,
}

#[derive(serde::Serialize)]
struct ConfigRuntime {
    runtime_v2: bool,
    default_provider: Option<String>,
    context_budget_tokens: usize,
    auto_merge: bool,
}

async fn config_handler() -> Result<Json<ConfigResponse>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let cfg = config_store::read_config(&root).unwrap_or_default();
    let ai = cfg.ai.unwrap_or_default();
    Ok(Json(ConfigResponse {
        ai: ConfigAi { base_url: ai.base_url, model: ai.model },
        runtime: ConfigRuntime {
            runtime_v2: cfg.runtime.runtime_v2,
            default_provider: cfg.runtime.default_provider,
            context_budget_tokens: cfg.runtime.context_budget_tokens,
            auto_merge: cfg.runtime.auto_merge,
        },
    }))
}

#[derive(serde::Serialize)]
struct PingResponse {
    status: &'static str,
    timestamp: String,
    version: &'static str,
    uptime_seconds: u64,
}

/// Pure payload builder — the clock is injected so tests need no sleeping.
fn ping_payload(started_at: Instant, now: DateTime<Utc>) -> PingResponse {
    PingResponse {
        status: "ok",
        timestamp: now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        version: env!("CARGO_PKG_VERSION"),
        uptime_seconds: started_at.elapsed().as_secs(),
    }
}

/// Liveness probe: infallible, dependency-free (no board or config reads).
async fn ping_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    (
        [(header::CACHE_CONTROL, "no-store")],
        Json(ping_payload(state.started_at, Utc::now())),
    )
}

fn paths_match(changed: &str, mapped: &str) -> bool {
    let changed = changed.trim_start_matches("./").trim_end_matches('/');
    let mapped = mapped.trim_start_matches("./");
    changed == mapped
        || changed.ends_with(&format!("/{}", mapped))
        || mapped.ends_with(&format!("/{}", changed))
        || mapped.starts_with(&format!("{}/", changed))
}

#[derive(serde::Serialize)]
struct CodeResponse {
    results: Vec<CodeHit>,
}

#[derive(serde::Serialize)]
struct CodeHit {
    path: String,
    symbols: Vec<String>,
    cards: Vec<String>,
}

#[derive(Deserialize)]
struct CodeQuery {
    name: Option<String>,
    q: Option<String>,
    top: Option<usize>,
}

async fn code_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CodeQuery>,
) -> Result<Json<CodeResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .to_string_lossy()
        .into_owned();
    let index = {
        let mut guard = state.code_cache.lock().await;
        let stale = guard
            .as_ref()
            .map(|c| c.root != root || c.built_at.elapsed().as_secs() > 5)
            .unwrap_or(true);
        if stale {
            let index = Arc::new(SymbolIndex::build(std::path::Path::new(&root)));
            *guard = Some(CodeCache { root: root.clone(), built_at: Instant::now(), index });
        }
        guard.as_ref().unwrap().index.clone()
    };

    let hits = index.search(&query.q.unwrap_or_default(), query.top.unwrap_or(10));
    let ctx = read_context(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    let board = read_board(&board_name).ok();

    let results = hits
        .into_iter()
        .map(|hit| {
            let cards = ctx
                .index
                .get(&hit.path)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|id| {
                    board
                        .as_ref()
                        .map(|b| b.cards.iter().any(|c| c.id == *id))
                        .unwrap_or(false)
                })
                .collect::<Vec<_>>();
            CodeHit { path: hit.path, symbols: hit.matched_symbols, cards }
        })
        .collect();
    Ok(Json(CodeResponse { results }))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.tx.clone()))
}

async fn handle_socket(socket: WebSocket, tx: broadcast::Sender<String>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = tx.subscribe();
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let version = RELOAD_VERSION.load(Ordering::SeqCst);
            // Plain `reload` strings keep the existing protocol. Structured
            // contribution events are already JSON objects and are forwarded
            // with the same version field.
            let json = if msg.trim_start().starts_with('{') {
                match serde_json::from_str::<serde_json::Value>(&msg) {
                    Ok(serde_json::Value::Object(mut object)) => {
                        object.insert("version".into(), serde_json::json!(version));
                        serde_json::Value::Object(object)
                    }
                    _ => serde_json::json!({"type": msg, "version": version}),
                }
            } else {
                serde_json::json!({"type": msg, "version": version})
            };
            if sender.send(Message::Text(json.to_string().into())).await.is_err() { break; }
        }
    });
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = receiver.next().await {}
    });
    tokio::select! { _ = send_task => {}, _ = recv_task => {} }
}

struct ServerError {
    message: String,
    status: StatusCode,
}

impl ServerError {
    fn bad(message: impl Into<String>) -> Self {
        Self { message: message.into(), status: StatusCode::BAD_REQUEST }
    }
    fn internal(message: impl Into<String>) -> Self {
        Self { message: message.into(), status: StatusCode::INTERNAL_SERVER_ERROR }
    }
}

impl IntoResponse for ServerError {
    fn into_response(self) -> Response {
        (self.status, Json(serde_json::json!({"error": self.message}))).into_response()
    }
}

async fn watch_board_files(tx: broadcast::Sender<String>, board_name: Option<String>) {
    use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc;

    let board_dir = match barkcli_core::storage::board_dir::find_project_root() {
        Ok(dir) => dir, Err(_) => return,
    };
    let (watch_tx, watch_rx) = mpsc::channel::<Result<Event, notify::Error>>();
    let mut watcher: RecommendedWatcher = match Watcher::new(watch_tx, Config::default()) {
        Ok(w) => w, Err(_) => return,
    };
    // Watch both the project root (for .board files) and .board/ dir (for metadata)
    if let Err(e) = watcher.watch(&board_dir, RecursiveMode::NonRecursive) {
        eprintln!("Failed to watch board directory: {}", e); return;
    }
    let board_meta_dir = board_dir.join(".board");
    if board_meta_dir.exists() {
        let _ = watcher.watch(&board_meta_dir, RecursiveMode::Recursive);
    }
    for event in watch_rx {
        match event {
            Ok(Event { kind: EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_), paths, .. }) => {
                let mut should_reload = false;
                for path in &paths {
                    let ext = path.extension().and_then(|e| e.to_str());
                    // Board files
                    if ext == Some("board") {
                        if let Some(ref name) = board_name {
                            let expected = format!("{}.board", name);
                            if path.file_name().and_then(|n| n.to_str()) == Some(&expected) {
                                should_reload = true;
                            }
                        } else {
                            should_reload = true;
                        }
                    }
                    // Metadata files (specs, memory, tasks, etc.)
                    if let Some(path_str) = path.to_str() {
                        if path_str.contains(".board/") && (
                            path_str.ends_with(".json") ||
                            path_str.ends_with(".jsonl") ||
                            path_str.ends_with(".yaml")
                        ) {
                            should_reload = true;
                        }
                    }
                }
                if should_reload {
                    RELOAD_VERSION.fetch_add(1, Ordering::SeqCst);
                    let _ = tx.send("reload".to_string());
                }
            }
            Err(_) => break,
            _ => {}
        }
    }
}

/// Sleep-time compute (à la Letta): poll the evidence fingerprint every few
/// seconds; when it changes, reconcile every adopted board's context file.
/// Polling (not events) keeps this deterministic across platforms — the
/// broadcast bus only feeds the browser WebSocket, and FSEvents NonRecursive
/// delivery is unreliable for external CLI writes.
async fn context_reconciler_loop(board_name: Option<String>) {
    use tokio::time::{sleep, Duration};

    let poll = Duration::from_secs(5);

    // Reconcile once shortly after startup: heals a file left stale by work
    // done before the server booted (only for boards that already have one).
    sleep(Duration::from_secs(15)).await;
    reconcile_context_files(&board_name).await;
    let mut last = evidence_fingerprint();

    loop {
        sleep(poll).await;
        let fp = evidence_fingerprint();
        if fp == last {
            continue;
        }
        last = fp;
        // Small grace so multi-file saves (board + sidecar + memory) land in
        // one reconciliation pass.
        sleep(Duration::from_secs(2)).await;
        last = evidence_fingerprint();
        reconcile_context_files(&board_name).await;
    }
}

/// Fingerprint of all context-relevant evidence: every *.board at the
/// project root plus every .json/.jsonl/.yaml under .board/ — excluding
/// barkcli's own state and daemon files, which digest itself writes.
fn evidence_fingerprint() -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut h = DefaultHasher::new();
    let Ok(root) = barkcli_core::storage::board_dir::find_project_root() else {
        return 0;
    };

    if let Ok(rd) = std::fs::read_dir(&root) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("board") {
                stamp_file(&p, &mut h);
            }
        }
    }
    walk_evidence(&root.join(".board"), 0, &mut h);

    h.finish()
}

fn walk_evidence(dir: &std::path::Path, depth: u8, h: &mut std::collections::hash_map::DefaultHasher) {
    if depth > 4 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        // Own artifacts — digest writes these; including them would make the
        // reconciler chase its own tail.
        if name.starts_with("context-file.") || name.starts_with("server.") {
            continue;
        }
        if p.is_dir() {
            walk_evidence(&p, depth + 1, h);
        } else if matches!(
            p.extension().and_then(|x| x.to_str()),
            Some("json") | Some("jsonl") | Some("yaml")
        ) {
            stamp_file(&p, h);
        }
    }
}

fn stamp_file(path: &std::path::Path, h: &mut std::collections::hash_map::DefaultHasher) {
    use std::hash::Hash;
    if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(mtime) = meta.modified() {
            if let Ok(d) = mtime.duration_since(std::time::UNIX_EPOCH) {
                d.as_nanos().hash(h);
            }
        }
        meta.len().hash(h);
        path.to_string_lossy().hash(h);
    }
}

/// Refresh context files for the boards this server is serving. `if_exists`
/// means boards that never opted into the context file are left alone.
async fn reconcile_context_files(board_name: &Option<String>) {
    let boards: Vec<String> = match board_name {
        Some(name) => vec![name.clone()],
        None => barkcli_core::storage::board_file::list_board_files().unwrap_or_default(),
    };
    for name in boards {
        let opts = barkcli_core::context_file::DigestOpts {
            quiet: true,
            if_exists: true,
            ..Default::default()
        };
        if let Err(e) = barkcli_core::context_file::digest::run_digest_core(&name, &opts) {
            eprintln!("barkcli context digest (reconciler): {}", e);
        }
    }
}

// ── Management Layer Handlers ──
#[derive(Deserialize)]
struct TaskQuery {
    status: Option<String>,
    card_id: Option<String>,
    agent_id: Option<String>,
}

#[derive(serde::Serialize)]
struct TaskView {
    #[serde(flatten)]
    task: TaskRequest,
    /// True when the task still claims to be active but no agent is alive.
    stalled: bool,
    last_seen: Option<String>,
}

#[derive(serde::Serialize)]
struct TaskListResponse {
    tasks: Vec<TaskView>,
}

async fn list_tasks_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TaskQuery>,
) -> Result<Json<TaskListResponse>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let queue = if tasks_path.exists() {
        TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?
    } else {
        TaskQueue::new()
    };

    let mut tasks: Vec<TaskRequest> = queue.tasks;

    // Filter by status
    if let Some(status_str) = &query.status {
        if let Ok(status) = serde_json::from_str::<TaskStatus>(&format!("\"{}\"", status_str)) {
            tasks.retain(|t| t.status == status);
        }
    }

    // Filter by card_id
    if let Some(card_id) = &query.card_id {
        tasks.retain(|t| &t.card_id == card_id);
    }

    // Filter by agent_id
    if let Some(agent_id) = &query.agent_id {
        tasks.retain(|t| t.assigned_agent.as_deref() == Some(agent_id));
    }

    // Liveness is derived, never persisted: a crashed agent must not keep a
    // task looking "running" forever.
    let live = barkcli_core::agent::BoardLiveness::load(&board_name);
    let tasks = tasks
        .into_iter()
        .map(|task| {
            let stalled = live.task_stalled(&task);
            let last_seen = live.last_seen(&task.id).map(|t| t.to_rfc3339());
            TaskView {
                task,
                stalled,
                last_seen,
            }
        })
        .collect();

    Ok(Json(TaskListResponse { tasks }))
}

#[derive(Deserialize)]
struct CreateTaskRequest {
    card_id: String,
    title: String,
    description: Option<String>,
    acceptance_criteria: Option<Vec<String>>,
    priority: Option<String>,
}

async fn create_task_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTaskRequest>,
) -> Result<Json<TaskRequest>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks");

    std::fs::create_dir_all(&tasks_dir).map_err(|e| ServerError::internal(e.to_string()))?;

    let tasks_path = tasks_dir.join(format!("{}.json", board_name));

    let mut queue = if tasks_path.exists() {
        TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?
    } else {
        TaskQueue::new()
    };

    let task = barkcli_core::agent::queue::create_task(
        &req.card_id,
        &req.title,
        &req.description.unwrap_or_default(),
        req.acceptance_criteria.unwrap_or_default(),
        barkcli_core::agent::queue::populate_context_files(&req.card_id, &board_name),
        &req.priority.unwrap_or_else(|| "medium".to_string()),
    );

    queue.add(task.clone());

    queue.save(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    // Broadcast reload
    let _ = state.tx.send("reload".to_string());

    Ok(Json(task))
}

async fn get_task_handler(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> Result<Json<TaskRequest>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let queue = TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    queue
        .get(&task_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ServerError::bad("Task not found"))
}

#[derive(Deserialize)]
struct UpdateTaskRequest {
    status: Option<String>,
    assigned_agent: Option<String>,
}

async fn update_task_handler(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
    Json(req): Json<UpdateTaskRequest>,
) -> Result<Json<TaskRequest>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let mut queue = TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    if let Some(status_str) = &req.status {
        if let Ok(status) = serde_json::from_str::<TaskStatus>(&format!("\"{}\"", status_str)) {
            queue
                .update_status(&task_id, status)
                .map_err(|e| ServerError::bad(e.to_string()))?;
        }
    }

    if let Some(agent_id) = &req.assigned_agent {
        if let Some(task) = queue.get_mut(&task_id) {
            task.assigned_agent = Some(agent_id.clone());
        }
    }

    queue.save(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    queue
        .get(&task_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ServerError::bad("Task not found"))
}

async fn delete_task_handler(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let mut queue = TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    queue.tasks.retain(|t| t.id != task_id);

    queue.save(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    Ok(Json(serde_json::json!({"deleted": true})))
}

async fn claim_task_handler(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<TaskRequest>, ServerError> {
    let agent_id = query
        .get("agent_id")
        .ok_or_else(|| ServerError::bad("agent_id query parameter required"))?;
    let session_id = query.get("session_id").map(|s| s.as_str());
    let lease_minutes: i64 = query
        .get("lease_minutes")
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);

    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let mut queue = TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    queue
        .claim(&task_id, agent_id, session_id, lease_minutes)
        .map_err(|e| ServerError::bad(e.to_string()))?;

    // Update agent state
    let _ = agent_start_task(agent_id, &task_id);

    queue.save(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    queue
        .get(&task_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ServerError::bad("Task not found"))
}

#[derive(Deserialize)]
struct CompleteTaskRequest {
    files_changed: Option<Vec<String>>,
    commit_sha: Option<String>,
    summary: Option<String>,
    tests_passed: Option<bool>,
}

async fn complete_task_handler(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
    Json(req): Json<CompleteTaskRequest>,
) -> Result<Json<TaskRequest>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let mut queue = TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    queue
        .complete(&task_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;

    // Update agent state
    if let Some(task) = queue.get(&task_id) {
        if let Some(ref agent_id) = task.assigned_agent {
            let _ = agent_complete_task(agent_id, &task_id, 0);
        }
    }

    // Store result details
    let result = barkcli_core::agent::queue::TaskResult {
        task_id: task_id.clone(),
        status: barkcli_core::agent::queue::CompletionStatus::Success,
        files_changed: req.files_changed.unwrap_or_default(),
        commit_sha: req.commit_sha,
        summary: req.summary.unwrap_or_else(|| format!("Completed task")),
        tests_passed: req.tests_passed,
        duration_ms: 0,
        error_message: None,
        artifacts: Vec::new(),
    };

    let results_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks");
    let results_path = results_dir.join(format!("{}_results.json", board_name));

    let mut results = barkcli_core::agent::queue::TaskResults::load(&results_path)
        .unwrap_or_default();
    results.add(result);
    results.save(&results_path).map_err(|e| ServerError::internal(e.to_string()))?;

    queue.save(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    queue
        .get(&task_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ServerError::bad("Task not found"))
}

async fn fail_task_handler(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> Result<Json<TaskRequest>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let mut queue = TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    queue
        .fail(&task_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;

    // Update agent state
    if let Some(task) = queue.get(&task_id) {
        if let Some(ref agent_id) = task.assigned_agent {
            let _ = agent_fail_task(agent_id, &task_id);
        }
    }

    queue.save(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    queue
        .get(&task_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ServerError::bad("Task not found"))
}

// ── Agent State Helpers ──

/// Load or create the agent registry.
fn load_registry() -> Result<AgentRegistry, ServerError> {
    let agents_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("agents")
        .join("registry.json");
    if agents_path.exists() {
        AgentRegistry::load(&agents_path).map_err(|e| ServerError::internal(e.to_string()))
    } else {
        Ok(AgentRegistry::new())
    }
}

/// Save the agent registry to disk.
fn save_registry(registry: &AgentRegistry) -> Result<(), ServerError> {
    let agents_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("agents");
    std::fs::create_dir_all(&agents_dir).map_err(|e| ServerError::internal(e.to_string()))?;
    let registry_path = agents_dir.join("registry.json");
    registry
        .save(&registry_path)
        .map_err(|e| ServerError::internal(e.to_string()))
}

/// Update agent state when a task is claimed.
fn agent_start_task(agent_id: &str, task_id: &str) -> Result<(), ServerError> {
    let mut registry = load_registry()?;
    if let Some(agent) = registry.get_mut(agent_id) {
        agent.start_task(task_id);
        save_registry(&registry)?;
    }
    Ok(())
}

/// Update agent state when a task is completed.
fn agent_complete_task(agent_id: &str, task_id: &str, duration_ms: u64) -> Result<(), ServerError> {
    let mut registry = load_registry()?;
    if let Some(agent) = registry.get_mut(agent_id) {
        agent.complete_task(task_id, duration_ms);
        save_registry(&registry)?;
    }
    Ok(())
}

/// Update agent state when a task fails.
fn agent_fail_task(agent_id: &str, task_id: &str) -> Result<(), ServerError> {
    let mut registry = load_registry()?;
    if let Some(agent) = registry.get_mut(agent_id) {
        agent.fail_task(task_id);
        save_registry(&registry)?;
    }
    Ok(())
}

// ── Agent Handlers ──

#[derive(serde::Serialize)]
struct AgentListResponse {
    agents: Vec<AgentIdentity>,
}

async fn list_agents_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AgentListResponse>, ServerError> {
    let agents_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("agents");

    let registry = if agents_path.exists() {
        let registry_path = agents_path.join("registry.json");
        if registry_path.exists() {
            AgentRegistry::load(&registry_path).map_err(|e| ServerError::internal(e.to_string()))?
        } else {
            AgentRegistry::new()
        }
    } else {
        AgentRegistry::new()
    };

    Ok(Json(AgentListResponse {
        agents: registry.agents,
    }))
}

#[derive(Deserialize)]
struct RegisterAgentRequest {
    id: String,
    name: String,
    role: String,
}

async fn register_agent_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterAgentRequest>,
) -> Result<Json<AgentIdentity>, ServerError> {
    let agents_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("agents");

    std::fs::create_dir_all(&agents_dir).map_err(|e| ServerError::internal(e.to_string()))?;

    let registry_path = agents_dir.join("registry.json");

    let mut registry = if registry_path.exists() {
        AgentRegistry::load(&registry_path).map_err(|e| ServerError::internal(e.to_string()))?
    } else {
        AgentRegistry::new()
    };

    let role = AgentRole::from_str(&req.role)
        .ok_or_else(|| ServerError::bad(format!("Invalid role: {}", req.role)))?;

    let agent = AgentIdentity::new(&req.id, &req.name, role);
    registry.register(agent.clone());

    registry
        .save(&registry_path)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    Ok(Json(agent))
}

async fn get_agent_handler(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
) -> Result<Json<AgentIdentity>, ServerError> {
    let agents_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("agents")
        .join("registry.json");

    let registry = AgentRegistry::load(&agents_path).map_err(|e| ServerError::internal(e.to_string()))?;

    registry
        .get(&agent_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ServerError::bad("Agent not found"))
}

async fn delete_agent_handler(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let agents_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("agents");

    let registry_path = agents_dir.join("registry.json");

    let mut registry = AgentRegistry::load(&registry_path).map_err(|e| ServerError::internal(e.to_string()))?;

    registry.remove(&agent_id);

    registry
        .save(&registry_path)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    Ok(Json(serde_json::json!({"deleted": true})))
}

#[derive(serde::Serialize)]
struct AgentStatusResponse {
    agent: AgentIdentity,
    active_tasks: usize,
    completed_tasks: usize,
    failed_tasks: usize,
    success_rate: f32,
}

async fn agent_status_handler(
    State(state): State<Arc<AppState>>,
    Path(agent_id): Path<String>,
) -> Result<Json<AgentStatusResponse>, ServerError> {
    let agents_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("agents")
        .join("registry.json");

    let registry = AgentRegistry::load(&agents_path).map_err(|e| ServerError::internal(e.to_string()))?;

    let agent = registry
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| ServerError::bad("Agent not found"))?;

    Ok(Json(AgentStatusResponse {
        active_tasks: agent.active_tasks.len(),
        completed_tasks: agent.completed_tasks.len(),
        failed_tasks: agent.failed_tasks.len(),
        success_rate: agent.success_rate(),
        agent,
    }))
}

// ── Orchestration Handlers ──

#[derive(serde::Serialize)]
struct OrchestrateNextResponse {
    task: Option<TaskRequest>,
    insights: Vec<String>,
}

async fn orchestrate_next_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<OrchestrateNextResponse>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let queue = if tasks_path.exists() {
        TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?
    } else {
        TaskQueue::new()
    };

    let task = queue.next_pending().cloned();
    let mut insights = Vec::new();

    if task.is_none() {
        insights.push("No pending tasks available".to_string());
    }

    Ok(Json(OrchestrateNextResponse { task, insights }))
}

#[derive(serde::Serialize)]
struct OrchestrateCycleResponse {
    cycle_number: usize,
    tasks_created: usize,
    tasks_dispatched: usize,
    tasks_completed: usize,
    tasks_failed: usize,
    insights: Vec<String>,
}

async fn orchestrate_cycle_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<OrchestrateCycleResponse>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;

    // Load board
    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    // Create orchestration engine
    let mut engine = barkcli_core::agent::orchestrate::OrchestrationEngine::new(
        &board_name,
        barkcli_core::agent::roles::AgentRole::ScrumMaster,
        board,
    )
    .map_err(|e| ServerError::internal(e.to_string()))?;

    // Run cycle
    let result = engine
        .run_cycle()
        .map_err(|e| ServerError::internal(e.to_string()))?;

    Ok(Json(OrchestrateCycleResponse {
        cycle_number: result.cycle_number,
        tasks_created: result.tasks_created,
        tasks_dispatched: result.tasks_dispatched,
        tasks_completed: result.tasks_completed,
        tasks_failed: result.tasks_failed,
        insights: result.insights,
    }))
}

#[derive(serde::Serialize)]
struct OrchestrateStatusResponse {
    status: String,
    cycle_count: usize,
    tasks_dispatched: usize,
    tasks_completed: usize,
    tasks_failed: usize,
}

async fn orchestrate_status_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<OrchestrateStatusResponse>, ServerError> {
    let board_name = resolve_board_name(&state, None)?;

    let status =
        barkcli_core::agent::orchestrate::OrchestrationEngine::load_state(&board_name)
            .map_err(|e| ServerError::internal(e.to_string()))?;

    match status {
        Some(state) => Ok(Json(OrchestrateStatusResponse {
            status: state.status.display_name().to_string(),
            cycle_count: state.cycle_count,
            tasks_dispatched: state.tasks_dispatched,
            tasks_completed: state.tasks_completed,
            tasks_failed: state.tasks_failed,
        })),
        None => Ok(Json(OrchestrateStatusResponse {
            status: "Not started".to_string(),
            cycle_count: 0,
            tasks_dispatched: 0,
            tasks_completed: 0,
            tasks_failed: 0,
        })),
    }
}

// ── Memory Handlers ──

#[derive(Deserialize)]
struct MemoryQuery {
    name: Option<String>,
    q: Option<String>,
    tier: Option<String>,
    limit: Option<usize>,
}

#[derive(serde::Serialize)]
struct MemoryListResponse {
    memories: Vec<MemoryEntry>,
    total: usize,
}

async fn list_memory_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MemoryQuery>,
) -> Result<Json<MemoryListResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let store = MemoryStore::open(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let results = if let Some(ref q) = query.q {
        let top = query.limit.unwrap_or(50);
        store.search(q, top).into_iter().cloned().collect()
    } else if let Some(ref tier_str) = query.tier {
        let tier = match tier_str.as_str() {
            "working" => MemoryTier::Working,
            "short_term" | "short-term" => MemoryTier::ShortTerm,
            "long_term" | "long-term" => MemoryTier::LongTerm,
            "external" => MemoryTier::External,
            _ => return Err(ServerError::bad(format!("invalid tier: {}", tier_str))),
        };
        let limit = query.limit.unwrap_or(100);
        store.by_tier(tier).into_iter().take(limit).cloned().collect()
    } else {
        let limit = query.limit.unwrap_or(50);
        store.recent(limit).into_iter().cloned().collect()
    };

    let total = store.len();
    Ok(Json(MemoryListResponse { memories: results, total }))
}

#[derive(Deserialize)]
struct AddMemoryRequest {
    content: String,
    tier: Option<String>,
    tags: Option<Vec<String>>,
    source: Option<String>,
}

async fn add_memory_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
    Json(req): Json<AddMemoryRequest>,
) -> Result<Json<MemoryEntry>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut store = MemoryStore::open(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let tier = match req.tier.as_deref().unwrap_or("short_term") {
        "working" => MemoryTier::Working,
        "short_term" | "short-term" => MemoryTier::ShortTerm,
        "long_term" | "long-term" => MemoryTier::LongTerm,
        "external" => MemoryTier::External,
        _ => return Err(ServerError::bad("invalid tier")),
    };

    let mut entry = MemoryEntry::new(&req.content, tier);
    if let Some(tags) = req.tags {
        entry.tags = tags;
    }
    entry.source = req.source;

    store.add(entry.clone());
    store.save().map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(entry))
}

async fn delete_memory_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut store = MemoryStore::open(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let before = store.len();
    store.memory.entries.retain(|e| e.id != id);
    let removed = store.len() < before;

    store.save().map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());

    Ok(Json(serde_json::json!({ "deleted": removed })))
}

async fn ingest_memory_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let report = barkcli_core::memory::ingest::ingest(&board_name, true)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "sessions_ingested": report.sessions_ingested,
        "memories_added": report.memories_added,
        "consolidated": report.consolidated,
    })))
}

async fn consolidate_memory_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut store = MemoryStore::open(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    let report = store.consolidate();
    store.save().map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "promoted": report.promoted,
        "compressed": report.compressed,
        "evicted": report.evicted,
    })))
}

async fn brain_graph_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let graph = barkcli_core::brain::graph::BrainGraph::load(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "nodes": graph.nodes, "edges": graph.edges })))
}

async fn brain_node_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let graph = barkcli_core::brain::graph::BrainGraph::load(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let node = graph
        .node(&id)
        .ok_or_else(|| ServerError::bad(format!("node not found: {}", id)))?;
    let neighbors = graph.neighbors(&id);
    Ok(Json(serde_json::json!({ "node": node, "neighbors": neighbors })))
}

#[derive(serde::Serialize)]
struct MemoryStatsResponse {
    total: usize,
    by_tier: std::collections::HashMap<String, usize>,
    facts: usize,
}

async fn memory_stats_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<MemoryStatsResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let store = MemoryStore::open(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let mut by_tier = std::collections::HashMap::new();
    for tier in &[MemoryTier::Working, MemoryTier::ShortTerm, MemoryTier::LongTerm, MemoryTier::External] {
        let count = store.by_tier(*tier).len();
        by_tier.insert(tier.display_name().to_string(), count);
    }

    Ok(Json(MemoryStatsResponse {
        total: store.len(),
        by_tier,
        facts: store.memory.project_facts.len(),
    }))
}

#[derive(Deserialize)]
struct AddFactRequest {
    fact: String,
    category: Option<String>,
    confidence: Option<f32>,
    sources: Option<Vec<String>>,
}

async fn add_fact_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
    Json(req): Json<AddFactRequest>,
) -> Result<Json<ProjectFact>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut store = MemoryStore::open(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let fact = ProjectFact {
        fact: req.fact,
        category: req.category.unwrap_or_else(|| "convention".into()),
        confidence: req.confidence.unwrap_or(0.8),
        sources: req.sources.unwrap_or_default(),
        created_at: chrono::Utc::now(),
    };

    store.add_fact(fact.clone());
    store.save().map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(fact))
}

#[derive(Deserialize)]
struct FactsQuery {
    name: Option<String>,
    category: Option<String>,
}

#[derive(serde::Serialize)]
struct FactsListResponse {
    facts: Vec<ProjectFact>,
}

async fn list_facts_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FactsQuery>,
) -> Result<Json<FactsListResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let store = MemoryStore::open(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let facts = if let Some(ref cat) = query.category {
        store.facts_by_category(cat).into_iter().cloned().collect()
    } else {
        store.memory.project_facts.clone()
    };

    Ok(Json(FactsListResponse { facts }))
}

// ── Specs Handlers ──

#[derive(Deserialize)]
struct SpecsQuery {
    name: Option<String>,
}

#[derive(serde::Serialize)]
struct SpecsListResponse {
    specs: Vec<Spec>,
}

async fn list_specs_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SpecsQuery>,
) -> Result<Json<SpecsListResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let specs = barkcli_core::storage::specs::read_specs(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(SpecsListResponse { specs }))
}

#[derive(Deserialize)]
struct CreateSpecRequest {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    tags: Option<Vec<String>>,
}

async fn create_spec_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SpecsQuery>,
    Json(req): Json<CreateSpecRequest>,
) -> Result<Json<Spec>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let id = barkcli_core::util::slug::to_slug(&req.title);
    let mut spec = Spec::new(&id, &req.title);
    if let Some(desc) = req.description {
        spec.description = Some(desc);
    }
    if let Some(p) = req.priority {
        spec.priority = p;
    }
    if let Some(tags) = req.tags {
        spec.tags = tags;
    }

    barkcli_core::storage::specs::upsert_spec(&board_name, spec.clone())
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(spec))
}

async fn get_spec_handler(
    State(state): State<Arc<AppState>>,
    Path(spec_id): Path<String>,
    Query(query): Query<SpecsQuery>,
) -> Result<Json<Spec>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    barkcli_core::storage::specs::get_spec(&board_name, &spec_id)
        .map_err(|e| ServerError::internal(e.to_string()))?
        .map(Json)
        .ok_or_else(|| ServerError::bad(format!("spec '{}' not found", spec_id)))
}

#[derive(Deserialize)]
struct UpdateSpecRequest {
    status: Option<String>,
    priority: Option<String>,
    description: Option<String>,
    title: Option<String>,
}

async fn update_spec_handler(
    State(state): State<Arc<AppState>>,
    Path(spec_id): Path<String>,
    Query(query): Query<SpecsQuery>,
    Json(req): Json<UpdateSpecRequest>,
) -> Result<Json<Spec>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut spec = barkcli_core::storage::specs::get_spec(&board_name, &spec_id)
        .map_err(|e| ServerError::internal(e.to_string()))?
        .ok_or_else(|| ServerError::bad(format!("spec '{}' not found", spec_id)))?;

    if let Some(s) = req.status {
        spec.status = SpecStatus::parse(&s).ok_or_else(|| ServerError::bad(format!("invalid status: {}", s)))?;
    }
    if let Some(p) = req.priority {
        spec.priority = p;
    }
    if let Some(d) = req.description {
        spec.description = Some(d);
    }
    if let Some(t) = req.title {
        spec.title = t;
    }
    spec.updated_at = chrono::Utc::now();

    barkcli_core::storage::specs::upsert_spec(&board_name, spec.clone())
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(spec))
}

async fn delete_spec_handler(
    State(state): State<Arc<AppState>>,
    Path(spec_id): Path<String>,
    Query(query): Query<SpecsQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let removed = barkcli_core::storage::specs::remove_spec(&board_name, &spec_id)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "deleted": removed })))
}

#[derive(Deserialize)]
struct AddRequirementRequest {
    title: String,
    description: Option<String>,
    acceptance_criteria: Option<Vec<String>>,
}

async fn add_requirement_handler(
    State(state): State<Arc<AppState>>,
    Path(spec_id): Path<String>,
    Query(query): Query<SpecsQuery>,
    Json(req): Json<AddRequirementRequest>,
) -> Result<Json<Requirement>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut spec = barkcli_core::storage::specs::get_spec(&board_name, &spec_id)
        .map_err(|e| ServerError::internal(e.to_string()))?
        .ok_or_else(|| ServerError::bad(format!("spec '{}' not found", spec_id)))?;

    let req_id = format!("req-{}", barkcli_core::util::slug::to_slug(&req.title));
    let mut requirement = Requirement::new(&req_id, &req.title);
    if let Some(desc) = req.description {
        requirement.description = Some(desc);
    }
    if let Some(ac) = req.acceptance_criteria {
        requirement.acceptance_criteria = ac;
    }

    if !spec.add_requirement(requirement.clone()) {
        return Err(ServerError::bad(format!("requirement '{}' already exists", req_id)));
    }

    barkcli_core::storage::specs::upsert_spec(&board_name, spec)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(requirement))
}

#[derive(Deserialize)]
struct UpdateRequirementRequest {
    status: Option<String>,
    title: Option<String>,
    description: Option<String>,
}

async fn update_requirement_handler(
    State(state): State<Arc<AppState>>,
    Path((spec_id, req_id)): Path<(String, String)>,
    Query(query): Query<SpecsQuery>,
    Json(req): Json<UpdateRequirementRequest>,
) -> Result<Json<Requirement>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut spec = barkcli_core::storage::specs::get_spec(&board_name, &spec_id)
        .map_err(|e| ServerError::internal(e.to_string()))?
        .ok_or_else(|| ServerError::bad(format!("spec '{}' not found", spec_id)))?;

    let requirement = spec
        .get_requirement_mut(&req_id)
        .ok_or_else(|| ServerError::bad(format!("requirement '{}' not found", req_id)))?;

    if let Some(s) = req.status {
        requirement.status = RequirementStatus::parse(&s)
            .ok_or_else(|| ServerError::bad(format!("invalid status: {}", s)))?;
    }
    if let Some(t) = req.title {
        requirement.title = t;
    }
    if let Some(d) = req.description {
        requirement.description = Some(d);
    }
    requirement.updated_at = chrono::Utc::now();

    let result = requirement.clone();

    barkcli_core::storage::specs::upsert_spec(&board_name, spec)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(result))
}

#[derive(serde::Serialize)]
struct TraceResponse {
    spec_id: String,
    title: String,
    requirements: Vec<TraceRequirement>,
}

#[derive(serde::Serialize)]
struct TraceRequirement {
    id: String,
    title: String,
    status: String,
    linked_code: Vec<String>,
    linked_tests: Vec<String>,
    linked_tasks: Vec<String>,
    stale: bool,
    stale_reason: Option<String>,
}

async fn trace_spec_handler(
    State(state): State<Arc<AppState>>,
    Path(spec_id): Path<String>,
    Query(query): Query<SpecsQuery>,
) -> Result<Json<TraceResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let spec = barkcli_core::storage::specs::get_spec(&board_name, &spec_id)
        .map_err(|e| ServerError::internal(e.to_string()))?
        .ok_or_else(|| ServerError::bad(format!("spec '{}' not found", spec_id)))?;

    let requirements = spec.requirements.iter().map(|r| TraceRequirement {
        id: r.id.clone(),
        title: r.title.clone(),
        status: format!("{:?}", r.status),
        linked_code: r.linked_code.clone(),
        linked_tests: r.linked_tests.clone(),
        linked_tasks: r.linked_tasks.clone(),
        stale: r.stale,
        stale_reason: r.stale_reason.clone(),
    }).collect();

    Ok(Json(TraceResponse {
        spec_id: spec.id,
        title: spec.title,
        requirements,
    }))
}

#[derive(serde::Serialize)]
struct CoverageResponse {
    total_requirements: usize,
    implemented: usize,
    verified: usize,
    stale: usize,
    coverage_percent: f64,
}

async fn specs_coverage_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SpecsQuery>,
) -> Result<Json<CoverageResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let cov = barkcli_core::storage::specs::calculate_coverage(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    Ok(Json(CoverageResponse {
        total_requirements: cov.total_requirements,
        implemented: cov.implemented,
        verified: cov.verified,
        stale: cov.stale,
        coverage_percent: cov.coverage_percent,
    }))
}

#[derive(Deserialize)]
struct ScanStaleRequest {
    name: Option<String>,
    modified_files: Vec<String>,
}

async fn scan_stale_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ScanStaleRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.name)?;
    let stale_updates = barkcli_core::storage::specs::mark_stale_requirements(&board_name, &req.modified_files)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "stale_count": stale_updates.len(),
        "updates": stale_updates.into_iter().map(|(s, r, reason)| {
            serde_json::json!({ "spec_id": s, "req_id": r, "reason": reason })
        }).collect::<Vec<_>>(),
    })))
}

// ── Checkpoint Handlers ──

#[derive(Deserialize)]
struct CheckpointQuery {
    name: Option<String>,
}

#[derive(serde::Serialize)]
struct CheckpointEntry {
    kind: String,
    id: String,
    saved_at: String,
}

#[derive(serde::Serialize)]
struct CheckpointsListResponse {
    checkpoints: Vec<CheckpointEntry>,
}

async fn list_checkpoints_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CheckpointQuery>,
) -> Result<Json<CheckpointsListResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let snap_dir = board_dir.join("snapshots");

    let mut checkpoints = Vec::new();

    if snap_dir.is_dir() {
        // Manual checkpoints
        if let Ok(entries) = std::fs::read_dir(&snap_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("yaml") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        let saved_at = std::fs::metadata(&path)
                            .and_then(|m| m.modified())
                            .ok()
                            .map(|t| {
                                let dt: chrono::DateTime<chrono::Utc> = t.into();
                                dt.format("%Y-%m-%d %H:%M").to_string()
                            })
                            .unwrap_or_else(|| "-".into());
                        checkpoints.push(CheckpointEntry {
                            kind: "manual".into(),
                            id: stem.to_string(),
                            saved_at,
                        });
                    }
                }
            }
        }

        // Auto checkpoints
        let auto_dir = snap_dir.join("auto");
        if auto_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&auto_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().and_then(|s| s.to_str()) == Some("yaml") {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            let saved_at = std::fs::metadata(&path)
                                .and_then(|m| m.modified())
                                .ok()
                                .map(|t| {
                                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                                    dt.format("%Y-%m-%d %H:%M").to_string()
                                })
                                .unwrap_or_else(|| "-".into());
                            checkpoints.push(CheckpointEntry {
                                kind: "auto".into(),
                                id: stem.to_string(),
                                saved_at,
                            });
                        }
                    }
                }
            }
        }
    }

    checkpoints.sort_by(|a, b| a.saved_at.cmp(&b.saved_at));
    Ok(Json(CheckpointsListResponse { checkpoints }))
}

#[derive(Deserialize)]
struct SaveCheckpointRequest {
    label: Option<String>,
}

async fn save_checkpoint_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CheckpointQuery>,
    Json(req): Json<SaveCheckpointRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let label = req.label.unwrap_or_else(|| {
        chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
    });

    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let snap_dir = board_dir.join("snapshots");
    std::fs::create_dir_all(&snap_dir).map_err(|e| ServerError::internal(e.to_string()))?;

    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    let yaml = serde_yaml::to_string(&board).map_err(|e| ServerError::internal(e.to_string()))?;

    let clean = label.replace(['/', '\\', ':'], "-");
    let path = snap_dir.join(format!("{}.yaml", clean));
    std::fs::write(&path, &yaml).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "ok": true, "label": label })))
}

async fn restore_checkpoint_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<CheckpointQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let snap_dir = board_dir.join("snapshots");
    let clean = id.replace(['/', '\\', ':'], "-");

    // Search in manual and auto dirs
    let mut yaml_content = None;
    for candidate in [
        snap_dir.join(format!("{}.yaml", clean)),
        snap_dir.join("auto").join(format!("{}.yaml", clean)),
    ] {
        if candidate.exists() {
            yaml_content = Some(std::fs::read_to_string(&candidate)
                .map_err(|e| ServerError::internal(e.to_string()))?);
            break;
        }
    }

    let yaml = yaml_content.ok_or_else(|| ServerError::bad(format!("checkpoint '{}' not found", id)))?;
    let board: Board = serde_yaml::from_str(&yaml)
        .map_err(|e| ServerError::internal(format!("invalid checkpoint YAML: {}", e)))?;

    // Save undo state before restoring
    let _ = barkcli_core::commands::undo::save_undo_state(&board_name, "checkpoint-restore", None);

    board_file::write_board(&board_name, &board)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "ok": true, "restored": id })))
}

// ── Undo/Diff/Blame Handlers ──

async fn undo_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let undo_dir = board_dir.join("undo");
    let path = undo_dir.join(format!("{}.jsonl", board_name));

    if !path.exists() {
        return Ok(Json(serde_json::json!({ "ok": false, "message": "nothing to undo" })));
    }

    let content = std::fs::read_to_string(&path).map_err(|e| ServerError::internal(e.to_string()))?;
    let entries: Vec<barkcli_core::commands::undo::UndoEntry> = content
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();

    if entries.is_empty() {
        return Ok(Json(serde_json::json!({ "ok": false, "message": "nothing to undo" })));
    }

    let idx = entries.len() - 1;
    let board: Board = serde_yaml::from_str(&entries[idx].yaml)
        .map_err(|e| ServerError::internal(format!("invalid undo YAML: {}", e)))?;

    board_file::write_board(&board_name, &board)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    // Remove the last entry
    let new_entries: Vec<&barkcli_core::commands::undo::UndoEntry> = entries[..idx].iter().collect();
    let new_content: String = new_entries
        .iter()
        .map(|e| format!("{}\n", serde_json::to_string(e).unwrap_or_default()))
        .collect();
    std::fs::write(&path, new_content).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "undid": entries[idx].op,
        "card_id": entries[idx].card_id,
    })))
}

#[derive(serde::Serialize)]
struct DiffResponse {
    added: Vec<DiffCard>,
    removed: Vec<DiffCard>,
    moved: Vec<DiffMoved>,
}

#[derive(serde::Serialize)]
struct DiffCard {
    id: String,
    title: String,
    column: String,
}

#[derive(serde::Serialize)]
struct DiffMoved {
    id: String,
    title: String,
    from: String,
    to: String,
}

async fn diff_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<DiffResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let undo_dir = board_dir.join("undo");
    let path = undo_dir.join(format!("{}.jsonl", board_name));

    let current = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    if !path.exists() {
        return Ok(Json(DiffResponse { added: vec![], removed: vec![], moved: vec![] }));
    }

    let content = std::fs::read_to_string(&path).map_err(|e| ServerError::internal(e.to_string()))?;
    let entries: Vec<barkcli_core::commands::undo::UndoEntry> = content
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();

    if let Some(last) = entries.last() {
        let prev: Board = serde_yaml::from_str(&last.yaml)
            .map_err(|e| ServerError::internal(format!("invalid undo YAML: {}", e)))?;

        let added: Vec<DiffCard> = current.cards.iter()
            .filter(|c| !prev.cards.iter().any(|p| p.id == c.id))
            .map(|c| DiffCard { id: c.id.clone(), title: c.title.clone(), column: c.column.clone() })
            .collect();

        let removed: Vec<DiffCard> = prev.cards.iter()
            .filter(|p| !current.cards.iter().any(|c| c.id == p.id))
            .map(|c| DiffCard { id: c.id.clone(), title: c.title.clone(), column: c.column.clone() })
            .collect();

        let moved: Vec<DiffMoved> = current.cards.iter()
            .filter(|c| prev.cards.iter().any(|p| p.id == c.id && p.column != c.column))
            .filter_map(|c| {
                prev.cards.iter().find(|p| p.id == c.id).map(|p| DiffMoved {
                    id: c.id.clone(),
                    title: c.title.clone(),
                    from: p.column.clone(),
                    to: c.column.clone(),
                })
            })
            .collect();

        Ok(Json(DiffResponse { added, removed, moved }))
    } else {
        Ok(Json(DiffResponse { added: vec![], removed: vec![], moved: vec![] }))
    }
}

#[derive(serde::Serialize)]
struct BlameEntry {
    at: String,
    op: String,
}

#[derive(serde::Serialize)]
struct BlameResponse {
    card_id: String,
    entries: Vec<BlameEntry>,
}

async fn blame_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<BlameResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let undo_dir = board_dir.join("undo");
    let path = undo_dir.join(format!("{}.jsonl", board_name));

    if !path.exists() {
        return Ok(Json(BlameResponse { card_id, entries: vec![] }));
    }

    let content = std::fs::read_to_string(&path).map_err(|e| ServerError::internal(e.to_string()))?;
    let entries: Vec<BlameEntry> = content
        .lines()
        .filter_map(|l| serde_json::from_str::<barkcli_core::commands::undo::UndoEntry>(l).ok())
        .filter(|e| e.card_id.as_deref() == Some(card_id.as_str()))
        .map(|e| BlameEntry { at: e.at, op: e.op })
        .collect();

    Ok(Json(BlameResponse { card_id, entries }))
}

#[derive(Deserialize)]
struct SnapshotRequest {
    name: Option<String>,
    label: String,
}

async fn snapshot_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SnapshotRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.name)?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let snap_dir = board_dir.join("snapshots");
    std::fs::create_dir_all(&snap_dir).map_err(|e| ServerError::internal(e.to_string()))?;

    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    let yaml = serde_yaml::to_string(&board).map_err(|e| ServerError::internal(e.to_string()))?;

    let clean = req.label.replace(['/', '\\', ':'], "-");
    let path = snap_dir.join(format!("{}.yaml", clean));
    std::fs::write(&path, &yaml).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "ok": true, "label": req.label })))
}

// ── Import/Export Handlers ──

#[derive(Deserialize)]
struct ExportQuery {
    name: Option<String>,
    format: Option<String>,
}

async fn export_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
) -> Result<Response, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let format = query.format.unwrap_or_else(|| "yaml".into());
    let (content, content_type) = match format.as_str() {
        "json" => {
            let json = serde_json::to_string_pretty(&board)
                .map_err(|e| ServerError::internal(e.to_string()))?;
            (json, "application/json".to_string())
        }
        _ => {
            let yaml = serde_yaml::to_string(&board)
                .map_err(|e| ServerError::internal(e.to_string()))?;
            (yaml, "text/yaml".to_string())
        }
    };

    let filename = format!("{}.{}", board_name, format);
    let ct = header::HeaderValue::from_str(&content_type).unwrap();
    let cd = header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename)).unwrap();
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, ct), (header::CONTENT_DISPOSITION, cd)],
        content,
    ).into_response())
}

#[derive(Deserialize)]
struct ImportRequest {
    yaml: Option<String>,
    json: Option<String>,
    name: Option<String>,
}

async fn import_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ImportRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let is_json = req.json.is_some();
    let content = req.yaml.or(req.json)
        .ok_or_else(|| ServerError::bad("either 'yaml' or 'json' field required"))?;

    let board: Board = if is_json {
        serde_json::from_str(&content)
            .map_err(|e| ServerError::bad(format!("invalid JSON: {}", e)))?
    } else {
        serde_yaml::from_str(&content)
            .map_err(|e| ServerError::bad(format!("invalid YAML: {}", e)))?
    };

    if board.columns.is_empty() {
        return Err(ServerError::bad("board must have at least one column"));
    }

    let board_name = resolve_board_name(&state, req.name)?;
    board_file::write_board(&board_name, &board)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "ok": true, "name": board_name, "cards": board.cards.len() })))
}

// ── Validate/Doctor Handlers ──

#[derive(serde::Serialize)]
struct ValidateResponse {
    boards: Vec<ValidateBoardResult>,
    all_valid: bool,
}

#[derive(serde::Serialize)]
struct ValidateBoardResult {
    name: String,
    valid: bool,
    errors: Vec<String>,
}

async fn validate_handler() -> Result<Json<ValidateResponse>, ServerError> {
    let boards = list_board_files().map_err(|e| ServerError::internal(e.to_string()))?;
    let mut results = Vec::new();
    let mut all_valid = true;

    for name in &boards {
        let errors = barkcli_core::commands::validate::validate_board(name);
        if !errors.is_empty() {
            all_valid = false;
        }
        results.push(ValidateBoardResult {
            name: name.clone(),
            valid: errors.is_empty(),
            errors,
        });
    }

    Ok(Json(ValidateResponse { boards: results, all_valid }))
}

#[derive(serde::Serialize)]
struct DoctorResponse {
    boards: Vec<DoctorBoardResult>,
    fixed: usize,
}

#[derive(serde::Serialize)]
struct DoctorBoardResult {
    name: String,
    errors_before: usize,
    errors_after: usize,
    fixed: Vec<String>,
}

async fn doctor_handler() -> Result<Json<DoctorResponse>, ServerError> {
    let boards = list_board_files().map_err(|e| ServerError::internal(e.to_string()))?;
    let mut results = Vec::new();
    let mut total_fixed = 0;

    for name in &boards {
        let errors_before = barkcli_core::commands::validate::validate_board(name);
        let mut fixed = Vec::new();

        if !errors_before.is_empty() {
            // Try to auto-fix
            let path = format!("{}.board", name);
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(mut value) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
                    let mapping = value.as_mapping_mut();

                    // Fix missing title
                    if let Some(m) = mapping {
                        if !m.contains_key("title") {
                            let title = name.replace(['-', '_'], " ");
                            m.insert(
                                serde_yaml::Value::String("title".into()),
                                serde_yaml::Value::String(title),
                            );
                            fixed.push("added missing 'title'".into());
                        }

                        // Fix empty columns
                        if let Some(cols) = m.get("columns").and_then(|c| c.as_sequence()) {
                            if cols.is_empty() {
                                if let Some(cols_mut) = m.get_mut("columns").and_then(|c| c.as_sequence_mut()) {
                                    cols_mut.push(serde_yaml::Value::Mapping(serde_yaml::Mapping::from_iter([
                                        (serde_yaml::Value::String("id".into()), serde_yaml::Value::String("todo".into())),
                                        (serde_yaml::Value::String("name".into()), serde_yaml::Value::String("To Do".into())),
                                    ])));
                                    fixed.push("added default 'todo' column".into());
                                }
                            }
                        }
                    }

                    if !fixed.is_empty() {
                        let new_yaml = serde_yaml::to_string(&value)
                            .map_err(|e| ServerError::internal(e.to_string()))?;
                        std::fs::write(&path, &new_yaml)
                            .map_err(|e| ServerError::internal(e.to_string()))?;
                        total_fixed += fixed.len();
                    }
                }
            }
        }

        let errors_after = barkcli_core::commands::validate::validate_board(name);
        results.push(DoctorBoardResult {
            name: name.clone(),
            errors_before: errors_before.len(),
            errors_after: errors_after.len(),
            fixed,
        });
    }

    Ok(Json(DoctorResponse { boards: results, fixed: total_fixed }))
}

// ── Board CRUD Handlers ──

#[derive(Deserialize)]
struct CreateBoardRequest {
    title: String,
    description: Option<String>,
    columns: Option<Vec<String>>,
}

async fn create_board_handler(
    Json(req): Json<CreateBoardRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let name = barkcli_core::util::slug::to_slug(&req.title);
    if name.is_empty() {
        return Err(ServerError::bad("board name cannot be empty"));
    }

    let columns: Vec<String> = req.columns.unwrap_or_else(|| {
        vec!["todo".into(), "doing".into(), "review".into(), "done".into()]
    });

    let board = Board {
        title: req.title,
        description: req.description,
        columns: columns
            .iter()
            .map(|c| barkcli_core::models::Column::new(c, c))
            .collect(),
        cards: vec![],
    };

    board_file::write_board(&name, &board)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true, "name": name })))
}

async fn delete_board_handler(
    Path(name): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let name = sanitize_name(&name)?;
    let path = board_file::board_path(&name)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    if !path.exists() {
        return Err(ServerError::bad(format!("board '{}' not found", name)));
    }

    std::fs::remove_file(&path).map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ── Card Comment Handler ──

#[derive(Deserialize)]
struct AddCommentRequest {
    author: String,
    text: String,
}

async fn add_comment_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Query(query): Query<BoardQuery>,
    Json(req): Json<AddCommentRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;

    let card = board.cards.iter_mut().find(|c| c.id == card_id)
        .ok_or_else(|| ServerError::bad(format!("card '{}' not found", card_id)))?;

    let comment = Comment {
        author: req.author,
        text: req.text,
        at: Utc::now(),
    };
    card.comments.push(comment);
    card.updated_at = chrono::Utc::now();

    board_file::write_board(&board_name, &board)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Mind & Skills handlers (SPEC-004 R2) ─────────────────────────────────────

async fn mind_snapshot_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let snap = barkcli_core::mind::snapshot::build(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::to_value(&snap).map_err(|e| ServerError::internal(e.to_string()))?))
}

async fn mind_digest_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let snap = barkcli_core::mind::snapshot::build(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let digest = barkcli_core::mind::digest::render(&snap);
    Ok(Json(serde_json::json!({"board": board_name, "digest": digest, "snapshot": snap})))
}

// ── Autopilot handlers (agent-driven loop with human gates) ─────────────────

async fn autopilot_status_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let st = barkcli_core::agent::autopilot::evaluate(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::to_value(&st).map_err(|e| ServerError::internal(e.to_string()))?))
}

#[derive(Deserialize)]
struct IntakeRequest {
    text: String,
    kind: Option<String>,
    board: Option<String>,
    backend: Option<String>,
    auto_run: Option<bool>,
}

fn dispatch_backend_plan(
    board_name: &str,
    card_id: &str,
    backend_name: &str,
    intent_text: &str,
) -> Result<serde_json::Value, String> {
    let b_name = backend_name.to_lowercase();
    let b_tag = format!("agent:{}", b_name);

    let mut card_title = String::new();
    barkcli_core::storage::board_file::update_board(board_name, |b| {
        if let Some(c) = b.cards.iter_mut().find(|c| c.id == card_id) {
            c.labels.retain(|l| !l.starts_with("agent:"));
            c.labels.push(b_tag.clone());
            c.assignee = Some(b_name.clone());
            c.column = "doing".to_string();
            c.touch();
            card_title = c.title.clone();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Card not found"))
        }
    }).map_err(|e| e.to_string())?;

    let mut st = barkcli_core::agent::autopilot::AutopilotState::load(board_name);
    let proposal = st.propose(board_name, card_id, &b_name).map_err(|e| e.to_string())?;
    let _ = st.approve(board_name, card_id, true);

    let plan_ev = barkcli_core::threads::ThreadEvent::new(
        card_id,
        barkcli_core::threads::ThreadEventKind::PlanApproved,
        "barkcli",
        format!("Plan approved with {} child tasks. Dispatched to {}.", proposal.children.len(), b_name),
        Some(serde_json::json!({ "children": proposal.children, "backend": b_name })),
    );
    let _ = barkcli_core::threads::append_event(card_id, &plan_ev);

    if b_name == "board" {
        if let Ok(board) = barkcli_core::storage::board_file::read_board(board_name) {
            if let Ok(mut engine) = barkcli_core::agent::orchestrate::OrchestrationEngine::new(
                board_name,
                barkcli_core::agent::roles::AgentRole::ScrumMaster,
                board,
            ) {
                let _ = engine.run_cycle();
            }
        }
    } else {
        let b_str = b_name.clone();
        let b_board = board_name.to_string();
        let c_id = card_id.to_string();
        let prompt = if intent_text.trim().is_empty() {
            card_title
        } else {
            intent_text.to_string()
        };
        tokio::task::spawn_blocking(move || {
            let backend_parsed = barkcli_core::agent::SessionBackend::parse(&b_str);
            let mut run_opts = barkcli_core::commands::run_cmd::RunOptions::default();
            run_opts.card_id = Some(c_id);
            run_opts.intent = prompt;
            run_opts.board = Some(b_board);
            run_opts.backend = backend_parsed;
            run_opts.yes = true;
            let _ = barkcli_core::commands::run_cmd::run(run_opts);
        });
    }

    Ok(serde_json::to_value(&proposal).unwrap_or(serde_json::json!({ "card_id": card_id })))
}

async fn intake_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<IntakeRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if req.text.trim().is_empty() {
        return Err(ServerError::bad("text required"));
    }
    let board_name = resolve_board_name(&state, req.board)?;
    let mut args = vec![req.text.clone()];
    match req.kind.as_deref() {
        Some("bug") => args.push("--bug".into()),
        Some("feature") => args.push("--feature".into()),
        _ => {}
    }
    args.push("--board".into());
    args.push(board_name.clone());
    barkcli_core::commands::intake::run_intake(&args)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let out: serde_json::Value = std::fs::read_to_string(std::env::temp_dir().join("barkcli-intake-last.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));

    let card_id = out.get("card_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut plan_val = serde_json::Value::Null;

    if !card_id.is_empty() {
        let b_name = req.backend.as_deref().unwrap_or("").to_lowercase();
        let k_name = req.kind.as_deref().unwrap_or("task").to_lowercase();

        let _ = barkcli_core::storage::board_file::update_board(&board_name, |b| {
            if let Some(c) = b.cards.iter_mut().find(|c| c.id == card_id) {
                if !b_name.is_empty() {
                    c.labels.retain(|l| !l.starts_with("agent:"));
                    c.labels.push(format!("agent:{}", b_name));
                    c.assignee = Some(b_name.clone());
                }
                c.labels.retain(|l| !l.starts_with("type:"));
                c.labels.push(format!("type:{}", k_name));
                c.touch();
            }
            Ok(())
        });

        if req.auto_run == Some(true) || (!b_name.is_empty() && b_name != "auto") {
            let target_backend = if b_name.is_empty() || b_name == "auto" { "board" } else { &b_name };
            if let Ok(p) = dispatch_backend_plan(&board_name, &card_id, target_backend, &req.text) {
                plan_val = p;
            }
        }
    }

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "board": board_name,
        "intake": out,
        "plan": plan_val
    })))
}

#[derive(Deserialize)]
struct CreateAndRunRequest {
    title: String,
    description: Option<String>,
    kind: Option<String>,
    backend: Option<String>,
    priority: Option<String>,
    board: Option<String>,
    acceptance_criteria: Option<Vec<String>>,
}

async fn create_and_run_task_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateAndRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let title = req.title.trim().to_string();
    if title.is_empty() {
        return Err(ServerError::bad("Task title is required"));
    }
    let board_name = resolve_board_name(&state, req.board)?;
    let mut card_id = String::new();
    let b_name = req.backend.unwrap_or_else(|| "board".to_string()).to_lowercase();
    let k_name = req.kind.unwrap_or_else(|| "task".to_string()).to_lowercase();
    let prio = req.priority.unwrap_or_else(|| "medium".to_string());
    let desc = req.description.clone();
    let ac = req.acceptance_criteria.clone().unwrap_or_default();

    barkcli_core::storage::board_file::update_board(&board_name, |b| {
        let existing_ids: Vec<String> = b.cards.iter().map(|c| c.id.clone()).collect();
        let fresh_id = barkcli_core::util::slug::unique_slug(&title, &existing_ids);
        card_id = fresh_id.clone();
        let mut card = barkcli_core::models::card::Card::new(&fresh_id, &title, "doing");
        card.priority = prio;
        card.description = desc;
        card.acceptance_criteria = ac;
        card.assignee = Some(b_name.clone());
        card.labels = vec![format!("agent:{}", b_name), format!("type:{}", k_name)];
        b.cards.push(card);
        Ok(())
    }).map_err(|e| ServerError::internal(e.to_string()))?;

    let plan_res = dispatch_backend_plan(&board_name, &card_id, &b_name, &title)
        .map_err(|e| ServerError::internal(e))?;
    let _ = state.tx.send("reload".to_string());

    Ok(Json(serde_json::json!({
        "ok": true,
        "card_id": card_id,
        "board": board_name,
        "backend": b_name,
        "kind": k_name,
        "plan": plan_res,
        "status": "running"
    })))
}

#[derive(Deserialize)]
struct CardPlanAndRunRequest {
    board: Option<String>,
    backend: Option<String>,
}

async fn card_plan_and_run_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Json(req): Json<CardPlanAndRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board)?;
    let b_name = req.backend.unwrap_or_else(|| "board".to_string()).to_lowercase();

    let plan_res = dispatch_backend_plan(&board_name, &card_id, &b_name, "")
        .map_err(|e| ServerError::internal(e))?;
    let _ = state.tx.send("reload".to_string());

    Ok(Json(serde_json::json!({
        "ok": true,
        "card_id": card_id,
        "board": board_name,
        "backend": b_name,
        "plan": plan_res,
        "status": "running"
    })))
}

#[derive(Deserialize)]
struct AutopilotCardRequest {
    card_id: String,
    board: Option<String>,
    by: Option<String>,
    reason: Option<String>,
    create_tasks: Option<bool>,
}

async fn autopilot_propose_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AutopilotCardRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board)?;
    let mut st = barkcli_core::agent::autopilot::AutopilotState::load(&board_name);
    let by = req.by.as_deref().unwrap_or("web");
    let p = st
        .propose(&board_name, &req.card_id, by)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::to_value(&p).map_err(|e| ServerError::internal(e.to_string()))?))
}

async fn autopilot_approve_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AutopilotCardRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board)?;
    let mut st = barkcli_core::agent::autopilot::AutopilotState::load(&board_name);
    let kids = st
        .approve(&board_name, &req.card_id, req.create_tasks.unwrap_or(true))
        .map_err(|e| ServerError::bad(e.to_string()))?;

    let approved_ev = barkcli_core::threads::ThreadEvent::new(
        &req.card_id,
        barkcli_core::threads::ThreadEventKind::PlanApproved,
        "barkcli",
        format!("Plan approved with {} child tasks", kids.len()),
        Some(serde_json::json!({ "child_cards": kids })),
    );
    let _ = barkcli_core::threads::append_event(&req.card_id, &approved_ev);
    let _ = state.thread_tx.send(approved_ev);

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "approved": true, "card_id": req.card_id, "child_cards": kids })))
}

async fn autopilot_reject_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AutopilotCardRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board)?;
    let mut st = barkcli_core::agent::autopilot::AutopilotState::load(&board_name);
    let reason = req.reason.as_deref().unwrap_or("User requested revision");
    st.reject(&board_name, &req.card_id, reason)
        .map_err(|e| ServerError::bad(e.to_string()))?;

    let steer_ev = barkcli_core::threads::ThreadEvent::new(
        &req.card_id,
        barkcli_core::threads::ThreadEventKind::Steer,
        "you",
        format!("Plan rejected: {}", reason),
        None,
    );
    let _ = barkcli_core::threads::append_event(&req.card_id, &steer_ev);
    let _ = state.thread_tx.send(steer_ev);

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "rejected": true, "card_id": req.card_id })))
}

#[derive(Deserialize)]
struct ReviewRequest {
    board: Option<String>,
    all: Option<bool>,
    auto: Option<bool>,
}

async fn review_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ReviewRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board)?;
    let mut args = Vec::new();
    if req.all.unwrap_or(true) {
        args.push("--all".to_string());
    }
    if req.auto.unwrap_or(true) {
        args.push("--auto".to_string());
    }
    args.push("--board".to_string());
    args.push(board_name.clone());
    barkcli_core::commands::review::run_review(&args)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "board": board_name, "reviewed": true })))
}

// ── Smart History Bundles ──

async fn list_bundles_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let branch = params.get("branch").map(|s| s.as_str()).filter(|s| !s.is_empty());
    let kind = params.get("kind").and_then(|s| barkcli_core::models::bundle::BundleKind::parse(s));
    let status = params.get("status").and_then(|s| match s.as_str() {
        "open" => Some(barkcli_core::models::bundle::BundleStatus::Open),
        "sealed" => Some(barkcli_core::models::bundle::BundleStatus::Sealed),
        _ => None,
    });
    let bundles = barkcli_core::history::list_bundles(branch, kind, status)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({ "bundles": bundles })))
}

async fn scan_bundles_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let branch = barkcli_core::history::git::current_branch(&root);
    let config = barkcli_core::history::ScanConfig {
        branch,
        since: None,
        max_commits: barkcli_core::history::git::DEFAULT_MAX_COMMITS,
        use_llm: true,
        heuristic: barkcli_core::history::heuristics::HeuristicConfig::default(),
    };
    let result = barkcli_core::history::scan(&root, &config)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "commits_processed": result.commits_processed,
        "bundles_created": result.bundles_created,
        "bundles_updated": result.bundles_updated,
        "unsorted_count": result.unsorted_count,
    })))
}

async fn get_bundle_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let bundle = barkcli_core::history::get_bundle(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?
        .ok_or_else(|| ServerError::bad(format!("bundle '{}' not found", id)))?;
    Ok(Json(serde_json::to_value(&bundle).unwrap()))
}

async fn delete_bundle_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let bundle = barkcli_core::history::get_bundle(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?
        .ok_or_else(|| ServerError::bad(format!("bundle '{}' not found", id)))?;
    barkcli_core::history::reject_bundle(&id, &bundle.branch)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "rejected": true, "id": id })))
}

async fn approve_bundle_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    barkcli_core::history::approve_bundle(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "approved": true, "id": id })))
}

async fn reject_bundle_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let bundle = barkcli_core::history::get_bundle(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?
        .ok_or_else(|| ServerError::bad(format!("bundle '{}' not found", id)))?;
    barkcli_core::history::reject_bundle(&id, &bundle.branch)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "rejected": true, "id": id })))
}

async fn seal_bundle_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    barkcli_core::history::seal_bundle(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "sealed": true, "id": id })))
}

async fn rename_bundle_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let title = req.get("title").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("title required"))?;
    barkcli_core::history::rename_bundle(&id, title)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "renamed": true, "id": id, "title": title })))
}

async fn merge_bundles_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let source = req.get("source").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("source required"))?;
    let target = req.get("target").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("target required"))?;
    barkcli_core::history::merge_bundles(source, target)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "merged": true, "source": source, "target": target })))
}

async fn split_bundle_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let id = req.get("id").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("id required"))?;
    let sha = req.get("sha").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("sha required"))?;
    let new_id = barkcli_core::history::split_bundle(id, sha)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "split": true, "new_bundle": new_id })))
}

async fn move_commit_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let sha = req.get("sha").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("sha required"))?;
    let from = req.get("from").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("from required"))?;
    let to = req.get("to").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("to required"))?;
    barkcli_core::history::move_commit(sha, from, to)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "moved": true, "sha": sha, "from": from, "to": to })))
}

async fn bundle_tree_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let tree = barkcli_core::history::bundle_tree()
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({ "tree": tree })))
}

async fn export_bundles_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let bundles = barkcli_core::history::list_bundles(None, None, None)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let markdown = barkcli_core::history::llm::generate_changelog(&bundles);
    if params.get("format").map(|s| s.as_str()) == Some("json") {
        Ok(Json(serde_json::json!({ "bundles": bundles, "format": "json" })))
    } else {
        Ok(Json(serde_json::json!({ "changelog": markdown, "format": "markdown" })))
    }
}

async fn export_branch_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let new_branch = req.get("new_branch").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("new_branch required"))?;
    let source_branch = req.get("source_branch").and_then(|v| v.as_str())
        .ok_or_else(|| ServerError::bad("source_branch required"))?;
    let bundles = barkcli_core::history::list_bundles(Some(source_branch), None, None)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let mut sorted = bundles.clone();
    sorted.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    let tip = barkcli_core::history::curated::export_curated_branch(&root, source_branch, new_branch, &sorted)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({
        "created": true,
        "branch": new_branch,
        "tip_sha": tip,
        "original_branch_untouched": true,
    })))
}

// ── Git history & visualizer handlers ───────────────────────────────────────

#[derive(Deserialize)]
struct GitCommitsQuery {
    branch: Option<String>,
    since: Option<String>,
    limit: Option<usize>,
}

#[derive(Serialize)]
struct GitCommitsResponse {
    branch: String,
    branches: Vec<String>,
    commits: Vec<barkcli_core::history::git::RawCommit>,
}

async fn git_commits_handler(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<GitCommitsQuery>,
) -> Result<Json<GitCommitsResponse>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let branches = barkcli_core::history::git::list_branches(&root);
    let current = barkcli_core::history::git::current_branch(&root);
    let branch = query.branch.unwrap_or_else(|| {
        if current.is_empty() {
            "HEAD".to_string()
        } else {
            current
        }
    });
    let limit = query.limit.unwrap_or(60).clamp(1, 300);
    let commits = barkcli_core::history::git::read_commits(
        &root,
        &branch,
        query.since.as_deref(),
        limit,
    ).unwrap_or_default();

    Ok(Json(GitCommitsResponse {
        branch,
        branches,
        commits,
    }))
}

#[derive(Serialize)]
struct GitDiffResponse {
    sha: String,
    message: String,
    diff: String,
    files_changed: Vec<String>,
    additions: u64,
    deletions: u64,
}

async fn git_diff_handler(
    State(_state): State<Arc<AppState>>,
    Path(sha): Path<String>,
) -> Result<Json<GitDiffResponse>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    if !barkcli_core::history::git::commit_exists(&root, &sha) {
        return Err(ServerError::bad(format!("commit '{}' not found", sha)));
    }
    let message = barkcli_core::history::git::commit_message(&root, &sha);
    let diff = barkcli_core::history::git::commit_diff(&root, &sha);

    let mut files_changed = Vec::new();
    let mut additions = 0u64;
    let mut deletions = 0u64;

    if let Ok(commits) = barkcli_core::history::git::read_commits(&root, &sha, None, 1) {
        if let Some(c) = commits.into_iter().next() {
            files_changed = c.files_changed;
            additions = c.additions;
            deletions = c.deletions;
        }
    }

    Ok(Json(GitDiffResponse {
        sha,
        message,
        diff,
        files_changed,
        additions,
        deletions,
    }))
}

#[derive(Deserialize)]
struct GitAssignRequest {
    board_name: Option<String>,
    commit_sha: Option<String>,
    title: String,
    description: Option<String>,
    column: Option<String>,
    priority: Option<String>,
    agent_id: Option<String>,
    files_context: Option<Vec<String>>,
    acceptance_criteria: Option<Vec<String>>,
}

#[derive(Serialize)]
struct GitAssignResponse {
    card_id: String,
    task_id: Option<String>,
    board_name: String,
    agent_id: Option<String>,
    title: String,
    status: String,
}

async fn git_assign_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<GitAssignRequest>,
) -> Result<Json<GitAssignResponse>, ServerError> {
    let board_name = resolve_board_name(&state, req.board_name)?;
    let title = req.title.trim().to_string();
    if title.is_empty() {
        return Err(ServerError::bad("Task title is required"));
    }

    let mut created_card_id = String::new();
    let target_col = req.column.clone();
    let card_desc = req.description.clone();
    let card_prio = req.priority.clone();
    let acc_criteria = req.acceptance_criteria.clone().unwrap_or_default();
    let files = req.files_context.clone().unwrap_or_default();
    let commit_sha_opt = req.commit_sha.clone();
    let assigned_agent_req = req.agent_id.clone().filter(|s| !s.trim().is_empty());

    // 1. Update board atomically with lock
    barkcli_core::storage::board_file::update_board(&board_name, |board| {
        let existing_ids: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
        let fresh_id = barkcli_core::util::slug::unique_slug(&title, &existing_ids);
        created_card_id = fresh_id.clone();

        let col_id = target_col.clone().unwrap_or_else(|| {
            board.columns.first().map(|c| c.id.clone()).unwrap_or_else(|| "todo".into())
        });

        let mut card = barkcli_core::models::card::Card::new(&fresh_id, &title, &col_id);
        card.priority = card_prio.clone().unwrap_or_else(|| "medium".into());
        card.description = card_desc.clone();
        card.acceptance_criteria = acc_criteria.clone();
        if let Some(ref aid) = assigned_agent_req {
            card.assignee = Some(aid.clone());
        }

        let mut labels = vec!["git".to_string()];
        if let Some(ref sha) = commit_sha_opt {
            labels.push(format!("commit:{}", &sha[..7.min(sha.len())]));
        }
        card.labels = labels;

        board.cards.push(card);
        Ok(())
    }).map_err(|e| ServerError::internal(format!("Failed to save board card: {}", e)))?;

    // 2. Create task in task queue
    let tasks_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks");
    let _ = std::fs::create_dir_all(&tasks_dir);
    let tasks_path = tasks_dir.join(format!("{}.json", board_name));

    let mut queue = if tasks_path.exists() {
        TaskQueue::load(&tasks_path).unwrap_or_else(|_| TaskQueue::new())
    } else {
        TaskQueue::new()
    };

    let context_files: Vec<barkcli_core::agent::queue::FileContext> = files
        .into_iter()
        .map(|path| barkcli_core::agent::queue::FileContext {
            content: std::fs::read_to_string(&path).ok(),
            symbols: Vec::new(),
            call_graph: None,
            test_coverage: None,
            path,
        })
        .collect();

    let task = barkcli_core::agent::queue::create_task(
        &created_card_id,
        &title,
        req.description.as_deref().unwrap_or(""),
        req.acceptance_criteria.clone().unwrap_or_default(),
        context_files,
        req.priority.as_deref().unwrap_or("medium"),
    );

    let mut assigned_agent = None;
    let mut status = "created".to_string();

    if let Some(ref agent_id) = assigned_agent_req {
        if queue.claim(&task.id, agent_id, None, 60).is_ok() {
            let _ = agent_start_task(agent_id, &task.id);
            assigned_agent = Some(agent_id.clone());
            status = "assigned".to_string();
        }
    }

    queue.add(task.clone());
    let _ = queue.save(&tasks_path);

    // 3. Broadcast reload
    let _ = state.tx.send("reload".to_string());

    Ok(Json(GitAssignResponse {
        card_id: created_card_id,
        task_id: Some(task.id),
        board_name,
        agent_id: assigned_agent,
        title,
        status,
    }))
}

fn skill_json(skill: &barkcli_core::skills::Skill, include_content: bool) -> serde_json::Value {
    let mut value = serde_json::json!({
        "id": skill.id,
        "name": skill.name,
        "description": skill.description,
        "triggers": skill.triggers,
        "source": skill.source.to_string(),
        "enabled": skill.enabled,
        "always": skill.always,
    });
    if include_content {
        value["content"] = serde_json::Value::String(skill.content.clone());
    }
    value
}

async fn list_skills_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let reg = barkcli_core::skills::SkillRegistry::load_all(None)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let skills: Vec<serde_json::Value> = reg.skills.iter().map(|s| skill_json(s, false)).collect();
    Ok(Json(serde_json::json!({ "skills": skills })))
}

async fn get_skill_handler(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let reg = barkcli_core::skills::SkillRegistry::load_all(None)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let skill = reg
        .get(&id)
        .ok_or_else(|| ServerError::bad(format!("skill '{}' not found", id)))?;
    Ok(Json(skill_json(skill, true)))
}

#[derive(Deserialize)]
struct CreateSkillBody {
    id: Option<String>,
    name: String,
    description: Option<String>,
    triggers: Option<Vec<String>>,
    content: String,
}

async fn create_skill_handler(
    Json(body): Json<CreateSkillBody>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let skill = barkcli_core::skills::manage::create_project_skill(
        body.id.as_deref(),
        &body.name,
        body.description.as_deref().unwrap_or(""),
        &body.triggers.unwrap_or_default(),
        &body.content,
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;

    Ok(Json(serde_json::json!({ "skill": skill_json(&skill, true) })))
}

#[derive(Deserialize)]
struct UpdateSkillBody {
    enabled: bool,
}

async fn update_skill_handler(
    Path(id): Path<String>,
    Json(body): Json<UpdateSkillBody>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let reg = barkcli_core::skills::SkillRegistry::load_all(None)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    if reg.get(&id).is_none() {
        return Err(ServerError::bad(format!("skill '{}' not found", id)));
    }

    barkcli_core::skills::manage::set_enabled(&id, body.enabled)
        .map_err(|e| ServerError::internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "id": id, "enabled": body.enabled })))
}

async fn delete_skill_handler(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    barkcli_core::skills::manage::delete_project_skill(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({ "deleted": id })))
}

#[derive(Deserialize)]
struct InstallSkillsBody {
    source: String,
    dir: Option<String>,
}

async fn install_skills_handler(
    Json(body): Json<InstallSkillsBody>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let source = body.source.trim().to_string();
    if source.is_empty() {
        return Err(ServerError::bad("a git URL, owner/repo, or local path is required"));
    }
    let dir = body
        .dir
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty());

    let result = tokio::task::spawn_blocking(move || {
        barkcli_core::skills::install::install_from_source(&source, dir.as_deref())
    })
    .await
    .map_err(|e| ServerError::internal(e.to_string()))?
    .map_err(|e| ServerError::bad(e.to_string()))?;

    Ok(Json(serde_json::json!({
        "source": result.source,
        "rev": result.rev,
        "installed": result.installed,
        "updated": result.updated,
    })))
}

// ── Documentation handlers ───────────────────────────────────────────────────

/// List available documentation files (public docs only, no internal/).
///
/// Docs live in `docs/content/*.md` in this repo; fall back to `docs/` for
/// legacy flat layouts.
async fn list_docs_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let docs_dir = docs_content_dir();
    let mut docs = Vec::new();

    if docs_dir.is_dir() {
        let entries = std::fs::read_dir(&docs_dir)
            .map_err(|e| ServerError::internal(format!("failed to read docs dir: {}", e)))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(name) = path.file_stem().and_then(|n| n.to_str()) {
                    // Only serve public .md files, exclude internal/ and other dirs
                    if !name.starts_with('.') {
                        // Read first line for title, or use filename
                        let title = std::fs::read_to_string(&path)
                            .ok()
                            .and_then(|content| {
                                content.lines().next().map(|line| {
                                    let t = line.trim_start_matches('#').trim();
                                    if t.is_empty() { name.to_string() } else { t.to_string() }
                                })
                            })
                            .unwrap_or_else(|| name.to_string());

                        docs.push(serde_json::json!({
                            "slug": name,
                            "title": title,
                        }));
                    }
                }
            }
        }
    }

    // Sort alphabetically
    docs.sort_by(|a, b| {
        a["slug"].as_str().unwrap_or("").cmp(b["slug"].as_str().unwrap_or(""))
    });

    Ok(Json(serde_json::json!({ "docs": docs })))
}

/// The directory documentation is served from: `docs/content/` when present
/// (current layout, shared with the fumadocs site), else `docs/` directly.
fn docs_content_dir() -> std::path::PathBuf {
    let content = std::path::Path::new("docs").join("content");
    if content.is_dir() {
        content
    } else {
        std::path::PathBuf::from("docs")
    }
}

/// Get a single documentation file by slug (e.g. /api/docs/COMMANDS).
async fn get_doc_handler(
    Path(file): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Sanitize: only allow alphanumeric, hyphens, underscores
    if file.is_empty() || file.len() > 100 || file.contains("..") || file.contains('/') || file.contains('\\') {
        return Err(ServerError::bad("invalid doc filename"));
    }

    let path = docs_content_dir().join(format!("{}.md", file));

    if !path.exists() {
        return Err(ServerError::bad(format!("doc '{}' not found", file)));
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| ServerError::internal(format!("failed to read doc: {}", e)))?;

    Ok(Json(serde_json::json!({
        "slug": file,
        "content": content,
    })))
}

// ── Thread and transcript endpoints ──

#[derive(Deserialize)]
struct CreateThreadRequest {
    text: String,
    kind: Option<String>,
    backend: Option<String>,
    model: Option<String>,
    mode: Option<String>,
    board: Option<String>,
}

async fn list_threads_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let summaries = barkcli_core::threads::list_threads(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::to_value(&summaries).unwrap_or(serde_json::json!([]))))
}

async fn get_thread_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    let card = board.cards.into_iter().find(|c| c.id == card_id);
    let events = if let Some(ref c) = card {
        barkcli_core::threads::load_or_init_thread(&board_name, c)
            .map_err(|e| ServerError::internal(e.to_string()))?
    } else {
        barkcli_core::threads::read_events(&card_id)
            .map_err(|e| ServerError::internal(e.to_string()))?
    };
    let runs = barkcli_core::runtime::RuntimeStore::from_project()
        .and_then(|store| store.list_runs(Some(&card_id)))
        .unwrap_or_default();
    Ok(Json(serde_json::json!({
        "id": card_id,
        "card": card,
        "events": events,
        "runs": runs,
    })))
}

#[derive(Deserialize)]
struct UpdateThreadRequest {
    #[serde(default)]
    board: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    pinned: Option<bool>,
    #[serde(default)]
    settled: Option<bool>,
}

/// Rename, pin, settle, or reopen a thread. Every action mutates the card so
/// the board and the navigator stay in sync.
async fn update_thread_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Json(req): Json<UpdateThreadRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if req.title.is_none() && req.pinned.is_none() && req.settled.is_none() {
        return Err(ServerError::bad("no thread change requested"));
    }
    let board_name = resolve_board_name(&state, req.board)?;
    let mut updated = None;
    barkcli_core::storage::board_file::update_board(&board_name, |board| {
        let card = board
            .cards
            .iter_mut()
            .find(|card| card.id == card_id)
            .ok_or_else(|| anyhow::anyhow!("thread not found"))?;
        let mut changed = false;
        if let Some(title) = req.title.as_ref() {
            let title = title.trim();
            if title.is_empty() {
                anyhow::bail!("title required");
            }
            card.title = title.to_string();
            changed = true;
        }
        if let Some(pinned) = req.pinned {
            card.pinned = pinned;
        }
        if let Some(settled) = req.settled {
            if settled && card.column != "done" {
                card.column = "done".to_string();
                changed = true;
            } else if !settled && card.column == "done" {
                card.column = "todo".to_string();
                changed = true;
            }
        }
        card.version += 1;
        if changed {
            card.updated_at = Utc::now();
        }
        updated = Some(card.clone());
        Ok(())
    })
    .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "card": updated,
    })))
}

#[derive(Deserialize)]
struct ForkThreadRequest {
    #[serde(default)]
    board: Option<String>,
    #[serde(default)]
    event_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
}

/// Copy a thread (or its prefix up to `event_id`) into a fresh card. The fork
/// starts in `todo` with no inherited pin or run identity.
async fn fork_thread_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Json(req): Json<ForkThreadRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board)?;
    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    let original = board
        .cards
        .iter()
        .find(|card| card.id == card_id)
        .cloned()
        .ok_or_else(|| ServerError::bad("thread not found"))?;

    let mut events = barkcli_core::threads::read_events(&card_id)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    if let Some(event_id) = req.event_id.as_deref() {
        let index = events
            .iter()
            .position(|event| event.id == event_id)
            .ok_or_else(|| ServerError::bad("fork point not found in this thread"))?;
        events.truncate(index + 1);
    }

    let title = req
        .title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{} (fork)", original.title));
    let mut new_id = String::new();
    barkcli_core::storage::board_file::update_board(&board_name, |board| {
        let existing: Vec<String> = board.cards.iter().map(|card| card.id.clone()).collect();
        new_id = barkcli_core::util::slug::unique_slug(&title, &existing);
        let mut card = original.clone();
        card.id = new_id.clone();
        card.title = title.clone();
        card.column = "todo".to_string();
        card.pinned = false;
        card.version = 1;
        card.created_at = Utc::now();
        card.updated_at = Utc::now();
        board.cards.push(card);
        Ok(())
    })
    .map_err(|e| ServerError::internal(e.to_string()))?;

    for (index, event) in events.iter().enumerate() {
        let mut copy = barkcli_core::threads::ThreadEvent::new(
            &new_id,
            event.kind.clone(),
            &event.author,
            &event.text,
            event.data.clone(),
        );
        copy.seq = index as u64 + 1;
        copy.created_at = event.created_at.clone();
        barkcli_core::threads::append_event(&new_id, &copy)
            .map_err(|e| ServerError::internal(e.to_string()))?;
    }

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "thread_id": new_id,
        "card_id": new_id,
    })))
}

async fn delete_thread_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    if state.chat.lock().map(|chats| chats.contains_key(&card_id)).unwrap_or(false) {
        return Err(ServerError::bad("Stop the active reply before deleting this thread."));
    }
    let runs = barkcli_core::runtime::RuntimeStore::from_project()
        .and_then(|store| store.list_runs(Some(&card_id)))
        .unwrap_or_default();
    if runs.iter().any(|run| {
        matches!(run.status.as_str(), "queued" | "starting" | "running" | "waiting")
    }) {
        return Err(ServerError::bad("Stop the active build before deleting this thread."));
    }
    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    if !board.cards.iter().any(|card| card.id == card_id) {
        return Err(ServerError::bad("thread not found"));
    }
    barkcli_core::storage::board_file::update_board(&board_name, |board| {
        board.cards.retain(|card| card.id != card_id);
        Ok(())
    })
    .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = barkcli_core::threads::delete_thread_file(&card_id);
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn list_thread_runs_handler(
    Path(card_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let runs = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .list_runs(Some(&card_id))
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::to_value(runs).unwrap_or(serde_json::json!([]))))
}

async fn get_run_handler(
    Path(run_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let run = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .load_run(&run_id)
        .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
    Ok(Json(serde_json::to_value(run).unwrap_or(serde_json::json!(null))))
}

#[derive(Deserialize)]
struct CreateContributionRequest {
    title: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    parent: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    files: Vec<String>,
}

async fn create_contribution_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateContributionRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let title = req.title.trim().to_string();
    if title.is_empty() {
        return Err(ServerError::bad("title is required"));
    }
    let kind = barkcli_core::runtime::event::ContributionKind::parse(
        req.kind.as_deref().unwrap_or("insight"),
    );
    let author = req
        .author
        .clone()
        .or_else(|| std::env::var("USER").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "human".into());
    let store = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let run = barkcli_core::commands::contribute::manual_contribution(
        &store,
        &title,
        kind,
        &author,
        req.parent.as_deref(),
        req.files.clone(),
        req.text.as_deref(),
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;
    broadcast_contribution(&state.tx, "contribution_published", &run.id);
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::to_value(run).unwrap_or(serde_json::json!(null))))
}

async fn contributions_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let analysis = store
        .contribution_index()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .analysis();
    Ok(Json(
        serde_json::to_value(analysis).unwrap_or(serde_json::json!({})),
    ))
}

async fn contribution_duplicates_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let index = store
        .contribution_index()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let duplicates = index
        .duplicate_candidates()
        .into_iter()
        .map(|candidate| {
            serde_json::json!({
                "left": candidate.left,
                "right": candidate.right,
                "shared_files": candidate.shared_files,
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(serde_json::json!({ "duplicates": duplicates })))
}

async fn run_ancestry_handler(
    Path(run_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let index = store
        .contribution_index()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let lineage = index.ancestry(&run_id);
    if lineage.is_empty() {
        return Err(ServerError::bad(format!("run not found: {run_id}")));
    }
    let descendants = index.descendants(&run_id);
    Ok(Json(serde_json::json!({
        "run_id": run_id,
        "lineage": lineage,
        "descendants": descendants,
    })))
}

#[derive(Deserialize)]
struct LinkRunRequest {
    parent_id: String,
}

async fn link_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Json(req): Json<LinkRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let run = store
        .link_run(&run_id, &req.parent_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::to_value(run).unwrap_or(serde_json::json!(null))))
}

#[derive(Deserialize)]
struct VerifyRunRequest {
    verifier: String,
    #[serde(default)]
    note: Option<String>,
}

async fn verify_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<VerifyRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let verifier = req.verifier.trim().to_string();
    if verifier.is_empty() {
        return Err(ServerError::bad("verifier is required"));
    }
    let note = req.note.clone();
    let run_id_for_task = run_id.clone();
    let board_for_task = board_name.clone();
    let run = tokio::task::spawn_blocking(move || {
        let service = barkcli_core::runtime::RunService::from_project(&board_for_task)
            .map_err(|e| anyhow::anyhow!(e.to_string()))?;
        service.verify(&run_id_for_task, &verifier, note)
    })
    .await
    .map_err(|e| ServerError::internal(format!("verification task failed: {e}")))?
    .map_err(|e| ServerError::bad(e.to_string()))?;
    // The store appended a Review event; forward it to connected threads so
    // the verification is visible without a refresh.
    if let Ok(events) = barkcli_core::threads::read_events(&run.card_id) {
        if let Some(event) = events.last() {
            let _ = state.thread_tx.send(event.clone());
        }
    }
    broadcast_contribution(&state.tx, "contribution_verified", &run.id);
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "run": run,
    })))
}

async fn list_providers_handler() -> Json<serde_json::Value> {
    let providers = barkcli_core::runtime::ProviderRegistry::standard().statuses();
    Json(serde_json::to_value(providers).unwrap_or(serde_json::json!([])))
}

async fn probe_provider_handler(
    Path(provider_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let registry = barkcli_core::runtime::ProviderRegistry::standard();
    let adapter = registry
        .get(&provider_id)
        .ok_or_else(|| ServerError::bad(format!("unknown provider: {provider_id}")))?;
    Ok(Json(
        serde_json::to_value(adapter.probe()).unwrap_or(serde_json::json!(null)),
    ))
}

/// Models the local CLI actually reports. An empty list means the provider
/// takes a free-form model id; it never means "use a made-up default".
async fn provider_models_handler(
    Path(provider_id): Path<String>,
) -> Result<Json<Vec<String>>, ServerError> {
    let registry = barkcli_core::runtime::ProviderRegistry::standard();
    let models = registry
        .models(&provider_id)
        .ok_or_else(|| ServerError::bad(format!("unknown provider: {provider_id}")))?;
    Ok(Json(models))
}

#[derive(Deserialize)]
struct StartThreadRunRequest {
    #[serde(flatten)]
    run: barkcli_core::runtime::CreateRunRequest,
    plan_event_id: Option<String>,
}

async fn start_thread_run_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<StartThreadRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    if let Some(expected) = req.plan_event_id.as_deref() {
        let events = barkcli_core::threads::read_events(&card_id).unwrap_or_default();
        let latest = events.iter().rev().find(|event| matches!(event.kind,
            barkcli_core::threads::ThreadEventKind::PlanProposed | barkcli_core::threads::ThreadEventKind::PlanApproved));
        if !latest.is_some_and(|event| event.id == expected && event.kind == barkcli_core::threads::ThreadEventKind::PlanProposed) {
            return Err(ServerError::bad("This plan changed or was already approved. Reload it before building."));
        }
    }
    let tx = state.thread_tx.clone();
    let sink: barkcli_core::runtime::ThreadSink = Arc::new(move |event| {
        let _ = tx.send(event);
    });
    let service = barkcli_core::runtime::RunService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let run = service
        .start_for_card(&card_id, req.run, Some(sink))
        .map_err(|e| ServerError::bad(e.to_string()))?;
    if let Some(plan_id) = req.plan_event_id {
        let event = barkcli_core::threads::ThreadEvent::new(&card_id,
            barkcli_core::threads::ThreadEventKind::PlanApproved, "you", "Plan approved; build started",
            Some(serde_json::json!({ "plan_event_id": plan_id, "run_id": run.id })));
        let _ = barkcli_core::threads::append_event(&card_id, &event);
        let _ = state.thread_tx.send(event);
        let mut planner = barkcli_core::agent::autopilot::AutopilotState::load(&board_name);
        planner.proposals.remove(&card_id);
        if !planner.approved.contains(&card_id) { planner.approved.push(card_id.clone()); }
        let _ = planner.save();
    }
    broadcast_contribution(&state.tx, "contribution_published", &run.id);
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::to_value(run).unwrap_or(serde_json::json!(null))))
}

async fn run_diff_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::runtime::RunService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let diff = service
        .diff(&run_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::to_value(diff).unwrap_or(serde_json::json!(null))))
}

async fn run_gate_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::runtime::RunService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let run = service
        .store()
        .load_run(&run_id)
        .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
    let log = run
        .gate
        .as_ref()
        .and_then(|gate| gate.log_path.as_deref())
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default();
    let gate = run.gate.clone();
    let eligibility = service.merge_eligibility(&run);
    Ok(Json(serde_json::json!({
        "run": run,
        "gate": gate,
        "log": log,
        "eligibility": eligibility,
    })))
}

#[derive(Deserialize)]
struct CheckRunRequest {
    command: Option<String>,
}

async fn check_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<CheckRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board = resolve_board_name(&state, params.name)?;
    let command = req.command.clone();
    let run = tokio::task::spawn_blocking(move || {
        barkcli_core::runtime::RunService::from_project(&board)?.check(&run_id, command.as_deref())
    }).await.map_err(|error| ServerError::internal(error.to_string()))?
        .map_err(|error| ServerError::bad(error.to_string()))?;
    if let Ok(events) = barkcli_core::threads::read_events(&run.card_id) {
        if let Some(event) = events.last() { let _ = state.thread_tx.send(event.clone()); }
    }
    let _ = state.tx.send("reload".into());
    Ok(Json(serde_json::to_value(run).unwrap_or_default()))
}

async fn run_context_handler(
    Path(run_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::context::ContextStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let run = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .load_run(&run_id)
        .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
    let context = run
        .context_manifest_id
        .as_deref()
        .and_then(|manifest_id| store.load_pack(manifest_id).ok());
    Ok(Json(serde_json::json!({
        "run": run,
        "context": context,
        "available": context.is_some(),
    })))
}

#[derive(Deserialize)]
struct ContextPreviewRequest {
    card_id: String,
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    permission_mode: Option<String>,
    #[serde(default)]
    skills: Vec<String>,
    #[serde(default)]
    budget_tokens: Option<usize>,
}

async fn context_preview_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<ContextPreviewRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let board = barkcli_core::storage::board_file::read_board(&board_name)
        .map_err(|e| ServerError::bad(format!("board could not be read: {e}")))?;
    let card = board
        .cards
        .iter()
        .find(|card| card.id == req.card_id)
        .cloned()
        .ok_or_else(|| ServerError::bad(format!("card '{}' not found", req.card_id)))?;
    let engine = barkcli_core::context::ContextEngine::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let pack = engine
        .compile(&barkcli_core::context::CompileRequest {
            thread_id: card.id.clone(),
            card_id: card.id.clone(),
            card,
            run_id: None,
            role: req.role,
            provider: req.provider.unwrap_or_else(|| "opencode".into()),
            permission_mode: req.permission_mode.unwrap_or_else(|| "auto".into()),
            extra_prompt: req.prompt,
            explicit_skills: req.skills,
            budget_tokens: req.budget_tokens,
        })
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(pack).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn discover_skills_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let skills = barkcli_core::skills::discover::discover(&root);
    Ok(Json(serde_json::json!({ "skills": skills })))
}

#[derive(Deserialize)]
struct ImportDiscoveredSkillRequest {
    path: String,
}

async fn import_discovered_skill_handler(
    Json(body): Json<ImportDiscoveredSkillRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let imported = barkcli_core::skills::discover::import(&root, std::path::Path::new(&body.path))
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({ "imported": imported })))
}

async fn stop_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::runtime::RunService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    // A stopped run inside an orchestra plan must stop its sibling tasks too.
    let cascaded = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .ok()
        .and_then(|orchestra| orchestra.stop_run_cascade(&run_id).ok())
        .flatten();
    let run = if cascaded.is_some() {
        service
            .store()
            .load_run(&run_id)
            .map_err(|e| ServerError::bad(format!("run not found: {e}")))?
    } else {
        service
            .stop(&run_id)
            .map_err(|e| ServerError::bad(e.to_string()))?
    };
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(run).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(serde::Deserialize, Default)]
struct MergeRunRequest {
    #[serde(default)]
    approved: bool,
}

async fn merge_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<MergeRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if !req.approved {
        return Err(ServerError::bad(
            "merge requires explicit human approval (approved: true)",
        ));
    }
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::runtime::RunService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let outcome = service
        .merge(&run_id, req.approved)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    broadcast_contribution(&state.tx, "contribution_merged", &run_id);
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::to_value(outcome).unwrap_or(serde_json::json!(null))))
}

// ---------------------------------------------------------------------------
// Review, repository, editor, and ship (M4)
// ---------------------------------------------------------------------------

async fn review_state_handler(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let state = barkcli_core::review::ReviewStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .load(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(state).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct ReviewViewedRequest {
    path: String,
    viewed: bool,
}

async fn review_viewed_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<ReviewViewedRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::review::ReviewStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let mut review = store
        .load(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    review.mark_viewed(&req.path, req.viewed);
    store
        .save(&review)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(review).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct ReviewCommentRequest {
    path: String,
    #[serde(default)]
    line: Option<u32>,
    #[serde(default)]
    side: Option<String>,
    body: String,
    #[serde(default)]
    run_id: Option<String>,
    #[serde(default)]
    author: Option<String>,
}

async fn review_add_comment_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<ReviewCommentRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::review::ReviewStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let mut review = store
        .load(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let comment = review
        .add_comment(
            &req.path,
            req.line,
            req.side,
            &req.body,
            req.author.as_deref().unwrap_or("you"),
            req.run_id,
        )
        .map_err(|e| ServerError::bad(e.to_string()))?;
    store
        .save(&review)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(comment).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct ResolveCommentRequest {
    resolved: bool,
}

async fn review_resolve_comment_handler(
    State(state): State<Arc<AppState>>,
    Path((id, comment_id)): Path<(String, String)>,
    Json(req): Json<ResolveCommentRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::review::ReviewStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let mut review = store
        .load(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let comment = review
        .resolve_comment(&comment_id, req.resolved)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    store
        .save(&review)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(comment).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn review_delete_comment_handler(
    State(state): State<Arc<AppState>>,
    Path((id, comment_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let store = barkcli_core::review::ReviewStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let mut review = store
        .load(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    review
        .delete_comment(&comment_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    store
        .save(&review)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "deleted": comment_id })))
}

#[derive(Deserialize)]
struct RequestChangesRequest {
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

async fn request_changes_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<RequestChangesRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let store = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let previous = store
        .load_run(&run_id)
        .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
    let review = barkcli_core::review::ReviewStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .load(&run_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let digest = review.prompt_digest();
    if digest.trim().is_empty() && req.note.as_deref().unwrap_or("").trim().is_empty() {
        return Err(ServerError::bad(
            "add a review comment or a note before requesting changes",
        ));
    }
    let mut prompt = format!(
        "Address the human review feedback for this task. Keep the change scoped to the feedback.\n\n{}",
        if digest.trim().is_empty() {
            "General feedback:".to_string()
        } else {
            format!("Review comments:\n{digest}")
        }
    );
    if let Some(note) = req.note.filter(|note| !note.trim().is_empty()) {
        prompt.push_str(&format!("\nAdditional note:\n{note}\n"));
    }
    prompt.push_str("\nRun the project gate and commit the fix. Do not merge or push.");
    let tx = state.thread_tx.clone();
    let sink: barkcli_core::runtime::ThreadSink = Arc::new(move |event| {
        let _ = tx.send(event);
    });
    let service = barkcli_core::runtime::RunService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let run = service
        .start_for_card(
            &previous.card_id,
            barkcli_core::runtime::CreateRunRequest {
                provider: req.provider.or_else(|| Some(previous.provider.clone())),
                model: req.model.or_else(|| previous.model.clone()),
                role: previous.role.clone(),
                agent_id: previous.agent_id.clone(),
                permission_mode: Some("auto".into()),
                prompt: Some(prompt),
                test_cmd: previous.gate.as_ref().and_then(|gate| gate.command.clone()),
                skills: Vec::new(),
                resume: true,
                parent_run_id: Some(previous.id.clone()),
                contributes_to: Vec::new(),
                kind: None,
                author: None,
                skip_gate: false,
            },
            Some(sink),
        )
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "run": run, "comments": review.open_comments().len() })))
}

#[derive(Deserialize)]
struct AskRunRequest {
    question: String,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    line: Option<u32>,
}

async fn ask_about_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<AskRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let question = req.question.trim();
    if question.is_empty() {
        return Err(ServerError::bad("a question is required"));
    }
    let board_name = resolve_board_name(&state, params.name)?;
    let previous = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .load_run(&run_id)
        .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
    let location = req
        .path
        .as_deref()
        .map(|path| match req.line {
            Some(line) => format!(" at {path}:{line}"),
            None => format!(" at {path}"),
        })
        .unwrap_or_default();
    let prompt = format!(
        "Answer this review question{location}. Do not modify files, run the gate, commit, or merge.\n\nQuestion: {question}"
    );
    let tx = state.thread_tx.clone();
    let sink: barkcli_core::runtime::ThreadSink = Arc::new(move |event| {
        let _ = tx.send(event);
    });
    let service = barkcli_core::runtime::RunService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let run = service
        .start_for_card(
            &previous.card_id,
            barkcli_core::runtime::CreateRunRequest {
                provider: Some(previous.provider.clone()),
                model: previous.model.clone(),
                role: Some("reviewer".into()),
                agent_id: None,
                permission_mode: Some("read-only".into()),
                prompt: Some(prompt),
                test_cmd: None,
                skills: Vec::new(),
                resume: true,
                parent_run_id: Some(previous.id.clone()),
                contributes_to: Vec::new(),
                kind: None,
                author: None,
                skip_gate: true,
            },
            Some(sink),
        )
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "run": run })))
}

// ---------------------------------------------------------------------------
// Trust layer: receipts, guard, and the review queue (SPEC-007)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ReceiptQuery {
    #[serde(default)]
    card_id: Option<String>,
}

async fn list_receipts_handler(
    Query(query): Query<ReceiptQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let receipts = barkcli_core::receipt::list_receipts(&root, query.card_id.as_deref())
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let summaries: Vec<barkcli_core::receipt::ReceiptSummary> =
        receipts.iter().map(Into::into).collect();
    Ok(Json(serde_json::json!({ "receipts": summaries })))
}

async fn get_receipt_handler(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let receipt = barkcli_core::receipt::find_receipt(&root, &id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let markdown = barkcli_core::receipt::to_markdown(&receipt);
    Ok(Json(
        serde_json::json!({ "receipt": receipt, "markdown": markdown }),
    ))
}

#[derive(Deserialize, Default)]
struct VerifyReceiptRequest {
    #[serde(default)]
    rerun_gate: bool,
}

async fn verify_receipt_handler(
    Path(id): Path<String>,
    Json(req): Json<VerifyReceiptRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let verification = barkcli_core::receipt::verify_receipt(&root, &id, req.rerun_gate)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(verification)
            .map_err(|e| ServerError::internal(e.to_string()))?,
    ))
}

#[derive(Deserialize, Default)]
struct GuardScanRequest {
    /// Git revision range, e.g. `main...HEAD`.
    #[serde(default)]
    range: Option<String>,
    /// Scan only staged changes.
    #[serde(default)]
    staged: bool,
    /// Scan a branch against the repository base branch.
    #[serde(default)]
    branch: Option<String>,
}

async fn guard_scan_handler(
    Json(req): Json<GuardScanRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if req.range.is_some() && req.staged {
        return Err(ServerError::bad("use either `range` or `staged`, not both"));
    }
    if req.branch.is_some() && (req.range.is_some() || req.staged) {
        return Err(ServerError::bad(
            "use either `branch` or `range`/`staged`, not both",
        ));
    }

    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let settings = barkcli_core::storage::board_dir::find_board_dir_opt()
        .ok()
        .flatten()
        .and_then(|dir| barkcli_core::storage::config_store::read_config(&dir).ok())
        .map(|config| config.guard)
        .unwrap_or_default();
    if !settings.enabled {
        return Err(ServerError::bad(
            "guard is disabled (`guard.enabled = false` in .board/config.json)",
        ));
    }

    let scope = if let Some(branch) = req.branch.as_deref() {
        barkcli_core::guard::branch_scope(&root, branch)
    } else if let Some(range) = req.range {
        barkcli_core::guard::diff::DiffScope::Range(range)
    } else if req.staged {
        barkcli_core::guard::diff::DiffScope::Staged
    } else {
        barkcli_core::guard::diff::DiffScope::Worktree
    };
    let options = barkcli_core::guard::GuardOptions::from_settings(scope, &settings);
    let report = barkcli_core::guard::scan(&root, &options)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(report).map_err(|e| ServerError::internal(e.to_string()))?,
    ))
}

#[derive(Deserialize)]
struct ReviewQueueQuery {
    #[serde(default)]
    board: Option<String>,
    #[serde(default)]
    all: Option<bool>,
    #[serde(default)]
    limit: Option<usize>,
}

async fn review_queue_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ReviewQueueQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, query.board)?;
    let board = barkcli_core::storage::board_file::read_board(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let mut items = barkcli_core::commands::review_queue::build_queue(
        &root,
        &board,
        &board_name,
        query.all.unwrap_or(false),
    )
    .map_err(|e| ServerError::internal(e.to_string()))?;
    if let Some(limit) = query.limit {
        items.truncate(limit);
    }
    Ok(Json(serde_json::json!({ "items": items })))
}

async fn editor_detect_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let editors = barkcli_core::editor::editors();
    Ok(Json(serde_json::json!({
        "editors": editors,
        "preferred": std::env::var("BARKCLI_EDITOR").ok(),
    })))
}

#[derive(Deserialize)]
struct OpenFileRequest {
    path: String,
    #[serde(default)]
    line: Option<u32>,
    #[serde(default)]
    editor: Option<String>,
    /// Open inside this run's worktree instead of the project root.
    #[serde(default)]
    run_id: Option<String>,
}

async fn open_file_handler(
    Json(req): Json<OpenFileRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = if let Some(run_id) = req.run_id.as_deref() {
        let run = barkcli_core::runtime::RuntimeStore::from_project()
            .map_err(|e| ServerError::internal(e.to_string()))?
            .load_run(run_id)
            .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
        run.worktree
            .map(std::path::PathBuf::from)
            .ok_or_else(|| ServerError::bad("this run has no worktree"))?
    } else {
        barkcli_core::repo::project_root()
            .map_err(|e| ServerError::internal(e.to_string()))?
    };
    let editor = barkcli_core::editor::open_file_in_root(
        &root,
        &req.path,
        req.line,
        req.editor.as_deref(),
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({
        "opened": true,
        "path": barkcli_core::repo::normalize_relative(&req.path)
            .map_err(|e| ServerError::bad(e.to_string()))?,
        "editor": editor,
    })))
}

#[derive(Deserialize)]
struct RepoTreeQuery {
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    depth: Option<usize>,
}

async fn repo_tree_handler(
    Query(query): Query<RepoTreeQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let entries = barkcli_core::repo::list_tree(
        &root,
        query.path.as_deref().unwrap_or("."),
        query.depth.unwrap_or(4),
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({ "root": root, "entries": entries })))
}

#[derive(Deserialize)]
struct RepoFileQuery {
    path: String,
    #[serde(default)]
    max_bytes: Option<usize>,
}

async fn repo_file_handler(
    Query(query): Query<RepoFileQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let file = barkcli_core::repo::read_file(
        &root,
        &query.path,
        query.max_bytes.unwrap_or(200_000).clamp(1024, 2_000_000),
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(file).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn git_status_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let status = barkcli_core::repo::git_status(&root)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(status).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn git_worktrees_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let worktrees = barkcli_core::repo::git_worktrees(&root)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(worktrees).unwrap_or_else(|_| serde_json::json!([])),
    ))
}

#[derive(Deserialize)]
struct GitCommitRequest {
    message: String,
    #[serde(default)]
    paths: Vec<String>,
    #[serde(default)]
    card_id: Option<String>,
}

async fn git_commit_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<GitCommitRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let commit = barkcli_core::repo::git_commit(&root, &req.message, &req.paths)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    if let Some(card_id) = req.card_id.filter(|id| !id.trim().is_empty()) {
        let board_name = resolve_board_name(&state, params.name)?;
        let _ = barkcli_core::storage::board_file::update_board(&board_name, |board| {
            if let Some(card) = board.cards.iter_mut().find(|card| card.id == card_id) {
                card.labels.push(format!("commit:{}", commit.sha));
                card.updated_at = Utc::now();
            }
            Ok(())
        });
    }
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "sha": commit.sha,
        "message": commit.message,
        "files": commit.files,
    })))
}

#[derive(Deserialize)]
struct GitPushRequest {
    #[serde(default)]
    remote: Option<String>,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    dry_run: bool,
    #[serde(default)]
    confirm: bool,
}

async fn git_push_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<GitPushRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if !req.dry_run && !req.confirm {
        return Err(ServerError::bad("push requires confirm=true"));
    }
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let status = barkcli_core::repo::git_status(&root)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let remote = req.remote.unwrap_or_else(|| "origin".into());
    let branch = req.branch.unwrap_or(status.branch);
    let output = barkcli_core::repo::git_push(&root, &remote, &branch, req.dry_run)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "remote": remote,
        "branch": branch,
        "dry_run": req.dry_run,
        "output": output,
    })))
}

#[derive(Deserialize)]
struct GitMergeRequest {
    branch: String,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    confirm: bool,
}

async fn git_merge_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<GitMergeRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if !req.confirm {
        return Err(ServerError::bad("merge requires confirm=true"));
    }
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let status = barkcli_core::repo::git_status(&root)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    if !status.clean {
        return Err(ServerError::bad(
            "commit or stash working tree changes before merging",
        ));
    }
    let output = barkcli_core::repo::git_merge(&root, &req.branch, req.message.as_deref())
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "branch": req.branch,
        "output": output,
        "head": barkcli_core::repo::git_status(&root).ok().map(|status| status.head),
    })))
}

#[derive(Deserialize)]
struct GitPrRequest {
    title: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    base: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    dry_run: bool,
    #[serde(default)]
    confirm: bool,
}

async fn git_pr_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<GitPrRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if !req.dry_run && !req.confirm {
        return Err(ServerError::bad("creating a pull request requires confirm=true"));
    }
    let root = barkcli_core::repo::project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let output = barkcli_core::repo::git_pr(
        &root,
        &req.title,
        req.body.as_deref().unwrap_or(""),
        req.base.as_deref(),
        req.draft,
        req.dry_run,
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "dry_run": req.dry_run,
        "output": output,
    })))
}

// ---------------------------------------------------------------------------
// Product team and orchestra (M3)
// ---------------------------------------------------------------------------

async fn list_roles_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let roles = barkcli_core::agent::RoleRegistry::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(roles.roles).unwrap_or(serde_json::json!([])),
    ))
}

async fn list_profiles_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let profiles = barkcli_core::agent::ProfileStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .list()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(profiles).unwrap_or(serde_json::json!([])),
    ))
}

async fn save_profile_handler(
    State(state): State<Arc<AppState>>,
    Json(mut profile): Json<barkcli_core::agent::AgentProfile>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if profile.id.trim().is_empty() {
        profile.id = barkcli_core::util::slug::to_slug(&profile.name);
    }
    if profile.id.trim().is_empty() {
        return Err(ServerError::bad("agent name is required"));
    }
    let roles = barkcli_core::agent::RoleRegistry::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    if !roles.validate_role(&profile.role) {
        return Err(ServerError::bad(format!(
            "unknown role '{}'",
            profile.role
        )));
    }
    profile.capacity = profile.capacity.clamp(1, 8);
    let saved = barkcli_core::agent::ProfileStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .save(profile)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(saved).unwrap_or(serde_json::json!(null)),
    ))
}

async fn default_team_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let profiles = barkcli_core::agent::ProfileStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .ensure_default_team()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "profiles": profiles })))
}

#[derive(Deserialize)]
struct ProfileStatusRequest {
    status: barkcli_core::agent::ProfileStatus,
}

async fn profile_status_handler(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(req): Json<ProfileStatusRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let saved = barkcli_core::agent::ProfileStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .set_status(&profile_id, req.status)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(saved).unwrap_or(serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct AssignAgentRequest {
    #[serde(default)]
    plan_id: Option<String>,
    #[serde(default)]
    task_id: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    files: Vec<String>,
}

async fn assign_agent_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<AssignAgentRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    if let (Some(plan_id), Some(task_id)) = (req.plan_id.as_deref(), req.task_id.as_deref()) {
        let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
            .map_err(|e| ServerError::internal(e.to_string()))?;
        let ranked = service
            .assignments(plan_id, task_id)
            .map_err(|e| ServerError::bad(e.to_string()))?;
        return Ok(Json(serde_json::json!({ "recommendations": ranked })));
    }
    let role = req
        .role
        .ok_or_else(|| ServerError::bad("role is required for a new task recommendation"))?;
    let mut task = barkcli_core::agent::PlanTask::new(
        "preview",
        req.title.unwrap_or_else(|| "Task".into()),
        role,
    );
    task.description = req.description.unwrap_or_default();
    task.labels = req.labels;
    task.files = req.files;
    let profiles = barkcli_core::agent::ProfileStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .list()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let ranked = barkcli_core::agent::rank_agents(
        &task,
        &profiles,
        &std::collections::HashMap::new(),
        &std::collections::HashMap::new(),
    );
    Ok(Json(serde_json::json!({ "recommendations": ranked })))
}

#[derive(Deserialize)]
struct OrchestraQuery {
    name: Option<String>,
    #[serde(default)]
    auto_dispatch: bool,
}

async fn orchestra_snapshot_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<OrchestraQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let snapshot = service
        .snapshot(params.auto_dispatch)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(snapshot).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize, Default)]
struct OrchestraTickRequest {
    #[serde(default = "default_true")]
    auto_dispatch: bool,
}

fn default_true() -> bool {
    true
}

async fn orchestra_tick_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<OrchestraTickRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let snapshot = service
        .snapshot(req.auto_dispatch)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    if req.auto_dispatch {
        let _ = state.tx.send("reload".to_string());
    }
    Ok(Json(
        serde_json::to_value(snapshot).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct CreateOrchestraPlanRequest {
    #[serde(default)]
    card_id: Option<String>,
    #[serde(default)]
    plan: Option<barkcli_core::agent::ProductPlan>,
}

async fn create_orchestra_plan_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<CreateOrchestraPlanRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let plan = if let Some(mut plan) = req.plan {
        if plan.parent_card_id.trim().is_empty() {
            if let Some(card_id) = req.card_id {
                plan.parent_card_id = card_id;
            }
        }
        service
            .create_plan_from(plan)
            .map_err(|e| ServerError::bad(e.to_string()))?
    } else {
        let card_id = req
            .card_id
            .ok_or_else(|| ServerError::bad("card_id or plan is required"))?;
        service
            .create_plan(&card_id)
            .map_err(|e| ServerError::bad(e.to_string()))?
    };
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(plan).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn get_orchestra_plan_handler(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let plan = service
        .reconcile_plan(&plan_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(
        serde_json::to_value(plan).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn approve_orchestra_plan_handler(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let plan = service
        .approve_plan(&plan_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(plan).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn dispatch_orchestra_plan_handler(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let tx = state.thread_tx.clone();
    let sink: barkcli_core::runtime::ThreadSink = Arc::new(move |event| {
        let _ = tx.send(event);
    });
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let report = service
        .dispatch_plan(&plan_id, Some(sink))
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(report).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn cancel_orchestra_plan_handler(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let plan = service
        .cancel_plan(&plan_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(plan).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct AssignOrchestraTaskRequest {
    agent_id: String,
}

async fn assign_orchestra_task_handler(
    State(state): State<Arc<AppState>>,
    Path((plan_id, task_id)): Path<(String, String)>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<AssignOrchestraTaskRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let plan = service
        .assign_task(&plan_id, &task_id, &req.agent_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(plan).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

async fn orchestra_task_assignments_handler(
    State(state): State<Arc<AppState>>,
    Path((plan_id, task_id)): Path<(String, String)>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let ranked = service
        .assignments(&plan_id, &task_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    Ok(Json(serde_json::json!({ "recommendations": ranked })))
}

async fn retry_orchestra_task_handler(
    State(state): State<Arc<AppState>>,
    Path((plan_id, task_id)): Path<(String, String)>,
    Query(params): Query<BoardQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let plan = service
        .retry_task(&plan_id, &task_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let report = service
        .dispatch_plan(&plan_id, None)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "plan": plan, "report": report })))
}

#[derive(Deserialize)]
struct AnswerQuestionRequest {
    answer: String,
}

async fn answer_orchestra_question_handler(
    State(state): State<Arc<AppState>>,
    Path((plan_id, question_id)): Path<(String, String)>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<AnswerQuestionRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let service = barkcli_core::agent::OrchestraService::from_project(&board_name)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let plan = service
        .answer_question(&plan_id, &question_id, &req.answer)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(
        serde_json::to_value(plan).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct ApproveRunRequest {
    approved: bool,
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    merge: bool,
}

async fn approve_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Query(params): Query<BoardQuery>,
    Json(req): Json<ApproveRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, params.name)?;
    let run = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .load_run(&run_id)
        .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let event = barkcli_core::threads::ThreadEvent::new(
        &run.card_id,
        barkcli_core::threads::ThreadEventKind::ApprovalResolved,
        "you",
        if req.approved {
            "Approved merge".to_string()
        } else {
            "Rejected merge".to_string()
        },
        Some(serde_json::json!({
            "run_id": run.id,
            "approved": req.approved,
            "note": req.note,
            "kind": "merge",
        })),
    );
    let _ = barkcli_core::threads::append_event_to_dir(
        &board_dir.join("threads"),
        &run.card_id,
        &event,
    );
    let _ = state.thread_tx.send(event);
    let mut outcome = None;
    if req.approved && req.merge {
        let service = barkcli_core::runtime::RunService::from_project(&board_name)
            .map_err(|e| ServerError::internal(e.to_string()))?;
        outcome = Some(
            service
                .merge(&run_id, true)
                .map_err(|e| ServerError::bad(e.to_string()))?,
        );
    }
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "approved": req.approved,
        "merged": outcome.is_some(),
        "outcome": outcome,
    })))
}

#[derive(Deserialize)]
struct AnswerRunRequest {
    text: String,
}

async fn answer_run_handler(
    State(state): State<Arc<AppState>>,
    Path(run_id): Path<String>,
    Json(req): Json<AnswerRunRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let run = barkcli_core::runtime::RuntimeStore::from_project()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .load_run(&run_id)
        .map_err(|e| ServerError::bad(format!("run not found: {e}")))?;
    let board_dir = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let event = barkcli_core::threads::ThreadEvent::new(
        &run.card_id,
        barkcli_core::threads::ThreadEventKind::Answer,
        "you",
        &req.text,
        Some(serde_json::json!({ "run_id": run.id })),
    );
    let _ = barkcli_core::threads::append_event_to_dir(
        &board_dir.join("threads"),
        &run.card_id,
        &event,
    );
    let _ = state.thread_tx.send(event.clone());
    Ok(Json(
        serde_json::to_value(event).unwrap_or_else(|_| serde_json::json!(null)),
    ))
}

#[derive(Deserialize)]
struct ChatThreadRequest {
    text: String,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    skip_user_event: bool,
    #[serde(default)]
    board: Option<String>,
}

fn persist_chat_event(
    card_id: &str,
    tx: &broadcast::Sender<barkcli_core::threads::ThreadEvent>,
    event: &barkcli_core::threads::ThreadEvent,
) {
    let _ = barkcli_core::threads::append_event(card_id, event);
    let _ = tx.send(event.clone());
}

/// One read-only conversation turn with the selected local agent CLI.
/// The provider runs in the project root with `plan` permissions; it never
/// gets a worktree, a commit, or a merge. Build work still goes through the
/// worktree runner.
async fn chat_thread_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Json(req): Json<ChatThreadRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let text = req.text.trim().to_string();
    if text.is_empty() {
        return Err(ServerError::bad("message text required"));
    }
    if state
        .chat
        .lock()
        .map_err(|_| ServerError::internal("chat state is poisoned"))?
        .contains_key(&card_id)
    {
        return Err(ServerError::bad(
            "this thread is already waiting for a reply; stop it or wait",
        ));
    }

    let board_name = resolve_board_name(&state, req.board.clone())?;
    let provider = match req.provider.as_deref().unwrap_or("opencode").to_lowercase().as_str() {
        "claude" | "claude-code" => "claude-code".to_string(),
        other => other.to_string(),
    };
    let registry = barkcli_core::runtime::ProviderRegistry::standard();
    let adapter = registry
        .get(&provider)
        .ok_or_else(|| ServerError::bad(format!("unknown provider: {provider}")))?;
    let status = adapter.probe();
    if !status.available {
        return Err(ServerError::bad(format!(
            "{} is not installed. Install it or choose another local agent.",
            status.name
        )));
    }
    if status.authenticated == Some(false) {
        return Err(ServerError::bad(
            status
                .auth_hint
                .clone()
                .unwrap_or_else(|| format!("{} is not signed in.", status.name)),
        ));
    }
    let board = read_board(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    if !board.cards.iter().any(|card| card.id == card_id) {
        return Err(ServerError::bad(format!("card '{card_id}' not found")));
    }

    let user_ev = barkcli_core::threads::ThreadEvent::new(
        &card_id,
        barkcli_core::threads::ThreadEventKind::User,
        "you",
        &text,
        Some(serde_json::json!({
            "mode": "ask",
            "provider": provider,
            "files": req.files,
        })),
    );
    if !req.skip_user_event {
        persist_chat_event(&card_id, &state.thread_tx, &user_ev);
    }

    let prepared = barkcli_core::runtime::chat::prepare_chat(
        &barkcli_core::runtime::ChatRequest {
            card_id: card_id.clone(),
            text: text.clone(),
            provider: provider.clone(),
            model: req.model.clone(),
            files: req.files.clone(),
            board_name: Some(board_name.clone()),
        },
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;
    let turn_id = prepared.turn_id.clone();
    let session = Arc::new(StdMutex::new(prepared.session.clone()));
    let session_for_sink = session.clone();
    let buffer = Arc::new(StdMutex::new(String::new()));
    let buffer_for_sink = buffer.clone();
    let final_seen = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let final_for_sink = final_seen.clone();
    let failed_seen = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let failed_for_sink = failed_seen.clone();
    let tx_for_sink = state.thread_tx.clone();
    let card_for_sink = card_id.clone();
    let turn_for_sink = turn_id.clone();
    let provider_for_sink = provider.clone();
    let model_for_sink = prepared.start.model.clone();
    let sink: barkcli_core::runtime::EventSink = Arc::new(move |event| {
        match &event {
            barkcli_core::runtime::RuntimeEvent::Assistant { text, partial } => {
                if *partial {
                    if let Ok(mut buffer) = buffer_for_sink.lock() {
                        buffer.push_str(text);
                    }
                    let mut delta = barkcli_core::threads::ThreadEvent::new(
                        &card_for_sink,
                        barkcli_core::threads::ThreadEventKind::AssistantDelta,
                        &provider_for_sink,
                        text.clone(),
                        None,
                    );
                    delta.run_id = Some(turn_for_sink.clone());
                    delta.turn_id = Some(turn_for_sink.clone());
                    let _ = tx_for_sink.send(delta);
                } else {
                    if let Ok(mut buffer) = buffer_for_sink.lock() {
                        buffer.clear();
                    }
                    final_for_sink.store(true, Ordering::SeqCst);
                    let mut event = barkcli_core::threads::ThreadEvent::new(
                        &card_for_sink,
                        barkcli_core::threads::ThreadEventKind::Assistant,
                        &provider_for_sink,
                        text.clone(),
                        Some(serde_json::json!({ "provider": provider_for_sink, "mode": "ask" })),
                    );
                    event.run_id = Some(turn_for_sink.clone());
                    event.turn_id = Some(turn_for_sink.clone());
                    persist_chat_event(&card_for_sink, &tx_for_sink, &event);
                }
            }
            barkcli_core::runtime::RuntimeEvent::ToolCall { .. } => {
                let mut event = barkcli_core::threads::ThreadEvent::new(
                    &card_for_sink,
                    barkcli_core::threads::ThreadEventKind::ToolCall,
                    &provider_for_sink,
                    event.summary(),
                    serde_json::to_value(&event).ok(),
                );
                event.run_id = Some(turn_for_sink.clone());
                event.turn_id = Some(turn_for_sink.clone());
                persist_chat_event(&card_for_sink, &tx_for_sink, &event);
            }
            barkcli_core::runtime::RuntimeEvent::ApprovalRequested { .. }
            | barkcli_core::runtime::RuntimeEvent::Question { .. } => {
                let mut event = barkcli_core::threads::ThreadEvent::new(
                    &card_for_sink,
                    event.thread_kind(),
                    &provider_for_sink,
                    event.summary(),
                    serde_json::to_value(&event).ok(),
                );
                event.run_id = Some(turn_for_sink.clone());
                event.turn_id = Some(turn_for_sink.clone());
                persist_chat_event(&card_for_sink, &tx_for_sink, &event);
            }
            barkcli_core::runtime::RuntimeEvent::Failed { message, .. } => {
                failed_for_sink.store(true, Ordering::SeqCst);
                let mut event = barkcli_core::threads::ThreadEvent::new(
                    &card_for_sink,
                    barkcli_core::threads::ThreadEventKind::RunFailed,
                    &provider_for_sink,
                    message.clone(),
                    serde_json::to_value(&event).ok(),
                );
                event.run_id = Some(turn_for_sink.clone());
                event.turn_id = Some(turn_for_sink.clone());
                persist_chat_event(&card_for_sink, &tx_for_sink, &event);
            }
            barkcli_core::runtime::RuntimeEvent::Interrupted => {
                let mut event = barkcli_core::threads::ThreadEvent::new(
                    &card_for_sink,
                    barkcli_core::threads::ThreadEventKind::RunInterrupted,
                    &provider_for_sink,
                    "Reply stopped.",
                    None,
                );
                event.run_id = Some(turn_for_sink.clone());
                event.turn_id = Some(turn_for_sink.clone());
                persist_chat_event(&card_for_sink, &tx_for_sink, &event);
            }
            barkcli_core::runtime::RuntimeEvent::Usage { .. } => {
                let mut event = barkcli_core::threads::ThreadEvent::new(
                    &card_for_sink,
                    barkcli_core::threads::ThreadEventKind::Usage,
                    &provider_for_sink,
                    event.summary(),
                    serde_json::to_value(&event).ok(),
                );
                event.run_id = Some(turn_for_sink.clone());
                event.turn_id = Some(turn_for_sink.clone());
                persist_chat_event(&card_for_sink, &tx_for_sink, &event);
            }
            barkcli_core::runtime::RuntimeEvent::Log { level, message } => {
                if level == "stderr" || message.to_lowercase().contains("error") {
                    let mut event = barkcli_core::threads::ThreadEvent::new(
                        &card_for_sink,
                        barkcli_core::threads::ThreadEventKind::Log,
                        &provider_for_sink,
                        message.clone(),
                        Some(serde_json::json!({ "level": level })),
                    );
                    event.run_id = Some(turn_for_sink.clone());
                    event.turn_id = Some(turn_for_sink.clone());
                    persist_chat_event(&card_for_sink, &tx_for_sink, &event);
                }
            }
            barkcli_core::runtime::RuntimeEvent::Session { id } => {
                if let Ok(mut saved) = session_for_sink.lock() {
                    saved.session_id = id.clone();
                    saved.provider = provider_for_sink.clone();
                    saved.model = model_for_sink.clone();
                    let _ = barkcli_core::runtime::chat::write_session(&card_for_sink, &saved);
                }
            }
            _ => {}
        }
    });

    let handle = adapter
        .start(prepared.start.clone(), sink)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let pid = handle.pid();

    let start_ev = {
        let mut event = barkcli_core::threads::ThreadEvent::new(
            &card_id,
            barkcli_core::threads::ThreadEventKind::RunStarted,
            &provider,
            format!("{} is reading the project…", status.name),
            Some(serde_json::json!({ "mode": "ask" })),
        );
        event.run_id = Some(turn_id.clone());
        event.turn_id = Some(turn_id.clone());
        event
    };
    persist_chat_event(&card_id, &state.thread_tx, &start_ev);

    state
        .chat
        .lock()
        .map_err(|_| ServerError::internal("chat state is poisoned"))?
        .insert(
            card_id.clone(),
            ChatRuntime {
                pid,
                turn_id: turn_id.clone(),
                provider: provider.clone(),
            },
        );

    let chat_state = state.chat.clone();
    let tx_done = state.thread_tx.clone();
    let card_done = card_id.clone();
    let turn_done = turn_id.clone();
    let provider_done = provider.clone();
    let buffer_done = buffer.clone();
    let final_done = final_seen.clone();
    std::thread::spawn(move || {
        let outcome = handle.wait();
        if !final_done.load(Ordering::SeqCst) {
            let text = buffer_done
                .lock()
                .map(|buffer| buffer.clone())
                .unwrap_or_default();
            if !text.trim().is_empty() {
                let mut event = barkcli_core::threads::ThreadEvent::new(
                    &card_done,
                    barkcli_core::threads::ThreadEventKind::Assistant,
                    &provider_done,
                    text,
                    Some(serde_json::json!({ "provider": provider_done, "mode": "ask" })),
                );
                event.run_id = Some(turn_done.clone());
                event.turn_id = Some(turn_done.clone());
                persist_chat_event(&card_done, &tx_done, &event);
            }
        }
        if let Err(error) = outcome {
            if !failed_seen.load(Ordering::SeqCst) {
                let mut event = barkcli_core::threads::ThreadEvent::new(
                    &card_done,
                    barkcli_core::threads::ThreadEventKind::RunFailed,
                    &provider_done,
                    error.to_string(),
                    None,
                );
                event.run_id = Some(turn_done.clone());
                event.turn_id = Some(turn_done.clone());
                persist_chat_event(&card_done, &tx_done, &event);
            }
        }
        let mut done = barkcli_core::threads::ThreadEvent::new(
            &card_done,
            barkcli_core::threads::ThreadEventKind::Custom("chat_done".into()),
            "barkcli",
            "",
            Some(serde_json::json!({ "turn_id": turn_done })),
        );
        done.run_id = Some(turn_done.clone());
        done.turn_id = Some(turn_done);
        persist_chat_event(&card_done, &tx_done, &done);
        if let Ok(mut chat) = chat_state.lock() {
            chat.remove(&card_done);
        }
    });

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "turn_id": turn_id,
        "provider": provider,
        "board": board_name,
        "mode": "ask",
    })))
}

async fn stop_chat_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let runtime = state
        .chat
        .lock()
        .map_err(|_| ServerError::internal("chat state is poisoned"))?
        .get(&card_id)
        .cloned();
    let Some(runtime) = runtime else {
        return Err(ServerError::bad("no active chat on this thread"));
    };
    if let Some(pid) = runtime.pid {
        let _ = std::process::Command::new("kill")
            .args(["-INT", &pid.to_string()])
            .status();
    }
    Ok(Json(serde_json::json!({
        "ok": true,
        "turn_id": runtime.turn_id,
        "provider": runtime.provider,
    })))
}

#[derive(Deserialize)]
struct ExecRequest {
    command: String,
    #[serde(default)]
    timeout_secs: Option<u64>,
}

fn cap_command_output(output: &[u8]) -> String {
    const MAX: usize = 200_000;
    let text = String::from_utf8_lossy(output);
    let mut capped: String = text.chars().take(MAX).collect();
    if text.chars().count() > MAX {
        capped.push_str("\n… output truncated");
    }
    capped
}

async fn exec_handler(
    Json(req): Json<ExecRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let command = req.command.trim();
    if command.is_empty() {
        return Err(ServerError::bad("command is required"));
    }
    if command.len() > 4096 {
        return Err(ServerError::bad("command is too long"));
    }
    let root = project_root_or_cwd();
    let timeout_secs = req.timeout_secs.unwrap_or(120).clamp(1, 600);
    let started = Instant::now();
    let child = tokio::process::Command::new("sh")
        .arg("-lc")
        .arg(command)
        .current_dir(&root)
        .kill_on_drop(true)
        .output();
    let output = tokio::time::timeout(Duration::from_secs(timeout_secs), child).await;
    let duration_ms = started.elapsed().as_millis() as u64;
    match output {
        Ok(Ok(output)) => Ok(Json(serde_json::json!({
            "ok": output.status.success(),
            "command": command,
            "exit_code": output.status.code(),
            "stdout": cap_command_output(&output.stdout),
            "stderr": cap_command_output(&output.stderr),
            "duration_ms": duration_ms,
            "timed_out": false,
            "cwd": root.display().to_string(),
        }))),
        Ok(Err(error)) => Err(ServerError::bad(format!("command failed to start: {error}"))),
        Err(_) => Ok(Json(serde_json::json!({
            "ok": false,
            "command": command,
            "exit_code": serde_json::Value::Null,
            "stdout": "",
            "stderr": format!("Command timed out after {timeout_secs}s."),
            "duration_ms": duration_ms,
            "timed_out": true,
            "cwd": root.display().to_string(),
        }))),
    }
}

#[derive(Deserialize)]
struct AddScheduleRequest {
    intent: String,
    every: String,
    #[serde(default)]
    backend: Option<String>,
    #[serde(default)]
    board: Option<String>,
}

async fn list_schedules_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let entries = barkcli_core::commands::schedule::read_schedules()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::to_value(entries).unwrap_or(serde_json::json!([]))))
}

async fn add_schedule_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AddScheduleRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board.clone())?;
    let backend = req.backend.unwrap_or_else(|| "opencode".into());
    let entry = barkcli_core::commands::schedule::add_schedule(
        &board_name,
        &req.intent,
        &req.every,
        &backend,
    )
    .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::to_value(entry).unwrap_or(serde_json::json!(null))))
}

async fn delete_schedule_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    barkcli_core::commands::schedule::remove_schedule(&id)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn run_schedules_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let ran = barkcli_core::commands::schedule::run_due_once()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true, "ran": ran})))
}

#[derive(Deserialize)]
struct AddRuleRequest {
    title: String,
    body: String,
}

async fn list_rules_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let rules = barkcli_core::commands::rules::read_rules()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({
        "rules": rules
            .into_iter()
            .map(|rule| serde_json::json!({"title": rule.title, "body": rule.body}))
            .collect::<Vec<_>>()
    })))
}

async fn add_rule_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AddRuleRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    barkcli_core::commands::rules::add_rule(&req.title, &req.body)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn delete_rule_handler(
    State(state): State<Arc<AppState>>,
    Path(title): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    barkcli_core::commands::rules::remove_rule(&title)
        .map_err(|e| ServerError::bad(e.to_string()))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn create_thread_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateThreadRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let text = req.text.trim();
    if text.is_empty() {
        return Err(ServerError::bad("text required"));
    }
    let board_name = resolve_board_name(&state, req.board.clone())?;
    let b_name = req.backend.unwrap_or_else(|| "board".to_string()).to_lowercase();
    let k_name = req.kind.unwrap_or_else(|| "feature".to_string()).to_lowercase();
    let mode = req.mode.unwrap_or_else(|| "plan_first".to_string()).to_lowercase();

    let mut card_id = String::new();
    barkcli_core::storage::board_file::update_board(&board_name, |b| {
        let existing_ids: Vec<String> = b.cards.iter().map(|c| c.id.clone()).collect();
        let fresh_id = barkcli_core::util::slug::unique_slug(text, &existing_ids);
        card_id = fresh_id.clone();
        let mut card = barkcli_core::models::card::Card::new(&fresh_id, text, "todo");
        card.description = Some(text.to_string());
        card.assignee = Some(b_name.clone());
        card.labels = vec![format!("agent:{}", b_name), format!("type:{}", k_name)];
        b.cards.push(card);
        Ok(())
    }).map_err(|e| ServerError::internal(e.to_string()))?;

    let user_event = barkcli_core::threads::ThreadEvent::new(
        &card_id,
        barkcli_core::threads::ThreadEventKind::User,
        "you",
        text,
        Some(serde_json::json!({
            "backend": b_name,
            "model": req.model,
            "kind": k_name,
            "mode": mode,
        })),
    );
    let _ = barkcli_core::threads::append_event(&card_id, &user_event);
    let _ = state.thread_tx.send(user_event.clone());

    if mode == "chat" {
        // A read-only conversation, not an implementation intent. The first
        // reply comes from /api/threads/:id/chat.
    } else if mode == "plan_and_run" || mode == "auto" {
        let tx = state.thread_tx.clone();
        let sink: barkcli_core::runtime::ThreadSink = Arc::new(move |event| { let _ = tx.send(event); });
        barkcli_core::runtime::RunService::from_project(&board_name)
            .and_then(|service| service.start_for_card(&card_id, barkcli_core::runtime::CreateRunRequest {
                provider: Some(b_name.clone()), model: req.model.clone(), ..Default::default()
            }, Some(sink)))
            .map_err(|error| ServerError::bad(error.to_string()))?;
    } else {
        let mut st = barkcli_core::agent::autopilot::AutopilotState::load(&board_name);
        if let Ok(proposal) = st.propose(&board_name, &card_id, "planner") {
            let plan_ev = barkcli_core::threads::ThreadEvent::new(
                &card_id,
                barkcli_core::threads::ThreadEventKind::PlanProposed,
                "barkcli",
                format!("Proposed plan with {} child tasks", proposal.children.len()),
                Some(serde_json::to_value(&proposal).unwrap_or_default()),
            );
            let _ = barkcli_core::threads::append_event(&card_id, &plan_ev);
            let _ = state.thread_tx.send(plan_ev);
        }
    }

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "thread_id": card_id,
        "card_id": card_id,
        "board": board_name,
        "backend": b_name,
        "status": "created",
    })))
}

#[derive(Deserialize)]
struct PostMessageRequest {
    text: String,
    author: Option<String>,
    board: Option<String>,
    backend: Option<String>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    model: Option<String>,
}

async fn post_thread_message_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Json(req): Json<PostMessageRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let text = req.text.trim();
    if text.is_empty() {
        return Err(ServerError::bad("message text required"));
    }
    let author = req.author.unwrap_or_else(|| "you".to_string());
    let user_ev = barkcli_core::threads::ThreadEvent::new(
        &card_id,
        barkcli_core::threads::ThreadEventKind::User,
        &author,
        text,
        Some(serde_json::json!({ "backend": req.backend, "model": req.model, "mode": req.mode })),
    );
    barkcli_core::threads::append_event(&card_id, &user_ev)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let _ = state.thread_tx.send(user_ev.clone());

    let board_name = resolve_board_name(&state, req.board)?;
    // Planning is explicit and offline. Ordinary messages never infer execution
    // approval from words such as "yes" or "proceed".
    if req.mode.as_deref() == Some("plan_first") {
        barkcli_core::storage::board_file::update_board(&board_name, |board| {
            let card = board.cards.iter_mut().find(|card| card.id == card_id)
                .ok_or_else(|| anyhow::anyhow!("thread card not found"))?;
            let previous = card.description.clone().unwrap_or_default();
            card.description = Some(format!("{previous}\n\nChange request:\n{text}"));
            card.touch();
            Ok(())
        }).map_err(|error| ServerError::bad(error.to_string()))?;
        let mut planner = barkcli_core::agent::autopilot::AutopilotState::load(&board_name);
        let proposal = planner.propose(&board_name, &card_id, "barkcli (offline)")
            .map_err(|error| ServerError::bad(error.to_string()))?;
        let event = barkcli_core::threads::ThreadEvent::new(&card_id,
            barkcli_core::threads::ThreadEventKind::PlanProposed, "barkcli", "Plan ready for review",
            serde_json::to_value(proposal).ok());
        barkcli_core::threads::append_event(&card_id, &event).map_err(|error| ServerError::internal(error.to_string()))?;
        let _ = state.thread_tx.send(event);
    }
    let _ = state.tx.send("reload".into());
    return Ok(Json(serde_json::to_value(&user_ev).unwrap_or_default()));
}

#[derive(Deserialize)]
struct StreamQuery {
    after_seq: Option<u64>,
}

async fn stream_thread_handler(
    State(state): State<Arc<AppState>>,
    Path(card_id): Path<String>,
    Query(params): Query<StreamQuery>,
) -> Sse<impl futures::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let after_seq = params.after_seq.unwrap_or(0);
    let existing_events = barkcli_core::threads::read_events(&card_id)
        .unwrap_or_default()
        .into_iter()
        .filter(|ev| ev.seq == 0 || ev.seq > after_seq)
        .collect::<Vec<_>>();
    let cid = card_id.clone();
    let initial_stream = futures::stream::iter(existing_events.into_iter().map(|ev| {
        Ok(Event::default().json_data(&ev).unwrap_or_else(|_| Event::default().data("{}")))
    }));

    let rx = state.thread_tx.subscribe();
    let live_stream = futures::stream::unfold((rx, cid, after_seq), |(mut rx, cid, after_seq)| async move {
        loop {
            match rx.recv().await {
                Ok(ev) => {
                    if ev.card_id == cid && (ev.seq == 0 || ev.seq > after_seq) {
                        let sse_ev: Result<Event, std::convert::Infallible> = Ok(
                            Event::default().json_data(&ev).unwrap_or_else(|_| Event::default().data("{}"))
                        );
                        return Some((sse_ev, (rx, cid, after_seq)));
                    }
                }
                Err(_) => return None,
            }
        }
    });

    let combined = initial_stream.chain(live_stream);
    Sse::new(combined).keep_alive(KeepAlive::default())
}

#[derive(Deserialize)]
struct TranscriptParams {
    lines: Option<usize>,
}

async fn session_transcript_handler(
    Path(session_id): Path<String>,
    Query(params): Query<TranscriptParams>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let session = barkcli_core::agent::load_session(&session_id)
        .map_err(|e| ServerError::bad(format!("session not found: {}", e)))?;
    let limit = params.lines.unwrap_or(50);
    let tail = barkcli_core::agent::session::transcript_tail(&session, limit);
    let total = session.transcript_path.as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| s.lines().count())
        .unwrap_or(tail.len());

    Ok(Json(serde_json::json!({
        "id": session_id,
        "status": session.status,
        "lines": tail,
        "total_lines": total,
        "transcript_path": session.transcript_path,
    })))
}

async fn task_diff_handler(
    Path(task_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let slug = barkcli_core::util::slug::to_slug(&task_id);
    let branch = format!("bark/{}", slug);
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;

    let revision = format!("HEAD...{}", branch);
    let output = std::process::Command::new("git")
        .args(&["diff", &revision])
        .current_dir(&root)
        .output();

    let diff_str = match output {
        Ok(out) if out.status.success() && !out.stdout.is_empty() => {
            String::from_utf8_lossy(&out.stdout).to_string()
        }
        _ => {
            let wt_path = root.join(".board").join("worktrees").join(&slug);
            if wt_path.exists() {
                std::process::Command::new("git")
                    .args(&["diff", "HEAD"])
                    .current_dir(&wt_path)
                    .output()
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                    .unwrap_or_default()
            } else {
                String::new()
            }
        }
    };

    let files: Vec<String> = diff_str
        .lines()
        .filter(|l| l.starts_with("diff --git"))
        .filter_map(|l| l.split_whitespace().last().map(|s| s.trim_start_matches("b/").to_string()))
        .collect();

    Ok(Json(serde_json::json!({
        "task_id": task_id,
        "branch": branch,
        "diff": diff_str,
        "files": files,
    })))
}

async fn session_stop_handler(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if let Ok(mut session) = barkcli_core::agent::load_session(&session_id) {
        if let Some(pid) = session.pid {
            let _ = std::process::Command::new("kill")
                .args(&["-15", &pid.to_string()])
                .output();
        }
        session.status = barkcli_core::agent::session::SessionStatus::Killed;
        let _ = barkcli_core::agent::save_session(&session);

        if let Some(ref cid) = session.task_id {
            let ev = barkcli_core::threads::ThreadEvent::new(
                cid,
                barkcli_core::threads::ThreadEventKind::Steer,
                "you",
                format!("Stopped agent session {}", session_id),
                Some(serde_json::json!({ "session_id": session_id, "action": "stop" })),
            );
            let _ = barkcli_core::threads::append_event(cid, &ev);
            let _ = state.thread_tx.send(ev);
        }
    }
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "ok": true, "session_id": session_id, "status": "stopped" })))
}

#[derive(Deserialize)]
struct SteerRequest {
    guidance: String,
    author: Option<String>,
}

async fn session_steer_handler(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(req): Json<SteerRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let session = barkcli_core::agent::load_session(&session_id)
        .map_err(|e| ServerError::bad(format!("session not found: {}", e)))?;
    let author = req.author.unwrap_or_else(|| "you".to_string());
    if let Some(ref cid) = session.task_id {
        let ev = barkcli_core::threads::ThreadEvent::new(
            cid,
            barkcli_core::threads::ThreadEventKind::Steer,
            &author,
            format!("Steering guidance: {}", req.guidance),
            Some(serde_json::json!({
                "session_id": session_id,
                "guidance": req.guidance,
                "task_id": session.task_id
            })),
        );
        let _ = barkcli_core::threads::append_event(cid, &ev);
        let _ = state.thread_tx.send(ev);
    }
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({ "ok": true, "session_id": session_id, "guidance": req.guidance })))
}

async fn session_fork_handler(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let session = barkcli_core::agent::load_session(&session_id)
        .map_err(|e| ServerError::bad(format!("session not found: {}", e)))?;
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let task_id = session.task_id.clone().unwrap_or_else(|| session.id.clone());
    let slug = barkcli_core::util::slug::to_slug(&task_id);
    let now = chrono::Utc::now().timestamp_millis();
    let fork_branch = format!("bark/{}-fork-{}", slug, now);

    let _ = std::process::Command::new("git")
        .args(&["branch", &fork_branch, "HEAD"])
        .current_dir(&root)
        .output();

    if let Some(ref cid) = session.task_id {
        let ev = barkcli_core::threads::ThreadEvent::new(
            cid,
            barkcli_core::threads::ThreadEventKind::Steer,
            "barkcli",
            format!("Forked task {} into alternate branch {}", task_id, fork_branch),
            Some(serde_json::json!({
                "action": "fork",
                "parent_session": session_id,
                "fork_branch": fork_branch
            })),
        );
        let _ = barkcli_core::threads::append_event(cid, &ev);
        let _ = state.thread_tx.send(ev);
    }

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "parent_session": session_id,
        "fork_branch": fork_branch
    })))
}

#[derive(Deserialize)]
struct RaceRequest {
    backend_a: Option<String>,
    backend_b: Option<String>,
    board: Option<String>,
    intent: Option<String>,
}

async fn task_race_handler(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
    Json(req): Json<RaceRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let board_name = resolve_board_name(&state, req.board)?;
    let b_a = req.backend_a.unwrap_or_else(|| "opencode".to_string());
    let b_b = req.backend_b.unwrap_or_else(|| "codex".to_string());
    let prompt = req.intent.unwrap_or_else(|| format!("Implement task {}", task_id));

    let ev = barkcli_core::threads::ThreadEvent::new(
        &task_id,
        barkcli_core::threads::ThreadEventKind::Steer,
        "barkcli",
        format!("Racing backends: {} vs {}. First to pass acceptance test gate will merge.", b_a, b_b),
        Some(serde_json::json!({
            "action": "race",
            "backend_a": b_a,
            "backend_b": b_b,
        })),
    );
    let _ = barkcli_core::threads::append_event(&task_id, &ev);
    let _ = state.thread_tx.send(ev);

    let b_name = board_name.clone();
    let cid = task_id.clone();
    let p_clone = prompt.clone();
    let ba_clone = b_a.clone();
    std::thread::spawn(move || {
        let _ = dispatch_backend_plan(&b_name, &cid, &ba_clone, &p_clone);
    });

    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({
        "ok": true,
        "task_id": task_id,
        "race_started": true,
        "backend_a": b_a,
        "backend_b": b_b,
    })))
}

async fn session_eval_handler(
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let session = barkcli_core::agent::load_session(&session_id)
        .map_err(|e| ServerError::bad(format!("session not found: {}", e)))?;
    let transcript = session.transcript_path.as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default();

    let lines_count = transcript.lines().count();
    let tool_calls = transcript.lines().filter(|l| l.contains("tool_call") || l.contains("execute") || l.contains("$ ")).count();
    let duration_ms = match session.ended_at {
        Some(end) => (end - session.started_at).num_milliseconds(),
        None => (chrono::Utc::now() - session.started_at).num_milliseconds(),
    }.max(0);
    let gate_passed = session.status == barkcli_core::agent::session::SessionStatus::Done;

    Ok(Json(serde_json::json!({
        "session_id": session_id,
        "status": session.status,
        "backend": session.backend.as_str(),
        "duration_ms": duration_ms,
        "transcript_lines": lines_count,
        "tool_calls": tool_calls,
        "gate_passed": gate_passed,
        "tests_passed": gate_passed,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use tower::ServiceExt;

    fn test_state(token: Option<&str>) -> Arc<AppState> {
        let (tx, _) = broadcast::channel(8);
        let (thread_tx, _) = broadcast::channel(8);
        Arc::new(AppState {
            board_name: None,
            host: "127.0.0.1".into(),
            token: token.map(str::to_string),
            tx,
            thread_tx,
            code_cache: Arc::new(Mutex::new(None)),
            chat: Arc::new(StdMutex::new(HashMap::new())),
            started_at: Instant::now(),
        })
    }

    /// The real auth middleware around the ping route plus a protected control
    /// route, so the public-route exemption is exercised, not just the handler.
    fn test_router(state: Arc<AppState>) -> Router {
        Router::new()
            .route("/api/ping", get(ping_handler))
            .route("/api/config", get(|| async { "config" }))
            .layer(middleware::from_fn_with_state(state.clone(), auth_layer))
            .with_state(state)
    }

    fn get_request(uri: &str) -> Request {
        Request::builder()
            .uri(uri)
            .body(axum::body::Body::empty())
            .unwrap()
    }

    #[test]
    fn ping_payload_matches_contract() {
        let now = DateTime::parse_from_rfc3339("2026-10-26T12:41:07.412900Z")
            .unwrap()
            .with_timezone(&Utc);
        let payload = ping_payload(Instant::now(), now);

        assert_eq!(payload.status, "ok");
        assert_eq!(payload.version, env!("CARGO_PKG_VERSION"));
        // Exactly millisecond precision, UTC, `Z` suffix.
        assert_eq!(payload.timestamp, "2026-10-26T12:41:07.412Z");
        assert!(payload.timestamp.ends_with('Z'));

        let parsed = DateTime::parse_from_rfc3339(&payload.timestamp).unwrap();
        assert_eq!(parsed.timestamp_millis(), now.timestamp_millis());
        assert_eq!(payload.uptime_seconds, 0);
    }

    #[tokio::test]
    async fn ping_route_is_public_and_uncacheable() {
        let app = test_router(test_state(Some("secret")));
        let res = app.oneshot(get_request("/api/ping")).await.unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );

        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["status"], "ok");
        assert_eq!(value["version"], env!("CARGO_PKG_VERSION"));
        assert!(value["uptime_seconds"].is_u64());
        let timestamp = value["timestamp"].as_str().unwrap();
        assert!(DateTime::parse_from_rfc3339(timestamp).is_ok());
        assert!(timestamp.ends_with('Z'));
    }

    #[tokio::test]
    async fn ping_exemption_does_not_leak_to_other_api_routes() {
        let app = test_router(test_state(Some("secret")));
        let res = app.oneshot(get_request("/api/config")).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn ping_exemption_is_exact_literal_not_a_prefix() {
        // `/api/ping/...` must stay protected so the public exemption cannot be
        // widened into a hole for future sub-routes.
        for uri in ["/api/ping/", "/api/ping/extra", "/api/pingx"] {
            let app = test_router(test_state(Some("secret")));
            let res = app.oneshot(get_request(uri)).await.unwrap();
            assert_eq!(res.status(), StatusCode::UNAUTHORIZED, "{} leaked", uri);
        }
    }

    #[tokio::test]
    async fn ping_ignores_a_bogus_token_query_param() {
        // Public means public: a stale `?token=` from a browser must not 401.
        let app = test_router(test_state(Some("secret")));
        let res = app
            .oneshot(get_request("/api/ping?token=stale"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn ping_timestamp_is_the_current_time() {
        let app = test_router(test_state(Some("secret")));
        let before = Utc::now();
        let res = app.oneshot(get_request("/api/ping")).await.unwrap();
        let after = Utc::now();

        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let ts = DateTime::parse_from_rfc3339(value["timestamp"].as_str().unwrap())
            .unwrap()
            .with_timezone(&Utc);

        // Freshly stamped, not a cached/constant value, and not in the future.
        // The payload truncates to milliseconds, so allow 1 ms of rounding.
        assert!(
            ts.timestamp_millis() >= before.timestamp_millis() - 1,
            "timestamp {} predates the request",
            ts
        );
        assert!(
            ts.timestamp_millis() <= after.timestamp_millis(),
            "timestamp {} is in the future",
            ts
        );
        assert!((after - ts).num_seconds() < 1);
    }

    #[tokio::test]
    async fn ping_uptime_reflects_process_age() {
        let started = Instant::now()
            .checked_sub(std::time::Duration::from_secs(90))
            .expect("platform clock supports subtraction");
        let payload = ping_payload(started, Utc::now());
        assert!(
            payload.uptime_seconds >= 90,
            "uptime {} should count from process start",
            payload.uptime_seconds
        );
    }

    #[tokio::test]
    async fn ping_head_returns_headers_only() {
        // Uptime monitors often probe with HEAD; axum's `get` route serves it.
        let app = test_router(test_state(Some("secret")));
        let req = Request::builder()
            .method("HEAD")
            .uri("/api/ping")
            .body(axum::body::Body::empty())
            .unwrap();
        let res = app.oneshot(req).await.unwrap();

        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            res.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        assert!(body.is_empty(), "HEAD must not carry a body");
    }

    #[test]
    fn ping_payload_exposes_only_liveness_fields() {
        // No board, config, or filesystem data may appear on the public route.
        let value = serde_json::to_value(ping_payload(Instant::now(), Utc::now())).unwrap();
        let mut keys: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(keys, ["status", "timestamp", "uptime_seconds", "version"]);
        assert_eq!(value["status"], "ok");
    }

    #[test]
    fn sanitize_accepts_safe_names() {
        assert!(sanitize_name("dev").is_ok());
        assert!(sanitize_name("my-board_2").is_ok());
        assert!(sanitize_name("a.b-c").is_ok());
        assert!(sanitize_name(&"x".repeat(64)).is_ok());
    }

    #[test]
    fn sanitize_rejects_traversal() {
        assert!(sanitize_name("").is_err());
        assert!(sanitize_name("../etc/passwd").is_err());
        assert!(sanitize_name("../../x").is_err());
        assert!(sanitize_name("/etc/passwd").is_err());
        assert!(sanitize_name("a/b").is_err());
        assert!(sanitize_name("a\\b").is_err());
        assert!(sanitize_name("x\0y").is_err());
        assert!(sanitize_name(&"x".repeat(65)).is_err());
        assert!(sanitize_name("dev board").is_err());
        assert!(sanitize_name("dev:board").is_err());
    }

    #[test]
    fn const_eq_compares_securely() {
        assert!(const_eq("abc", "abc"));
        assert!(!const_eq("abc", "abd"));
        assert!(!const_eq("abc", "ab"));
        assert!(!const_eq("", "a"));
        assert!(const_eq("", ""));
    }

    #[test]
    fn percent_decode_handles_encoded() {
        assert_eq!(percent_decode("hello"), "hello");
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("%2Fetc%2Fpasswd"), "/etc/passwd");
        assert_eq!(percent_decode("100%25"), "100%");
        assert_eq!(percent_decode("bad%zz"), "bad%zz");
        assert_eq!(percent_decode("+"), "+");
    }

    // ── Trust layer routes (SPEC-007) ──

    static CWD_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    static TEMP_PROJECT_SEQ: AtomicU64 = AtomicU64::new(0);

    /// A throwaway board project for the duration of one test. Restores the
    /// process working directory on drop, before removing the directory.
    struct TempProject {
        dir: std::path::PathBuf,
        prev: std::path::PathBuf,
        _lock: std::sync::MutexGuard<'static, ()>,
    }

    impl TempProject {
        fn root(&self) -> &std::path::Path {
            &self.dir
        }
    }

    impl Drop for TempProject {
        fn drop(&mut self) {
            let _ = std::env::set_current_dir(&self.prev);
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn with_temp_project() -> TempProject {
        let lock = CWD_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let dir = std::env::temp_dir().join(format!(
            "bark_server_trust_{}_{}_{}",
            std::process::id(),
            TEMP_PROJECT_SEQ.fetch_add(1, Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join(".board")).unwrap();
        std::fs::write(dir.join(".board").join("config.json"), r#"{"version":1}"#).unwrap();
        let git = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .current_dir(&dir)
                .args(args)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        };
        git(&["init", "-q"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        std::fs::write(dir.join("README.md"), "temp\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-q", "-m", "init"]);

        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&dir).unwrap();
        TempProject {
            dir,
            prev,
            _lock: lock,
        }
    }

    fn trust_router(state: Arc<AppState>) -> Router {
        Router::new()
            .route("/api/receipts", get(list_receipts_handler))
            .route("/api/receipts/{id}", get(get_receipt_handler))
            .route("/api/receipts/{id}/verify", post(verify_receipt_handler))
            .route("/api/guard/scan", post(guard_scan_handler))
            .route("/api/review/queue", get(review_queue_handler))
            .layer(middleware::from_fn_with_state(state.clone(), auth_layer))
            .with_state(state)
    }

    fn post_json_request(uri: &str, body: serde_json::Value) -> Request {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    }

    async fn json_body(res: Response) -> serde_json::Value {
        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn receipts_route_is_registered() {
        let _project = with_temp_project();
        let app = trust_router(test_state(None));
        let res = app.oneshot(get_request("/api/receipts")).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        assert_eq!(value["receipts"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn receipt_routes_require_auth() {
        for (method, uri) in [
            ("GET", "/api/receipts"),
            ("GET", "/api/receipts/rcpt_deadbeef0000"),
            ("POST", "/api/receipts/rcpt_deadbeef0000/verify"),
            ("POST", "/api/guard/scan"),
            ("GET", "/api/review/queue"),
        ] {
            let app = trust_router(test_state(Some("secret")));
            let request = if method == "POST" {
                post_json_request(uri, serde_json::json!({}))
            } else {
                get_request(uri)
            };
            let res = app.oneshot(request).await.unwrap();
            assert_eq!(res.status(), StatusCode::UNAUTHORIZED, "{uri} leaked");
        }
    }

    #[tokio::test]
    async fn guard_scan_rejects_both_range_and_staged() {
        let _project = with_temp_project();
        let app = trust_router(test_state(None));
        let res = app
            .oneshot(post_json_request(
                "/api/guard/scan",
                serde_json::json!({ "range": "main...HEAD", "staged": true }),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
        let value = json_body(res).await;
        assert!(value["error"].as_str().unwrap().contains("either"));
    }

    #[tokio::test]
    async fn guard_scan_returns_a_report() {
        let project = with_temp_project();
        std::fs::write(project.root().join("src.rs"), "fn main() {}\n").unwrap();
        let app = trust_router(test_state(None));
        let res = app
            .oneshot(post_json_request(
                "/api/guard/scan",
                serde_json::json!({}),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        assert_eq!(value["version"], 1);
        assert!(value["findings"].is_array());
    }

    #[tokio::test]
    async fn review_queue_returns_json_array() {
        let project = with_temp_project();
        std::fs::write(
            project.root().join("work.board"),
            r#"title: work
columns:
- id: todo
  name: Todo
- id: review
  name: Review
cards:
- id: card-1
  title: Ship the trust layer
  column: review
"#,
        )
        .unwrap();
        let app = trust_router(test_state(None));
        let res = app
            .oneshot(get_request("/api/review/queue?board=work"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        let items = value["items"].as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["card_id"], "card-1");
        assert_eq!(items[0]["column"], "review");
    }

    fn project_router(state: Arc<AppState>) -> Router {
        Router::new()
            .route("/api/project", get(project_handler))
            .route("/api/project/onboard", post(onboard_project_handler))
            .route("/api/project/init-git", post(init_git_handler))
            .route("/api/hooks", get(hooks_status_handler))
            .route("/api/hooks/install", post(install_hooks_handler))
            .route("/api/providers/{id}/models", get(provider_models_handler))
            .route("/api/threads/{id}/chat", post(chat_thread_handler))
            .route("/api/threads/{id}/chat/stop", post(stop_chat_handler))
            .route("/api/threads", post(create_thread_handler))
            .route("/api/exec", post(exec_handler))
        .route("/api/rules", get(list_rules_handler).post(add_rule_handler))
        .route("/api/rules/{title}", delete(delete_rule_handler))
        .route(
            "/api/schedules",
            get(list_schedules_handler).post(add_schedule_handler),
        )
        .route("/api/schedules/{id}", delete(delete_schedule_handler))
        .route("/api/schedules-run-due", post(run_schedules_handler))
            .route(
                "/api/contributions",
                get(contributions_handler).post(create_contribution_handler),
            )
            .route("/api/contributions/duplicates", get(contribution_duplicates_handler))
            .route("/api/runs/{id}/ancestry", get(run_ancestry_handler))
            .route("/api/runs/{id}/link", post(link_run_handler))
            .route("/api/runs/{id}/verify", post(verify_run_handler))
            .with_state(state)
    }

    #[tokio::test]
    async fn project_snapshot_reports_the_real_temp_root() {
        let project = with_temp_project();
        let app = project_router(test_state(None));
        let res = app.oneshot(get_request("/api/project")).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        assert_eq!(
            std::fs::canonicalize(value["root"].as_str().unwrap()).unwrap(),
            std::fs::canonicalize(project.root()).unwrap()
        );
        assert_eq!(value["is_git"], true);
        assert!(value["setup"]["board"].is_boolean());
        assert!(value["counts"]["cards"].is_number());
    }

    #[tokio::test]
    async fn onboarding_is_deterministic_and_idempotent() {
        let project = with_temp_project();
        let app = project_router(test_state(None));

        let first = app
            .clone()
            .oneshot(post_json_request("/api/project/onboard", serde_json::json!({})))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::OK);
        let first = json_body(first).await;
        assert_eq!(first["ok"], true);
        let steps = first["steps"].as_array().unwrap();
        for id in ["board", "context", "team", "hooks", "providers"] {
            assert!(
                steps.iter().any(|step| step["id"] == id),
                "missing setup step {id}"
            );
        }
        assert!(project.root().join("project_context.md").exists());
        assert!(!first["project"]["boards"].as_array().unwrap().is_empty());

        let boards_after_first = first["project"]["boards"].as_array().unwrap().len();
        let agents_after_first = first["project"]["counts"]["agents"].as_u64().unwrap();

        let second = app
            .oneshot(post_json_request("/api/project/onboard", serde_json::json!({})))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::OK);
        let second = json_body(second).await;
        assert_eq!(
            second["project"]["boards"].as_array().unwrap().len(),
            boards_after_first
        );
        assert_eq!(
            second["project"]["counts"]["agents"].as_u64().unwrap(),
            agents_after_first
        );
        assert_eq!(second["project"]["setup"]["complete"], true);
    }

    #[tokio::test]
    async fn hooks_endpoints_install_and_report_real_files() {
        let project = with_temp_project();
        let app = project_router(test_state(None));
        let before = app
            .clone()
            .oneshot(get_request("/api/hooks"))
            .await
            .unwrap();
        assert_eq!(before.status(), StatusCode::OK);
        let before = json_body(before).await;
        assert_eq!(before["opencode"], false);

        let installed = app
            .clone()
            .oneshot(post_json_request(
                "/api/hooks/install",
                serde_json::json!({ "agents": ["opencode", "claude-code"] }),
            ))
            .await
            .unwrap();
        assert_eq!(installed.status(), StatusCode::OK);

        let after = app
            .oneshot(get_request("/api/hooks"))
            .await
            .unwrap();
        assert_eq!(after.status(), StatusCode::OK);
        let after = json_body(after).await;
        assert_eq!(after["opencode"], true);
        assert_eq!(after["claude_code"], true);
        assert!(project.root().join(".opencode/plugins/barkcli.ts").exists());
        assert!(project.root().join(".claude/settings.json").exists());
    }

    #[tokio::test]
    async fn provider_model_endpoint_rejects_unknown_providers() {
        let app = project_router(test_state(None));
        let res = app
            .oneshot(get_request("/api/providers/not-a-provider/models"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
        let value = json_body(res).await;
        assert!(value["error"].as_str().unwrap().contains("unknown provider"));
    }

    #[tokio::test]
    async fn project_snapshot_discovers_real_commands() {
        let project = with_temp_project();
        std::fs::write(
            project.root().join("package.json"),
            r#"{"scripts":{"test":"vitest","build":"vite build"}}"#,
        )
        .unwrap();
        let app = project_router(test_state(None));
        let res = app.oneshot(get_request("/api/project")).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        let commands = value["commands"].as_array().unwrap();
        assert!(commands
            .iter()
            .any(|item| item["command"] == "npm run test"));
        assert!(commands
            .iter()
            .any(|item| item["command"] == "git status --short"));
    }

    #[tokio::test]
    async fn exec_endpoint_runs_in_the_project_root() {
        let project = with_temp_project();
        let app = project_router(test_state(None));
        let res = app
            .oneshot(post_json_request(
                "/api/exec",
                serde_json::json!({ "command": "printf bark && pwd" }),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        assert_eq!(value["ok"], true);
        assert_eq!(value["exit_code"], 0);
        assert!(value["stdout"].as_str().unwrap().contains("bark"));
        assert_eq!(
            std::fs::canonicalize(value["cwd"].as_str().unwrap()).unwrap(),
            std::fs::canonicalize(project.root()).unwrap()
        );
    }

    #[tokio::test]
    async fn chat_rejects_unknown_providers_before_starting_a_process() {
        let project = with_temp_project();
        std::fs::write(
            project.root().join("work.board"),
            "title: work\ncolumns:\n- id: todo\n  name: Todo\ncards: []\n",
        )
        .unwrap();
        let app = project_router(test_state(None));
        let res = app
            .oneshot(post_json_request(
                "/api/threads/any-card/chat",
                serde_json::json!({ "text": "hello", "provider": "not-a-provider" }),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
        let value = json_body(res).await;
        assert!(value["error"].as_str().unwrap().contains("unknown provider"));
    }

    #[tokio::test]
    async fn chat_threads_do_not_auto_propose_a_plan() {
        let project = with_temp_project();
        std::fs::write(
            project.root().join("work.board"),
            "title: work\ncolumns:\n- id: todo\n  name: Todo\ncards: []\n",
        )
        .unwrap();
        let app = project_router(test_state(None));
        let res = app
            .oneshot(post_json_request(
                "/api/threads",
                serde_json::json!({
                    "text": "Where is the auth middleware?",
                    "backend": "opencode",
                    "mode": "chat"
                }),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        let thread_id = value["thread_id"].as_str().unwrap();
        let events = barkcli_core::threads::read_events(thread_id).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, barkcli_core::threads::ThreadEventKind::User);
    }

    #[tokio::test]
    async fn contributions_link_and_ancestry_are_real() {
        let project = with_temp_project();
        let store = barkcli_core::runtime::RuntimeStore::from_project().unwrap();
        let make = |id: &str, author: &str| {
            let mut start = sm_test_start(id);
            start.agent_id = Some(author.into());
            store.create_run(&start).unwrap();
        };
        make("run_root", "agent-a");
        make("run_child", "agent-b");
        let app = project_router(test_state(None));
        let res = app
            .clone()
            .oneshot(post_json_request(
                "/api/runs/run_child/link",
                serde_json::json!({ "parent_id": "run_root" }),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let res = app
            .oneshot(get_request("/api/runs/run_child/ancestry"))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        assert_eq!(value["lineage"].as_array().unwrap().len(), 2);
        let contributions = project_router(test_state(None))
            .oneshot(get_request("/api/contributions"))
            .await
            .unwrap();
        assert_eq!(contributions.status(), StatusCode::OK);
        let value = json_body(contributions).await;
        assert_eq!(value["metrics"]["total_nodes"], 2);
        assert_eq!(value["metrics"]["edges"], 1);
    }

    #[tokio::test]
    async fn manual_contributions_are_created_and_indexed() {
        let project = with_temp_project();
        std::fs::write(
            project.root().join("work.board"),
            "title: work\ncolumns:\n- id: todo\n  name: Todo\ncards: []\n",
        )
        .unwrap();
        let app = project_router(test_state(None));
        let res = app
            .clone()
            .oneshot(post_json_request(
                "/api/contributions",
                serde_json::json!({
                    "title": "A manual insight",
                    "kind": "hypothesis",
                    "text": "The cache is cold"
                }),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let value = json_body(res).await;
        assert_eq!(value["kind"], "hypothesis");
        assert!(value["id"].as_str().unwrap().starts_with("run_"));

        let res = app.oneshot(get_request("/api/contributions")).await.unwrap();
        let value = json_body(res).await;
        assert_eq!(value["metrics"]["total_nodes"], 1);
        assert_eq!(value["open_hypotheses"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn self_verification_is_rejected_by_the_http_layer() {
        let project = with_temp_project();
        std::fs::write(
            project.root().join("work.board"),
            "title: work\ncolumns:\n- id: todo\n  name: Todo\ncards: []\n",
        )
        .unwrap();
        let store = barkcli_core::runtime::RuntimeStore::from_project().unwrap();
        let start = sm_test_start("run_self");
        let mut run = store.create_run(&start).unwrap();
        run.status = barkcli_core::runtime::RunStatus::Passed;
        store.save_run(&run).unwrap();
        let app = project_router(test_state(None));
        let res = app
            .oneshot(post_json_request(
                "/api/runs/run_self/verify",
                serde_json::json!({ "verifier": "builder-1" }),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
        let value = json_body(res).await;
        assert!(value["error"]
            .as_str()
            .unwrap()
            .contains("self-verification"));
    }

    fn sm_test_start(id: &str) -> barkcli_core::runtime::StartRun {
        barkcli_core::runtime::StartRun {
            run_id: id.into(),
            thread_id: "card-1".into(),
            card_id: "card-1".into(),
            prompt: String::new(),
            cwd: std::env::current_dir().unwrap().to_string_lossy().to_string(),
            provider: "fake".into(),
            model: None,
            role: Some("builder".into()),
            agent_id: Some("builder-1".into()),
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        }
    }

    #[tokio::test]
    async fn stopping_an_idle_chat_is_an_explicit_error() {
        let app = project_router(test_state(None));
        let res = app
            .oneshot(post_json_request(
                "/api/threads/any-card/chat/stop",
                serde_json::json!({}),
            ))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
        let value = json_body(res).await;
        assert!(value["error"].as_str().unwrap().contains("no active chat"));
    }
}
