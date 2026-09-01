use anyhow::{Context, Result};
use chrono::{DateTime, Utc};

use crate::agent::identity::{AgentRegistry, AgentStatus};
use crate::agent::queue::{TaskQueue, TaskStatus};
use crate::agent::orchestrate::OrchestrationState;
use crate::storage::board_file::read_board;
use crate::util::style;

/// `barkcli monitor [board]` — Dashboard showing agent status, task queue, and insights.
///
/// Flags:
///   --watch       Live refresh every N seconds
///   --interval N  Refresh interval (default 5)
///   --board <n>   Target board
pub fn run_monitor(args: &[String]) -> Result<()> {
    let watch = args.iter().any(|a| a == "--watch");
    let interval: u64 = args
        .iter()
        .position(|a| a == "--interval")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(5);

    let board_name = find_board(args)?;
    let board = read_board(&board_name)
        .context(format!("board '{}' not found", board_name))?;

    if watch {
        loop {
            // Clear screen
            print!("\x1B[2J\x1B[1;1H");
            render_dashboard(&board_name, &board)?;
            std::thread::sleep(std::time::Duration::from_secs(interval));
        }
    } else {
        render_dashboard(&board_name, &board)
    }
}

fn render_dashboard(board_name: &str, board: &crate::models::Board) -> Result<()> {
    let now = Utc::now();

    println!("{} Dashboard for '{}'", style::accent("Monitor:"), board_name);
    println!("{}", "─".repeat(60));

    // ── Board Overview ──
    println!();
    println!("{} Board Overview", style::strong("📋"));
    let mut col_counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for card in &board.cards {
        *col_counts.entry(card.column.as_str()).or_insert(0) += 1;
    }
    let columns = vec!["todo", "doing", "review", "done"];
    for col in &columns {
        let count = col_counts.get(col).unwrap_or(&0);
        let bar = "█".repeat(*count);
        let empty = "░".repeat((10 - count.min(&10)));
        println!("  {:>8} {:>3} {}{}", col, count, style::column(bar.as_str()), style::muted(&empty));
    }
    println!("  {:>8} {:>3}", "total", board.cards.len());

    // ── Agent Status ──
    println!();
    println!("{} Agent Status", style::strong("🤖"));
    match load_registry() {
        Ok(registry) => {
            if registry.agents.is_empty() {
                println!("  {}", style::muted("No agents registered"));
            } else {
                for agent in &registry.agents {
                    let status_icon = match agent.status {
                        AgentStatus::Idle => style::ok("idle"),
                        AgentStatus::Working => style::warn("working"),
                        AgentStatus::Paused => style::muted("paused"),
                        AgentStatus::Error => style::err("error"),
                    };
                    let active = agent.active_tasks.len();
                    let completed = agent.completed_tasks.len();
                    let failed = agent.failed_tasks.len();
                    let rate = agent.success_rate() * 100.0;

                    let last_active = agent.last_active
                        .map(|t| format_duration(now - t))
                        .unwrap_or_else(|| "never".to_string());

                    println!(
                        "  {:>20} {:>8} active:{} done:{} fail:{} rate:{:.0}% last:{}",
                        style::strong(&agent.name),
                        status_icon,
                        active,
                        completed,
                        failed,
                        rate,
                        last_active,
                    );
                }
            }
        }
        Err(_) => {
            println!("  {}", style::muted("Agent registry not available"));
        }
    }

    // ── Task Queue ──
    println!();
    println!("{} Task Queue", style::strong("⚡"));
    match load_queue(board_name) {
        Ok(queue) => {
            let counts = queue.count_by_status();
            let pending = counts.get(&TaskStatus::Pending).unwrap_or(&0);
            let assigned = counts.get(&TaskStatus::Assigned).unwrap_or(&0);
            let in_progress = counts.get(&TaskStatus::InProgress).unwrap_or(&0);
            let completed = counts.get(&TaskStatus::Completed).unwrap_or(&0);
            let failed = counts.get(&TaskStatus::Failed).unwrap_or(&0);
            let total = pending + assigned + in_progress + completed + failed;

            if total == 0 {
                println!("  {}", style::muted("No tasks in queue"));
            } else {
                println!("  Pending:     {:>3} {}", pending, progress_bar(*pending, total));
                println!("  Assigned:    {:>3} {}", assigned, progress_bar(*assigned, total));
                println!("  In Progress: {:>3} {}", in_progress, progress_bar(*in_progress, total));
                println!("  Completed:   {:>3} {}", completed, progress_bar(*completed, total));
                println!("  Failed:      {:>3} {}", failed, progress_bar(*failed, total));

                // Show stuck tasks
                let stuck = find_stuck_tasks(&queue);
                if !stuck.is_empty() {
                    println!();
                    println!("  {} Stuck tasks (>24h in progress):", style::warn("⚠"));
                    for task in &stuck {
                        let agent = task.assigned_agent.as_deref().unwrap_or("unassigned");
                        println!("    - {} [{}] assigned to {}", task.title, task.id, agent);
                    }
                }

                // Show next pending task
                if let Some(next) = queue.next_pending() {
                    println!();
                    println!("  {} Next: {} [{}]", style::ok("→"), next.title, next.priority);
                }
            }
        }
        Err(_) => {
            println!("  {}", style::muted("No tasks yet"));
        }
    }

    // ── Insights ──
    println!();
    println!("{} Insights", style::strong("💡"));
    let insights = generate_insights(board_name, board);
    if insights.is_empty() {
        println!("  {}", style::ok("Everything looks good"));
    } else {
        for insight in &insights {
            println!("  {}", insight);
        }
    }

    // ── Orchestration State ──
    println!();
    println!("{} Orchestration", style::strong("🔄"));
    match load_orchestration_state(board_name) {
        Some(state) => {
            println!("  Status:  {}", state.status.display_name());
            println!("  Cycles:  {}", state.cycle_count);
            println!("  Dispatched/Completed/Failed: {}/{}/{}",
                state.tasks_dispatched, state.tasks_completed, state.tasks_failed);
            if let Some(ref sprint) = state.current_sprint {
                println!("  Sprint:  {}", sprint);
            }
            if let Some(last) = state.last_cycle_at {
                println!("  Last:    {} ago", format_duration(now - last));
            }
        }
        None => {
            println!("  {}", style::muted("Not started. Run `barkcli orchestrate cycle` to begin."));
        }
    }

    println!();
    println!("{}", "─".repeat(60));
    println!("  Run with {} for live updates", style::accent("--watch"));

    Ok(())
}

