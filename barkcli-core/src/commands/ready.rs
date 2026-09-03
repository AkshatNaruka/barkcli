use anyhow::Result;

use super::fleet::{load_queue, load_registry, resolve_board_arg, flag_value};
use crate::agent::{dispatch_scores, overlap, AgentRole};
use crate::util::style;

/// Parse a role name for dispatch scoring.
fn parse_role(s: Option<&str>) -> AgentRole {
    match s {
        Some("product-owner") | Some("po") => AgentRole::ProductOwner,
        Some("tech-lead") | Some("techlead") | Some("dev") => AgentRole::TechLead,
        Some("project-manager") | Some("pm") => AgentRole::ProjectManager,
        _ => AgentRole::ScrumMaster,
    }
}

/// `barkcli ready [--role ROLE] [--limit N]` — ranked runnable tasks with reasons.
pub fn run_ready(args: &[String]) -> Result<()> {
    let board = resolve_board_arg(args)?;
    let role = parse_role(flag_value(args, "--role").as_deref());
    let limit: usize = flag_value(args, "--limit").and_then(|v| v.parse().ok()).unwrap_or(10);
    let queue = load_queue(&board)?;
    let registry = load_registry()?;
    let items = dispatch_scores(&queue, &registry, &role);

    if items.is_empty() {
        println!("{}", style::muted("nothing runnable — queue drained or all blocked"));
        // Show why: list blocked/needs-input tasks.
        for t in queue.tasks.iter().filter(|t| {
            t.status == crate::agent::TaskStatus::Blocked
                || t.status == crate::agent::TaskStatus::NeedsInput
        }) {
            println!(
                "  {} {} — {}",
                style::warn(t.status.display_name()),
                style::strong(&t.id),
                t.blocked_reason.as_deref().unwrap_or("")
            );
        }
        return Ok(());
    }

    println!("{} runnable tasks (role {:?}):", style::accent("Ready:"), role);
    for item in items.iter().take(limit) {
        println!(
            "  {} {} [{}] (score {:.1}) — {}",
            style::ok("●"),
            style::strong(&item.task_id),
            item.priority,
            item.score,
            style::muted(&item.reason)
        );
    }
    Ok(())
}

/// `barkcli packet <task-id>` — the fully enriched executable packet.
pub fn run_packet(args: &[String]) -> Result<()> {
    let task_id = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli packet <task-id>"))?;
    let board = resolve_board_arg(args)?;
    let queue = load_queue(&board)?;
    let task = queue
        .get(&task_id)
        .ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;

    println!("# Packet: {}", style::strong(&task.title));
    println!("task:   {}", task.id);
    println!("card:   {}", task.card_id);
    println!("status: {} (priority {})", task.status.display_name(), task.priority);
    println!("branch: {}", task.branch.as_deref().unwrap_or("(none — claim assigns bark/<id>)"));
    if !task.description.is_empty() {
        println!("\n## Description\n{}", task.description);
    }
    if !task.acceptance_criteria.is_empty() {
        println!("\n## Acceptance criteria");
        for ac in &task.acceptance_criteria {
            println!("- [ ] {}", ac);
        }
    }
    if !task.context_files.is_empty() {
        println!("\n## Files ({} — do not touch anything else without asking)", task.context_files.len());
        for f in &task.context_files {
            if f.symbols.is_empty() {
                println!("- {}", f.path);
            } else {
                println!("- {} ({})", f.path, f.symbols.join(", "));
            }
        }
    }
    if !task.dependencies.is_empty() {
        println!("\n## Depends on: {}", task.dependencies.join(", "));
    }

    // Collision warning.
    let rep = overlap(&queue, &task.id);
    if !rep.overlapping_tasks.is_empty() {
        println!(
            "\n{} overlaps {} sharing: {}",
            style::warn("Warning:"),
            rep.overlapping_tasks.join(", "),
            rep.shared_files.join(", ")
        );
    }

    // Skills.
    if let Some(skills) = crate::agent::skills_for_task(task) {
        println!("\n{}", skills);
    }

    // Prior art: sibling tasks on the same card + memory hits.
    let siblings: Vec<_> = queue
        .for_card(&task.card_id)
        .into_iter()
        .filter(|t| t.id != task.id)
        .collect();
    if !siblings.is_empty() {
        println!("\n## Prior art (same card)");
        for s in siblings.iter().take(5) {
            println!("- {} [{}] {}", s.id, s.status.display_name(), s.title);
        }
    }
    if let Ok(store) = crate::memory::MemoryStore::open(&board) {
        let hits = store.search(&task.title, 3);
        if !hits.is_empty() {
            println!("\n## Related memory");
            for h in hits {
                let one: String = h.content.chars().take(140).collect();
                println!("- {}", one);
            }
        }
    }

    // Verify profile.
    match crate::agent::verify::load_profile() {
        Ok(p) if !p.steps.is_empty() => {
            println!("\n## Verify before reporting done");
            for s in &p.steps {
                println!("- {}: `{}`", s.name, s.cmd.join(" "));
            }
        }
        _ => println!("\n## Verify\n- none configured"),
    }
    Ok(())
}
