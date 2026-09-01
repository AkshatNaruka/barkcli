use anyhow::{Context, Result};
use chrono::Utc;

use crate::agent::queue::{CompletionStatus, TaskQueue, TaskResults, TaskStatus};
use crate::storage::board_file::{read_board, write_board};
use crate::util::style;

/// `barkcli review [card-id]` — Validate completed tasks against acceptance criteria.
///
/// Flags:
///   --all         Review all completed cards
///   --board <n>   Target board
///   --auto        Auto-move passing cards to done
pub fn run_review(args: &[String]) -> Result<()> {
    let review_all = args.iter().any(|a| a == "--all");
    let auto_move = args.iter().any(|a| a == "--auto");

    let board_name = find_board(args)?;
    let mut board = read_board(&board_name)
        .context(format!("board '{}' not found", board_name))?;

    let queue = load_queue(&board_name).unwrap_or_default();
    let results = load_results(&board_name).unwrap_or_default();

    // Find cards to review
    let card_ids: Vec<String> = if review_all {
        board.cards.iter()
            .filter(|c| c.column.as_str() == "review" || c.column.as_str() == "doing")
            .map(|c| c.id.clone())
            .collect()
    } else {
        // Find specific card
        let card_id = args.iter()
            .filter(|a| !a.starts_with('-'))
            .find(|a| !a.contains('/') && !a.contains('.'))
            .cloned();

        match card_id {
            Some(id) => vec![id],
            None => {
                // Review all cards in review column
                board.cards.iter()
                    .filter(|c| c.column.as_str() == "review")
                    .map(|c| c.id.clone())
                    .collect()
            }
        }
    };

    let cards_to_review: Vec<crate::models::card::Card> = card_ids.iter()
        .filter_map(|id| board.cards.iter().find(|c| c.id == *id).cloned())
        .collect();

    if cards_to_review.is_empty() {
        println!("{} No cards to review", style::muted("Review:"));
        println!("  Cards in 'review' column will be checked here.");
        println!("  Move cards to 'review' with: barkcli move <id> review");
        return Ok(());
    }

    println!(
        "{} Reviewing {} card(s)...",
        style::accent("Review:"),
        cards_to_review.len(),
    );
    println!();

    let mut passed = 0;
    let mut failed = 0;
    let mut needs_work = 0;

    for card in &cards_to_review {
        println!("{} {}", style::strong("Card:"), card.title);

        // Find tasks for this card
        let card_tasks: Vec<_> = queue.tasks.iter()
            .filter(|t| t.card_id == card.id)
            .collect();

        let completed_tasks: Vec<_> = card_tasks.iter()
            .filter(|t| t.status == TaskStatus::Completed)
            .collect();

        let total_tasks = card_tasks.len();
        let done_tasks = completed_tasks.len();

        if total_tasks == 0 {
            println!("  {} No tasks created for this card", style::warn("⚠"));
            println!("  Run `barkcli plan {} --tasks` first", card.id);
            needs_work += 1;
            println!();
            continue;
        }

        // Check task completion
        let task_score = if total_tasks > 0 {
            done_tasks as f32 / total_tasks as f32
        } else {
            0.0
        };

        println!(
            "  Tasks: {}/{} ({:.0}%)",
            done_tasks,
            total_tasks,
            task_score * 100.0
        );

        // Check acceptance criteria
        let ac_total = card.checklist.len();
        let ac_done = card.checklist.iter().filter(|c| c.done).count();
        if ac_total > 0 {
            let ac_score = ac_done as f32 / ac_total as f32;
            println!(
                "  AC:    {}/{} ({:.0}%)",
                ac_done,
                ac_total,
                ac_score * 100.0
            );
        }

        // Check test results from task results
        let mut tests_passed = true;
        for task in &completed_tasks {
            if let Some(result) = results.for_task(&task.id) {
                if let Some(passed_flag) = result.tests_passed {
                    if !passed_flag {
                        tests_passed = false;
                        println!(
                            "  {} Task '{}' tests failed",
                            style::err("✗"),
                            task.title
                        );
                    }
                }
                if !result.files_changed.is_empty() {
                    println!(
                        "  {} Task '{}' changed {} file(s)",
                        style::ok("✓"),
                        task.title,
                        result.files_changed.len()
                    );
                }
            }
        }

        // Check for git commit
        let has_commit = completed_tasks.iter().any(|t| {
            results.for_task(&t.id)
                .and_then(|r| r.commit_sha.as_ref())
                .is_some()
        });

        // Overall verdict
        let all_ac_done = ac_total == 0 || ac_done >= ac_total;
        let all_tasks_done = done_tasks >= total_tasks;

        let verdict = if all_tasks_done && all_ac_done && tests_passed && has_commit {
            passed += 1;
            println!("  {} {}", style::ok("PASS"), "All checks passed");
            "pass"
        } else if all_tasks_done && all_ac_done && tests_passed {
            passed += 1;
            println!("  {} {}", style::ok("PASS"), "Tasks + AC done (no commit yet)");
            "pass"
        } else {
            failed += 1;
            let mut issues = Vec::new();
            if !all_tasks_done {
                issues.push(format!("{} tasks incomplete", total_tasks - done_tasks));
            }
            if !all_ac_done && ac_total > 0 {
                issues.push(format!("{} AC unchecked", ac_total - ac_done));
            }
            if !tests_passed {
                issues.push("tests failed".to_string());
            }
            if !has_commit {
                issues.push("no git commit".to_string());
            }
            println!("  {} {}", style::err("FAIL"), issues.join(", "));
            "fail"
        };

        // Auto-move to done if requested and passing
        if auto_move && verdict == "pass" {
            if let Some(c) = board.cards.iter_mut().find(|c| c.id == card.id) {
                c.column = "done".into();
                println!("  {} Moved to done", style::ok("→"));
            }
        }

        println!();
    }

    // Summary
    println!("{}", "─".repeat(50));
    println!(
        "{} Summary: {} passed, {} failed, {} needs work",
        style::accent("Review:"),
        style::ok(&passed.to_string()),
        if failed > 0 { style::err(&failed.to_string()) } else { style::ok(&failed.to_string()) },
        if needs_work > 0 { style::warn(&needs_work.to_string()) } else { style::ok(&needs_work.to_string()) },
    );

    if auto_move && passed > 0 {
        write_board(&board_name, &board)?;
        println!("  {} Board updated", style::ok("OK"));
    }

    Ok(())
}

