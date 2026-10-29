//! Scheduled agent runs. A schedule is a small, serializable record in
//! `.board/schedules.json`; the `barkcli schedule run` daemon executes due
//! intents by invoking the normal autonomy loop.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration as StdDuration;

use crate::storage::board_dir::find_board_dir;
use crate::util::style;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleEntry {
    pub id: String,
    pub intent: String,
    pub board: String,
    pub backend: String,
    pub every_secs: u64,
    pub enabled: bool,
    pub next_run: DateTime<Utc>,
    pub last_run: Option<DateTime<Utc>>,
    pub last_status: Option<String>,
    pub created_at: DateTime<Utc>,
}

fn schedules_path() -> Result<std::path::PathBuf> {
    Ok(find_board_dir()?.join("schedules.json"))
}

pub fn read_schedules() -> Result<Vec<ScheduleEntry>> {
    let path = schedules_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

pub fn write_schedules(entries: &[ScheduleEntry]) -> Result<()> {
    let path = schedules_path()?;
    let content = serde_json::to_string_pretty(entries)?;
    std::fs::write(&path, content)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

pub fn parse_every(value: &str) -> Result<u64> {
    let value = value.trim();
    if value.is_empty() {
        bail!("schedule interval is required");
    }
    let (number, multiplier) = if value.ends_with('h') {
        (&value[..value.len() - 1], 3600u64)
    } else if value.ends_with('m') {
        (&value[..value.len() - 1], 60u64)
    } else if value.ends_with('s') {
        (&value[..value.len() - 1], 1u64)
    } else {
        (value, 1u64)
    };
    let amount: u64 = number
        .parse()
        .with_context(|| format!("invalid schedule interval: {value}"))?;
    if amount == 0 {
        bail!("schedule interval must be greater than zero");
    }
    Ok(amount * multiplier)
}

pub fn add_schedule(
    board: &str,
    intent: &str,
    every: &str,
    backend: &str,
) -> Result<ScheduleEntry> {
    let intent = intent.trim();
    if intent.is_empty() {
        bail!("schedule intent is required");
    }
    let every_secs = parse_every(every)?;
    let entry = ScheduleEntry {
        id: format!("sched_{}", uuid::Uuid::new_v4().simple()),
        intent: intent.to_string(),
        board: board.to_string(),
        backend: backend.to_string(),
        every_secs,
        enabled: true,
        next_run: Utc::now(),
        last_run: None,
        last_status: None,
        created_at: Utc::now(),
    };
    let mut entries = read_schedules()?;
    entries.push(entry.clone());
    write_schedules(&entries)?;
    Ok(entry)
}

pub fn remove_schedule(id: &str) -> Result<()> {
    let mut entries = read_schedules()?;
    let before = entries.len();
    entries.retain(|entry| entry.id != id);
    if entries.len() == before {
        bail!("schedule '{id}' was not found");
    }
    write_schedules(&entries)?;
    Ok(())
}

pub fn run_due_once() -> Result<usize> {
    let root = crate::storage::board_dir::find_project_root()?;
    let mut entries = read_schedules()?;
    let now = Utc::now();
    let mut ran = 0;
    for entry in entries.iter_mut() {
        if !entry.enabled || now < entry.next_run {
            continue;
        }
        entry.last_run = Some(now);
        let status = Command::new(std::env::current_exe().unwrap_or_else(|_| "barkcli".into()))
            .args(["run", &entry.intent, "--yes", "--backend", &entry.backend, "-b", &entry.board])
            .current_dir(&root)
            .status();
        entry.last_status = Some(match status {
            Ok(status) if status.success() => "passed".into(),
            Ok(status) => format!("exit {}", status.code().unwrap_or(1)),
            Err(error) => format!("error: {error}"),
        });
        entry.next_run = now + Duration::seconds(entry.every_secs as i64);
        ran += 1;
    }
    write_schedules(&entries)?;
    Ok(ran)
}

pub fn run_schedule(args: &[String]) -> Result<()> {
    match args.first().map(|s| s.as_str()) {
        Some("list") | Some("ls") => {
            let entries = read_schedules()?;
            if entries.is_empty() {
                println!("{}", style::muted("No schedules. Add one with `schedule add \"<intent>\" --every 1h`."));
                return Ok(());
            }
            println!("{:<12} {:<8} {:<8} {:<24} {}", "ID", "EVERY", "STATUS", "NEXT RUN", "INTENT");
            for entry in entries {
                let next = entry.next_run.format("%Y-%m-%d %H:%M").to_string();
                let status = entry.last_status.as_deref().unwrap_or("never");
                println!(
                    "{:<12} {:<8} {:<8} {:<24} {}",
                    entry.id,
                    format_every(entry.every_secs),
                    status,
                    next,
                    entry.intent
                );
            }
            Ok(())
        }
        Some("add") => {
            let mut intent_parts = Vec::new();
            let mut every = "1h".to_string();
            let mut backend = "opencode".to_string();
            let mut board = None;
            let mut i = 1;
            while i < args.len() {
                match args[i].as_str() {
                    "--every" => {
                        i += 1;
                        every = args.get(i).cloned().unwrap_or_default();
                    }
                    "--backend" => {
                        i += 1;
                        backend = args.get(i).cloned().unwrap_or_default();
                    }
                    "--board" | "-b" => {
                        i += 1;
                        board = args.get(i).cloned();
                    }
                    _ => intent_parts.push(args[i].clone()),
                }
                i += 1;
            }
            let intent = intent_parts.join(" ");
            let board = board.unwrap_or(crate::cli::resolve_board(None)?);
            let entry = add_schedule(&board, &intent, &every, &backend)?;
            println!(
                "{} {} (every {}, backend {})",
                style::ok("Scheduled:"),
                entry.id,
                format_every(entry.every_secs),
                entry.backend
            );
            Ok(())
        }
        Some("remove") | Some("rm") | Some("delete") => {
            let id = args
                .get(1)
                .ok_or_else(|| anyhow::anyhow!("usage: barkcli schedule remove <id>"))?;
            remove_schedule(id)?;
            println!("{}", style::ok("Removed schedule"));
            Ok(())
        }
        Some("run") => {
            let once = args.iter().any(|arg| arg == "--once");
            if once {
                let ran = run_due_once()?;
                println!("{}", style::ok(&format!("Ran {ran} due schedule(s)")));
                return Ok(());
            }
            println!("{}", style::accent("Running scheduler (Ctrl-C to stop)…"));
            loop {
                let ran = run_due_once().unwrap_or(0);
                if ran > 0 {
                    println!("{}", style::ok(&format!("Ran {ran} due schedule(s)")));
                }
                std::thread::sleep(StdDuration::from_secs(30));
            }
        }
        _ => {
            bail!("usage: barkcli schedule <list|add|remove|run> [args]");
        }
    }
}

fn format_every(seconds: u64) -> String {
    if seconds % 3600 == 0 {
        format!("{}h", seconds / 3600)
    } else if seconds % 60 == 0 {
        format!("{}m", seconds / 60)
    } else {
        format!("{}s", seconds)
    }
}
