use anyhow::{bail, Result};

use barkcli_core::models::Board;
use barkcli_core::storage::board_file::read_board;

pub fn run(since: &str, json: bool) -> Result<()> {
    let name = barkcli_core::commands::boards::resolve_board(None)?;
    let board = read_board(&name)?;

    let now = chrono::Utc::now();
    let since_time = parse_since(since)?;

    let completed: Vec<_> = board.cards.iter().filter(|c| c.column == "done").collect();
    let in_progress: Vec<_> = board.cards.iter().filter(|c| c.column == "doing" || c.column == "review").collect();
    let blocked: Vec<_> = board.cards.iter().filter(|c| c.blocked_by.is_some() || c.links.iter().any(|l| l.ty == barkcli_core::models::card::LinkType::BlockedBy)).collect();
    let todo: Vec<_> = board.cards.iter().filter(|c| c.column == "todo").collect();

    let total_effort: u32 = board.cards.iter().filter_map(|c| c.effort).sum();
    let done_effort: u32 = completed.iter().filter_map(|c| c.effort).sum();

    if json {
        let output = serde_json::json!({
            "board": name,
            "date": now.to_rfc3339(),
            "since": since,
            "summary": {
                "completed": completed.len(),
                "in_progress": in_progress.len(),
                "blocked": blocked.len(),
                "todo": todo.len(),
                "total": board.cards.len(),
                "total_effort": total_effort,
                "done_effort": done_effort
            },
            "completed_cards": completed.iter().map(|c| serde_json::json!({
                "id": c.id, "title": c.title, "priority": c.priority,
                "labels": c.labels, "assignee": c.assignee, "effort": c.effort
            })).collect::<Vec<_>>(),
        });
        println!("{}", serde_json::to_string_pretty(&output)?);
        return Ok(());
    }

    println!("## Board Report — {}", name);
    println!("**{}** (since {})\n", now.format("%b %d, %Y"), since);
    println!("| Category     | Count | Effort |");
    println!("|-------------|-------|--------|");
    println!("| ✅ Completed  | {} | {} / {} pts |", completed.len(), done_effort, total_effort);
    println!("| 🔄 In Progress | {} | |", in_progress.len());
    println!("| 🚫 Blocked    | {} | |", blocked.len());
    println!("| 📋 To Do      | {} | |", todo.len());
    println!();

    if !completed.is_empty() {
        println!("### ✅ Completed ({})\n", completed.len());
        for c in &completed {
            println!("- **{}** `[{}]` — {}", c.title, c.priority, labels_str(c));
        }
        println!();
    }

    if !in_progress.is_empty() {
        println!("### 🔄 In Progress ({})\n", in_progress.len());
        for c in &in_progress {
            println!("- **{}** `[{}]` (`{}`) — {}", c.title, c.priority, c.column, labels_str(c));
        }
        println!();
    }

    if !blocked.is_empty() {
        println!("### 🚫 Blocked ({})\n", blocked.len());
        for c in &blocked {
            let by = c.blocked_by.as_deref().unwrap_or("?");
            println!("- **{}** `[{}]` — blocked by `{}`", c.title, c.priority, by);
        }
        println!();
    }

    Ok(())
}

/// `report --sprint <name>` — effort burndown for a sprint's cards.
pub fn run_sprint_report(sprint_name: &str, json: bool) -> Result<()> {
    let name = barkcli_core::commands::boards::resolve_board(None)?;
    let board = read_board(&name)?;

    let tag = format!("sprint:{}", sprint_name);
    let cards: Vec<_> = board
        .cards
        .iter()
        .filter(|c| c.labels.iter().any(|l| l == &tag))
        .collect();

    if cards.is_empty() {
        // Fall back: cards whose parent chain leads to a sprint-tagged PBI
        println!("No cards tagged '{}' — tag cards with `-l {}` or link them to a tagged PBI.", tag, tag);
        return Ok(());
    }

    let total: u32 = cards.iter().filter_map(|c| c.effort).sum();
    let done: u32 = cards.iter().filter(|c| c.column == "done").filter_map(|c| c.effort).sum();
    let remaining: u32 = total - done;

    if json {
        let output = serde_json::json!({
            "sprint": sprint_name,
            "total_effort": total,
            "done_effort": done,
            "remaining_effort": remaining,
            "cards": cards.iter().map(|c| serde_json::json!({
                "id": c.id, "title": c.title, "column": c.column, "effort": c.effort
            })).collect::<Vec<_>>()
        });
        println!("{}", serde_json::to_string_pretty(&output)?);
        return Ok(());
    }

    let pct = if total > 0 { (done as f64 / total as f64 * 100.0).round() as u32 } else { 0 };
    let bar_width = 20usize;
    let filled = ((pct as usize) * bar_width / 100).min(bar_width);
    let bar: String = format!(
        "[{}{}] {}%",
        "█".repeat(filled),
        "░".repeat(bar_width - filled),
        pct
    );

    println!("## Sprint Burndown — {}", sprint_name);
    println!();
    println!("{}", bar);
    println!();
    println!("| Metric | Points |");
    println!("|--------|--------|");
    println!("| Total | {} |", total);
    println!("| Done | {} |", done);
    println!("| Remaining | {} |", remaining);
    println!();
    println!("### Cards");
    for c in &cards {
        let col = match c.column.as_str() {
            "done" => "✅",
            "doing" => "🔄",
            "review" => "👀",
            _ => "📋",
        };
        println!(
            "- {} **{}** `[{}]` ({}){}",
            col,
            c.title,
            c.id,
            c.column,
            c.effort.map(|e| format!(" — {} pts", e)).unwrap_or_default()
        );
    }
    Ok(())
}

fn labels_str(c: &barkcli_core::models::Card) -> String {
    if c.labels.is_empty() {
        String::new()
    } else {
        c.labels.iter().map(|l| format!("`{}`", l)).collect::<Vec<_>>().join(" ")
    }
}

fn parse_since(s: &str) -> Result<chrono::DateTime<chrono::Utc>> {
    // Handle relative times
    if let Some(days) = s.strip_suffix(" days ago").and_then(|s| s.trim().parse::<i64>().ok()) {
        return Ok(chrono::Utc::now() - chrono::Duration::days(days));
    }
    if let Some(weeks) = s.strip_suffix(" weeks ago").and_then(|s| s.trim().parse::<i64>().ok()) {
        return Ok(chrono::Utc::now() - chrono::Duration::weeks(weeks));
    }
    // Try parsing as ISO date
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Ok(dt.with_timezone(&chrono::Utc));
    }
    bail!("Invalid time: {}. Use '7 days ago' or ISO date.", s)
}
