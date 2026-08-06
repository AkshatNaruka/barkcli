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

    match cmd.as_str() {
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

        "comment" => handle_comment(cmd_args)?,
        "block" => handle_block(cmd_args)?,
        "pin" => handle_pin(cmd_args)?,
        "unpin" => handle_unpin(cmd_args)?,

        "boards" => handle_boards_cmd(cmd_args)?,
        "switch" => handle_switch(cmd_args)?,
        "status" => commands::status::run()?,
        "validate" => commands::validate::run()?,
        "doctor" => commands::doctor::run()?,
        "clean" => commands::clean::run()?,

        "export" => handle_export(cmd_args)?,
        "import" => handle_import(cmd_args)?,

        "snapshot" => handle_snapshot(cmd_args)?,

        "session" => handle_session_cmd(cmd_args)?,
        "checkpoint" => handle_checkpoint_cmd(cmd_args)?,
        "hooks" => handle_hooks_cmd(cmd_args)?,

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
        bail!("usage: barkcli hooks <install|remove|status>");
    };
    match sub.as_str() {
        "install" => commands::hooks::run_install(&args[1..]),
        "remove" | "uninstall" => commands::hooks::run_remove(&args[1..]),
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
        "help" => {
            println!("Board '{}' operations:", name);
            println!("  add <title>   list   show <id>   move <id> <col>   update <id>   remove <id>");
            println!("  Or use the flat CLI: barkcli add/list/show/move/...  (no board name needed)");
            Ok(())
        }
            _ => bail!("unknown action '{}' for board '{}'. Try `barkcli {}` (flat CLI)", action, name, action),
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
    println!("Interfaces:");
    println!("  tui                 Terminal kanban");
    println!("  serve               Browser kanban");
    println!("  open                TUI if terminal, browser otherwise");
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
    println!("  --due YYYY-MM-DD  Due date (add)");
    println!("  --board name   Target a specific board");
}
