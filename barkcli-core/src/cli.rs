use anyhow::{bail, Result};

use crate::commands;
use crate::commands::undo;

pub fn resolve_board(board_arg: Option<&str>) -> Result<String> {
    commands::boards::resolve_board(board_arg)
}

fn save_undo(board: Option<&str>, op: &str, card_id: Option<&str>) -> Result<()> {
    let name = resolve_board(board)?;
    undo::save_undo_state(&name, op, card_id)
}

pub fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let rest = &args[1..];

    if rest.is_empty() {
        print_usage();
        return Ok(());
    }

    let cmd = &rest[0];
    let cmd_args = &rest[1..];

    dispatch(cmd, cmd_args)
}

/// Run a single command by name (used by barkcli-cli's pro gate before
/// delegating, e.g. `barkcli context refresh`).
pub fn run_dispatch(cmd: &str, cmd_args: &[String]) -> Result<()> {
    let cmd = if cmd == "agent" && cmd_args.first().map(|s| s.as_str()) == Some("sync") {
        "context"
    } else {
        cmd
    };
    dispatch(cmd, cmd_args)
}

fn dispatch(cmd: &str, cmd_args: &[String]) -> Result<()> {
    match cmd {
        "init" => commands::init::run()?,
        "create" => {
            let name = cmd_args.first().ok_or_else(|| anyhow::anyhow!("missing board name"))?;
            commands::create::run(name)?
        }

        "add" => handle_add(cmd_args)?,
        "list" | "ls" => handle_list(cmd_args)?,
        "show" => handle_show(cmd_args)?,
        "move" | "mv" => handle_move(cmd_args)?,
        "done" => handle_done(cmd_args)?,
        "update" | "up" => handle_update(cmd_args)?,
        "remove" | "rm" | "delete" => handle_remove(cmd_args)?,

        "log" => handle_log(cmd_args)?,
        "undo" => handle_undo(cmd_args)?,
        "diff" => handle_diff(cmd_args)?,
        "blame" => handle_blame(cmd_args)?,

        "today" => {
            let (board, _) = parse_board_flag(cmd_args)?;
            let board_name = resolve_board(board.as_deref())?;
            commands::agenda::run_today(&board_name)?
        }
        "calendar" => {
            let (board, rest) = parse_board_flag(cmd_args)?;
            let board_name = resolve_board(board.as_deref())?;
            let month = rest.first().map(|s| s.as_str());
            commands::agenda::run_calendar(&board_name, month)?
        }
        "remind" => {
            let (board, rest) = parse_board_flag(cmd_args)?;
            let board_name = resolve_board(board.as_deref())?;
            let mut hours = 24u64;
            let mut i = 0;
            while i < rest.len() {
                if rest[i] == "--hours" {
                    i += 1;
                    if let Some(h) = rest.get(i).and_then(|v| v.parse().ok()) {
                        hours = h;
                    }
                }
                i += 1;
            }
            commands::agenda::run_remind(&board_name, hours)?
        }

        "comment" => handle_comment(cmd_args)?,
        "block" => handle_block(cmd_args)?,
        "pin" => handle_pin(cmd_args)?,
        "unpin" => handle_unpin(cmd_args)?,

        "link" => handle_link(cmd_args)?,
        "unlink" => handle_unlink(cmd_args)?,
        "tree" => handle_tree(cmd_args)?,
        "code" => handle_code(cmd_args)?,
        "context" => handle_context_cmd(cmd_args)?,
        "agent" => handle_agent_cmd(cmd_args)?,

        "boards" => handle_boards_cmd(cmd_args)?,
        "switch" => handle_switch(cmd_args)?,
        "status" => commands::status::run()?,
        "validate" => commands::validate::run()?,
        "doctor" => commands::doctor::run()?,
        "clean" => commands::clean::run()?,

        "export" => handle_export(cmd_args)?,
        "import" => handle_import(cmd_args)?,

        "merge" => commands::merge::run(cmd_args)?,

        "snapshot" => handle_snapshot(cmd_args)?,

        "vscode-install" | "vscode" => commands::vscode::run(cmd_args)?,

        "intake" => commands::intake::run_intake(cmd_args)?,
        "plan" => commands::plan::run_plan(cmd_args)?,
        "memory" | "mem" => commands::memory::run_memory(cmd_args)?,
        "monitor" => commands::monitor::run_monitor(cmd_args)?,
        "review" => commands::review::run_review(cmd_args)?,
        "mind" => commands::mind::run_mind(cmd_args)?,
        "overview" => commands::overview::run_overview(cmd_args)?,
        "skills" | "skill" => commands::skills::run_skills(cmd_args)?,
        "dispatch" => {
            // Alias to orchestrate cycle via agent engine
            let board_name = resolve_board(None)?;
            let board = crate::storage::board_file::read_board(&board_name)?;
            let mut eng = crate::agent::OrchestrationEngine::new(&board_name, crate::agent::AgentRole::ScrumMaster, board)?;
            let res = eng.run_cycle()?;
            println!("Dispatched {} tasks (created {}), insights: {}", res.tasks_dispatched, res.tasks_created, res.insights.join("; "));
        }

        "session" => handle_session_cmd(cmd_args)?,
        "checkpoint" => handle_checkpoint_cmd(cmd_args)?,
        "hooks" => handle_hooks_cmd(cmd_args)?,

        // Fleet: multi-agent execution (sessions, worktrees, leases)
        "fleet" => commands::fleet::run_fleet(cmd_args)?,
        "task" => commands::task_cmd::run_task(cmd_args)?,
        "ready" => commands::ready::run_ready(cmd_args)?,
        "packet" => commands::ready::run_packet(cmd_args)?,
        "prime" => commands::prime::run_prime(cmd_args)?,
        "verify" => commands::verify_cmd::run_verify(cmd_args)?,
        "handoff" => commands::handoff::run_handoff(cmd_args)?,

        // Interfaces / self-update — handled by barkcli-cli's main.rs
        "tui" | "serve" | "open" | "update" | "upgrade" => {}
        "--version" | "-V" | "version" => {}
        "help" | "--help" | "-h" => print_usage(),

        name => handle_legacy(name, cmd_args)?,
    }

    Ok(())
}

