use anyhow::Result;
use barkcli_core::models::Sprint;
use barkcli_core::storage::board_file::{read_board, write_board};
use barkcli_core::storage::sprints;
use barkcli_core::util::style;
use chrono::{Local, Utc};

pub fn start(name: &str, start_date: Option<&str>, end_date: Option<&str>) -> Result<()> {
    let board_name = barkcli_core::commands::boards::resolve_board(None)?;
    let mut board = read_board(&board_name)?;

    let today = Local::now().format("%Y-%m-%d").to_string();

    // Record sprint metadata (start/end dates) in .board/sprints/<board>.json
    let existing = sprints::read_sprints(&board_name)?
        .into_iter()
        .find(|s| s.name == name);
    let sprint = Sprint {
        name: name.to_string(),
        start: Some(start_date.unwrap_or(&today).to_string()),
        end: end_date
            .map(|s| s.to_string())
            .or_else(|| existing.as_ref().and_then(|s| s.end.clone())),
        created_at: existing.as_ref().map(|s| s.created_at).unwrap_or_else(Utc::now),
    };
    sprints::upsert_sprint(&board_name, sprint)?;

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
    if let Some(end) = end_date {
        println!("  {} Ends: {}", style::accent("→"), end);
    }
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

    // Close the sprint: stamp today's end date if none was set
    if let Ok(mut sprints) = sprints::read_sprints(&board_name) {
        let today = Local::now().format("%Y-%m-%d").to_string();
        if let Some(s) = sprints.iter_mut().find(|s| s.name == name) {
            if s.end.is_none() {
                s.end = Some(today);
            }
        }
        let _ = sprints::write_sprints(&board_name, &sprints);
    }

    let pct = if total > 0 { (done as f64 / total as f64 * 100.0) as u32 } else { 0 };
    println!("{} Sprint '{}' ended.", style::ok("✓"), name);
    println!("  {} Completed: {}/{} ({}%)", style::ok("✅"), done, total, pct);
    println!("  {} Remaining tasks moved to backlog.", style::warn("🔄"));
    Ok(())
}

pub fn list() -> Result<()> {
    let board_name = barkcli_core::commands::boards::resolve_board(None)?;
    let sprints = sprints::read_sprints(&board_name)?;

    if sprints.is_empty() {
        println!("No sprints yet. Start one: barkcli sprint start <name> [--ends YYYY-MM-DD]");
        return Ok(());
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let board = read_board(&board_name)?;

    println!("Sprints for '{}':", board_name);
    for s in &sprints {
        let label = format!("sprint:{}", s.name);
        let total = board.cards.iter().filter(|c| c.labels.contains(&label)).count();
        let done = board.cards.iter().filter(|c| c.labels.contains(&label) && c.column == "done").count();
        let pct = if total > 0 { (done as f64 / total as f64 * 100.0) as u32 } else { 0 };

        let state = match (&s.start, &s.end) {
            (Some(st), Some(en)) if st.as_str() <= today.as_str() && today.as_str() <= en.as_str() => "active",
            (Some(_), Some(en)) if en.as_str() < today.as_str() => "ended",
            _ => "upcoming",
        };
        let marker = match state {
            "active" => style::ok("●"),
            "ended" => style::muted("○"),
            _ => style::accent("◇"),
        };
        let range = match (&s.start, &s.end) {
            (Some(st), Some(en)) => format!("{} → {}", st, en),
            (Some(st), None) => format!("{} → ?", st),
            _ => "no dates".into(),
        };
        println!("  {} {}  {}  {}/{} ({}%)", marker, s.name, style::muted(&range), done, total, pct);
    }
    Ok(())
}
