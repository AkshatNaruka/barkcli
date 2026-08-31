use anyhow::{Context, Result};

use crate::storage::board_file::{read_board_with_hash, write_board_if_unchanged};
use crate::storage::history;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing card id"))?;
    let column = args
        .get(1)
        .ok_or_else(|| anyhow::anyhow!("missing target column"))?;

    let (mut board, hash) =
        read_board_with_hash(name).context(format!("board '{}' not found", name))?;

    let valid_column = board.columns.iter().any(|c| c.id == *column);
    if !valid_column {
        let valid: Vec<_> = board.columns.iter().map(|c| c.id.as_str()).collect();
        anyhow::bail!(
            "invalid column '{}'. Valid columns: {}",
            column,
            valid.join(", ")
        );
    }

    let card = board
        .cards
        .iter_mut()
        .find(|c| c.id == *id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found in '{}'", id, name))?;

    let old_column = card.column.clone();
    card.column = column.clone();
    card.touch();

    match write_board_if_unchanged(name, &board, &hash)? {
        true => {}
        false => {
            anyhow::bail!(
                "conflict: '{}' was modified since you read it. Re-run the command to retry.",
                id
            );
        }
    }

    history::log_move(name, id, &old_column, column)?;
    println!(
        "Moved '{}' from '{}' to '{}' (v{})",
        id, old_column, column, board.cards.iter().find(|c| c.id == *id).unwrap().version
    );
    Ok(())
}