// ─── Task handlers ───────────────────────────────

fn handle_add(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    let board_name = resolve_board(board.as_deref())?;
    save_undo(Some(&board_name), "add", None)?;
    let mut all_args = vec![board_name.clone()];
    all_args.extend(rest.iter().cloned());
    commands::card::add::run(&all_args[0], &all_args[1..])
}

fn handle_list(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    let board_name = resolve_board(board.as_deref())?;
    commands::card::list::run(&board_name, &rest)
}

fn handle_show(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() { bail!("missing card id"); }
    let board_name = resolve_board(board.as_deref())?;
    commands::card::show::run(&board_name, &[rest[0].clone()])
}

fn handle_move(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.len() < 2 {             bail!("usage: barkcli move <id> <column>"); }
    let board_name = resolve_board(board.as_deref())?;
    save_undo(Some(&board_name), "move", Some(&rest[0]))?;
    commands::card::move_cmd::run(&board_name, &rest)
}

fn handle_done(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() {             bail!("usage: barkcli done <id>"); }
    let board_name = resolve_board(board.as_deref())?;
    save_undo(Some(&board_name), "done", Some(&rest[0]))?;
    commands::card::move_cmd::run(&board_name, &[rest[0].clone(), "done".into()])
}

fn handle_update(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() {             bail!("usage: barkcli update <id> [flags]"); }
    let board_name = resolve_board(board.as_deref())?;
    save_undo(Some(&board_name), "update", Some(&rest[0]))?;
    commands::card::update::run(&board_name, &rest)
}

fn handle_remove(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() {             bail!("usage: barkcli remove <id>"); }
    let board_name = resolve_board(board.as_deref())?;
    save_undo(Some(&board_name), "remove", Some(&rest[0]))?;
    commands::card::remove::run(&board_name, &rest)
}

// ─── History ─────────────────────────────────────

fn handle_log(args: &[String]) -> Result<()> {
    let (board, _rest) = parse_board_flag(args)?;
    let board_name = resolve_board(board.as_deref())?;
    commands::git_ops::run_log(Some(&board_name))
}

