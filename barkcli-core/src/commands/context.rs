use std::path::PathBuf;

use anyhow::{Context, Result};
use comfy_table::Cell;

use crate::code::SymbolIndex;
use crate::models::context::{BoardContext, FileRef};
use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::read_board;
use crate::storage::context::{read_context, write_context};
use crate::util::{display, git, style};

/// `barkcli context scan` — auto-map every card to code via fuzzy symbol
/// matching. Local only, no LLM.
pub fn run_scan(board: &str, args: &[String]) -> Result<()> {
    let top = flag_value(args, "--top").and_then(|v| v.parse::<usize>().ok()).unwrap_or(3);
    let min_score = flag_value(args, "--min-score").and_then(|v| v.parse::<u32>().ok()).unwrap_or(1);

    let b = read_board(board).context(format!("board '{}' not found", board))?;
    let root = project_root()?;
    let index = SymbolIndex::build(&root);
    if index.files.is_empty() {
        println!("{} no source files found in {}", style::warn("Scan:"), root.display());
        return Ok(());
    }

    let mut ctx = read_context(board)?;
    let mut mapped = 0usize;
    for card in &b.cards {
        if card.links.iter().any(|l| l.ty == crate::models::card::LinkType::Parent) {
            continue; // don't auto-map children — they share parent code
        }
        if card_has_manual_files(&ctx, &card.id) {
            continue;
        }
        let hits = index.match_title(&card.title, min_score, top);
        let entry = ctx.card_mut(&card.id);
        for hit in &hits {
            if entry.files.iter().any(|f| f.path == hit.path) {
                continue;
            }
            let mut fr = FileRef::new(hit.path.clone());
            fr.source = "scan".into();
            fr.symbols = hit.matched_symbols.clone();
            entry.files.push(fr);
            mapped += 1;
        }
    }
    ctx.rebuild_index();
    write_context(board, &ctx)?;
    println!(
        "{} {} file→card mappings across {} cards ({} source files indexed)",
        style::ok("Scan:"),
        mapped,
        b.cards.len(),
        index.files.len()
    );
    Ok(())
}

/// `barkcli context link <card> <path-or-symbol>` — pin a file to a card.
pub fn run_link(board: &str, args: &[String]) -> Result<()> {
    if args.len() < 2 {
        anyhow::bail!("usage: barkcli context link <card> <path|symbol>");
    }
    let card_id = &args[0];
    let target = &args[1];
    let b = read_board(board)?;
    if !b.cards.iter().any(|c| c.id == *card_id) {
        anyhow::bail!("card '{}' not found in '{}'", card_id, board);
    }

    let root = project_root()?;
    let index = SymbolIndex::build(&root);
    let mut matched_paths: Vec<String> = Vec::new();

    if index.get(target).is_some() {
        matched_paths.push(target.clone());
    } else {
        // Maybe a symbol → resolve to files containing it
        for f in &index.files {
            if f.symbols.iter().any(|s| s == target) {
                matched_paths.push(f.path.clone());
            }
        }
    }
    if matched_paths.is_empty() {
        anyhow::bail!("no file or symbol '{}' found in project", target);
    }

    let mut ctx = read_context(board)?;
    let mut added = Vec::new();
    for path in &matched_paths {
        let entry = ctx.card_mut(card_id);
        if entry.files.iter().any(|f| f.path == *path) {
            continue;
        }
        let mut fr = FileRef::new(path.clone());
        fr.symbols = index.get(path).map(|f| f.symbols.clone()).unwrap_or_default();
        fr.source = "manual".into();
        entry.files.push(fr);
        added.push(path.clone());
    }
    ctx.rebuild_index();
    write_context(board, &ctx)?;
    if added.is_empty() {
        println!("{} already linked", style::muted("Link:"));
    } else {
        println!("{} linked {} to '{}'", style::ok("Link:"), added.join(", "), card_id);
    }
    Ok(())
}

/// `barkcli context unlink <card> <path>`
pub fn run_unlink(board: &str, args: &[String]) -> Result<()> {
    if args.len() < 2 {
        anyhow::bail!("usage: barkcli context unlink <card> <path>");
    }
    let mut ctx = read_context(board)?;
    let before = ctx.card_mut(&args[0]).files.len();
    ctx.card_mut(&args[0]).files.retain(|f| f.path != args[1]);
    let removed = ctx.cards.get(&args[0]).map(|e| e.files.len()).unwrap_or(0) < before;
    if removed {
        ctx.rebuild_index();
        write_context(board, &ctx)?;
        println!("{} unlinked {} from '{}'", style::ok("Unlink:"), args[1], args[0]);
    } else {
        println!("{} no link found", style::muted("Unlink:"));
    }
    Ok(())
}

