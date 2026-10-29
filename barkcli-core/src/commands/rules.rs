//! Project rules live in the tracked `AGENTS.md` file so every agent and every
//! human sees the same instructions. Bark never invents rules; it only reads
//! and appends sections that the user or an agent explicitly publishes.

use anyhow::{bail, Context, Result};
use std::fs;
use std::path::PathBuf;

use crate::storage::board_dir::find_project_root;
use crate::util::style;

#[derive(Debug, Clone)]
pub struct Rule {
    pub title: String,
    pub body: String,
}

pub fn read_rules() -> Result<Vec<Rule>> {
    let path = rules_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).context("failed to read AGENTS.md")?;
    let mut rules = Vec::new();
    let mut current: Option<Rule> = None;
    for line in raw.lines() {
        if let Some(title) = line.strip_prefix("## ") {
            if let Some(rule) = current.take() {
                rules.push(rule);
            }
            current = Some(Rule {
                title: title.trim().to_string(),
                body: String::new(),
            });
            continue;
        }
        if let Some(rule) = current.as_mut() {
            if !rule.body.is_empty() || !line.trim().is_empty() {
                rule.body.push_str(line);
                rule.body.push('\n');
            }
        }
    }
    if let Some(rule) = current {
        rules.push(rule);
    }
    for rule in &mut rules {
        rule.body = rule.body.trim().to_string();
    }
    rules.retain(|rule| !rule.title.is_empty());
    Ok(rules)
}

pub fn find_rule(title: &str) -> Result<Option<Rule>> {
    Ok(read_rules()?
        .into_iter()
        .find(|rule| rule.title.eq_ignore_ascii_case(title)))
}

pub fn add_rule(title: &str, body: &str) -> Result<()> {
    let title = title.trim();
    if title.is_empty() {
        bail!("rule title is required");
    }
    let path = rules_path()?;
    if !path.exists() {
        fs::write(&path, "# AGENTS.md\n\nProject rules for AI agents.\n")
            .context("failed to create AGENTS.md")?;
    }
    let mut content = fs::read_to_string(&path).context("failed to read AGENTS.md")?;
    if !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&format!("\n## {title}\n\n{}\n", body.trim()));
    fs::write(&path, content).context("failed to write AGENTS.md")?;
    Ok(())
}

pub fn remove_rule(title: &str) -> Result<()> {
    let path = rules_path()?;
    if !path.exists() {
        bail!("AGENTS.md does not exist");
    }
    let raw = fs::read_to_string(&path).context("failed to read AGENTS.md")?;
    let mut out = Vec::new();
    let mut skip = false;
    for line in raw.lines() {
        if let Some(candidate) = line.strip_prefix("## ") {
            skip = candidate.trim().eq_ignore_ascii_case(title);
            if skip {
                continue;
            }
        }
        if !skip {
            out.push(line);
        }
    }
    // Collapse trailing blank lines.
    while out.last().map(|line| line.trim().is_empty()).unwrap_or(false) {
        out.pop();
    }
    out.push("");
    fs::write(&path, out.join("\n")).context("failed to write AGENTS.md")?;
    Ok(())
}

fn rules_path() -> Result<PathBuf> {
    Ok(find_project_root()?.join("AGENTS.md"))
}

pub fn run_rules(args: &[String]) -> Result<()> {
    match args.first().map(|s| s.as_str()) {
        None | Some("list") | Some("ls") => {
            let rules = read_rules()?;
            if rules.is_empty() {
                println!(
                    "{}",
                    style::muted("No rules in AGENTS.md. Add one with `barkcli rules add <title> -d <body>`.")
                );
                return Ok(());
            }
            println!("{:<32} {}", "RULE", "SUMMARY");
            for rule in rules {
                let summary = rule
                    .body
                    .lines()
                    .find(|line| !line.trim().is_empty())
                    .unwrap_or("")
                    .trim();
                println!("{:<32} {}", style::accent(&rule.title), style::muted(summary));
            }
            Ok(())
        }
        Some("show") | Some("get") => {
            let title = args
                .get(1)
                .ok_or_else(|| anyhow::anyhow!("usage: barkcli rules show <title>"))?;
            let rule = find_rule(title)?.ok_or_else(|| anyhow::anyhow!("rule '{title}' not found"))?;
            println!("## {}", rule.title);
            println!();
            println!("{}", rule.body);
            Ok(())
        }
        Some("add") | Some("new") => {
            let title = args
                .get(1)
                .ok_or_else(|| anyhow::anyhow!("usage: barkcli rules add <title> [-d <body>]"))?;
            let mut body = String::new();
            let mut i = 2;
            while i < args.len() {
                match args[i].as_str() {
                    "-d" | "--description" | "--body" => {
                        i += 1;
                        if let Some(value) = args.get(i) {
                            body = value.clone();
                        }
                    }
                    _ => {
                        if !body.is_empty() {
                            body.push(' ');
                        }
                        body.push_str(&args[i]);
                    }
                }
                i += 1;
            }
            if body.trim().is_empty() {
                body = "Describe the rule here.".into();
            }
            add_rule(title, &body)?;
            println!("{}", style::ok(&format!("Added rule '{title}'")));
            Ok(())
        }
        Some("remove") | Some("rm") | Some("delete") => {
            let title = args
                .get(1)
                .ok_or_else(|| anyhow::anyhow!("usage: barkcli rules remove <title>"))?;
            remove_rule(title)?;
            println!("{}", style::ok(&format!("Removed rule '{title}'")));
            Ok(())
        }
        _ => bail!("usage: barkcli rules <list|add|show|remove> [args]"),
    }
}