fn handle_undo(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    let card_id = rest.iter().find(|s| !s.starts_with('-')).map(|s| s.as_str());
    undo::run_undo(board.as_deref(), card_id)
}

fn handle_diff(args: &[String]) -> Result<()> {
    let (_board, _rest) = parse_board_flag(args)?;
    undo::run_diff()
}

fn handle_blame(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() {             bail!("usage: barkcli blame <id>"); }
    undo::run_blame(board.as_deref(), &rest[0])
}

fn handle_snapshot(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() {             bail!("usage: barkcli snapshot <label>"); }
    undo::run_snapshot(board.as_deref(), &rest[0])
}

// ─── Comment / Block ─────────────────────────────

fn handle_comment(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.len() < 2 {             bail!("usage: barkcli comment <id> \"text\""); }
    let board_name = resolve_board(board.as_deref())?;

    let id = &rest[0];
    let text = rest[1..].join(" ");

    let mut b = crate::storage::board_file::read_board(&board_name)?;
    let card = b.cards.iter_mut()
        .find(|c| c.id == *id)
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found", id))?;

    card.comments.push(crate::models::card::Comment {
        author: "barkcli".into(),
        text,
        at: chrono::Utc::now(),
    });
    crate::storage::board_file::write_board(&board_name, &b)?;
    println!("Comment added to '{}'", id);
    Ok(())
}

fn handle_block(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() {             bail!("usage: barkcli block <id> --on <other-id>"); }
    let board_name = resolve_board(board.as_deref())?;

    let id = &rest[0];
    let mut blocked_by = None;
    let mut i = 1;
    while i < rest.len() {
        if rest[i] == "--on" {
            i += 1;
            blocked_by = rest.get(i).cloned();
        }
        i += 1;
    }

    let mut b = crate::storage::board_file::read_board(&board_name)?;
    {
        let card = b.cards.iter_mut()
            .find(|c| c.id == *id)
            .ok_or_else(|| anyhow::anyhow!("card '{}' not found", id))?;
        card.blocked_by = blocked_by;
    }
    crate::storage::board_file::write_board(&board_name, &b)?;

    let blocked = b.cards.iter().find(|c| c.id == *id).and_then(|c| c.blocked_by.as_deref());
    if let Some(by) = blocked {
        println!("Blocked '{}' by '{}'", id, by);
    } else {
        println!("Unblocked '{}'", id);
    }
    Ok(())
}

fn handle_pin(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() { bail!("usage: barkcli pin <id>"); }
    let board_name = resolve_board(board.as_deref())?;
    commands::card::pin::run_pin(&board_name, &rest[0])
}

fn handle_unpin(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() { bail!("usage: barkcli unpin <id>"); }
    let board_name = resolve_board(board.as_deref())?;
    commands::card::pin::run_unpin(&board_name, &rest[0])
}

// ─── Links / Code / Context ──────────────────────

fn handle_link(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.len() < 2 { bail!("usage: barkcli link <id> <target-id> [--as parent|child|related|blocked-by]"); }
    let board_name = resolve_board(board.as_deref())?;
    save_undo(Some(&board_name), "link", Some(&rest[0]))?;
    commands::link::run_link(&board_name, &rest)
}

fn handle_unlink(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.len() < 2 { bail!("usage: barkcli unlink <id> <target-id> [--as parent|child|related|blocked-by]"); }
    let board_name = resolve_board(board.as_deref())?;
    save_undo(Some(&board_name), "unlink", Some(&rest[0]))?;
    commands::link::run_unlink(&board_name, &rest)
}

fn handle_tree(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    let board_name = resolve_board(board.as_deref())?;
    commands::link::run_tree(&board_name, &rest)
}

fn handle_code(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if rest.is_empty() { bail!("usage: barkcli code <query> [--top N]"); }
    let board_name = resolve_board(board.as_deref())?;
    commands::code::run_code(&board_name, &rest)
}

