use anyhow::Result;

use super::fleet::{flag_value, resolve_board_arg};
use crate::agent::verify;
use crate::util::style;

/// `barkcli verify [--init] [--task TASK]` — run the repo verify profile.
///
/// `--init` writes the auto-detected profile to `.board/verify.json`.
/// `--task` runs inside that task's worktree (via its lease session).
pub fn run_verify(args: &[String]) -> Result<()> {
    let _board = resolve_board_arg(args)?;

    if args.iter().any(|a| a == "--init") {
        let profile = verify::detect_profile()?;
        verify::save_profile(&profile)?;
        println!("{} wrote .board/verify.json ({} steps)", style::ok("Verify:"), profile.steps.len());
        for s in &profile.steps {
            println!("  - {}: `{}`", s.name, s.cmd.join(" "));
        }
        return Ok(());
    }

    let profile = verify::load_profile()?;
    if profile.steps.is_empty() {
        println!("{} no steps configured — run `barkcli verify --init`", style::warn("Verify:"));
        return Ok(());
    }

    // Resolve cwd: task worktree when --task names a claimed task.
    let cwd = if let Some(task_id) = flag_value(args, "--task") {
        let board = resolve_board_arg(args)?;
        let queue = super::fleet::load_queue(&board)?;
        let task = queue
            .get(&task_id)
            .ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;
        task.lease
            .as_ref()
            .and_then(|l| l.session_id.as_ref())
            .and_then(|sid| crate::agent::session::load_session(sid).ok())
            .and_then(|s| s.worktree_path.map(std::path::PathBuf::from))
            .filter(|p| p.exists())
            .unwrap_or(crate::storage::board_dir::find_project_root()?)
    } else {
        crate::storage::board_dir::find_project_root()?
    };

    println!("{} running {} steps in {}", style::accent("Verify:"), profile.steps.len(), cwd.display());
    let mut failed = 0;
    for r in verify::run_profile(&profile, &cwd) {
        let mark = if r.success { style::ok("PASS") } else { style::err("FAIL") };
        println!("  {} {} ({}ms)", mark, r.name, r.duration_ms);
        if !r.success {
            failed += 1;
            for line in r.tail.iter().take(10) {
                println!("      {}", style::muted(line));
            }
        }
    }
    if failed > 0 {
        anyhow::bail!("{} of {} verify steps failed", failed, profile.steps.len());
    }
    println!("{} all steps passed", style::ok("Verify:"));
    Ok(())
}
