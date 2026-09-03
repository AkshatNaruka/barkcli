use anyhow::Result;
use comfy_table::Cell;

use crate::skills::SkillRegistry;
use crate::util::{display, style};

/// `barkcli skills <list|show|install>` (SPEC-003)
pub fn run_skills(args: &[String]) -> Result<()> {
    let sub = args.first().map(|s| s.as_str()).unwrap_or("list");
    match sub {
        "list" | "ls" => run_list(&args[1..]),
        "show" => run_show(&args[1..]),
        "install" => run_install(&args[1..]),
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        _ => anyhow::bail!("unknown skills subcommand '{}'. Try `barkcli skills help`", sub),
    }
}

fn run_list(_args: &[String]) -> Result<()> {
    let reg = SkillRegistry::load_all(None)?;
    let mut t = display::table();
    t.set_header(display::header(vec!["ID", "Name", "Source", "Triggers"]));
    for s in reg.list() {
        t.add_row(vec![
            Cell::new(style::accent(&s.id)),
            Cell::new(&s.name),
            Cell::new(s.source.to_string()),
            Cell::new(s.triggers.join(", ")),
        ]);
    }
    println!("{t}");
    println!("{} {} builtin + {} total skills", style::ok("Skills:"), 4, reg.list().len());
    Ok(())
}

fn run_show(args: &[String]) -> Result<()> {
    let id = args.first().ok_or_else(|| anyhow::anyhow!("usage: barkcli skills show <id>"))?;
    let reg = SkillRegistry::load_all(None)?;
    let s = reg.get(id).ok_or_else(|| anyhow::anyhow!("skill '{}' not found", id))?;
    println!("{} {} ({}) — {}", style::accent("Skill:"), style::strong(&s.name), s.id, s.source);
    println!("Triggers: {}", s.triggers.join(", "));
    println!();
    println!("{}", s.content);
    Ok(())
}

fn run_install(args: &[String]) -> Result<()> {
    if args.is_empty() {
        anyhow::bail!("usage: barkcli skills install <id> [--from <path>]");
    }
    let id = &args[0];
    let from_idx = args.iter().position(|a| a == "--from");
    let from = from_idx.and_then(|i| args.get(i + 1));

    let reg = SkillRegistry::load_all(None)?;
    let builtin = reg.get(id).ok_or_else(|| anyhow::anyhow!("skill '{}' not found in registry", id))?;

    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let dest_dir = board_dir.join("skills");
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(format!("{}.md", id));

    if let Some(src) = from {
        let content = std::fs::read_to_string(src).map_err(|e| anyhow::anyhow!("read {}: {}", src, e))?;
        std::fs::write(&dest, content)?;
    } else {
        // Copy builtin content to project
        let content = format!(
            "---\nid: {}\nname: {}\ndescription: {}\ntriggers: [{}]\n---\n\n{}",
            builtin.id,
            builtin.name,
            builtin.description,
            builtin.triggers.join(", "),
            builtin.content
        );
        std::fs::write(&dest, content)?;
    }

    println!("{} Installed skill '{}' → {}", style::ok("OK"), id, dest.display());
    Ok(())
}

fn print_help() {
    println!("Usage: barkcli skills <command> [args]");
    println!();
    println!("Commands:");
    println!("  list              List all skills (builtin + project + user)");
    println!("  show <id>         Show skill content");
    println!("  install <id>      Copy builtin skill to .board/skills/<id>.md");
    println!("  install <id> --from <path>  Install from file");
}
