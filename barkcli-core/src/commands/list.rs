use anyhow::Result;
use comfy_table::Cell;

use crate::storage::board_file::list_board_files;
use crate::storage::board_file::read_board;
use crate::util::{display, style};

pub fn run() -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("{}", style::muted("No boards found. Create one with `barkcli create <name>`"));
        return Ok(());
    }

    let mut t = display::table();
    t.set_header(display::header(vec!["Board", "Cards", "Columns"]));
    for name in &boards {
        match read_board(name) {
            Ok(board) => {
                let card_count = board.cards.len().to_string();
                let col_count = board.columns.len().to_string();
                t.add_row(vec![
                    Cell::new(style::accent(name)),
                    Cell::new(&card_count),
                    Cell::new(&col_count),
                ]);
            }
            Err(e) => {
                t.add_row(vec![
                    Cell::new(style::accent(name)),
                    Cell::new(style::err("error")),
                    Cell::new(style::muted(&e.to_string())),
                ]);
            }
        }
    }
    println!("{t}");
    Ok(())
}
