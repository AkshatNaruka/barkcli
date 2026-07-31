use anyhow::Result;
use comfy_table::Cell;

use crate::storage::board_file::list_board_files;
use crate::storage::board_file::read_board;
use crate::util::display::table;

pub fn run() -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("No boards found. Create one with `board create <name>`");
        return Ok(());
    }

    let mut t = table();
    t.set_header(vec!["Board", "Cards", "Columns"]);
    for name in &boards {
        match read_board(name) {
            Ok(board) => {
                let card_count = board.cards.len().to_string();
                let col_count = board.columns.len().to_string();
                t.add_row(vec![Cell::new(name), Cell::new(&card_count), Cell::new(&col_count)]);
            }
            Err(e) => {
                t.add_row(vec![
                    Cell::new(name),
                    Cell::new("error"),
                    Cell::new(&e.to_string()),
                ]);
            }
        }
    }
    println!("{t}");
    Ok(())
}
