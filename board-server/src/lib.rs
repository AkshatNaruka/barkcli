use std::sync::Arc;

use anyhow::{Context, Result};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::broadcast;
use tower_http::services::ServeDir;

use board_core::storage::board_file;
use board_core::storage::board_file::{list_board_files, read_board};

#[allow(dead_code)]
static INDEX_HTML_FALLBACK: &str = include_str!("./index.html");

#[derive(Clone)]
struct AppState {
    board_name: Option<String>,
    tx: broadcast::Sender<String>,
}

pub async fn run(port: u16, board_name: Option<&str>, open_browser: bool) -> Result<()> {
    let (tx, _) = broadcast::channel::<String>(16);

    let state = Arc::new(AppState {
        board_name: board_name.map(|s| s.to_string()),
        tx: tx.clone(),
    });

    let app = Router::new()
        .route("/api/boards", get(list_boards_handler))
        .route("/api/board", get(get_board_handler).put(save_board_handler))
        .route("/ws", get(ws_handler))
        .fallback_service(ServeDir::new("web/dist").fallback(
            ServeDir::new("vscode-extension/dist") // fallback to old VS Code extension assets
        ))
        .with_state(state.clone());

    let watch_tx = tx.clone();
    let watch_board_name = board_name.map(|s| s.to_string());
    tokio::spawn(async move {
        watch_board_files(watch_tx, watch_board_name).await;
    });

    let addr = format!("0.0.0.0:{}", port);
    println!("Board server listening on http://localhost:{}", port);

    if open_browser {
        if let Err(e) = open::that(format!("http://localhost:{}", port)) {
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

#[derive(serde::Serialize)]
struct BoardListResponse { boards: Vec<String> }

async fn list_boards_handler() -> Result<Json<BoardListResponse>, ServerError> {
    let boards = list_board_files().map_err(|e| ServerError(e.to_string()))?;
    Ok(Json(BoardListResponse { boards }))
}

#[derive(serde::Serialize)]
struct BoardResponse { yaml: String }

#[derive(Deserialize)]
struct BoardQuery { name: Option<String> }

async fn get_board_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BoardQuery>,
) -> Result<Json<BoardResponse>, ServerError> {
    let name = query.name.as_deref().or(state.board_name.as_deref()).unwrap_or_default();
    let boards = list_board_files().map_err(|e| ServerError(e.to_string()))?;
    let board_name = if !name.is_empty() {
        name.to_string()
    } else if boards.len() == 1 {
        boards[0].clone()
    } else if boards.is_empty() {
        return Err(ServerError("No boards found. Create one with `board create <name>`.".into()));
    } else {
        boards[0].clone()
    };
    let board = read_board(&board_name).map_err(|e| ServerError(format!("read: {}", e)))?;
    let yaml = serde_yaml::to_string(&board).map_err(|e| ServerError(format!("serialize: {}", e)))?;
    Ok(Json(BoardResponse { yaml }))
}

#[derive(Deserialize)]
struct SaveRequest { yaml: String, name: Option<String> }

async fn save_board_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SaveRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let explicit = req.name.or(state.board_name.clone());
    let name = explicit.as_deref().unwrap_or_default();
    let boards = list_board_files().map_err(|e| ServerError(e.to_string()))?;
    let board_name = if !name.is_empty() {
        name.to_string()
    } else if boards.len() == 1 {
        boards[0].clone()
    } else if boards.is_empty() {
        return Err(ServerError("No boards found.".into()));
    } else {
        boards[0].clone()
    };
    let path = board_file::board_path(&board_name).map_err(|e| ServerError(format!("path: {}", e)))?;
    std::fs::write(&path, &req.yaml).map_err(|e| ServerError(format!("write: {}", e)))?;
    let _ = state.tx.send("reload".to_string());
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.tx.clone()))
}

async fn handle_socket(socket: WebSocket, tx: broadcast::Sender<String>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = tx.subscribe();
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = serde_json::json!({"type": msg});
            if sender.send(Message::Text(json.to_string().into())).await.is_err() { break; }
        }
    });
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = receiver.next().await {}
    });
    tokio::select! { _ = send_task => {}, _ = recv_task => {} }
}

struct ServerError(String);

impl IntoResponse for ServerError {
    fn into_response(self) -> Response {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": self.0}))).into_response()
    }
}

async fn watch_board_files(tx: broadcast::Sender<String>, board_name: Option<String>) {
    use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc;

    let board_dir = match board_core::storage::board_dir::find_project_root() {
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
                                let _ = tx.send("reload".to_string());
                            }
                        } else {
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
