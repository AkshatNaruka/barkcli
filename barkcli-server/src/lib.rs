use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, Request, State,
    },
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post, put},
    Router,
};
use chrono::{DateTime, Local, Utc};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::{broadcast, Mutex};
use tower_http::services::ServeDir;

use barkcli_core::agent::{
    AgentIdentity, AgentRegistry, AgentRole, TaskQueue, TaskRequest, TaskResult, TaskStatus,
    VelocityTracker,
};
use barkcli_core::code::SymbolIndex;
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
struct AppState {
    board_name: Option<String>,
    host: String,
    token: Option<String>,
    tx: broadcast::Sender<String>,
    code_cache: Arc<Mutex<Option<CodeCache>>>,
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
    // Auto-init: create .board/ if it doesn't exist
    auto_init().await;

    let (tx, _) = broadcast::channel::<String>(16);

    let state = Arc::new(AppState {
        board_name: board_name.map(|s| s.to_string()),
        host: host.to_string(),
        token,
        tx: tx.clone(),
        code_cache: Arc::new(Mutex::new(None)),
    });

    let app = Router::new()
        .route("/api/boards", get(list_boards_handler))
        .route("/api/board", get(get_board_handler).put(save_board_handler))
        .route("/api/sprints", get(sprints_handler).post(start_sprint_handler))
        .route("/api/sprints/end", post(end_sprint_handler))
        .route("/api/history", get(history_handler))
        .route("/api/sessions", get(sessions_handler))
        .route("/api/context", get(context_handler))
        .route("/api/context/sync", post(sync_context_handler))
        .route("/api/context/clear", post(clear_context_handler))
        .route("/api/code", get(code_handler))
        .route("/api/config", get(config_handler))
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
        .route("/api/agents", get(list_agents_handler).post(register_agent_handler))
        .route(
            "/api/agents/{agent_id}",
            get(get_agent_handler).delete(delete_agent_handler),
        )
        .route("/api/agents/{agent_id}/status", get(agent_status_handler))
        .route("/api/orchestrate/next", post(orchestrate_next_handler))
        .route("/api/orchestrate/cycle", post(orchestrate_cycle_handler))
        .route("/api/orchestrate/status", get(orchestrate_status_handler))
        // Memory endpoints
        .route("/api/memory", get(list_memory_handler).post(add_memory_handler))
        .route("/api/memory/{id}", delete(delete_memory_handler))
        .route("/api/memory/stats", get(memory_stats_handler))
        .route("/api/memory/fact", post(add_fact_handler))
        .route("/api/memory/facts", get(list_facts_handler))
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
        // Skills endpoints (SPEC-004 R2)
        .route("/api/skills", get(list_skills_handler))
        .route("/api/skills/{id}", get(get_skill_handler))
        // Documentation endpoints
        .route("/api/docs", get(list_docs_handler))
        .route("/api/docs/{file}", get(get_doc_handler))
        .route("/ws", get(ws_handler))
        .fallback_service(ServeDir::new("web/dist").fallback(
            ServeDir::new("vscode-extension/dist") // fallback to old VS Code extension assets
        ))
        .layer(middleware::from_fn_with_state(state.clone(), auth_layer))
        .with_state(state.clone());

    let watch_tx = tx.clone();
    let watch_board_name = board_name.map(|s| s.to_string());
    tokio::spawn(async move {
        watch_board_files(watch_tx, watch_board_name).await;
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

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .context(format!("failed to bind to {}", addr))?;

    axum::serve(listener, app)
        .await
        .context("server error")?;

    Ok(())
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
                barkcli_core::models::Column { id: "todo".into(), name: "To Do".into() },
                barkcli_core::models::Column { id: "doing".into(), name: "Doing".into() },
                barkcli_core::models::Column { id: "review".into(), name: "Review".into() },
                barkcli_core::models::Column { id: "done".into(), name: "Done".into() },
            ],
            cards: vec![],
        };
        if let Ok(()) = board_file::write_board("my-project", &board) {
            eprintln!("barkcli: created default board 'my-project.board'");
        }
    }
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
    let is_protected = path == "/ws" || path.starts_with("/api/");
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

