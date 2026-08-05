use anyhow::Result;
use barkcli_core::models::Card;
use barkcli_core::storage::board_file::{read_board, write_board};
use barkcli_core::util::style;
use chrono::Utc;

pub fn start(name: &str) -> Result<()> {
    let board_name = barkcli_core::commands::boards::resolve_board(None)?;
    let mut board = read_board(&board_name)?;

    // Tag all current todo/doing cards as sprint items
    let sprint_label = format!("sprint:{}", name);
    let mut tagged = 0;
    for card in &mut board.cards {
        if card.column == "todo" || card.column == "doing" {
            if !card.labels.iter().any(|l| l == &sprint_label) {
                card.labels.push(sprint_label.clone());
                tagged += 1;
            }
        }
    }
    write_board(&board_name, &board)?;
    println!("{} Sprint '{}' started. {} tasks tagged.", style::ok("✓"), name, tagged);
    println!("  {} barkcli list -l sprint:{}", style::accent("→"), name);
    Ok(())
}

pub fn end(name: &str) -> Result<()> {
    let board_name = barkcli_core::commands::boards::resolve_board(None)?;
    let mut board = read_board(&board_name)?;

    let sprint_label = format!("sprint:{}", name);

    let total = board.cards.iter().filter(|c| c.labels.contains(&sprint_label)).count();
    let done = board.cards.iter().filter(|c| c.labels.contains(&sprint_label) && c.column == "done").count();

    // Move remaining sprint items to next sprint
    for card in &mut board.cards {
        if card.labels.contains(&sprint_label) && card.column != "done" {
            card.labels.retain(|l| l != &sprint_label);
            card.updated_at = Utc::now();
        }
    }

    write_board(&board_name, &board)?;

    let pct = if total > 0 { (done as f64 / total as f64 * 100.0) as u32 } else { 0 };
    println!("{} Sprint '{}' ended.", style::ok("✓"), name);
    println!("  {} Completed: {}/{} ({}%)", style::ok("✅"), done, total, pct);
    println!("  {} Remaining tasks moved to backlog.", style::warn("🔄"));
    Ok(())
}
