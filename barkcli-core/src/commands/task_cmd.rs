use anyhow::Result;

use super::fleet::{flag_value, load_queue, resolve_board_arg, save_queue};
use crate::util::style;

/// `barkcli task <id> <note|block|unblock|heartbeat>`
pub fn run_task(args: &[String]) -> Result<()> {
    let mut positional = args.iter().filter(|a| !a.starts_with('-'));
    let task_id = positional
        .next()
        .cloned()
        .ok_or_else(|| {
            anyhow::anyhow!("usage: barkcli task <id> <note|block|unblock|heartbeat> [text]")
        })?;
    let sub = positional.next().cloned().unwrap_or_else(|| "show".to_string());
    let rest_text: String = positional.cloned().collect::<Vec<_>>().join(" ");

    match sub.as_str() {
        "show" => {
            let board = resolve_board_arg(args)?;
            let queue = load_queue(&board)?;
            let task = queue
                .get(&task_id)
                .ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;
            println!("{} {}", style::strong(&task.title), style::muted(&format!("({})", task.id)));
            println!("  status:   {}", task.status.display_name());
            println!("  priority: {}", task.priority);
            println!("  agent:    {}", task.assigned_agent.as_deref().unwrap_or("-"));
            println!("  card:     {}", task.card_id);
            println!("  branch:   {}", task.branch.as_deref().unwrap_or("-"));
            println!("  attempts: {}/{}", task.attempts, task.max_attempts);
            if let Some(ref lease) = task.lease {
                println!(
                    "  lease:    {} (expires {})",
                    lease.agent_id,
                    lease.expires_at.format("%H:%M UTC")
                );
            }
            if let Some(ref reason) = task.blocked_reason {
                println!("  blocked:  {}", reason);
            }
            if !task.acceptance_criteria.is_empty() {
                println!("  acceptance:");
                for ac in &task.acceptance_criteria {
                    println!("    - [ ] {}", ac);
                }
            }
            if !task.notes.is_empty() {
                println!("  notes:");
                for n in task.notes.iter().rev().take(5) {
                    println!("    [{}] {}: {}", n.at.format("%m-%d %H:%M"), n.author, n.text);
                }
            }
            Ok(())
        }
        "note" => {
            if rest_text.is_empty() {
                anyhow::bail!("usage: barkcli task <id> note <text>");
            }
            let board = resolve_board_arg(args)?;
            let mut queue = load_queue(&board)?;
            queue.add_note(&task_id, "human", &rest_text)?;
            save_queue(&board, &queue)?;
            println!("{} note added to {}", style::ok("Task:"), task_id);
            Ok(())
        }
        "block" => {
            if rest_text.is_empty() {
                anyhow::bail!("usage: barkcli task <id> block <reason>");
            }
            let board = resolve_board_arg(args)?;
            let mut queue = load_queue(&board)?;
            queue.block(&task_id, "human", &rest_text)?;
            save_queue(&board, &queue)?;
            println!("{} {} blocked", style::warn("Task:"), task_id);
            Ok(())
        }
        "unblock" => {
            let board = resolve_board_arg(args)?;
            let mut queue = load_queue(&board)?;
            queue.unblock(&task_id)?;
            save_queue(&board, &queue)?;
            println!("{} {} back to pending", style::ok("Task:"), task_id);
            Ok(())
        }
        "heartbeat" => {
            let board = resolve_board_arg(args)?;
            let agent = flag_value(args, "--agent").unwrap_or_else(|| "human".to_string());
            let lease_minutes: i64 = flag_value(args, "--lease-minutes")
                .and_then(|v| v.parse().ok())
                .unwrap_or(30);
            let mut queue = load_queue(&board)?;
            queue.heartbeat(&task_id, &agent, lease_minutes)?;
            save_queue(&board, &queue)?;
            println!("{} lease refreshed", style::ok("Task:"));
            Ok(())
        }
        _ => anyhow::bail!("unknown task subcommand '{}' (show | note | block | unblock | heartbeat)", sub),
    }
}
