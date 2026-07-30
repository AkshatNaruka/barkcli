use anyhow::{bail, Context, Result};

use crate::models::Board;
use crate::storage::board_file::{board_exists, write_board};

pub fn run(name: &str) -> Result<()> {
    if board_exists(name) {
        bail!("board '{}' already exists", name);
    }

    let board = Board::new(name);
    write_board(name, &board).context("failed to write board file")?;

    let filename = format!("{}.board", name);
    println!("Created board '{}' ({})", name, filename);
    Ok(())
}
