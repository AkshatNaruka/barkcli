use anyhow::{Context, Result};
use comfy_table::{Cell, Table};

use crate::mind::snapshot;
use crate::util::{display, style};

/// `barkcli overview` — 4-panel human narrative (SPEC-002), offline, no LLM
pub fn run_overview(args: &[String]) -> Result<()> {
    let board_name = find_board(args)?;

    // Try to load snapshot, fallback to live build
    let snap = match snapshot::load(&board_name) {
        Ok(s) => s,
        Err(_) => snapshot::build(&board_name)
            .context(format!("board '{}' not found", board_name))?,
    };

    println!("{} Overview for '{}' — {}", style::accent("Overview:"), snap.board_name, snap.generated_at.format("%Y-%m-%d %H:%M UTC"));
    println!("{}", "─".repeat(60));

    // Panel 1: Board Health
    println!();
    println!("{} Board Health", style::strong("📦"));
    println!("  Total: {} cards", style::strong(&snap.stats.total.to_string()));
    let mut t = display::table();
    t.set_header(display::header(vec!["Column", "Count"]));
    for col in ["todo", "doing", "review", "done"] {
        let n = snap.stats.by_column.get(col).copied().unwrap_or(0);
        t.add_row(vec![Cell::new(col), Cell::new(n.to_string())]);
    }
    println!("{t}");
    if !snap.stats.by_priority.is_empty() {
        let pri: Vec<String> = snap.stats.by_priority.iter().map(|(k, v)| format!("{}:{}", k, v)).collect();
        println!("  By priority: {}", pri.join(", "));
    }

    // Panel 2: Sprint / Velocity
    println!();
    println!("{} Sprint / Velocity", style::strong("🏃"));
    if let Some(ref s) = snap.active_sprint {
        println!("  Active: {} ({} → {})", style::accent(&s.name), s.start.as_deref().unwrap_or("-"), s.end.as_deref().unwrap_or("-"));
    } else {
        println!("  {}", style::muted("No active sprint. Start with: barkcli sprint start <name>"));
    }
    if let Some(ref v) = snap.velocity {
        println!("  Done {} cards, {} points, avg {:.1}", v.total_done, v.total_points, v.avg_effort);
    } else {
        println!("  {}", style::muted("No velocity yet (no cards in done)"));
    }

    // Panel 3: Blockers & Stale
    println!();
    println!("{} Blockers & Stale", style::strong("🚧"));
    if snap.blockers.is_empty() {
        println!("  {}", style::ok("No blockers"));
    } else {
        for b in &snap.blockers {
            println!("  {} {} ({}) blocked by {}", style::warn("⚠"), b.title, b.card_id, b.blocked_by.join(", "));
        }
    }
    if snap.stale_cards.is_empty() {
        println!("  {}", style::ok("No stale cards (>7d)"));
    } else {
        for s in &snap.stale_cards {
            println!("  {} {} ({}, {}d)", style::warn("⌛"), s.title, s.id, s.days);
        }
    }

    // Panel 4: Recent + Next
    println!();
    println!("{} Next Actions", style::strong("➡️"));
    for (i, a) in snap.next_actions.iter().enumerate() {
        println!("  {}. {} — {}", i + 1, style::accent(&a.action), style::muted(&a.reason));
    }

    println!();
    println!("{} Recent", style::strong("🕒"));
    if snap.recent_history.is_empty() && snap.recent_sessions.is_empty() {
        println!("  {}", style::muted("No recent history/sessions"));
    } else {
        for h in snap.recent_history.iter().take(5) {
            println!("  {} {} {} {}", style::muted(&h.at[..10.min(h.at.len())]), h.op, h.card, h.new_value.as_deref().unwrap_or(""));
        }
        for s in snap.recent_sessions.iter().take(3) {
            println!("  {} session {} {}", style::muted(&s.at[..10.min(s.at.len())]), s.id, s.summary.as_deref().unwrap_or(""));
        }
    }

    if !snap.top_memories.is_empty() {
        println!();
        println!("{} Top Memories", style::strong("🧠"));
        for m in &snap.top_memories {
            println!("  [{}] {}", m.tier.display_name(), m.content.chars().take(80).collect::<String>());
        }
    }

    println!();
    println!("{}", "─".repeat(60));
    println!("  {} for fresh snapshot", style::muted("Run `barkcli mind sync`"));
    println!("  Digest: {}", snapshot::digest_path(&board_name).map(|p| p.display().to_string()).unwrap_or_else(|_| "-".into()));

    Ok(())
}

fn find_board(args: &[String]) -> Result<String> {
    use crate::storage::board_file::list_board_files;
    let mut i = 0;
    while i < args.len() {
        if (args[i] == "--board" || args[i] == "-b") && i + 1 < args.len() {
            return Ok(args[i + 1].clone());
        }
        i += 1;
    }
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let cfg = crate::storage::config_store::read_config(&board_dir)?;
    cfg.default_board
        .or_else(|| {
            let root = board_dir.parent()?;
            std::fs::read_dir(root).ok()?.filter_map(|e| e.ok()).find(|e| e.path().extension().map(|ext| ext == "board").unwrap_or(false)).map(|e| e.path().file_stem().unwrap_or_default().to_string_lossy().to_string())
        })
        .or_else(|| list_board_files().ok().and_then(|v| v.first().cloned()))
        .ok_or_else(|| anyhow::anyhow!("No boards found"))
}
