use anyhow::{Context, Result};

use crate::models::Card;
use crate::storage::board_file::{read_board, write_board};
use crate::storage::history;
use crate::util::slug::unique_slug;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let title = args
        .first()
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("missing title"))?;

    let mut board = read_board(name).context(format!("board '{}' not found", name))?;

    let existing_ids: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
    let id = unique_slug(&title, &existing_ids);

    let rest = &args[1..];
    let mut column = None;
    let mut priority = None;
    let mut description = None;
    let mut labels = Vec::new();
    let mut assignee = None;
    let mut due_date = None;

    let mut i = 0;
    while i < rest.len() {
        match rest[i].as_str() {
            "-c" | "--column" => {
                i += 1;
                column = rest.get(i).cloned();
            }
            "-p" | "--priority" => {
                i += 1;
                priority = rest.get(i).cloned();
            }
            "-d" | "--description" => {
                i += 1;
                description = rest.get(i).cloned();
            }
            "-l" | "--label" => {
                i += 1;
                if let Some(l) = rest.get(i) {
                    labels.push(l.clone());
                }
            }
            "-a" | "--assignee" => {
                i += 1;
                assignee = rest.get(i).cloned();
            }
            "--due" => {
                i += 1;
                if let Some(d) = rest.get(i) {
                    due_date = Some(format!("{}T00:00:00Z", d));
                }
            }
            _ => {}
        }
        i += 1;
    }

    let col_id = column.unwrap_or_else(|| {
        board
            .columns
            .first()
            .map(|c| c.id.clone())
            .unwrap_or_else(|| "todo".into())
    });

    let mut card = Card::new(&id, &title, &col_id);
    card.priority = priority.unwrap_or_else(|| "medium".into());
    card.description = description;
    card.labels = labels;
    card.assignee = assignee;
    card.due_date = due_date;

    board.cards.push(card);
    write_board(name, &board).context("failed to write board")?;

    history::log_add(name, &id, &title)?;
    println!("Added card '{}' (id: {}) to '{}'", title, id, name);
    Ok(())
}
