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
    let blocked: Vec<_> = board.cards.iter().filter(|c| c.blocked_by.is_some()).collect();
    let todo: Vec<_> = board.cards.iter().filter(|c| c.column == "todo").collect();

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
                "total": board.cards.len()
            },
            "completed_cards": completed.iter().map(|c| serde_json::json!({
                "id": c.id, "title": c.title, "priority": c.priority,
                "labels": c.labels, "assignee": c.assignee
            })).collect::<Vec<_>>(),
        });
        println!("{}", serde_json::to_string_pretty(&output)?);
        return Ok(());
    }

    println!("## Board Report — {}", name);
    println!("**{}** (since {})\n", now.format("%b %d, %Y"), since);
    println!("| Category     | Count |");
    println!("|-------------|-------|");
    println!("| ✅ Completed  | {} |", completed.len());
    println!("| 🔄 In Progress | {} |", in_progress.len());
    println!("| 🚫 Blocked    | {} |", blocked.len());
    println!("| 📋 To Do      | {} |", todo.len());
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