fn load_queue(board_name: &str) -> Result<TaskQueue> {
    let tasks_path = crate::storage::board_dir::find_board_dir()?
        .join("tasks")
        .join(format!("{}.json", board_name));
    if tasks_path.exists() {
        TaskQueue::load(&tasks_path).map_err(|e| anyhow::anyhow!(e))
    } else {
        Ok(TaskQueue::new())
    }
}

fn load_results(board_name: &str) -> Result<TaskResults> {
    let results_path = crate::storage::board_dir::find_board_dir()?
        .join("tasks")
        .join(format!("{}_results.json", board_name));
    TaskResults::load(&results_path).map_err(|e| anyhow::anyhow!(e))
}

fn find_board(args: &[String]) -> Result<String> {
    let mut i = 0;
    while i < args.len() {
        if (args[i] == "--board" || args[i] == "-b") && i + 1 < args.len() {
            return Ok(args[i + 1].clone());
        }
        i += 1;
    }
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let config = crate::storage::config_store::read_config(&board_dir)?;
    config.default_board
        .or_else(|| {
            let root = board_dir.parent()?;
            std::fs::read_dir(root).ok()?
                .filter_map(|e| e.ok())
                .find(|e| e.path().extension().map(|ext| ext == "board").unwrap_or(false))
                .map(|e| e.path().file_stem().unwrap_or_default().to_string_lossy().to_string())
        })
        .ok_or_else(|| anyhow::anyhow!("No boards found"))
}
