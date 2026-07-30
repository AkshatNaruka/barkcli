use anyhow::{bail, Result};

use crate::commands;

pub fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        print_usage();
        return Ok(());
    }

    let command = &args[1];
    let rest = &args[2..];

    match command.as_str() {
        "init" => commands::init::run(),
        "create" => {
            let name = rest
                .first()
                .ok_or_else(|| anyhow::anyhow!("missing board name"))?;
            commands::create::run(name)
        }
        "list" | "ls" => commands::list::run(),
        "status" => commands::status::run(),
        "validate" => commands::validate::run(),
        "doctor" => commands::doctor::run(),
        "clean" => commands::clean::run(),
        "export" => {
            let name = rest
                .first()
                .ok_or_else(|| anyhow::anyhow!("missing board name"))?;
            commands::export::run(name, &rest[1..])
        }
        "import" => {
            let name = rest
                .first()
                .ok_or_else(|| anyhow::anyhow!("missing board name"))?;
            commands::import::run(name, &rest[1..])
        }
        "help" | "--help" | "-h" => {
            print_usage();
            Ok(())
        }
        name => {
            handle_board_op(name, rest)
        }
    }
}

fn handle_board_op(name: &str, args: &[String]) -> Result<()> {
    let action = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("missing action for board '{}'", name))?;
    let action_args = &args[1..];

    match action.as_str() {
        "add" => commands::card::add::run(name, action_args),
        "list" | "ls" => commands::card::list::run(name, action_args),
        "show" => commands::card::show::run(name, action_args),
        "move" | "mv" => commands::card::move_cmd::run(name, action_args),
        "status" => commands::card::status_cmd::run(name, action_args),
        "update" | "up" => commands::card::update::run(name, action_args),
        "remove" | "rm" => commands::card::remove::run(name, action_args),
        "export" => commands::export::run(name, action_args),
        "help" => {
            println!("Board '{}' operations:", name);
            println!("  add <title>       Add a card");
            println!("  list              List cards");
            println!("  show <id>         Show card details");
            println!("  move <id> <col>   Move card to column");
            println!("  status <id> <col> Quick status transition");
            println!("  update <id>       Update card fields");
            println!("  remove <id>       Remove a card");
            println!("  export [format]   Export board (json/yaml)");
            Ok(())
        }
        _ => bail!(
            "unknown action '{}' for board '{}'. Try `board {} help`",
            action,
            name,
            name
        ),
    }
}

fn print_usage() {
    println!("Usage: board <command> [args]");
    println!();
    println!("Project commands:");
    println!("  init                    Initialize a board project");
    println!("  create <name>           Create a new board");
    println!("  list                    List all boards");
    println!("  status                  Show board summary");
    println!("  validate                Validate all board files");
    println!("  doctor                  Validate & auto-fix issues");
    println!("  clean                   Clean stale locks and cache");
    println!("  export <name> [format]  Export board (json/yaml)");
    println!("  import <name> [file]    Import board from stdin or file");
    println!();
    println!("Board operations:");
    println!("  board <name> add <title>   Add a card");
    println!("  board <name> list          List cards");
    println!("  board <name> show <id>     Show card details");
    println!("  board <name> move <id> <col> Move card");
    println!("  board <name> status <id> <col> Quick status transition");
    println!("  board <name> update <id>   Update card fields");
    println!("  board <name> remove <id>   Remove a card");
}
