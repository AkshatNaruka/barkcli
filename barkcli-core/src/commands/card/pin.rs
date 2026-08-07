use anyhow::Result;
use crate::storage::board_file::{read_board, write_board};

pub fn run_pin(board_name: &str, card_id: &str) -> Result<()> {
    let mut board = read_board(board_name)?;
    let card = board.cards.iter_mut()
        .find(|c| c.id == card_id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found", card_id))?;
    card.pinned = true;
    write_board(board_name, &board)?;
    println!("Pinned '{}'", card_id);
    Ok(())
}

pub fn run_unpin(board_name: &str, card_id: &str) -> Result<()> {
    let mut board = read_board(board_name)?;
    let card = board.cards.iter_mut()
        .find(|c| c.id == card_id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found", card_id))?;
    card.pinned = false;
    write_board(board_name, &board)?;
    println!("Unpinned '{}'", card_id);
    Ok(())
}
