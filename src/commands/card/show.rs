use anyhow::{Context, Result};

use crate::storage::board_file::read_board;

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

    println!("  ID:         {}", card.id);
    println!("  Title:      {}", card.title);
    println!("  Column:     {}", card.column);
    println!("  Priority:   {}", card.priority);
    if let Some(desc) = &card.description {
        println!("  Description:");
        for line in desc.lines() {
            println!("    {}", line);
        }
    }
    if !card.labels.is_empty() {
        println!("  Labels:     {}", card.labels.join(", "));
    }
    if let Some(assignee) = &card.assignee {
        println!("  Assignee:   {}", assignee);
    }
    if let Some(due) = &card.due_date {
        println!("  Due:        {}", due);
    }
    if !card.checklist.is_empty() {
        println!("  Checklist:");
        for item in &card.checklist {
            let check = if item.done { "[x]" } else { "[ ]" };
            println!("    {} {}", check, item.text);
        }
    }
    if !card.comments.is_empty() {
        println!("  Comments:");
        for comment in &card.comments {
            println!("    {} ({}): {}", comment.author, comment.at.format("%Y-%m-%d %H:%M"), comment.text);
        }
    }
    println!("  Created:    {}", card.created_at.format("%Y-%m-%d %H:%M:%S UTC"));
    println!("  Updated:    {}", card.updated_at.format("%Y-%m-%d %H:%M:%S UTC"));
    Ok(())
}
