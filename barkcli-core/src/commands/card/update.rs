use anyhow::{Context, Result};

use crate::storage::board_file::{read_board_with_hash, write_board_if_unchanged};
use crate::storage::history;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing card id"))?;

    let (mut board, hash) =
        read_board_with_hash(name).context(format!("board '{}' not found", name))?;

    let card = board
        .cards
        .iter_mut()
        .find(|c| c.id == *id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found in '{}'", id, name))?;

    let mut changed = Vec::new();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-t" | "--title" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.title.clone();
                    card.title = v.clone();
                    changed.push(("title", old, v.clone()));
                }
            }
            "-d" | "--description" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.description.clone().unwrap_or_default();
                    card.description = Some(v.clone());
                    changed.push(("description", old, v.clone()));
                }
            }
            "-p" | "--priority" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.priority.clone();
                    card.priority = v.clone();
                    changed.push(("priority", old, v.clone()));
                }
            }
            "-l" | "--label" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    card.labels.push(v.clone());
                    changed.push(("labels", "".into(), v.clone()));
                }
            }
            "-a" | "--assignee" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.assignee.clone().unwrap_or_default();
                    card.assignee = Some(v.clone());
                    changed.push(("assignee", old, v.clone()));
                }
            }
            "-c" | "--column" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.column.clone();
                    card.column = v.clone();
                    changed.push(("column", old, v.clone()));
                }
            }
            "--remind" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.remind_at.clone().unwrap_or_default();
                    card.remind_at = Some(crate::commands::card::add::normalize_remind(v));
                    changed.push(("remind_at", old, v.clone()));
                }
            }
            "--no-remind" => {
                let old = card.remind_at.clone().unwrap_or_default();
                card.remind_at = None;
                changed.push(("remind_at", old, "none".into()));
            }
            "--due" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.due_date.clone().unwrap_or_default();
                    card.due_date = Some(format!("{}T00:00:00Z", v));
                    changed.push(("due_date", old, v.clone()));
                }
            }
            "--effort" => {
                i += 1;
                if let Some(v) = args.get(i).and_then(|v| v.parse().ok()) {
                    let old = card.effort.map(|e| e.to_string()).unwrap_or_default();
                    card.effort = Some(v);
                    changed.push(("effort", old, v.to_string()));
                }
            }
            "--no-effort" => {
                let old = card.effort.map(|e| e.to_string()).unwrap_or_default();
                card.effort = None;
                changed.push(("effort", old, "none".into()));
            }
            "--area" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.area.clone().unwrap_or_default();
                    card.area = Some(v.clone());
                    changed.push(("area", old, v.clone()));
                }
            }
            "--no-area" => {
                let old = card.area.clone().unwrap_or_default();
                card.area = None;
                changed.push(("area", old, "none".into()));
            }
            "--ac" | "--criterion" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    card.acceptance_criteria.push(v.clone());
                    changed.push(("acceptance_criteria", "".to_string(), v.clone()));
                }
            }
            "--rm-ac" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let old = card.acceptance_criteria.join(" | ");
                    card.acceptance_criteria.retain(|a| a != v);
                    changed.push(("acceptance_criteria", old, card.acceptance_criteria.join(" | ")));
                }
            }
            _ => {}
        }
        i += 1;
    }

    if changed.is_empty() {
        anyhow::bail!("no changes specified for card '{}'", id);
    }

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

    for (field, from, to) in &changed {
        let _ = history::log_update(name, id, field, from, to);
    }
    println!("Updated card '{}' in '{}'", id, name);
    Ok(())
}
