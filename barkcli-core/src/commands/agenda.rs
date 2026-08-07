use anyhow::{bail, Result};

use chrono::Datelike;

use crate::models::Card;
use crate::storage::board_file::read_board;
use crate::util::style;

/// Date portion of an ISO timestamp, or `None` for missing/garbage values.
fn date_of(s: &str) -> Option<String> {
    s.chars().take(10).collect::<String>().into()
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn day_after(days: i64) -> String {
    (chrono::Local::now() + chrono::Duration::days(days))
        .format("%Y-%m-%d")
        .to_string()
}

fn is_done(card: &Card) -> bool {
    card.column == "done"
}

fn checklist_progress(card: &Card) -> String {
    if card.checklist.is_empty() {
        return String::new();
    }
    let done = card.checklist.iter().filter(|i| i.done).count();
    format!(" [{}] {}/{}", style::muted("✓"), done, card.checklist.len())
}

fn card_line(card: &Card, due: Option<&str>) -> String {
    let mut out = format!("  {} {}", style::strong(&card.id), card.title);
    if let Some(d) = due {
        out.push_str(&format!("  {}", style::muted(&format!("due {}", d))));
    }
    out.push_str(&checklist_progress(card));
    out
}

/// `barkcli today` — overdue, today, upcoming (7 days), backlog.
pub fn run_today(board_name: &str) -> Result<()> {
    let board = read_board(board_name)?;
    let today = today();

    let mut overdue: Vec<&Card> = Vec::new();
    let mut today_cards: Vec<&Card> = Vec::new();
    let mut upcoming: Vec<(&Card, String)> = Vec::new();
    let mut backlog: Vec<&Card> = Vec::new();

    for card in &board.cards {
        match card.due_date.as_deref().and_then(date_of) {
            Some(d) if d < today => {
                if !is_done(card) {
                    overdue.push(card);
                }
            }
            Some(d) if d == today => today_cards.push(card),
            Some(d) if d <= day_after(7) => upcoming.push((card, d)),
            _ => {}
        }
        if card.due_date.is_none() && !is_done(card) {
            backlog.push(card);
        }
    }

    println!("Today ({}) — '{}'", today, board_name);
    println!();

    if overdue.is_empty() {
        println!("{} Overdue (0)", style::ok("✓"));
    } else {
        println!("{} Overdue ({})", style::err("⚠"), overdue.len());
        for c in overdue {
            println!("{}", card_line(c, c.due_date.as_deref().and_then(date_of).as_deref()));
        }
    }
    println!();

    println!("{} Today ({})", style::accent("●"), today_cards.len());
    for c in today_cards {
        println!("{}", card_line(c, None));
    }
    println!();

    println!("{} Next 7 days ({})", style::accent("▶"), upcoming.len());
    upcoming.sort_by(|a, b| a.1.cmp(&b.1));
    for (c, d) in upcoming {
        println!("{}", card_line(c, Some(&d)));
    }
    println!();

    println!("{} Backlog — no due date ({})", style::muted("▤"), backlog.len());
    for c in backlog {
        println!("{}", card_line(c, None));
    }

    Ok(())
}

/// `barkcli calendar [YYYY-MM]` — ASCII month grid of due cards + sprints.
pub fn run_calendar(board_name: &str, month_arg: Option<&str>) -> Result<()> {
    let (year, month): (i32, u32) = match month_arg {
        Some(m) => {
            let parts: Vec<&str> = m.split('-').collect();
            if parts.len() == 2 {
                let y: i32 = parts[0].parse().map_err(|_| anyhow::anyhow!("bad month '{}' (expected YYYY-MM)", m))?;
                let mo: u32 = parts[1].parse().map_err(|_| anyhow::anyhow!("bad month '{}' (expected YYYY-MM)", m))?;
                (y, mo)
            } else {
                bail!("usage: barkcli calendar [YYYY-MM]");
            }
        }
        None => {
            let now = chrono::Local::now();
            (now.year(), now.month())
        }
    };
    if !(1..=12).contains(&month) {
        bail!("month must be 1-12, got {}", month);
    }

    let board = read_board(board_name)?;
    let today = today();

    let first_weekday = chrono::NaiveDate::from_ymd_opt(year, month, 1)
        .map(|d| d.weekday().num_days_from_sunday() as usize)
        .unwrap_or(0);
    let days_in_month = chrono::NaiveDate::from_ymd_opt(year, month, 1)
        .and_then(|_d| {
            if month == 12 {
                chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1)
            } else {
                chrono::NaiveDate::from_ymd_opt(year, month + 1, 1)
            }
        })
        .map(|next| (next - chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap()).num_days() as u32)
        .unwrap_or(30);

    let cards_by_day: std::collections::HashMap<String, Vec<&Card>> = board
        .cards
        .iter()
        .filter_map(|c| {
            c.due_date
                .as_deref()
                .and_then(date_of)
                .map(|d| (d, c))
        })
        .fold(std::collections::HashMap::new(), |mut map, (d, c)| {
            map.entry(d).or_default().push(c);
            map
        });

    let month_names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    println!("    {} {}", month_names[(month - 1) as usize], year);
    println!("Su Mo Tu We Th Fr Sa");
    println!("• cards due · * today");

    let mut day: i64 = 1 - first_weekday as i64;
    while day <= days_in_month as i64 {
        let mut line = String::new();
        for _ in 0..7 {
            if day < 1 || day > days_in_month as i64 {
                line.push_str("   ");
            } else {
                let date = format!("{:04}-{:02}-{:02}", year, month, day);
                let count = cards_by_day.get(&date).map(|v| v.len()).unwrap_or(0);
                let cell = if date == today {
                    format!("*{}{}", day, if count > 0 { "•" } else { " " })
                } else if count > 0 {
                    format!("{}{}", day, "•")
                } else {
                    format!("{:>2} ", day)
                };
                line.push_str(&format!("{:<3}", cell));
            }
            day += 1;
        }
        println!("{}", line);
    }

    // Sprint ranges within this month
    let sprints = crate::storage::sprints::read_sprints(board_name)?;
    let in_month = |d: &str| d.chars().take(7).collect::<String>() == format!("{:04}-{:02}", year, month);
    let visible: Vec<_> = sprints
        .iter()
        .filter(|s| s.start.as_deref().map(in_month).unwrap_or(false) || s.end.as_deref().map(in_month).unwrap_or(false))
        .collect();
    if !visible.is_empty() {
        println!();
        println!("Sprints:");
        for s in visible {
            let start = s.start.as_deref().unwrap_or("?");
            let end = s.end.as_deref().unwrap_or("?");
            println!("  {} {} → {}", style::accent(&s.name), start, end);
        }
    }

    Ok(())
}

