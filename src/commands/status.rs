use anyhow::Result;
use comfy_table::Cell;

use crate::storage::board_file::{list_board_files, read_board};
use crate::util::display::table;

pub fn run() -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("No boards found.");
        return Ok(());
    }

    let mut t = table();
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
    t.set_header(headers);

    for name in &boards {
        match read_board(name) {
            Ok(board) => {
                let mut row = vec![Cell::new(name)];
                let total = board.cards.len();
                for col_id in &all_columns {
                    let count = board.cards.iter().filter(|c| c.column == *col_id).count();
                    row.push(Cell::new(&count.to_string()));
                }
                row.push(Cell::new(&total.to_string()));
                t.add_row(row);
            }
            Err(e) => {
                t.add_row(vec![
                    Cell::new(name),
                    Cell::new(&format!("error: {}", e)),
                ]);
            }
        }
    }

    println!("{t}");
    Ok(())
}
