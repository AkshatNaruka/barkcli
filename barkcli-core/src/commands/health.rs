use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct HealthReport {
    pub ok: bool,
    pub board: Option<String>,
    pub boards: usize,
    pub cards: usize,
    pub milestones: usize,
    pub worktrees: usize,
    pub merge_trains: usize,
    pub runs_active: usize,
    pub metrics: serde_json::Value,
}

pub fn run_health(_args: &[String]) -> Result<()> {
    let report = health()?;
    let json = serde_json::to_string_pretty(&report)?;
    println!("{}", json);
    Ok(())
}

pub fn health() -> Result<HealthReport> {
    let board_name = crate::commands::boards::resolve_board(None).ok();
    let mut cards = 0usize;
    let mut milestones = 0usize;
    if let Some(board) = board_name.as_deref() {
        if let Ok(b) = crate::storage::board_file::read_board(board) {
            cards = b.cards.len();
        }
        milestones = crate::storage::milestones::read_milestones(board).map(|m| m.len()).unwrap_or(0);
    }
    let boards = crate::storage::board_file::list_board_files().map(|b| b.len()).unwrap_or(0);
    let worktrees = crate::agent::worktree_lifecycle::list_with_health().map(|w| w.len()).unwrap_or(0);
    let merge_trains = crate::runtime::merge_train::list_trains().map(|t| t.len()).unwrap_or(0);
    let runs_active = crate::runtime::RuntimeStore::from_project()
        .ok()
        .and_then(|s| s.list_runs(None).ok())
        .map(|runs| runs.iter().filter(|r| !r.status.is_terminal()).count())
        .unwrap_or(0);
    let metrics = crate::util::metrics::load();
    Ok(HealthReport {
        ok: true,
        board: board_name,
        boards,
        cards,
        milestones,
        worktrees,
        merge_trains,
        runs_active,
        metrics: serde_json::to_value(&metrics).unwrap_or(serde_json::json!({})),
    })
}
