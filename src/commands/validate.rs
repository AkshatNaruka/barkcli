use std::collections::HashSet;

use anyhow::Result;
use serde_yaml;

use crate::storage::board_file::list_board_files;

pub fn run() -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("No boards found.");
        return Ok(());
    }

    let mut has_errors = false;

    for name in &boards {
        let errors = validate_board(name);
        if errors.is_empty() {
            println!("OK  {}.board", name);
        } else {
            has_errors = true;
            for err in &errors {
                println!("ERR {}.board: {}", name, err);
            }
        }
    }

    if has_errors {
        println!("\nValidation found errors. Run `board doctor` to auto-fix.");
        std::process::exit(1);
    } else {
        println!("\nAll boards valid.");
    }
    Ok(())
}

pub fn validate_board(name: &str) -> Vec<String> {
    let mut errors = Vec::new();

    let path = match std::fs::read_to_string(format!("{}.board", name)) {
        Ok(c) => c,
        Err(e) => {
            errors.push(format!("cannot read file: {}", e));
            return errors;
        }
    };

    let value: serde_yaml::Value = match serde_yaml::from_str(&path) {
        Ok(v) => v,
        Err(e) => {
            errors.push(format!("invalid YAML: {}", e));
            return errors;
        }
    };

    let mapping = match value.as_mapping() {
        Some(m) => m,
        None => {
            errors.push("board file must be a YAML mapping".into());
            return errors;
        }
    };

    if !mapping.contains_key("title") {
        errors.push("missing required field 'title'".into());
    }

    let columns = match mapping.get("columns").and_then(|c| c.as_sequence()) {
        Some(cols) => {
            if cols.is_empty() {
                errors.push("'columns' list is empty".into());
            }
            cols
        }
        None => {
            errors.push("missing required field 'columns'".into());
            return errors;
        }
    };

    let valid_column_ids: HashSet<&str> = columns
        .iter()
        .filter_map(|c| c.get("id").and_then(|id| id.as_str()))
        .collect();

    if let Some(cards) = mapping.get("cards").and_then(|c| c.as_sequence()) {
        let mut seen_ids = HashSet::new();
        for (i, card) in cards.iter().enumerate() {
            let card_id = card
                .get("id")
                .and_then(|id| id.as_str())
                .unwrap_or("<missing id>");

            if !seen_ids.insert(card_id) {
                errors.push(format!("duplicate card id '{}'", card_id));
            }

            if card.get("title").and_then(|t| t.as_str()).is_none() {
                errors.push(format!("card #{} (id: {}) missing 'title'", i + 1, card_id));
            }

            if let Some(col) = card.get("column").and_then(|c| c.as_str()) {
                if !valid_column_ids.contains(col) {
                    errors.push(format!(
                        "card '{}' references unknown column '{}'. Valid: {:?}",
                        card_id,
                        col,
                        valid_column_ids.iter().collect::<Vec<_>>()
                    ));
                }
            } else {
                errors.push(format!("card '{}' missing 'column' field", card_id));
            }

            if let Some(priority) = card.get("priority").and_then(|p| p.as_str()) {
                if !["high", "medium", "low"].contains(&priority) {
                    errors.push(format!(
                        "card '{}' has invalid priority '{}' (expected high/medium/low)",
                        card_id, priority
                    ));
                }
            }
        }
    }

    errors
}
