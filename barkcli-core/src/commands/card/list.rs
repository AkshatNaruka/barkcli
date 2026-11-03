use anyhow::{Context, Result};
use comfy_table::{Cell, Color};

use crate::storage::board_file::read_board;
use crate::util::{display, style};

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let board = read_board(name).context(format!("board '{}' not found", name))?;

    let mut filter_column: Option<&str> = None;
    let mut filter_priority: Option<&str> = None;
    let mut filter_label: Option<&str> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-c" | "--column" => {
                i += 1;
                filter_column = args.get(i).map(|s| s.as_str());
            }
            "-p" | "--priority" => {
                i += 1;
                filter_priority = args.get(i).map(|s| s.as_str());
            }
            "-l" | "--label" => {
                i += 1;
                filter_label = args.get(i).map(|s| s.as_str());
            }
            _ => {}
        }
        i += 1;
    }

    let cards: Vec<_> = board
        .cards
        .iter()
        .filter(|c| filter_column.map_or(true, |f| c.column == f))
        .filter(|c| filter_priority.map_or(true, |f| c.priority == f))
        .filter(|c| filter_label.map_or(true, |f| c.labels.iter().any(|l| l == f)))
        .collect();

    if cards.is_empty() {
        println!("No cards in '{}'", name);
        return Ok(());
    }

    let mut t = display::table();
    t.set_header(display::header(vec!["ID", "Title", "Column", "Priority", "Labels"]));
    for card in &cards {
        let priority_cell = match card.priority.as_str() {
            "high" | "critical" => Cell::new(&card.priority).fg(Color::Red),
            "medium" => Cell::new(&card.priority).fg(Color::Yellow),
            "low" => Cell::new(&card.priority).fg(Color::DarkGrey),
            _ => Cell::new(&card.priority),
        };
        let column_cell = match card.column.as_str() {
            "done" | "completed" => Cell::new(&card.column).fg(Color::Green),
            "doing" | "in-progress" => Cell::new(&card.column).fg(Color::Yellow),
            _ => Cell::new(&card.column),
        };

        t.add_row(vec![
            Cell::new(&card.id),
            Cell::new(style::title(&card.title, card.pinned)),
            column_cell,
            priority_cell,
            Cell::new(&card.labels.join(", ")),
        ]);
    }
    println!("{t}");
    Ok(())
}