fn handle_context_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli context <scan|link|unlink|status|show|sync|autosync|clear>");
    };
    let rest = &args[1..];
    let (board, rest2) = parse_board_flag(rest)?;
    let board_name = resolve_board(board.as_deref())?;
    match sub.as_str() {
        "scan" => commands::context::run_scan(&board_name, &rest2),
        "link" => commands::context::run_link(&board_name, &rest2),
        "unlink" => commands::context::run_unlink(&board_name, &rest2),
        "status" | "stats" => commands::context::run_status(&board_name),
        "show" | "info" => commands::context::run_show(&board_name, &rest2),
        "sync" => {
            let quiet = rest2.iter().any(|a| a == "--quiet");
            commands::context::run_sync(&board_name, quiet)
        }
        "refresh" => commands::agent::run_refresh(&board_name, &rest2),
        "autosync" | "auto" => commands::context::run_autosync(&board_name, &rest2),
        "clear" | "reset" => commands::context::run_clear(&board_name),
        _ => bail!("unknown context subcommand '{}' (scan | link | unlink | status | show | sync | refresh | autosync | clear)", sub),
    }
}

fn handle_agent_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli agent <propose|watch|sync|config>");
    };
    let rest = &args[1..];
    let (board, rest2) = parse_board_flag(rest)?;
    let board_name = resolve_board(board.as_deref())?;
    match sub.as_str() {
        "propose" => commands::agent::run_propose(&board_name, &rest2),
        "watch" => commands::agent::run_watch(&board_name, &rest2),
        "sync" => {
            let quiet = rest2.iter().any(|a| a == "--quiet");
            commands::agent::run_agent_sync(&board_name, quiet)
        }
        "config" => commands::agent::run_ai_config(&rest2),
        _ => bail!("unknown agent subcommand '{}' (propose | watch | sync | config)", sub),
    }
}

// ─── Boards ──────────────────────────────────────

fn handle_boards_cmd(args: &[String]) -> Result<()> {
    if args.is_empty() {
        commands::boards::run_boards_list()
    } else {
        match args[0].as_str() {
            "create" => {
                if args.len() < 2 {                     bail!("usage: barkcli boards create <name>"); }
                commands::boards::run_boards_create(&args[1])
            }
            _ => bail!("unknown boards subcommand: {}", args[0]),
        }
    }
}

fn handle_switch(args: &[String]) -> Result<()> {
    if args.is_empty() {             bail!("usage: barkcli switch <name>"); }
    commands::boards::run_switch(&args[0])
}

// ─── Export / Import ─────────────────────────────

fn handle_export(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    // If first positional arg is a known board name, use it (backward compat)
    let (board_name, format_args) = if board.is_none() && !rest.is_empty() {
        if crate::storage::board_file::board_exists(&rest[0]) {
            (rest[0].clone(), rest[1..].to_vec())
        } else {
            (resolve_board(None)?, rest)
        }
    } else {
        (resolve_board(board.as_deref())?, rest)
    };
    commands::export::run(&board_name, &format_args)
}

fn handle_import(args: &[String]) -> Result<()> {
    let (board, rest) = parse_board_flag(args)?;
    if board.is_none() && rest.is_empty() {
            bail!("usage: barkcli import <name> [file]  or  barkcli import --board <name> [file]");
    }
    let board_name = board.clone().unwrap_or_else(|| rest[0].clone());
    let file_args: Vec<String> = if board.is_some() {
        rest.clone()
    } else {
        rest[1..].to_vec()
    };
    commands::import::run(&board_name, &file_args)
}

// ─── Session / Checkpoint / Hooks ────────────────

fn handle_session_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli session <list|show|resume|log>");
    };
    match sub.as_str() {
        "list" | "ls" => commands::session::run_list(&args[1..]),
        "show" => commands::session::run_show(&args[1..]),
        "resume" => commands::session::run_resume(&args[1..]),
        "log" | "record" => commands::session::run_log(&args[1..]),
        _ => bail!("unknown session subcommand '{}' (list | show | resume | log)", sub),
    }
}

