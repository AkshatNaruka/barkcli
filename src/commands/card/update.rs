use anyhow::{Context, Result};

use crate::storage::board_file::{read_board, write_board};
use crate::storage::history;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing card id"))?;

    let mut board = read_board(name).context(format!("board '{}' not found", name))?;

    let card = board
        .cards
        .iter_mut()
        .find(|c| c.id == *id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found in '{}'", id, name))?;

    let mut changed = Vec::new();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-t" | "--title" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.title.clone();
                    card.title = v.clone();
                    changed.push(("title", old, v.clone()));
                }
            }
            "-d" | "--description" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.description.clone().unwrap_or_default();
                    card.description = Some(v.clone());
                    changed.push(("description", old, v.clone()));
                }
            }
            "-p" | "--priority" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.priority.clone();
                    card.priority = v.clone();
                    changed.push(("priority", old, v.clone()));
                }
            }
            "-l" | "--label" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    card.labels.push(v.clone());
                    changed.push(("labels", "".into(), v.clone()));
                }
            }
            "-a" | "--assignee" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.assignee.clone().unwrap_or_default();
                    card.assignee = Some(v.clone());
                    changed.push(("assignee", old, v.clone()));
                }
            }
            "-c" | "--column" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.column.clone();
                    card.column = v.clone();
                    changed.push(("column", old, v.clone()));
                }
            }
            _ => {}
        }
        i += 1;
    }

    write_board(name, &board).context("failed to write board")?;

    for (field, from, to) in &changed {
        let _ = history::log_update(name, id, field, from, to);
    }
    println!("Updated card '{}' in '{}'", id, name);
    Ok(())
}
