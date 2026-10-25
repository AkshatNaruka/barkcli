//! `barkcli bundle` — list, show, rename, merge, split, move, seal, approve, reject, export.

use anyhow::{Context, Result};

use crate::history;
use crate::history::llm;
use crate::models::bundle::{BundleKind, BundleStatus};
use crate::util::style;

/// `barkcli bundle list [--kind <k>] [--status <s>] [--branch <b>]`
pub fn run_list(args: &[String]) -> Result<()> {
    let kind = get_flag_value(args, "--kind").and_then(|k| BundleKind::parse(&k));
    let status = get_flag_value(args, "--status").and_then(|s| match s.as_str() {
        "open" => Some(BundleStatus::Open),
        "sealed" => Some(BundleStatus::Sealed),
        _ => None,
    });
    let branch = get_flag_value(args, "--branch");

    let bundles = history::list_bundles(branch.as_deref(), kind, status)?;

    if bundles.is_empty() {
        println!("{}", style::muted("No bundles found. Run `barkcli history scan` first."));
        return Ok(());
    }

    println!(
        "{} {} bundles\n",
        style::accent("Bundles:"),
        bundles.len()
    );

    for b in &bundles {
        let status_icon = if b.is_sealed() {
            style::ok("●")
        } else {
            style::muted("○")
        };
        let range = b
            .range
            .as_ref()
            .map(|r| format!("{}..{}", &r.first_sha[..8.min(r.first_sha.len())], &r.last_sha[..8.min(r.last_sha.len())]))
            .unwrap_or_default();
        println!(
            "  {} [{:<7}] {:<30} {} commits  +{}/-{}  {:.0}{}  {}",
            status_icon,
            b.kind.as_str(),
            truncate(&b.title, 30),
            b.stats.commits,
            b.stats.additions,
            b.stats.deletions,
            b.confidence * 100.0,
            if b.card_id.is_some() {
                format!(" → {}", b.card_id.as_ref().unwrap())
            } else {
                String::new()
            },
            range,
        );
    }

    Ok(())
}

/// `barkcli bundle show <id>`
pub fn run_show(args: &[String]) -> Result<()> {
    let id = args
        .first()
        .context("usage: barkcli bundle show <id>")?;

    let bundle = history::get_bundle(id)?
        .with_context(|| format!("bundle '{}' not found", id))?;

    println!("{}", style::accent(&bundle.title));
    println!("  ID:         {}", bundle.id);
    println!("  Kind:       {}", bundle.kind.as_str());
    println!("  Status:     {}", bundle.status.as_str());
    println!("  Branch:     {}", bundle.branch);
    println!("  Source:     {}", bundle.source.as_str());
    println!("  Confidence: {:.0}%", bundle.confidence * 100.0);
    if let Some(ref card) = bundle.card_id {
        println!("  Card:       {}", card);
    }
    if let Some(ref range) = bundle.range {
        println!(
            "  Range:      {}..{}",
            &range.first_sha[..8.min(range.first_sha.len())],
            &range.last_sha[..8.min(range.last_sha.len())]
        );
    }
    println!("  Stats:      {} commits, +{}, -{}", bundle.stats.commits, bundle.stats.additions, bundle.stats.deletions);
    if !bundle.files_touched.is_empty() {
        println!("  Files:      {}", bundle.files_touched.join(", "));
    }
    if !bundle.summary.is_empty() {
        println!("\n  {}", bundle.summary);
    }

    println!("\n  Commits ({}):", bundle.commits.len());
    for c in &bundle.commits {
        println!(
            "    {} {} {}",
            &c.sha[..8.min(c.sha.len())],
            truncate(&c.subject, 60),
            style::muted(&c.author),
        );
    }

    Ok(())
}

/// `barkcli bundle rename <id> <title>`
pub fn run_rename(args: &[String]) -> Result<()> {
    if args.len() < 2 {
        anyhow::bail!("usage: barkcli bundle rename <id> <title>");
    }
    let id = &args[0];
    let title = args[1..].join(" ");
    history::rename_bundle(id, &title)?;
    println!("{} Renamed '{}' to '{}'", style::ok("OK"), id, title);
    Ok(())
}