fn handle_checkpoint_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli checkpoint <list|save|show|restore>");
    };
    let rest = &args[1..];
    match sub.as_str() {
        "list" | "ls" => {
            let (board, _) = parse_board_flag(rest)?;
            commands::checkpoint::run_list(board.as_deref())
        }
        "save" => {
            if rest.iter().any(|a| a == "--auto") {
                commands::checkpoint::run_auto()
            } else {
                let (board, rest) = parse_board_flag(rest)?;
                let label = rest.first().cloned().unwrap_or_else(|| "manual".into());
                commands::checkpoint::run_save(board.as_deref(), &label)
            }
        }
        "show" => {
            let (board, rest) = parse_board_flag(rest)?;
            if rest.is_empty() { bail!("usage: barkcli checkpoint show <id>"); }
            commands::checkpoint::run_show(board.as_deref(), &rest[0])
        }
        "restore" => {
            let (board, rest) = parse_board_flag(rest)?;
            if rest.is_empty() { bail!("usage: barkcli checkpoint restore <id>"); }
            commands::checkpoint::run_restore(board.as_deref(), &rest[0])
        }
        _ => bail!("unknown checkpoint subcommand '{}' (list | save | show | restore)", sub),
    }
}

fn handle_hooks_cmd(args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli hooks <install|remove|status> [--spec-sync]");
    };
    match sub.as_str() {
        "install" => {
            let install_spec_sync = args.iter().any(|s| s == "--spec-sync" || s == "-s");
            if install_spec_sync {
                let board_dir = crate::storage::board_dir::find_board_dir()?;
                let root = board_dir.parent().unwrap_or(&std::path::Path::new(".")).to_path_buf();
                commands::hooks::install_spec_sync(&root)?;
            } else {
                commands::hooks::run_install(&args[1..])?;
            }
            Ok(())
        }
        "remove" | "uninstall" => {
            let remove_spec_sync = args.iter().any(|s| s == "--spec-sync" || s == "-s");
            if remove_spec_sync {
                let board_dir = crate::storage::board_dir::find_board_dir()?;
                let root = board_dir.parent().unwrap_or(&std::path::Path::new(".")).to_path_buf();
                commands::hooks::remove_spec_sync(&root)?;
            } else {
                commands::hooks::run_remove(&args[1..])?;
            }
            Ok(())
        }
        "status" => commands::hooks::run_status(),
        _ => bail!("unknown hooks subcommand '{}' (install | remove | status)", sub),
    }
}

// ─── Legacy dispatch ─────────────────────────────

fn handle_legacy(name: &str, args: &[String]) -> Result<()> {
    if args.is_empty() {
        let board = crate::storage::board_file::read_board(name);
        match board {
            Ok(_) => {
                println!("Board '{}' exists. Use `barkcli switch {}` for flat CLI.", name, name);
            }
            Err(_) => {
                bail!("unknown command '{}'. Try `barkcli help`", name);
            }
        }
        return Ok(());
    }

    let action = &args[0];
    let action_args = &args[1..];

    match action.as_str() {
        "add" => {
            save_undo(Some(name), "add", None)?;
            commands::card::add::run(name, action_args)
        }
        "list" | "ls" => commands::card::list::run(name, action_args),
        "show" => commands::card::show::run(name, action_args),
        "move" | "mv" => {
            save_undo(Some(name), "move", action_args.first().map(|s| s.as_str()))?;
            commands::card::move_cmd::run(name, action_args)
        }
        "done" => {
            save_undo(Some(name), "done", action_args.first().map(|s| s.as_str()))?;
            commands::card::move_cmd::run(name, &[action_args.first().cloned().unwrap_or_default(), "done".into()])
        }
        "status" | "update" | "up" => {
            save_undo(Some(name), "update", action_args.first().map(|s| s.as_str()))?;
            if action == "status" {
                commands::card::status_cmd::run(name, action_args)
            } else {
                commands::card::update::run(name, action_args)
            }
        }
        "remove" | "rm" => {
            save_undo(Some(name), "remove", action_args.first().map(|s| s.as_str()))?;
            commands::card::remove::run(name, action_args)
        }
        "export" => commands::export::run(name, action_args),
        "tui" => Ok(()),
        "serve" => Ok(()),
        "open" => Ok(()),
        "link" => {
            save_undo(Some(name), "link", action_args.first().map(|s| s.as_str()))?;
            commands::link::run_link(name, action_args)
        }
        "unlink" => {
            save_undo(Some(name), "unlink", action_args.first().map(|s| s.as_str()))?;
            commands::link::run_unlink(name, action_args)
        }
        "tree" => commands::link::run_tree(name, action_args),
        "code" => commands::code::run_code(name, action_args),
        "context" => handle_legacy_context(name, action_args),
        "agent" => handle_legacy_agent(name, action_args),
        "help" => {
            println!("Board '{}' operations:", name);
            println!("  add <title>   list   show <id>   move <id> <col>   update <id>   remove <id>");
            println!("  Or use the flat CLI: barkcli add/list/show/move/...  (no board name needed)");
            Ok(())
        }
            _ => bail!("unknown action '{}' for board '{}'. Try `barkcli {}` (flat CLI)", action, name, action),
    }
}

