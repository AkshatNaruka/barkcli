use anyhow::{bail, Result};

pub fn run_worktree_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli worktree <list|status|clean|checkpoint|setup> [slug]");
    };
    match sub.as_str() {
        "list" | "ls" => list(),
        "status" => status(),
        "clean" => clean(),
        "checkpoint" => checkpoint(&args[1..]),
        "setup" => setup(&args[1..]),
        _ => bail!("unknown worktree subcommand '{}'", sub),
    }
}

fn list() -> Result<()> {
    let rows = crate::agent::worktree_lifecycle::list_with_health()?;
    if rows.is_empty() {
        println!("No managed worktrees.");
        return Ok(());
    }
    for info in &rows {
        println!(
            "  {} [{}] {} {}",
            info.slug,
            info.status,
            info.branch.as_deref().unwrap_or("-"),
            info.path
        );
        if let Some(checkpoint) = &info.checkpoint_ref {
            println!("    checkpoint: {}", checkpoint);
        }
        if let Some(setup) = &info.setup_cmd {
            println!("    setup: {} ({})", setup, info.setup_status.as_deref().unwrap_or("-"));
        }
    }
    Ok(())
}

fn status() -> Result<()> {
    let rows = crate::agent::worktree_lifecycle::list_with_health()?;
    println!("{} worktree(s) tracked", rows.len());
    for info in &rows {
        println!("  {} [{}] updated {}", info.slug, info.status, info.updated_at.to_rfc3339());
    }
    // Include raw git list for cross-check.
    if let Ok(live) = crate::agent::worktree::list_worktrees() {
        println!("git worktree list: {} entry(s)", live.len());
    }
    Ok(())
}

fn clean() -> Result<()> {
    let pruned = crate::agent::worktree::prune_stale_worktrees()?;
    println!("Pruned {} stale worktree(s).", pruned);
    crate::util::metrics::inc_by("worktree_pruned", pruned as u64);
    Ok(())
}

fn checkpoint(args: &[String]) -> Result<()> {
    if args.is_empty() {
        bail!("usage: barkcli worktree checkpoint <slug> [label]");
    }
    let slug = &args[0];
    let label = args.get(1).map(|s| s.as_str()).unwrap_or("auto");
    let r#ref = crate::agent::worktree_lifecycle::checkpoint(slug, label)?;
    println!("Checkpointed {} → {}", slug, r#ref);
    crate::util::metrics::inc("worktree_checkpoint");
    Ok(())
}

fn setup(args: &[String]) -> Result<()> {
    if args.is_empty() {
        bail!("usage: barkcli worktree setup <slug>");
    }
    let slug = &args[0];
    let map = crate::agent::worktree_lifecycle::load_status();
    let info = map.get(slug).ok_or_else(|| anyhow::anyhow!("worktree '{}' not tracked", slug))?;
    let path = std::path::PathBuf::from(&info.path);
    if !path.exists() {
        anyhow::bail!("worktree path missing: {}", info.path);
    }
    let recorded = crate::agent::worktree_lifecycle::record_setup(slug, &path)?;
    match recorded.and_then(|i| i.setup_cmd) {
        Some(cmd) => println!("Setup for {}: {}", slug, cmd),
        None => println!("No setup detected for {}", slug),
    }
    Ok(())
}
