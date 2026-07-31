use anyhow::{Context, Result};

use crate::storage::board_file::{read_board, write_board};
use crate::storage::history;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing card id"))?;

    let mut board = read_board(name).context(format!("board '{}' not found", name))?;

    let pos = board
        .cards
        .iter()
        .position(|c| c.id == *id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found in '{}'", id, name))?;

    let card = board.cards.remove(pos);
    write_board(name, &board).context("failed to write board")?;

    history::log_remove(name, &card.id, &card.title)?;
    println!("Removed card '{}' (id: {}) from '{}'", card.title, card.id, name);
    Ok(())
}
