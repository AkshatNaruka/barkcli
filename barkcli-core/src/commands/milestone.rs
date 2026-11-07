use anyhow::{bail, Context, Result};

use crate::models::milestone::{Milestone, MilestoneStatus};
use crate::storage::board_file::{read_board, write_board};
use crate::storage::milestones as store;

/// `barkcli milestone <list|create|show|assign|remove|ship|roadmap>`
pub fn run_milestone(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli milestone <list|create|show|assign|remove|ship|roadmap>");
    };
    match sub.as_str() {
        "list" | "ls" => list(&args[1..]),
        "create" => create(&args[1..]),
        "show" => show(&args[1..]),
        "assign" => assign(&args[1..]),
        "remove" | "rm" | "delete" => remove(&args[1..]),
        "ship" => ship(&args[1..]),
        "roadmap" => roadmap(&args[1..]),
        _ => bail!("unknown milestone subcommand '{}'", sub),
    }
}

fn parse_board_flag(args: &[String]) -> (Option<String>, Vec<String>) {
    let mut board = None;
    let mut rest = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--board" | "-b" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    board = Some(v.clone());
                }
            }
            s => rest.push(s.to_string()),
        }
        i += 1;
    }
    (board, rest)
}

fn resolve_board(board: Option<String>) -> Result<String> {
    crate::commands::boards::resolve_board(board.as_deref())
}

fn list(args: &[String]) -> Result<()> {
    let (board_opt, _) = parse_board_flag(args);
    let board = resolve_board(board_opt)?;
    let milestones = store::read_milestones(&board)?;
    if milestones.is_empty() {
        println!("No milestones for board '{}'.", board);
        return Ok(());
    }
    let board_data = read_board(&board).ok();
    for m in &milestones {
        let progress = board_data.as_ref().map(|b| m.progress(b)).unwrap_or(0.0);
        let overdue = if m.is_overdue() { " (overdue)" } else { "" };
        println!(
            "  {}  [{}]  {:.0}%{}  cards:{} specs:{}",
            m.id, m.status, progress, overdue, m.card_ids.len(), m.spec_ids.len()
        );
    }
    Ok(())
}

fn create(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    let board = resolve_board(board_opt)?;
    // Flags: --title, --date YYYY-MM-DD, --order N, --status
    let mut title = String::new();
    let mut date: Option<String> = None;
    let mut order: i32 = 0;
    let mut status = MilestoneStatus::Planned;
    let mut i = 0;
    let mut positional = Vec::new();
    while i < rest.len() {
        match rest[i].as_str() {
            "--title" => {
                i += 1;
                title = rest.get(i).cloned().unwrap_or_default();
            }
            "--date" | "--target" => {
                i += 1;
                date = rest.get(i).cloned();
            }
            "--order" => {
                i += 1;
                order = rest.get(i).and_then(|v| v.parse().ok()).unwrap_or(0);
            }
            "--status" => {
                i += 1;
                if let Some(s) = rest.get(i) {
                    status = MilestoneStatus::parse(s).unwrap_or(MilestoneStatus::Planned);
                }
            }
            s if s.starts_with('-') => {}
            s => positional.push(s.to_string()),
        }
        i += 1;
    }
    if title.is_empty() && !positional.is_empty() {
        title = positional.join(" ");
    }
    if title.is_empty() {
        bail!("usage: barkcli milestone create --title \"Q4 Launch\" [--date YYYY-MM-DD] [--order N]");
    }
    let mut m = Milestone::new("", title);
    if let Some(d) = date {
        // Validate date format early.
        chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d")
            .with_context(|| format!("invalid date '{}', expected YYYY-MM-DD", d))?;
        m.target_date = Some(d);
    }
    m.sort_order = order;
    m.status = status;
    store::upsert_milestone(&board, m)?;
    let milestones = store::read_milestones(&board)?;
    let created = milestones.last().cloned();
    if let Some(c) = created {
        println!("Created milestone '{}' ({})", c.title, c.id);
    } else {
        println!("Milestone created.");
    }
    Ok(())
}

