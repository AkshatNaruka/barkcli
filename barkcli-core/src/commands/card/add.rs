use anyhow::{Context, Result};

/// Normalize `--remind` values: date-only (`2026-08-07`) → `T00:00:00Z`,
/// partial datetime (`2026-08-07T14:30`) → `T14:30:00Z`, full ISO passes through.
pub fn normalize_remind(raw: &str) -> String {
    let t = raw.trim();
    if t.contains('T') {
        let parts: Vec<&str> = t.split('T').collect();
        let date = parts[0];
        let time = parts[1].split('+').next().unwrap_or("").split('Z').next().unwrap_or("").to_string();
        let time = match time.len() {
            n if n >= 8 => format!("{}Z", time),            // HH:MM:SS
            n if n >= 5 => format!("{}:00Z", time),         // HH:MM
            _ => format!("{}:00:00Z", time),                // HH or empty
        };
        format!("{}T{}", date, time)
    } else {
        format!("{}T00:00:00Z", t)
    }
}

use crate::models::Card;
use crate::storage::board_file::read_board;
use crate::storage::history;
use crate::util::slug::unique_slug;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let title = args
        .first()
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("missing title"))?;

    // We read board once to resolve id for user feedback; actual RMW recomputes inside lock
    let snapshot = read_board(name).context(format!("board '{}' not found", name))?;

    let existing_ids: Vec<String> = snapshot.cards.iter().map(|c| c.id.clone()).collect();
    let id = unique_slug(&title, &existing_ids);

    let rest = &args[1..];
    let mut column = None;
    let mut priority = None;
    let mut description = None;
    let mut labels = Vec::new();
    let mut assignee = None;
    let mut due_date = None;
    let mut remind_at = None;
    let mut effort = None;
    let mut area = None;
    let mut acceptance = Vec::new();

    let mut i = 0;
    while i < rest.len() {
        match rest[i].as_str() {
            "-c" | "--column" => {
                i += 1;
                column = rest.get(i).cloned();
            }
            "-p" | "--priority" => {
                i += 1;
                priority = rest.get(i).cloned();
            }
            "-d" | "--description" => {
                i += 1;
                description = rest.get(i).cloned();
            }
            "-l" | "--label" => {
                i += 1;
                if let Some(l) = rest.get(i) {
                    labels.push(l.clone());
                }
            }
            "-a" | "--assignee" => {
                i += 1;
                assignee = rest.get(i).cloned();
            }
            "--due" => {
                i += 1;
                if let Some(d) = rest.get(i) {
                    due_date = Some(format!("{}T00:00:00Z", d));
                }
            }
            "--remind" => {
                i += 1;
                if let Some(r) = rest.get(i) {
                    remind_at = Some(normalize_remind(r));
                }
            }
            "--effort" => {
                i += 1;
                if let Some(v) = rest.get(i).and_then(|v| v.parse().ok()) {
                    effort = Some(v);
                }
            }
            "--area" => {
                i += 1;
                area = rest.get(i).cloned();
            }
            "--ac" | "--criterion" => {
                i += 1;
                if let Some(a) = rest.get(i) {
                    acceptance.push(a.clone());
                }
            }
            _ => {}
        }
        i += 1;
    }

    // Atomically update board under lock to prevent lost writes (SPEC-001)
    crate::storage::board_file::update_board(name, |board| {
        // Recompute id inside lock against fresh board to avoid duplicate slugs under concurrency
        let existing_ids: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
        let fresh_id = unique_slug(&title, &existing_ids);
        let col_id = column.clone().unwrap_or_else(|| {
            board
                .columns
                .first()
                .map(|c| c.id.clone())
                .unwrap_or_else(|| "todo".into())
        });
        let mut card = Card::new(&fresh_id, &title, &col_id);
        card.priority = priority.clone().unwrap_or_else(|| "medium".into());
        card.description = description.clone();
        card.labels = labels.clone();
        card.assignee = assignee.clone();
        card.due_date = due_date.clone();
        card.remind_at = remind_at.clone();
        card.effort = effort;
        card.area = area.clone();
        card.acceptance_criteria = acceptance.clone();
        board.cards.push(card);
        Ok(())
    })
    .context("failed to write board")?;

    // Use snapshot-id for log (best-effort); actual fresh id may differ under race but log remains useful
    history::log_add(name, &id, &title)?;
    println!("Added card '{}' (id: {}) to '{}'", title, id, name);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_remind;

    #[test]
    fn normalize_date_only() {
        assert_eq!(normalize_remind("2026-08-07"), "2026-08-07T00:00:00Z");
    }

    #[test]
    fn normalize_with_time() {
        assert_eq!(normalize_remind("2026-08-07T14:30"), "2026-08-07T14:30:00Z");
    }

    #[test]
    fn normalize_full_iso_passthrough() {
        assert_eq!(normalize_remind("2026-08-07T14:30:00Z"), "2026-08-07T14:30:00Z");
    }

    #[test]
    fn normalize_whitespace() {
        assert_eq!(normalize_remind("  2026-08-07  "), "2026-08-07T00:00:00Z");
    }
}
