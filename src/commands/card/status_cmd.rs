use anyhow::{Context, Result};

use crate::storage::board_file::{read_board, write_board};
use crate::storage::history;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing card id"))?;
    let column = args
        .get(1)
        .ok_or_else(|| anyhow::anyhow!("missing target status (column)"))?;

    let mut board = read_board(name).context(format!("board '{}' not found", name))?;

    let valid_column = board.columns.iter().any(|c| c.id == *column);
    if !valid_column {
        let valid: Vec<_> = board.columns.iter().map(|c| c.id.as_str()).collect();
        anyhow::bail!(
            "invalid status '{}'. Valid statuses: {}",
            column,
            valid.join(", ")
        );
    }

    let card = board
        .cards
        .iter_mut()
        .find(|c| c.id == *id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found in '{}'", id, name))?;

    let old = card.column.clone();
    card.column = column.clone();

    write_board(name, &board).context("failed to write board")?;

    history::log_move(name, id, &old, column)?;
    println!("'{}' status changed: {} -> {}", id, old, column);
    Ok(())
}