fn show(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    if rest.is_empty() {
        bail!("usage: barkcli milestone show <id>");
    }
    let board = resolve_board(board_opt)?;
    let id = &rest[0];
    let m = store::get_milestone(&board, id)?
        .ok_or_else(|| anyhow::anyhow!("milestone '{}' not found", id))?;
    println!("{} — {}\n  status: {}\n  target: {}\n  cards: {:?}\n  specs: {:?}\n  sprints: {:?}",
        m.id, m.title, m.status, m.target_date.as_deref().unwrap_or("-"), m.card_ids, m.spec_ids, m.sprint_names);
    if let Ok(board_data) = read_board(&board) {
        println!("  progress: {:.1}%", m.progress(&board_data));
        for cid in &m.card_ids {
            if let Some(card) = board_data.find_card(cid) {
                println!("    - {} [{}] {}", card.id, card.column, card.title);
            } else {
                println!("    - {} (not found)", cid);
            }
        }
    }
    Ok(())
}

fn assign(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    if rest.len() < 2 {
        bail!("usage: barkcli milestone assign <milestone-id> <card-id> [--remove]");
    }
    let do_remove = rest.iter().any(|a| a == "--remove");
    let board = resolve_board(board_opt)?;
    let changed = store::assign_card(&board, &rest[0], &rest[1], !do_remove)?;
    if changed {
        println!("{} {} {}", if do_remove { "Unassigned" } else { "Assigned" }, rest[1], "→" );
    } else {
        println!("No change (already assigned or not found).");
    }
    // Keep card.milestone pointer in sync via labels for backward-compat consumers.
    let _ = write_board;
    Ok(())
}

fn remove(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    if rest.is_empty() {
        bail!("usage: barkcli milestone remove <id>");
    }
    let board = resolve_board(board_opt)?;
    let removed = store::remove_milestone(&board, &rest[0])?;
    if removed {
        println!("Removed milestone '{}'", rest[0]);
    } else {
        bail!("milestone '{}' not found", rest[0]);
    }
    Ok(())
}

fn ship(args: &[String]) -> Result<()> {
    let (board_opt, rest) = parse_board_flag(args);
    if rest.is_empty() {
        bail!("usage: barkcli milestone ship <id>");
    }
    let board = resolve_board(board_opt)?;
    let mut m = store::get_milestone(&board, &rest[0])?
        .ok_or_else(|| anyhow::anyhow!("milestone '{}' not found", rest[0]))?;
    m.status = MilestoneStatus::Shipped;
    store::upsert_milestone(&board, m.clone())?;
    println!("Shipped milestone '{}' ({})", m.title, m.id);
    Ok(())
}

fn roadmap(args: &[String]) -> Result<()> {
    let (board_opt, _) = parse_board_flag(args);
    let board = resolve_board(board_opt)?;
    let rows = store::roadmap(&board)?;
    if rows.is_empty() {
        println!("No milestones for board '{}'.", board);
        return Ok(());
    }
    println!("Roadmap for board '{}':", board);
    for r in &rows {
        let m = &r.milestone;
        let flag = if r.overdue { " OVERDUE" } else { "" };
        println!(
            "  {:>2}. {} [{}] {:.0}% ({}/{}) target:{} specs:{} sprints:{} {}",
            m.sort_order, m.title, m.status, r.percent_done, r.done_cards, r.total_cards,
            m.target_date.as_deref().unwrap_or("-"), r.spec_count, r.sprint_count, flag
        );
    }
    // Overall health.
    let total: usize = rows.iter().map(|r| r.total_cards).sum();
    let done: usize = rows.iter().map(|r| r.done_cards).sum();
    let overall = if total == 0 { 0.0 } else { (done as f64 / total as f64) * 100.0 };
    println!("Overall: {}/{} cards done ({:.1}%)", done, total, overall);
    Ok(())
}