fn handle_legacy_context(board_name: &str, args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli {} context <scan|link|unlink|status|show|sync|autosync|clear>", board_name);
    };
    let rest = &args[1..];
    match sub.as_str() {
        "scan" => commands::context::run_scan(board_name, rest),
        "link" => commands::context::run_link(board_name, rest),
        "unlink" => commands::context::run_unlink(board_name, rest),
        "status" | "stats" => commands::context::run_status(board_name),
        "show" | "info" => commands::context::run_show(board_name, rest),
        "sync" => {
            let quiet = rest.iter().any(|a| a == "--quiet");
            commands::context::run_sync(board_name, quiet)
        }
        "refresh" => commands::agent::run_refresh(board_name, rest),
        "autosync" | "auto" => commands::context::run_autosync(board_name, rest),
        "clear" | "reset" => commands::context::run_clear(board_name),
        _ => bail!("unknown context subcommand '{}'", sub),
    }
}

fn handle_legacy_agent(board_name: &str, args: &[String]) -> Result<()> {
    let Some(sub) = args.first() else {
        bail!("usage: barkcli {} agent <propose|watch|sync|config>", board_name);
    };
    let rest = &args[1..];
    match sub.as_str() {
        "propose" => commands::agent::run_propose(board_name, rest),
        "watch" => commands::agent::run_watch(board_name, rest),
        "sync" => {
            let quiet = rest.iter().any(|a| a == "--quiet");
            commands::agent::run_agent_sync(board_name, quiet)
        }
        "config" => commands::agent::run_ai_config(rest),
        _ => bail!("unknown agent subcommand '{}'", sub),
    }
}

// ─── Helpers ─────────────────────────────────────

fn parse_board_flag(args: &[String]) -> Result<(Option<String>, Vec<String>)> {
    let mut board = None;
    let mut rest: Vec<String> = vec![];

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--board" | "-b" => {
                i += 1;
                if let Some(v) = args.get(i) { board = Some(v.clone()); }
            }
            s => { rest.push(s.to_string()); }
        }
        i += 1;
    }

    Ok((board, rest))
}

