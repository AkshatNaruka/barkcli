use anyhow::{Context, Result};

use crate::storage::board_file::read_board;
use crate::util::style;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing card id"))?;

    let board = read_board(name).context(format!("board '{}' not found", name))?;

    let card = board
        .cards
        .iter()
        .find(|c| c.id == *id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found in '{}'", id, name))?;

    let pin = if card.pinned { " 📌" } else { "" };
    println!("  {} {}{}", style::accent("ID:"), style::muted(&card.id), pin);
    println!("  {} {}", style::accent("Title:"), style::strong(&card.title));
    println!("  {} {}", style::accent("Column:"), style::column(&card.column));
    println!("  {} {}", style::accent("Priority:"), style::priority(&card.priority));
    if let Some(desc) = &card.description {
        println!("  {}", style::accent("Description:"));
        for line in desc.lines() {
            println!("    {}", line);
        }
    }
    if !card.labels.is_empty() {
        println!("  {} {}", style::accent("Labels:"), style::muted(&card.labels.join(", ")));
    }
    if let Some(assignee) = &card.assignee {
        println!("  {} {}", style::accent("Assignee:"), style::strong(assignee));
    }
    if let Some(due) = &card.due_date {
        println!("  {} {}", style::accent("Due:"), style::muted(due));
    }
    if let Some(blocked) = &card.blocked_by {
        println!("  {} {}", style::accent("Blocked by:"), style::err(blocked));
    }
    if !card.checklist.is_empty() {
        println!("  {}", style::accent("Checklist:"));
        for item in &card.checklist {
            let check = if item.done {
                style::ok("[x]")
            } else {
                style::muted("[ ]")
            };
            let text = if item.done {
                style::muted(&item.text)
            } else {
                item.text.clone()
            };
            println!("    {} {}", check, text);
        }
    }
    if !card.comments.is_empty() {
        println!("  {}", style::accent("Comments:"));
        for comment in &card.comments {
            println!("    {} {} ({})", style::strong(&comment.author), comment.text, style::muted(&comment.at.format("%Y-%m-%d %H:%M").to_string()));
        }
    }
    println!("  {} {}", style::accent("Created:"), style::muted(&card.created_at.format("%Y-%m-%d %H:%M:%S UTC").to_string()));
    println!("  {} {}", style::accent("Updated:"), style::muted(&card.updated_at.format("%Y-%m-%d %H:%M:%S UTC").to_string()));
    Ok(())
}
