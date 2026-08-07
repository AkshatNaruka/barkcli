use anyhow::Result;
use comfy_table::{Attribute, Cell};

use crate::storage::board_file::{list_board_files, read_board};
use crate::util::{display, style};

pub fn run() -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("{}", style::muted("No boards found."));
        return Ok(());
    }

    let mut t = display::table();
    let mut headers = vec!["Board".to_string()];
    let mut all_columns: Vec<String> = Vec::new();

    for name in &boards {
        if let Ok(board) = read_board(name) {
            for col in &board.columns {
                if !all_columns.contains(&col.id) {
                    all_columns.push(col.id.clone());
                }
            }
        }
    }
    headers.extend(all_columns.iter().map(|c| format!("[{}]", c)));
    headers.push("Total".into());
    t.set_header(headers.iter().map(|h| Cell::new(style::accent(h)).add_attributes(vec![Attribute::Bold])).collect::<Vec<_>>());

    for name in &boards {
        match read_board(name) {
            Ok(board) => {
                let mut row = vec![Cell::new(style::accent(name))];
                let total = board.cards.len();
                for col_id in &all_columns {
                    let count = board.cards.iter().filter(|c| c.column == *col_id).count();
                    let cell = if count > 0 {
                        style::strong(&count.to_string())
                    } else {
                        style::muted(&count.to_string())
                    };
                    row.push(Cell::new(cell));
                }
                row.push(Cell::new(style::strong(&total.to_string())));
                t.add_row(row);
            }
            Err(e) => {
                t.add_row(vec![
                    Cell::new(style::accent(name)),
                    Cell::new(style::err(&format!("error: {}", e))),
                ]);
            }
        }
    }

    println!("{t}");
    Ok(())
}