fn print_usage() {
    println!("Usage: barkcli <command> [args]");
    println!();
    println!("The core six — all you need most days:");
    println!("  init                Set up task tracking");
    println!("  add <title>         Add a task (-p, -l, -a, --due)");
    println!("  list                Show tasks grouped by column (-c, -l, -a filters)");
    println!("  move <id> <col>     Move a task");
    println!("  log                 See what changed");
    println!("  undo                Revert the last change");
    println!();
    println!("Shortcuts:");
    println!("  done <id>           Move to done");
    println!("  show <id>           Full task detail");
    println!("  update <id>         Change any field (-t, -p, -l, -a, -c)");
    println!("  remove <id>         Delete a task");
    println!("  comment <id> <txt>  Add a comment");
    println!("  block <id> --on <x> Mark blocked by another task");
    println!("  pin <id>           Pin a card to top of column");
    println!("  unpin <id>         Unpin a card");
    println!("  snapshot <label>    Save a checkpoint");
    println!("  blame <id>          Who changed what, when");
    println!("  diff                What changed since last operation");
    println!();
    println!("Calendar & reminders:");
    println!("  today               Agenda: overdue, today, next 7 days, backlog");
    println!("  calendar [YYYY-MM]  ASCII month calendar of due cards + sprints");
    println!("  remind [--hours N]  Cards with a reminder due (default 24h)");
    println!();
    println!("Sessions & checkpoints (agent capture):");
    println!("  session list        Show captured agent sessions");
    println!("  session show <id>   Full session detail");
    println!("  session resume <id> Print context to hand your agent");
    println!("  session log         Record a session (used by agent hooks)");
    println!("  checkpoint list     List manual + auto checkpoints");
    println!("  checkpoint save     Save a manual checkpoint");
    println!("  checkpoint restore <id>  Restore board from a checkpoint");
    println!("  hooks install       Install agent hooks (opencode/claude-code)");
    println!("  hooks status        Show installed agent hooks");
    println!();
    println!("Links & hierarchy (parent/child/related/blocked-by):");
    println!("  link <id> <target>  Link cards (--as parent|child|related|blocked-by)");
    println!("  unlink <id> <target> Remove a link (--as <type>)");
    println!("  tree                Render parent→child card tree");
    println!();
    println!("Code context (local, no LLM):");
    println!("  code <query>        Search symbols/files → linked cards");
    println!("  context scan        Auto-map cards to code (fuzzy symbols)");
    println!("  context link <card> <path|symbol>  Pin a file to a card");
    println!("  context status      Coverage + staleness table");
    println!("  context show <card> Full code context for a card");
    println!("  context sync        Git-aware refresh of mapped files");
    println!("  context autosync on/off  Post-commit context sync");
    println!();
    println!("Interfaces:");
    println!("  tui                 Terminal kanban");
    println!("  serve               Browser kanban");
    println!("  open                TUI if terminal, browser otherwise");
    println!("  vscode-install      Install VS Code extension for .board files");
    println!();
    println!("Management layer (human → agent pipeline):");
    println!("  intake <text>       Classify input → card + spec (--bug, --feature, --dry-run)");
    println!("  plan <card-id>      Generate spec + decomposition (--auto, --tasks, --dry-run)");
    println!("  memory <cmd>        Cross-session memory (add, search, list, stats, compress)");
    println!("  monitor             Dashboard: agents, tasks, insights (--watch for live)");
    println!("  review [card-id]    Validate completed tasks (--all, --auto)");
    println!("  mind sync|show      Compile + show Mind snapshot/digest");
    println!("  overview            4-panel human narrative (board/sprint/blockers/next)");
    println!("  skills list|show    BMAD skills (mvp/planning/scrum-master/test)");
    println!("  dispatch            Run orchestration cycle (assign tasks to agents)");
    println!();
    println!("Multiple boards (optional):");
    println!("  boards              List boards");
    println!("  boards create <n>   Create a new board");
    println!("  switch <name>       Make a board the default");
    println!();
    println!("Housekeeping:");
    println!("  status              Summary: counts per column");
    println!("  validate            Check task files");
    println!("  doctor              Validate + auto-fix");
    println!("  export [name] [fmt] Export tasks (json/yaml)");
    println!("  import <name> [file] Import tasks");
    println!("  update              Self-update barkcli");
    println!("  --version           Print version");
    println!();
    println!("Pro commands (license required — barkcli license activate <key>):");
    println!("  ai \"<prompt>\"        AI task breakdown (OpenAI)");
    println!("  report [since]      Weekly markdown report");
    println!("  changelog [since]   Auto-generate from git tags");
    println!("  stats               Progress bar + analytics");
    println!("  template list       Show 5 available templates");
    println!("  template install <n> Load a template");
    println!("  sprint start <name> Start a sprint");
    println!("  sprint end <name>   End sprint, show velocity");
    println!("  sync --push         Push to GitHub Issues");
    println!("  sync --pull         Pull from GitHub Issues");
    println!();
    println!("Flags (for add/update/list):");
    println!("  -p priority    high | medium | low");
    println!("  -l label       Repeatable: -l backend -l auth");
    println!("  -a assignee    Person assigned");
    println!("  -c column      Column filter or target");
    println!("  -t title       New title (update)");
    println!("  -d desc        Description (add)");
    println!("  --due YYYY-MM-DD  Due date (add/update)");
    println!("  --remind YYYY-MM-DD[THH:MM]  Reminder time (add/update)");
    println!("  --no-remind    Clear reminder (update)");
    println!("  --effort N     Story points (add/update)");
    println!("  --area <name>  Area path (add/update)");
    println!("  --ac <text>    Acceptance criterion, repeatable (add/update)");
    println!("  --board name   Target a specific board");
}
