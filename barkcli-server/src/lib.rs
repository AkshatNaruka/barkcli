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
    routing::{get, post, put},
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
            "/api/tasks/:task_id",
            get(get_task_handler)
                .put(update_task_handler)
                .delete(delete_task_handler),
        )
        .route("/api/tasks/:task_id/claim", post(claim_task_handler))
        .route("/api/tasks/:task_id/complete", post(complete_task_handler))
        .route("/api/tasks/:task_id/fail", post(fail_task_handler))
        .route("/api/agents", get(list_agents_handler).post(register_agent_handler))
        .route(
            "/api/agents/:agent_id",
            get(get_agent_handler).delete(delete_agent_handler),
        )
        .route("/api/agents/:agent_id/status", get(agent_status_handler))
        .route("/api/orchestrate/next", post(orchestrate_next_handler))
        .route("/api/orchestrate/cycle", post(orchestrate_cycle_handler))
        .route("/api/orchestrate/status", get(orchestrate_status_handler))
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
    if let Err(e) = watcher.watch(&board_dir, RecursiveMode::NonRecursive) {
        eprintln!("Failed to watch board directory: {}", e); return;
    }
    for event in watch_rx {
        match event {
            Ok(Event { kind: EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_), paths, .. }) => {
                for path in paths {
                    if path.extension().and_then(|e| e.to_str()) == Some("board") {
                        if let Some(ref name) = board_name {
                            let expected = format!("{}.board", name);
                            if path.file_name().and_then(|n| n.to_str()) == Some(&expected) {
                                RELOAD_VERSION.fetch_add(1, Ordering::SeqCst);
                                let _ = tx.send("reload".to_string());
                            }
                        } else {
                            RELOAD_VERSION.fetch_add(1, Ordering::SeqCst);
                            let _ = tx.send("reload".to_string());
                        }
                    }
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
        Vec::new(),
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

    let board_name = resolve_board_name(&state, None)?;
    let tasks_path = barkcli_core::storage::board_dir::find_board_dir()
        .map_err(|e| ServerError::internal(e.to_string()))?
        .join("tasks")
        .join(format!("{}.json", board_name));

    let mut queue = TaskQueue::load(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    queue
        .claim(&task_id, agent_id)
        .map_err(|e| ServerError::bad(e.to_string()))?;

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

    // Update task with result details
    if let Some(task) = queue.get_mut(&task_id) {
        if let Some(files) = &req.files_changed {
            // We could store these in a separate results store
        }
        if let Some(summary) = &req.summary {
            // Store summary if needed
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

    queue.save(&tasks_path).map_err(|e| ServerError::internal(e.to_string()))?;

    let _ = state.tx.send("reload".to_string());

    queue
        .get(&task_id)
        .cloned()
        .map(Json)
        .ok_or_else(|| ServerError::bad("Task not found"))
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
