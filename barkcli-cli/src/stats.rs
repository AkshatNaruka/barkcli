use anyhow::Result;

use barkcli_core::storage::board_file::read_board;

pub fn run() -> Result<()> {
    let name = barkcli_core::commands::boards::resolve_board(None)?;
    let board = read_board(&name)?;

    let total = board.cards.len();
    let done = board.cards.iter().filter(|c| c.column == "done").count();
    let in_progress = board.cards.iter().filter(|c| c.column == "doing" || c.column == "review").count();
    let blocked = board.cards.iter().filter(|c| c.blocked_by.is_some()).count();

    let pct = if total > 0 {
        (done as f64 / total as f64 * 100.0) as u32
    } else {
        0
    };

    let bar_width = 20;
    let filled = (pct as usize * bar_width / 100).min(bar_width);
    let bar: String = "█".repeat(filled) + &"░".repeat(bar_width - filled);

    let high = board.cards.iter().filter(|c| c.priority == "high").count();
    let med = board.cards.iter().filter(|c| c.priority == "medium").count();
    let low = board.cards.iter().filter(|c| c.priority == "low").count();

    println!("Board: {}", name);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();
    println!("  Total:        {:>4} cards", total);
    println!("  ✅ Done:       {:>4} ({:>3}%)", done, pct);
    println!("  🔄 In Progress: {:>4}", in_progress);
    println!("  🚫 Blocked:     {:>4}", blocked);
    println!();
    println!("  Progress:  {} {}%", bar, pct);
    println!();
    println!("  By priority:");
    println!("    🔴 High:     {:>4}", high);
    println!("    🟡 Medium:   {:>4}", med);
    println!("    ⚪ Low:      {:>4}", low);
    println!();

    // Per-column breakdown
    println!("  By column:");
    for col in &board.columns {
        let count = board.cards.iter().filter(|c| c.column == col.id).count();
        println!("    {}: {:>4}", col.name, count);
    }

    Ok(())
}
