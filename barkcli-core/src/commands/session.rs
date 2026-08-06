use anyhow::{bail, Context, Result};
use comfy_table::Cell;

use crate::models::SessionEntry;
use crate::storage::sessions::{append, read_sessions};
use crate::util::{display, style};

pub fn run_log(args: &[String]) -> Result<()> {
    let board = args
        .iter()
        .position(|a| a == "--board" || a == "-b")
        .and_then(|i| args.get(i + 1))
        .cloned();

    let name = crate::commands::boards::resolve_board(board.as_deref())?;

    let entry = read_stdin_session(&name, args)?;

    // Hooks must never break the agent — if we can't write, stay silent.
    if let Err(err) = append(&entry) {
        eprintln!("barkcli session log: {}", err);
        return Ok(());
    }

    println!("Session '{}' recorded for board '{}'", entry.id, entry.board);
    Ok(())
}

pub fn run_list(args: &[String]) -> Result<()> {
    let board = args
        .iter()
        .position(|a| a == "--board" || a == "-b")
        .and_then(|i| args.get(i + 1))
        .cloned();
    let name = crate::commands::boards::resolve_board(board.as_deref())?;

    let sessions = read_sessions(&name)?;
    if sessions.is_empty() {
        println!("{}", style::muted(format!("No sessions for '{}'", name)));
        return Ok(());
    }

    let mut t = display::table();
    t.set_header(display::header(vec!["ID", "Agent", "Prompt", "Commit", "Files", "When"]));
    for s in sessions.iter().rev().take(50) {
        let prompt = s
            .prompt
            .as_deref()
            .map(|p| {
                let one_line = p.replace('\n', " ");
                if one_line.chars().count() > 28 {
                    format!("{}…", one_line.chars().take(28).collect::<String>())
                } else {
                    one_line
                }
            })
            .unwrap_or_else(|| "-".into());
        let sha = s.commit_sha.as_deref().map(|c| c.chars().take(7).collect::<String>()).unwrap_or_else(|| "-".into());
        let when = s.at.split('T').next().unwrap_or(&s.at).to_string();
        t.add_row(vec![
            Cell::new(style::accent(&s.id)),
            Cell::new(s.agent.as_deref().unwrap_or("-")),
            Cell::new(style::strong(&prompt)),
            Cell::new(style::muted(&sha)),
            Cell::new(style::muted(&s.files_touched.len().to_string())),
            Cell::new(style::muted(&when)),
        ]);
    }
    println!("{t}");
    println!(
        "{}",
        style::muted(format!(
            "Showing last {} of {} sessions for '{}'",
            sessions.len().min(50),
            sessions.len(),
            name
        ))
    );
    Ok(())
}

pub fn run_show(args: &[String]) -> Result<()> {
    let (board, rest) = split_board(args)?;
    if rest.is_empty() {
        bail!("usage: barkcli session show <id>");
    }
    let id = &rest[0];
    let name = crate::commands::boards::resolve_board(board.as_deref())?;

    let session = read_sessions(&name)?
        .into_iter()
        .find(|s| s.id == *id)
        .ok_or_else(|| anyhow::anyhow!("session '{}' not found", id))?;

    print_session(&session);
    Ok(())
}

pub fn run_resume(args: &[String]) -> Result<()> {
    let (board, rest) = split_board(args)?;
    let name = crate::commands::boards::resolve_board(board.as_deref())?;

    let sessions = read_sessions(&name)?;
    if sessions.is_empty() {
        println!("{}", style::muted(format!("No sessions to resume for '{}'", name)));
        return Ok(());
    }

    let session = if rest.is_empty() {
        sessions.last().unwrap()
    } else {
        sessions
            .iter()
            .find(|s| s.id == rest[0])
            .ok_or_else(|| anyhow::anyhow!("session '{}' not found", rest[0]))?
    };

    println!("{}", style::ok("Resume context — hand this to your agent:"));
    println!();
    print_session(session);
    Ok(())
}

// ─── Helpers ─────────────────────────────────────

fn split_board(args: &[String]) -> Result<(Option<String>, Vec<String>)> {
    let mut board = None;
    let mut rest: Vec<String> = vec![];
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
    Ok((board, rest))
}

/// Build a SessionEntry from JSON on stdin (hook contract:
/// `barkcli session log` with a JSON payload piped in) plus CLI flags.
fn read_stdin_session(board: &str, args: &[String]) -> Result<SessionEntry> {
    use std::io::Read;

    let mut entry = SessionEntry::new(board);
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--agent" => {
                i += 1;
                entry.agent = args.get(i).cloned();
            }
            "--model" => {
                i += 1;
                entry.model = args.get(i).cloned();
            }
            "--summary" => {
                i += 1;
                entry.summary = args.get(i).cloned();
            }
            _ => {}
        }
        i += 1;
    }

    let mut raw = String::new();
    std::io::stdin()
        .read_to_string(&mut raw)
        .context("failed to read stdin payload")?;
    if !raw.trim().is_empty() {
        #[derive(serde::Deserialize)]
        struct Payload {
            prompt: Option<String>,
            commit: Option<String>,
            commit_sha: Option<String>,
            files: Option<Vec<String>>,
            files_touched: Option<Vec<String>>,
            summary: Option<String>,
            agent: Option<String>,
            model: Option<String>,
            /// Claude Code `Stop` hook carries the conversation as `input`
            /// (array of user messages); fall back to it when prompt is empty.
            input: Option<serde_json::Value>,
        }
        if let Ok(payload) = serde_json::from_str::<Payload>(&raw) {
            entry.prompt = payload.prompt.or(prompt_from_input(payload.input)).or(entry.prompt);
            entry.commit_sha = payload.commit.or(payload.commit_sha).or(entry.commit_sha);
            entry.files_touched = payload.files.or(payload.files_touched).unwrap_or_default();
            entry.summary = payload.summary.or(entry.summary);
            entry.agent = payload.agent.or(entry.agent);
            entry.model = payload.model.or(entry.model);
        }
    }
    Ok(entry)
}

/// Extract a prompt string from Claude Code's `input` field (string, or an
/// array of user-message strings from the conversation).
fn prompt_from_input(input: Option<serde_json::Value>) -> Option<String> {
    match input {
        Some(serde_json::Value::String(s)) if !s.trim().is_empty() => Some(s),
        Some(serde_json::Value::Array(items)) => {
            let parts: Vec<String> = items
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .filter(|s| !s.trim().is_empty())
                .collect();
            if parts.is_empty() { None } else { Some(parts.join("\n\n")) }
        }
        _ => None,
    }
}

fn print_session(s: &SessionEntry) {
    println!("{} {}", style::strong("Session:"), style::accent(&s.id));
    println!("  Board:    {}", s.board);
    println!("  Agent:    {}", s.agent.as_deref().unwrap_or("-"));
    println!("  Model:    {}", s.model.as_deref().unwrap_or("-"));
    println!("  Started:  {}", s.at);
    if let Some(ms) = s.duration_ms {
        println!("  Duration: {}s", ms / 1000);
    }
    if let Some(sha) = &s.commit_sha {
        println!("  Commit:   {}", sha);
    }
    if let Some(summary) = &s.summary {
        println!("  Summary:  {}", summary);
    }
    if let Some(prompt) = &s.prompt {
        println!("  Prompt:");
        for line in prompt.lines() {
            println!("    {}", line);
        }
    }
    if !s.files_touched.is_empty() {
        println!("  Files:");
        for f in &s.files_touched {
            println!("    - {}", f);
        }
    }
}
