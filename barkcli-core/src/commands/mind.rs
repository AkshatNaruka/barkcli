use anyhow::{Context, Result};

use crate::mind::{digest, snapshot};
use crate::util::style;

/// `barkcli mind <sync|show>` — Mind snapshot & digest (SPEC-002)
pub fn run_mind(args: &[String]) -> Result<()> {
    let sub = args.first().map(|s| s.as_str()).unwrap_or("sync");
    let rest = &args[1..];
    match sub {
        "sync" => run_sync(rest),
        "show" => run_show(rest),
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        _ => {
            // Default: sync if arg looks like board flag, else show help
            if sub.starts_with('-') {
                run_sync(args)
            } else {
                anyhow::bail!("unknown mind subcommand '{}'. Try `barkcli mind help`", sub)
            }
        }
    }
}

fn run_sync(args: &[String]) -> Result<()> {
    let quiet = args.iter().any(|a| a == "--quiet" || a == "-q");
    let board_name = find_board(args)?;

    if !quiet {
        println!("{} Syncing mind for '{}'...", style::accent("Mind:"), board_name);
    }

    let snap = snapshot::build(&board_name)
        .context(format!("failed to build mind for '{}'", board_name))?;
    snapshot::save(&snap)?;

    if !quiet {
        println!("{} Snapshot → {}", style::ok("OK"), snapshot::mind_path(&board_name)?.display());
        println!("{} Digest   → {}", style::ok("OK"), snapshot::digest_path(&board_name)?.display());
        println!("  Cards: {}  Blockers: {}  Stale: {}  Next: {}", snap.stats.total, snap.blockers.len(), snap.stale_cards.len(), snap.next_actions.first().map(|a| a.action.as_str()).unwrap_or("-"));
        // Show digest preview
        let d = digest::render(&snap);
        // Print first 30 lines
        for line in d.lines().take(30) {
            println!("{}", line);
        }
        if d.lines().count() > 30 {
            println!("{}", style::muted("... (see .board/mind/<board>.md)"));
        }
    }

    Ok(())
}

fn run_show(args: &[String]) -> Result<()> {
    let board_name = find_board(args)?;
    // Prefer digest.md if exists, else rebuild snapshot
    let dpath = snapshot::digest_path(&board_name)?;
    if dpath.exists() {
        let content = std::fs::read_to_string(&dpath).context("read digest")?;
        println!("{}", content);
        return Ok(());
    }
    let snap = snapshot::build(&board_name)?;
    println!("{}", digest::render(&snap));
    Ok(())
}

fn print_help() {
    println!("Usage: barkcli mind <command> [args]");
    println!();
    println!("Commands:");
    println!("  sync [--quiet]        Build snapshot + digest from board state");
    println!("  show                  Show digest.md (or render live)");
    println!();
    println!("Stored:");
    println!("  .board/mind/<board>.json   Snapshot (machine)");
    println!("  .board/mind/<board>.md     Digest (human, paste into agent)");
}

fn find_board(args: &[String]) -> Result<String> {
    let mut i = 0;
    while i < args.len() {
        if (args[i] == "--board" || args[i] == "-b") && i + 1 < args.len() {
            return crate::commands::boards::resolve_board(Some(&args[i + 1]));
        }
        i += 1;
    }
    crate::commands::boards::resolve_board(None)
}
