use anyhow::Result;
use comfy_table::Cell;

use crate::skills::{install, lock, publish, SkillRegistry};
use crate::util::{display, style};

/// `barkcli skills <list|show|install|lock|publish>` (SPEC-003 + P2 registry)
pub fn run_skills(args: &[String]) -> Result<()> {
    let sub = args.first().map(|s| s.as_str()).unwrap_or("list");
    match sub {
        "list" | "ls" => run_list(&args[1..]),
        "show" => run_show(&args[1..]),
        "install" => run_install(&args[1..]),
        "lock" => run_lock(&args[1..]),
        "publish" => run_publish(&args[1..]),
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
    let locked = lock::load().map(|l| l.skills.len()).unwrap_or(0);
    if locked > 0 {
        println!(
            "{} {} builtin + {} total · {} pinned in skills.lock",
            style::ok("Skills:"),
            4,
            reg.list().len(),
            locked
        );
    } else {
        println!(
            "{} {} builtin + {} total skills",
            style::ok("Skills:"),
            4,
            reg.list().len()
        );
    }
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

/// Two install modes:
///   `skills install <repo>`       — pull `**/*.md` skills from a git repo
///                                   (github `owner/repo`, a URL, or a local
///                                   directory) into `.board/skills/` and
///                                   pin them in `skills.lock`;
///   `skills install <id>`         — legacy: copy a builtin skill (or
///                                   `--from <path>`) into the project.
/// Repo mode wins when the argument is not a known registry skill id.
fn run_install(args: &[String]) -> Result<()> {
    if args.is_empty() {
        anyhow::bail!("usage: barkcli skills install <repo | id> [--from <path>] [--dir <subdir>]");
    }
    let target = &args[0];

    let repo_shaped = target.contains('/')
        || target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("git@")
        || std::path::Path::new(target).is_dir();
    if repo_shaped {
        return install_from_repo(target, args);
    }

    // Legacy: builtin copy or a local file.
    let from_idx = args.iter().position(|a| a == "--from");
    let from = from_idx.and_then(|i| args.get(i + 1));

    let reg = SkillRegistry::load_all(None)?;
    let builtin = reg
        .get(target)
        .ok_or_else(|| anyhow::anyhow!("skill '{}' not found in registry", target))?;

    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let dest_dir = board_dir.join("skills");
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(format!("{}.md", target));

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

    println!("{} Installed skill '{}' → {}", style::ok("OK"), target, dest.display());
    println!(
        "  {} install the shared registry: {}",
        style::muted("try"),
        style::muted(&format!(
            "barkcli skills install {}",
            publish::DEFAULT_REGISTRY
        ))
    );
    Ok(())
}

fn install_from_repo(source: &str, args: &[String]) -> Result<()> {
    let dir_idx = args.iter().position(|a| a == "--dir");
    let dir = dir_idx.and_then(|i| args.get(i + 1)).map(|s| s.as_str());
    println!(
        "{} installing skills from {}",
        style::accent("Skills:"),
        style::strong(source)
    );
    let res = install::install_from_source(source, dir)?;
    println!("{} pinned at {} ({})", style::ok("OK"), style::strong(&res.rev[..res.rev.len().min(12)]), res.source);
    if !res.installed.is_empty() {
        println!("  installed: {}", res.installed.join(", "));
    }
    if !res.updated.is_empty() {
        println!("  updated:   {}", res.updated.join(", "));
    }
    let lock_file = lock::load()?;
    println!(
        "  {} skills pinned in {}",
        lock_file.skills.len(),
        style::muted("skills.lock")
    );
    Ok(())
}

/// `barkcli skills lock` — print the pinned skills table.
fn run_lock(args: &[String]) -> Result<()> {
    let _ = args;
    let l = lock::load()?;
    if l.skills.is_empty() {
        println!(
            "{} no pinned skills — install with {}",
            style::warn("Lock:"),
            style::muted(&format!("barkcli skills install {}", publish::DEFAULT_REGISTRY))
        );
        return Ok(());
    }
    let mut t = display::table();
    t.set_header(display::header(vec![
        "ID",
        "Source",
        "Rev",
        "From",
        "SHA256",
        "Installed",
    ]));
    for e in &l.skills {
        t.add_row(vec![
            Cell::new(style::accent(&e.id)),
            Cell::new(&e.source),
            Cell::new(&e.rev[..e.rev.len().min(12)]),
            Cell::new(&e.origin_path),
            Cell::new(&e.sha256[..8]),
            Cell::new(&e.installed_at),
        ]);
    }
    println!("{t}");
    Ok(())
}

/// `barkcli skills publish <id> [--repo <owner/name>] [--file <path>]`
/// Push a skill to the shared registry repo + open a PR.
fn run_publish(args: &[String]) -> Result<()> {
    if args.is_empty() {
        anyhow::bail!("usage: barkcli skills publish <id> [--repo <owner/name>] [--file <path>]");
    }
    let id = &args[0];
    let repo_idx = args.iter().position(|a| a == "--repo");
    let repo = repo_idx.and_then(|i| args.get(i + 1)).map(|s| s.as_str());
    let file_idx = args.iter().position(|a| a == "--file");
    let file = file_idx.and_then(|i| args.get(i + 1)).map(|s| s.as_str());

    // Resolve the skill file: explicit --file, else .board/skills/<id>.md.
    let (path, _tmp) = match file {
        Some(f) => (std::path::PathBuf::from(f), None),
        None => {
            let p = crate::storage::board_dir::find_board_dir()?
                .join("skills")
                .join(format!("{}.md", id));
            if p.exists() {
                (p, None)
            } else {
                // Fall back to the builtin skill, rendered to a temp file.
                let reg = SkillRegistry::load_all(None)?;
                let s = reg
                    .get(id)
                    .ok_or_else(|| anyhow::anyhow!("skill '{}' not found locally", id))?;
                let dir = std::env::temp_dir().join(format!(
                    "bark_publish_{}",
                    uuid::Uuid::new_v4()
                ));
                std::fs::create_dir_all(&dir)?;
                let p = dir.join(format!("{}.md", id));
                let content = format!(
                    "---\nid: {}\nname: {}\ndescription: {}\ntriggers: [{}]\n---\n\n{}",
                    s.id,
                    s.name,
                    s.description,
                    s.triggers.join(", "),
                    s.content
                );
                std::fs::write(&p, content)?;
                (p, Some(dir))
            }
        }
    };

    println!(
        "{} publishing '{}' → {}",
        style::accent("Skills:"),
        style::strong(id),
        style::muted(&format!("{}", publish::registry_ref(repo)))
    );
    let outcome = publish::publish(id, &path, repo)?;
    match outcome.pr_url {
        Some(url) => {
            println!("{} PR opened: {}", style::ok("OK"), style::strong(&url));
            println!("  branch {} → {}", style::muted(&outcome.branch), style::muted(&outcome.registry));
        }
        None => {
            println!(
                "{} pushed the branch but could not finish the PR — do this by hand:",
                style::warn("⚠")
            );
            if let Some(steps) = &outcome.manual {
                for s in steps {
                    println!("  {}", style::muted(s));
                }
            }
        }
    }
    Ok(())
}

fn print_help() {
    println!("Usage: barkcli skills <command> [args]");
    println!();
    println!("Commands:");
    println!("  list              List all skills (builtin + project + user)");
    println!("  show <id>         Show skill content");
    println!("  install <repo>    Install skills from a git repo (github owner/repo, URL, or local dir); pins skills.lock");
    println!("  install <id>      Copy builtin skill to .board/skills/<id>.md");
    println!("  install <id> --from <path>  Install from file");
    println!("  install <repo> --dir <subdir>  Only skills under that path");
    println!("  lock              Print the pinned skills from skills.lock");
    println!("  publish <id>      Send a skill to the shared registry (git branch + gh PR)");
    println!("                    [--repo <owner/name>] [--file <path>]");
}
