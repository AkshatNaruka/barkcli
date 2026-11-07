use anyhow::{bail, Result};

use crate::runtime::merge_train;

pub fn run_merge_train(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli merge-train <plan|run|status|list> [train-id]");
    };
    match sub.as_str() {
        "plan" => plan(&args[1..]),
        "run" => run(&args[1..]),
        "status" => status(&args[1..]),
        "list" | "ls" => list(),
        _ => bail!("unknown merge-train subcommand '{}'", sub),
    }
}

fn parse_board_flag(args: &[String]) -> (Option<String>, Vec<String>) {
    let mut board = None;
    let mut rest = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--board" | "-b" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    board = Some(v.clone());
                }
            }
            s => rest.push(s.to_string()),
        }
        i += 1;
    }
    (board, rest)
}

fn resolve_board(board: Option<String>) -> Result<String> {
    crate::commands::boards::resolve_board(board.as_deref())
}

fn plan(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    let board = resolve_board(board_opt)?;
    // Flags: --runs run1,run2  or default: all gate-passed runs on this board.
    let mut run_ids: Vec<String> = Vec::new();
    let mut i = 0;
    while i < rest.len() {
        if rest[i] == "--runs" {
            i += 1;
            if let Some(v) = rest.get(i) {
                run_ids = v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            }
        }
        i += 1;
    }
    let store = crate::runtime::RuntimeStore::from_project()?;
    let all_runs = store.list_runs(None)?;
    let candidates: Vec<_> = if run_ids.is_empty() {
        all_runs.into_iter().filter(|r| r.gate.as_ref().map(|g| g.verified()).unwrap_or(false)).collect()
    } else {
        all_runs.into_iter().filter(|r| run_ids.contains(&r.id)).collect()
    };
    if candidates.is_empty() {
        println!("No gate-passed runs for board '{}'.", board);
        return Ok(());
    }
    let root = merge_train::project_root()?;
    let train = merge_train::plan_train(&candidates, None, &root)?;
    merge_train::save_train(&train)?;
    crate::util::metrics::inc("merge_train_planned");
    println!("Planned train {} ({} items) for board '{}'", train.id, train.items.len(), board);
    for item in &train.items {
        let reason = item.reason.as_deref().unwrap_or("");
        println!("  {} {} [{}] {} {}", item.run_id, item.card_id, item.status, item.branch.as_deref().unwrap_or("-"), reason);
        if !item.conflict_files.is_empty() {
            println!("    conflict files: {}", item.conflict_files.join(", "));
        }
    }
    Ok(())
}

fn run(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    let board = resolve_board(board_opt)?;
    if rest.is_empty() {
        bail!("usage: barkcli merge-train run <train-id>");
    }
    let train_id = &rest[0];
    let mut train = merge_train::load_train(train_id)?;
    let service = crate::runtime::RunService::from_project(&board)?;
    // Acquire merge-train lock.
    let _lock = crate::util::lock::FileLock::acquire(
        &store_board_dir()?.join("merge-train"),
    )?;
    let train = merge_train::execute_train(train, |item| {
        let outcome = service.merge(&item.run_id, true)?;
        let _ = outcome;
        crate::util::metrics::inc("merge_train_merged");
        Ok(())
    })?;
    println!("Train {} executed: {}/{} merged", train.id, train.merged_count, train.items.len());
    for item in &train.items {
        println!("  {} [{}] {}", item.run_id, item.status, item.reason.as_deref().unwrap_or(""));
    }
    Ok(())
}

fn status(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    let board = resolve_board(board_opt)?;
    let _ = board;
    if rest.is_empty() {
        bail!("usage: barkcli merge-train status <train-id>");
    }
    let train = merge_train::load_train(&rest[0])?;
    println!("Train {} — {}/{} merged", train.id, train.merged_count, train.items.len());
    for item in &train.items {
        println!("  {} {} [{}] {}", item.run_id, item.card_id, item.status, item.reason.as_deref().unwrap_or(""));
    }
    Ok(())
}

fn list() -> Result<()> {
    let trains = merge_train::list_trains()?;
    if trains.is_empty() {
        println!("No merge trains.");
        return Ok(());
    }
    for t in &trains {
        println!("  {} ({}/{}) {}", t.id, t.merged_count, t.items.len(), t.label);
    }
    Ok(())
}

fn store_board_dir() -> Result<std::path::PathBuf> {
    crate::storage::board_dir::find_board_dir()
}