/// `barkcli context status` — coverage table.
pub fn run_status(board: &str) -> Result<()> {
    let b = read_board(board)?;
    let ctx = read_context(board)?;

    let mut t = display::table();
    t.set_header(display::header(vec!["Card", "Files", "Status", "Last sync", "AI"]));
    let mut mapped_cards = 0usize;
    for card in &b.cards {
        let entry = ctx.cards.get(&card.id);
        let n = entry.map(|e| e.files.len()).unwrap_or(0);
        if n > 0 {
            mapped_cards += 1;
        }
        let worst = entry
            .map(|e| {
                e.files
                    .iter()
                    .map(|f| f.status.as_str())
                    .max_by_key(|s| match *s {
                        "changed" => 3,
                        "deleted" => 2,
                        "stale" => 1,
                        _ => 0,
                    })
                    .unwrap_or("clean")
            })
            .unwrap_or("unmapped");
        let status_styled = match worst {
            "changed" => style::err("changed"),
            "deleted" => style::err("deleted"),
            "stale" => style::warn("stale"),
            "clean" => style::ok("clean"),
            _ => style::muted("unmapped"),
        };
        let ai = match entry.and_then(|e| e.ai.as_ref()) {
            Some(a) => style::ok(format!("{} @{}", a.model.as_deref().unwrap_or("ai"), &a.at[..a.at.len().min(10)])),
            None => style::muted("-").to_string(),
        };
        let sync = entry.and_then(|e| e.last_sync_commit.clone()).unwrap_or_else(|| "-".into());
        t.add_row(vec![
            Cell::new(style::accent(&card.id)),
            Cell::new(style::strong(n.to_string())),
            Cell::new(status_styled),
            Cell::new(style::muted(sync)),
            Cell::new(ai),
        ]);
    }
    println!("{t}");
    let pct = if b.cards.is_empty() {
        0.0
    } else {
        mapped_cards as f64 * 100.0 / b.cards.len() as f64
    };
    println!(
        "{} {:.0}% of {} cards mapped to code",
        style::accent("Coverage:"),
        pct,
        b.cards.len()
    );
    Ok(())
}