/// `barkcli remind [--hours N]` — cards with a reminder within the window or overdue.
pub fn run_remind(board_name: &str, hours: u64) -> Result<()> {
    let board = read_board(board_name)?;
    let now = chrono::Utc::now();
    let window = chrono::Duration::hours(hours as i64);

    let mut soon: Vec<(&Card, String)> = Vec::new();
    let mut overdue: Vec<(&Card, String)> = Vec::new();

    for card in &board.cards {
        let Some(remind) = card.remind_at.as_deref().and_then(|r| chrono::DateTime::parse_from_rfc3339(r).ok()) else {
            continue;
        };
        let remind_utc = remind.with_timezone(&chrono::Utc);
        let when = card.due_date.as_deref().and_then(date_of).unwrap_or_default();
        if remind_utc < now {
            overdue.push((card, when));
        } else if remind_utc <= now + window {
            soon.push((card, when));
        }
    }

    if overdue.is_empty() && soon.is_empty() {
        println!("No reminders due in the next {}h.", hours);
        return Ok(());
    }

    println!("Reminders (next {}h) — '{}'", hours, board_name);
    println!();
    if !overdue.is_empty() {
        println!("{} Overdue ({})", style::err("⚠"), overdue.len());
        overdue.sort_by(|a, b| a.0.title.cmp(&b.0.title));
        for (c, when) in overdue {
            println!("{}", card_line(c, if when.is_empty() { None } else { Some(&when) }));
        }
        println!();
    }
    if !soon.is_empty() {
        println!("{} Coming up ({})", style::accent("🔔"), soon.len());
        soon.sort_by(|a, b| a.0.title.cmp(&b.0.title));
        for (c, when) in soon {
            println!("{}", card_line(c, if when.is_empty() { None } else { Some(&when) }));
        }
    }

    Ok(())
}