/// `barkcli bundle merge <a> <b>`
pub fn run_merge(args: &[String]) -> Result<()> {
    if args.len() < 2 {
        anyhow::bail!("usage: barkcli bundle merge <a> <b>");
    }
    let a = &args[0];
    let b = &args[1];
    history::merge_bundles(a, b)?;
    println!("{} Merged '{}' into '{}'", style::ok("OK"), a, b);
    Ok(())
}

/// `barkcli bundle split <id> <sha>`
pub fn run_split(args: &[String]) -> Result<()> {
    if args.len() < 2 {
        anyhow::bail!("usage: barkcli bundle split <id> <sha>");
    }
    let id = &args[0];
    let sha = &args[1];
    let new_id = history::split_bundle(id, sha)?;
    println!("{} Split '{}' at {} -> '{}'", style::ok("OK"), id, sha, new_id);
    Ok(())
}

/// `barkcli bundle move <sha> <from> <to>`
pub fn run_move(args: &[String]) -> Result<()> {
    if args.len() < 3 {
        anyhow::bail!("usage: barkcli bundle move <sha> <from> <to>");
    }
    let sha = &args[0];
    let from = &args[1];
    let to = &args[2];
    history::move_commit(sha, from, to)?;
    println!("{} Moved {} from '{}' to '{}'", style::ok("OK"), sha, from, to);
    Ok(())
}

/// `barkcli bundle seal <id>`
pub fn run_seal(args: &[String]) -> Result<()> {
    let id = args.first().context("usage: barkcli bundle seal <id>")?;
    history::seal_bundle(id)?;
    println!("{} Sealed '{}'", style::ok("OK"), id);
    Ok(())
}

/// `barkcli bundle approve <id>`
pub fn run_approve(args: &[String]) -> Result<()> {
    let id = args.first().context("usage: barkcli bundle approve <id>")?;
    history::approve_bundle(id)?;
    println!("{} Approved '{}'", style::ok("OK"), id);
    Ok(())
}

/// `barkcli bundle reject <id>`
pub fn run_reject(args: &[String]) -> Result<()> {
    let id = args.first().context("usage: barkcli bundle reject <id>")?;
    // Determine branch from the bundle
    let bundle = history::get_bundle(id)?
        .with_context(|| format!("bundle '{}' not found", id))?;
    history::reject_bundle(id, &bundle.branch)?;
    println!("{} Rejected '{}', commits moved to Unsorted", style::ok("OK"), id);
    Ok(())
}

/// `barkcli bundle export [--format markdown|json] [--curated-branch <name>]`
pub fn run_export(args: &[String]) -> Result<()> {
    let format = get_flag_value(args, "--format").unwrap_or_else(|| "markdown".into());
    let curated_branch = get_flag_value(args, "--curated-branch");

    let root = crate::storage::board_dir::find_project_root()?;
    let bundles = history::list_bundles(None, None, None)?;

    if let Some(branch_name) = curated_branch {
        // Non-destructive curated branch export
        println!(
            "{} Creating curated branch '{}' (original branch will NOT be modified)...",
            style::accent("Export:"),
            branch_name
        );

        // Sort bundles chronologically
        let mut sorted = bundles.clone();
        sorted.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        let tip = crate::history::curated::export_curated_branch(
            &root,
            &bundles.first().map(|b| b.branch.as_str()).unwrap_or("main"),
            &branch_name,
            &sorted,
        )?;

        println!(
            "{} Curated branch '{}' created at {}",
            style::ok("OK"),
            branch_name,
            &tip[..8.min(tip.len())]
        );
        println!(
            "{} Original branch was NOT modified.",
            style::muted("Note:")
        );
    } else {
        // Standard export
        match format.as_str() {
            "json" => {
                let json = serde_json::to_string_pretty(&bundles)?;
                println!("{}", json);
            }
            _ => {
                let changelog = llm::generate_changelog(&bundles);
                println!("{}", changelog);
            }
        }
    }

    Ok(())
}

fn get_flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max.saturating_sub(3)])
    }
}