/// `barkcli context show <card>` — full context for one card.
pub fn run_show(board: &str, args: &[String]) -> Result<()> {
    let card_id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli context show <card>"))?;
    let b = read_board(board)?;
    let card = b
        .cards
        .iter()
        .find(|c| c.id == *card_id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found", card_id))?;
    let ctx = read_context(board)?;
    let entry = ctx.cards.get(card_id);

    println!("  {} {}", style::accent("Card:"), style::strong(&card.title));
    match entry {
        None => {
            println!("  {} no code context yet — run `barkcli context scan` or `context link {} <path>`", style::muted("Context:"), card_id);
            return Ok(());
        }
        Some(e) => {
            if e.files.is_empty() {
                println!("  {} no files linked yet", style::muted("Files:"));
            } else {
                println!("  {}", style::accent("Files:"));
                for f in &e.files {
                    let status = match f.status.as_str() {
                        "changed" => style::err("● changed"),
                        "deleted" => style::err("● deleted"),
                        "stale" => style::warn("● stale"),
                        "clean" => style::ok("● clean"),
                        _ => style::muted("○").to_string(),
                    };
                    let commit = f.last_commit.as_deref().unwrap_or("-");
                    println!(
                        "    {} {} [{}] {} {}",
                        status,
                        style::strong(&f.path),
                        style::muted(f.source.clone()),
                        style::muted(format!("@{}", commit)),
                        if f.symbols.is_empty() {
                            String::new()
                        } else {
                            style::muted(format!("({})", f.symbols.join(", ")))
                        }
                    );
                }
            }
            if !e.sessions.is_empty() {
                println!("  {} {}", style::accent("Sessions:"), style::muted(e.sessions.join(", ")));
            }
            if let Some(ai) = &e.ai {
                println!("  {}", style::accent("AI summary:"));
                for line in ai.summary.lines() {
                    println!("    {}", line);
                }
                if !ai.next_steps.is_empty() {
                    println!("  {}", style::accent("Next steps:"));
                    for s in &ai.next_steps {
                        println!("    • {}", s);
                    }
                }
                println!(
                    "  {} {}",
                    style::muted("Refreshed:"),
                    style::muted(format!("{} ({} model)", ai.at, ai.model.as_deref().unwrap_or("?")))
                );
            }
        }
    }
    Ok(())
}

/// `barkcli context sync` — git-aware refresh of file statuses.
pub fn run_sync(board: &str, quiet: bool) -> Result<()> {
    let root = project_root()?;
    let b = read_board(board)?;
    if b.cards.is_empty() {
        return Ok(());
    }
    let mut ctx = read_context(board)?;

    let head = git::current_commit(&root);
    let last_commit_files = git::last_commit_files(&root);
    let dirty = git::dirty_files(&root);

    let mut changed_cards = 0usize;
    for (card_id, entry) in ctx.cards.iter_mut() {
        if entry.files.is_empty() {
            continue;
        }
        let mut card_touched = false;
        for f in entry.files.iter_mut() {
            let in_last_commit = last_commit_files.iter().any(|p| paths_match(p, &f.path));
            let is_dirty = dirty.iter().any(|p| paths_match(p, &f.path));
            if in_last_commit {
                f.last_commit = head.clone();
                f.status = "clean".into();
                card_touched = true;
            } else if is_dirty {
                f.status = "changed".into();
                card_touched = true;
            } else if f.status == "unknown" || f.status == "changed" {
                f.status = "clean".into();
            }
        }
        if card_touched {
            changed_cards += 1;
            let n = entry.files.iter().filter(|f| f.status == "clean" && f.last_commit.is_some()).count();
            let _ = crate::storage::history::log_update(
                board,
                card_id,
                "context.sync",
                "?",
                &format!("{} file(s) touched by latest code change", n),
            );
        }
    }
    ctx.rebuild_index();
    write_context(board, &ctx)?;

    if !quiet {
        println!(
            "{} {} card(s) touched by latest code change ({})",
            style::ok("Sync:"),
            changed_cards,
            head.as_deref().unwrap_or("no commits yet")
        );
    }
    Ok(())
}

fn paths_match(changed: &str, mapped: &str) -> bool {
    let changed = changed.trim_start_matches("./").trim_end_matches('/');
    let mapped = mapped.trim_start_matches("./");
    changed == mapped
        || changed.ends_with(&format!("/{}", mapped))
        || mapped.ends_with(&format!("/{}", changed))
        || mapped.starts_with(&format!("{}/", changed))
}

/// `barkcli context autosync on|off` — install/remove the post-commit context sync.
pub fn run_autosync(board: &str, args: &[String]) -> Result<()> {
    let Some(on_off) = args.first() else {
        anyhow::bail!("usage: barkcli context autosync on|off");
    };
    let root = project_root()?;
    let hooks_dir = root.join(".git").join("hooks");
    let post_commit = hooks_dir.join("post-commit");

    let marker = format!("# barkcli-context-autosync:{}", board);
    let cmd_line = format!("barkcli context sync --board {} >/dev/null 2>&1 || exit 0", board);

    match on_off.as_str() {
        "on" | "enable" => {
            std::fs::create_dir_all(&hooks_dir).ok();
            let existing = std::fs::read_to_string(&post_commit).unwrap_or_default();
            if existing.contains(&marker) {
                println!("{} context autosync already enabled for '{}'", style::muted("Autosync:"), board);
                return Ok(());
            }
            let content = if existing.trim().is_empty() {
                format!("#!/bin/sh\n{}\n{}\n", cmd_line, marker)
            } else {
                format!("{}\n{}\n{}\n", existing, cmd_line, marker)
            };
            std::fs::write(&post_commit, &content).context("failed to write post-commit hook")?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&post_commit, std::fs::Permissions::from_mode(0o755));
            }
            println!("{} context autosync enabled for '{}' (post-commit)", style::ok("Autosync:"), board);
        }
        "off" | "disable" => {
            let existing = std::fs::read_to_string(&post_commit).unwrap_or_default();
            let lines: Vec<&str> = existing.lines().filter(|l| !l.contains(&marker) && l.trim() != cmd_line).collect();
            let content = lines.join("\n");
            if content.trim().is_empty() {
                std::fs::write(&post_commit, "#!/bin/sh\n").ok();
            } else {
                std::fs::write(&post_commit, &content).ok();
            }
            println!("{} context autosync disabled for '{}'", style::ok("Autosync:"), board);
        }
        _ => anyhow::bail!("usage: barkcli context autosync on|off"),
    }
    Ok(())
}

/// `barkcli context clear` — wipe the sidecar (regenerate with scan/sync).
pub fn run_clear(board: &str) -> Result<()> {
    crate::storage::context::remove_context(board);
    println!("{} cleared context for '{}'", style::ok("Clear:"), board);
    Ok(())
}

fn card_has_manual_files(ctx: &BoardContext, card_id: &str) -> bool {
    ctx.cards
        .get(card_id)
        .map(|e| e.files.iter().any(|f| f.source == "manual"))
        .unwrap_or(false)
}

fn flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn project_root() -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    board_dir
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| anyhow::anyhow!("cannot determine project root"))
}