fn generate_insights(board_name: &str, board: &crate::models::Board) -> Vec<String> {
    let mut insights = Vec::new();

    // Check for blocked cards
    for card in &board.cards {
        if let Some(ref blocked_by) = card.blocked_by {
            if !blocked_by.is_empty() {
                insights.push(format!(
                    "{} Card '{}' blocked by '{}'",
                    style::warn("⚠"),
                    card.title,
                    blocked_by
                ));
            }
        }
    }

    // Check for cards with no acceptance criteria in todo
    let todo_no_ac: Vec<_> = board.cards.iter()
        .filter(|c| c.column.as_str() == "todo" && c.checklist.is_empty())
        .collect();
    if !todo_no_ac.is_empty() {
        insights.push(format!(
            "{} {} card(s) in todo have no acceptance criteria — run `barkcli plan`",
            style::warn("⚠"),
            todo_no_ac.len()
        ));
    }

    // Check for stale cards (>7 days in doing)
    // This is a heuristic since we don't track column change timestamps
    let doing_count = board.cards.iter()
        .filter(|c| c.column.as_str() == "doing")
        .count();
    if doing_count > 5 {
        insights.push(format!(
            "{} {} cards in doing — consider if some should be split or reassigned",
            style::warn("⚠"),
            doing_count
        ));
    }

    // Check for cards with high effort
    let high_effort: Vec<_> = board.cards.iter()
        .filter(|c| c.effort.map_or(false, |e| e > 8) && c.column.as_str() != "done")
        .collect();
    if !high_effort.is_empty() {
        insights.push(format!(
            "{} {} card(s) with effort > 8 — consider decomposition",
            style::warn("⚠"),
            high_effort.len()
        ));
    }

    insights
}

fn find_stuck_tasks(queue: &TaskQueue) -> Vec<&crate::agent::queue::TaskRequest> {
    let now = Utc::now();
    queue.tasks.iter()
        .filter(|t| t.status == TaskStatus::InProgress)
        .filter(|t| {
            // A task is stuck if it's been in progress for more than 24 hours
            // We check by looking at created_at (approximate since we don't track start time)
            now.signed_duration_since(t.created_at).num_hours() > 24
        })
        .collect()
}

fn progress_bar(value: usize, total: usize) -> String {
    if total == 0 {
        return String::new();
    }
    let width = 20;
    let filled = (value as f32 / total as f32 * width as f32) as usize;
    let empty = width - filled.min(width);
    format!("{}{}", "█".repeat(filled), "░".repeat(empty))
}

fn format_duration(duration: chrono::Duration) -> String {
    let secs = duration.num_seconds();
    if secs < 60 {
        format!("{}s", secs)
    } else if secs < 3600 {
        format!("{}m", secs / 60)
    } else if secs < 86400 {
        format!("{}h", secs / 3600)
    } else {
        format!("{}d", secs / 86400)
    }
}

fn load_registry() -> Result<AgentRegistry> {
    let agents_path = crate::storage::board_dir::find_board_dir()?
        .join("agents")
        .join("registry.json");
    if agents_path.exists() {
        AgentRegistry::load(&agents_path).map_err(|e| anyhow::anyhow!(e))
    } else {
        Ok(AgentRegistry::new())
    }
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

fn load_orchestration_state(board_name: &str) -> Option<OrchestrationState> {
    let state_path = crate::storage::board_dir::find_board_dir().ok()?
        .join("orchestration")
        .join(format!("{}.json", board_name));
    if state_path.exists() {
        let content = std::fs::read_to_string(&state_path).ok()?;
        serde_json::from_str(&content).ok()
    } else {
        None
    }
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
