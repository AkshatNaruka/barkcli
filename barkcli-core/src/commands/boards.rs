use anyhow::{bail, Result};

use crate::models::Board;
use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::{board_exists, list_board_files, write_board};
use crate::storage::config_store::{read_config, write_config};

pub fn run_boards_list() -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("No boards. Create one with `board boards create <name>`");
        return Ok(());
    }

    let default = default_board_name()?;
    for name in &boards {
        let marker = if Some(name.as_str()) == default.as_deref() {
            " ← default"
        } else {
            ""
        };
        println!("  {}{}", name, marker);
    }
    Ok(())
}

pub fn run_boards_create(name: &str) -> Result<()> {
    if board_exists(name) {
        bail!("board '{}' already exists", name);
    }
    let board = Board::new(name);
    write_board(name, &board)?;
    println!("Created board '{}.board'", name);
    println!("Switch to it: board switch {}", name);
    Ok(())
}

pub fn run_switch(name: &str) -> Result<()> {
    if !board_exists(name) {
        bail!("board '{}' does not exist. Create it: board boards create {}", name, name);
    }

    let board_dir = find_board_dir()?;
    let mut config = read_config(&board_dir).unwrap_or_default();
    config.default_board = Some(name.to_string());
    write_config(&board_dir, &config)?;

    println!("Switched to board '{}'", name);
    Ok(())
}

pub fn default_board_name() -> Result<Option<String>> {
    let board_dir = find_board_dir()?;
    let config = read_config(&board_dir).unwrap_or_default();
    Ok(config.default_board)
}

pub fn resolve_board(board_arg: Option<&str>) -> Result<String> {
    if let Some(name) = board_arg {
        return Ok(name.to_string());
    }

    let def = default_board_name()?;
    if let Some(name) = def {
        return Ok(name);
    }

    let boards = list_board_files()?;
    if boards.len() == 1 {
        return Ok(boards[0].clone());
    }
    if boards.is_empty() {
        bail!("No boards found. Run `board init` first.");
    }
    bail!(
        "No default board set. Choose one: board switch <name>\nAvailable: {}",
        boards.join(", ")
    );
}
