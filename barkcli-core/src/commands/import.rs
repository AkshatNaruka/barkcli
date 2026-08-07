use anyhow::{Context, Result};

use crate::models::Board;
use crate::storage::board_file::write_board;
use crate::util::style;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let input = if let Some(file) = args.first() {
        std::fs::read_to_string(file).context(format!("failed to read '{}'", file))?
    } else {
        use std::io::Read;
        let mut buf = String::new();
        std::io::stdin()
            .read_to_string(&mut buf)
            .context("failed to read stdin")?;
        buf
    };

    let board: Board = serde_yaml::from_str(&input)
        .or_else(|_| {
            // Try JSON if YAML fails
            serde_json::from_str::<Board>(&input)
                .map_err(|e| anyhow::anyhow!("failed to parse input as YAML or JSON: {}", e))
        })
        .context("failed to parse board data")?;

    write_board(name, &board).context("failed to write board")?;
    println!("{} board '{}' ({} cards)", style::ok("Imported"), name, board.cards.len());
    Ok(())
}
