use anyhow::Result;

use super::fleet::{load_queue, resolve_board_arg};
use crate::util::style;

/// `barkcli handoff <task-id> [--save]` — resume text for the next agent.
///
/// Renders what was done, what's left, open questions, and transcript tail.
/// `--save` also writes `.board/handoffs/<task>.md`.
pub fn run_handoff(args: &[String]) -> Result<()> {
    let task_id = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli handoff <task-id> [--save]"))?;
    let board = resolve_board_arg(args)?;
    let text = handoff_text(&board, &task_id)?;
    println!("{}", text);

    if args.iter().any(|a| a == "--save") {
        let dir = crate::storage::board_dir::find_board_dir()?.join("handoffs");
        std::fs::create_dir_all(&dir).ok();
        let path = dir.join(format!("{}.md", task_id));
        std::fs::write(&path, &text)?;
        println!("\n{} saved to {}", style::ok("Handoff:"), path.display());
    }
    Ok(())
}

/// Build handoff text (shared with MCP `handoff`).
pub fn handoff_text(board: &str, task_id: &str) -> Result<String> {
    let queue = load_queue(board)?;
    let task = queue
        .get(task_id)
        .ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;

    let mut out = String::new();
    out.push_str(&format!("# Handoff: {}\n\n", task.title));
    out.push_str(&format!("- task: `{}` · status: {} · priority: {}\n", task.id, task.status.display_name(), task.priority));
    out.push_str(&format!("- card: `{}` · agent: {}\n", task.card_id, task.assigned_agent.as_deref().unwrap_or("-")));
    if let Some(ref branch) = task.branch {
        out.push_str(&format!("- branch: `{}`\n", branch));
    }
    if !task.description.is_empty() {
        out.push_str(&format!("\n## Goal\n{}\n", task.description));
    }
    if !task.acceptance_criteria.is_empty() {
        out.push_str("\n## Acceptance criteria\n");
        for ac in &task.acceptance_criteria {
            out.push_str(&format!("- [ ] {}\n", ac));
        }
    }
    if !task.notes.is_empty() {
        out.push_str("\n## Notes (newest last)\n");
        for n in &task.notes {
            out.push_str(&format!("- [{}] {}: {}\n", n.at.format("%m-%d %H:%M"), n.author, n.text));
        }
    }
    if let Some(ref reason) = task.blocked_reason {
        out.push_str(&format!("\n## Blocked / waiting\n{}\n", reason));
    }

    // Session transcript tail (via lease session).
    if let Some(sid) = task.lease.as_ref().and_then(|l| l.session_id.as_ref()) {
        if let Ok(session) = crate::agent::session::load_session(sid) {
            out.push_str(&format!("\n## Session `{}` ({})\n", sid, session.status.display_name()));
            if let Some(ref wt) = session.worktree_path {
                out.push_str(&format!("- worktree: `{}`\n", wt));
            }
            let tail = crate::agent::session::transcript_tail(&session, 20);
            if !tail.is_empty() {
                out.push_str("\n### Transcript tail\n```\n");
                for line in tail {
                    out.push_str(&line);
                    out.push('\n');
                }
                out.push_str("```\n");
            }
        }
    }

    // Completion result, if any.
    let results_path = crate::storage::board_dir::find_board_dir()?
        .join("tasks")
        .join(format!("{}_results.json", board));
    if let Ok(results) = crate::agent::TaskResults::load(&results_path) {
        if let Some(r) = results.for_task(task_id) {
            out.push_str("\n## Last result\n");
            out.push_str(&format!("- summary: {}\n", r.summary));
            if !r.files_changed.is_empty() {
                out.push_str(&format!("- files: {}\n", r.files_changed.join(", ")));
            }
            if let Some(ref sha) = r.commit_sha {
                out.push_str(&format!("- commit: {}\n", sha));
            }
            if let Some(ref err) = r.error_message {
                out.push_str(&format!("- error: {}\n", err));
            }
        }
    }

    out.push_str(&format!(
        "\n---\nResume with: `barkcli packet {}` (full context) · `barkcli task {} show` (status)\n",
        task_id, task_id
    ));
    Ok(out)
}
