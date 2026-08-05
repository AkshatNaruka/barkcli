use anyhow::{Context, Result};
use serde_yaml;

use crate::models::Board;
use crate::storage::board_file::{list_board_files, write_board};
use crate::commands::validate::validate_board;
use crate::util::style;

pub fn run() -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("{}", style::muted("No boards found."));
        return Ok(());
    }

    let mut fixed_any = false;

    for name in &boards {
        let errors = validate_board(name);
        if errors.is_empty() {
            println!("{}  {}.board", style::ok("OK"), name);
            continue;
        }

        println!("Fix {}.board:", name);
        for err in &errors {
            println!("  - {}", err);
        }

        if fix_board(name)? {
            fixed_any = true;
            println!("  ✓ fixed\n");
        } else {
            println!("  ✗ could not auto-fix\n");
        }
    }

    if fixed_any {
        println!("{}", style::warn("Some files were fixed. Review changes with `git diff`."));
    } else {
        println!("{}", style::ok("No files needed changes."));
    }
    Ok(())
}

fn fix_board(name: &str) -> Result<bool> {
    let content = std::fs::read_to_string(format!("{}.board", name))
        .context("failed to read board file")?;

    let mut value: serde_yaml::Value = serde_yaml::from_str(&content)
        .context("failed to parse YAML")?;

    let mapping = match value.as_mapping_mut() {
        Some(m) => m,
        None => return Ok(false),
    };

    let mut changed = false;

    if !mapping.contains_key("title") {
        mapping.insert("title".into(), name.into());
        changed = true;
    }

    let valid_columns: Vec<serde_yaml::Value> = mapping
        .get("columns")
        .and_then(|c| c.as_sequence())
        .map(|cols| {
            cols.iter()
                .filter_map(|c| c.get("id").cloned())
                .collect()
        })
        .unwrap_or_default();

    if let Some(cards) = mapping.get_mut("cards").and_then(|c| c.as_sequence_mut()) {
        for card in cards.iter_mut() {
            let card_map = match card.as_mapping_mut() {
                Some(m) => m,
                None => continue,
            };

            if !card_map.contains_key("title") {
                card_map.insert("title".into(), "Untitled".into());
                changed = true;
            }

            if !card_map.contains_key("column") {
                if let Some(first_col) = valid_columns.first() {
                    card_map.insert("column".into(), first_col.clone());
                } else {
                    card_map.insert("column".into(), "todo".into());
                }
                changed = true;
            }

            if !card_map.contains_key("priority") {
                card_map.insert("priority".into(), "medium".into());
                changed = true;
            }
        }
    }

    if changed {
        let fixed: Board = serde_yaml::from_value(value)
            .context("failed to deserialize fixed board")?;
        write_board(name, &fixed)?;
    }

    Ok(changed)
}
