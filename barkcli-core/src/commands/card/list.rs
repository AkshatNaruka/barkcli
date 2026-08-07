use anyhow::{Context, Result};
use comfy_table::Cell;

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
        t.add_row(vec![
            Cell::new(style::muted(&card.id)),
            Cell::new(style::title(&card.title, card.pinned)),
            Cell::new(style::column(&card.column)),
            Cell::new(style::priority(&card.priority)),
            Cell::new(style::muted(&card.labels.join(", "))),
        ]);
    }
    println!("{t}");
    Ok(())
}
