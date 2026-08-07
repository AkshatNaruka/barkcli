use anyhow::{Context, Result};
use comfy_table::Cell;

use crate::storage::board_file::{list_board_files, read_board};
use crate::storage::history::read_history;
use crate::util::{display, style};

pub fn run_log(board_name: Option<&str>) -> Result<()> {
    let name = resolve_board(board_name)?;
    let entries = read_history(&name)?;
    if entries.is_empty() {
        println!("{}", style::muted(format!("No history for '{}'", name)));
        return Ok(());
    }

    let mut t = display::table();
    t.set_header(display::header(vec!["Time", "Op", "Card", "Field", "Old", "New"]));
    for entry in entries.iter().rev().take(50) {
        let op_styled = match entry.op.as_str() {
            "add" => style::ok(&entry.op),
            "remove" => style::err(&entry.op),
            "move" | "done" => style::warn(&entry.op),
            _ => style::accent(&entry.op),
        };
        t.add_row(vec![
            Cell::new(style::muted(&entry.at)),
            Cell::new(op_styled),
            Cell::new(style::accent(&entry.card)),
            Cell::new(style::muted(entry.field.as_deref().unwrap_or("-"))),
            Cell::new(style::muted(entry.old_value.as_deref().unwrap_or("-"))),
            Cell::new(style::strong(entry.new_value.as_deref().unwrap_or("-"))),
        ]);
    }
    println!("{t}");
    println!("{}", style::muted(format!("Showing last {} entries for '{}'", entries.len().min(50), name)));
    Ok(())
}

pub fn run_diff(board_name: Option<&str>, ref_spec: Option<&str>) -> Result<()> {
    let name = resolve_board(board_name)?;
    let current = read_board(&name)?;

    let default_ref = "HEAD~1";
    let git_ref = ref_spec.unwrap_or(default_ref);

    // Get previous board state from git
    let file = format!("{}.board", name);
    let output = std::process::Command::new("git")
        .args(["show", &format!("{}:{}", git_ref, file)])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let prev: crate::models::Board = serde_yaml::from_slice(&o.stdout)
                .context("failed to parse previous board")?;

            let added: Vec<_> = current.cards.iter()
                .filter(|c| !prev.cards.iter().any(|p| p.id == c.id))
                .collect();
            let removed: Vec<_> = prev.cards.iter()
                .filter(|p| !current.cards.iter().any(|c| c.id == p.id))
                .collect();
            let moved: Vec<_> = current.cards.iter()
                .filter(|c| {
                    if let Some(p) = prev.cards.iter().find(|p| p.id == c.id) {
                        p.column != c.column
                    } else { false }
                })
                .collect();

            println!("{}", style::accent(format!("Diff {} → current for '{}':", git_ref, name)));
            println!();
            if added.is_empty() && removed.is_empty() && moved.is_empty() {
                println!("{}", style::muted("No changes."));
            }
            if !added.is_empty() {
                println!("{}", style::ok(format!("Added ({}):", added.len())));
                for c in added { println!("  {} {} [{}]", style::ok("+"), style::strong(&c.title), style::muted(&c.id)); }
            }
            if !removed.is_empty() {
                println!("{}", style::err(format!("Removed ({}):", removed.len())));
                for c in removed { println!("  {} {} [{}]", style::err("-"), style::strong(&c.title), style::muted(&c.id)); }
            }
            if !moved.is_empty() {
                println!("{}", style::warn(format!("Moved ({}):", moved.len())));
                for c in moved {
                    let prev_col = prev.cards.iter().find(|p| p.id == c.id)
                        .map(|p| p.column.as_str()).unwrap_or("?");
                    println!("  {} {} {} → {}", style::warn("→"), style::strong(&c.title), prev_col, c.column);
                }
            }
        }
        Ok(_) => {
            println!("No previous version found at '{}' for '{}'", git_ref, file);
        }
        Err(e) => {
            println!("Failed to get previous version: {}", e);
        }
    }

    Ok(())
}

pub fn run_pr_summary(board_name: Option<&str>, base: Option<&str>) -> Result<()> {
    let name = resolve_board(board_name)?;
    let current = read_board(&name)?;
    let base_ref = base.unwrap_or("main");

    let file = format!("{}.board", name);
    let output = std::process::Command::new("git")
        .args(["show", &format!("{}:{}", base_ref, file)])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let prev: crate::models::Board = serde_yaml::from_slice(&o.stdout)
                .context("failed to parse previous board")?;

            let added: Vec<_> = current.cards.iter()
                .filter(|c| !prev.cards.iter().any(|p| p.id == c.id))
                .collect();
            let moved: Vec<_> = current.cards.iter()
                .filter(|c| {
                    if let Some(p) = prev.cards.iter().find(|p| p.id == c.id) {
                        p.column != c.column
                    } else { false }
                })
                .collect();

            println!("## Board Changes: {}", name);
            println!();
            if added.is_empty() && moved.is_empty() {
                println!("No board changes.");
                return Ok(());
            }

            println!("| Card | Status | Priority | Assignee | ID |");
            println!("|---|---|---|---|---|");
            for c in &added {
                let assignee = c.assignee.as_deref().unwrap_or("-");
                println!("| {} | Added → {} | {} | {} | {} |",
                    c.title, c.column, c.priority, assignee, c.id);
            }
            for c in &moved {
                let prev_col = prev.cards.iter().find(|p| p.id == c.id)
                    .map(|p| p.column.as_str()).unwrap_or("?");
                let assignee = c.assignee.as_deref().unwrap_or("-");
                println!("| {} | {} → {} | {} | {} | {} |",
                    c.title, prev_col, c.column, c.priority, assignee, c.id);
            }
        }
        Ok(_) => {
            println!("No base version found at '{}' for '{}'", base_ref, file);
        }
        Err(e) => {
            println!("Failed to get base version: {}", e);
        }
    }

    Ok(())
}

fn resolve_board(board_name: Option<&str>) -> Result<String> {
    if let Some(name) = board_name {
        return Ok(name.to_string());
    }
    let boards = list_board_files()?;
    if boards.is_empty() {
        anyhow::bail!("No boards found. Create one with `barkcli create <name>`");
    }
    if boards.len() == 1 {
        Ok(boards[0].clone())
    } else {
        anyhow::bail!("Multiple boards found. Specify with --board: {}", boards.join(", "));
    }
}