/// Resolve the board name: explicit query param > state default > single board.
fn resolve_board_name(state: &AppState, query: Option<String>) -> Result<String, ServerError> {
    let name = match query.or(state.board_name.clone()).unwrap_or_default() {
        n if !n.is_empty() => sanitize_name(&n)?,
        _ => {
            let boards = list_board_files().map_err(|e| ServerError::internal(e.to_string()))?;
            boards
                .first()
                .cloned()
                .ok_or_else(|| ServerError::bad("No boards found. Create one with `board create <name>`."))?
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
}

async fn sessions_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SessionsQuery>,
) -> Result<Json<SessionsResponse>, ServerError> {
    let board_name = resolve_board_name(&state, query.name)?;
    let mut all = sessions::read_sessions(&board_name).map_err(|e| ServerError::internal(e.to_string()))?;
    all.reverse(); // newest first
    let all = filter_entries(all, &query.since, query.limit, |e| &e.at);
    Ok(Json(SessionsResponse { sessions: all }))
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

#[derive(serde::Serialize)]
struct ConfigResponse {
    ai: ConfigAi,
}

#[derive(serde::Serialize)]
struct ConfigAi {
    base_url: String,
    model: String,
}

async fn config_handler() -> Result<Json<ConfigResponse>, ServerError> {
    let root = barkcli_core::storage::board_dir::find_project_root()
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let cfg = config_store::read_config(&root).unwrap_or_default();
    let ai = cfg.ai.unwrap_or_default();
    Ok(Json(ConfigResponse {
        ai: ConfigAi { base_url: ai.base_url, model: ai.model },
    }))
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
            let json = serde_json::json!({"type": msg, "version": version});
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

// ── Management Layer Handlers ──

#[derive(Deserialize)]
struct TaskQuery {
    status: Option<String>,
    card_id: Option<String>,
    agent_id: Option<String>,
}

#[derive(serde::Serialize)]
struct TaskListResponse {
    tasks: Vec<TaskRequest>,
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
        columns: columns.iter().map(|c| barkcli_core::models::Column {
            id: c.clone(),
            name: c.clone(),
        }).collect(),
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

async fn list_skills_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let reg = barkcli_core::skills::SkillRegistry::load_all(None)
        .map_err(|e| ServerError::internal(e.to_string()))?;
    let skills: Vec<serde_json::Value> = reg
        .skills
        .iter()
        .map(|s| {
            serde_json::json!({
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "triggers": s.triggers,
                "source": s.source.to_string(),
            })
        })
        .collect();
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
    Ok(Json(serde_json::json!({
        "id": skill.id,
        "name": skill.name,
        "description": skill.description,
        "triggers": skill.triggers,
        "source": skill.source.to_string(),
        "content": skill.content,
    })))
}

// ── Documentation handlers ───────────────────────────────────────────────────

/// List available documentation files (public docs only, no internal/).
async fn list_docs_handler() -> Result<Json<serde_json::Value>, ServerError> {
    let docs_dir = std::path::Path::new("docs");
    let mut docs = Vec::new();

    if docs_dir.is_dir() {
        let entries = std::fs::read_dir(docs_dir)
            .map_err(|e| ServerError::internal(format!("failed to read docs dir: {}", e)))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_stem().and_then(|n| n.to_str()) {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    // Only serve public .md files, exclude internal/ and other dirs
                    if ext == "md" && !name.starts_with('.') {
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

/// Get a single documentation file by slug (e.g. /api/docs/COMMANDS).
async fn get_doc_handler(
    Path(file): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Sanitize: only allow alphanumeric, hyphens, underscores
    if file.is_empty() || file.len() > 100 || file.contains("..") || file.contains('/') || file.contains('\\') {
        return Err(ServerError::bad("invalid doc filename"));
    }

    let path = std::path::Path::new("docs").join(format!("{}.md", file));

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
