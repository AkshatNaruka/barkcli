//! `barkcli history` — scan, watch, install-hooks, tree.

use anyhow::{Context, Result};

use crate::history;
use crate::history::store;
use crate::util::style;

/// `barkcli history scan [--since <sha>] [--all] [--branch <name>] [--no-llm]`
pub fn run_scan(args: &[String]) -> Result<()> {
    let root = crate::storage::board_dir::find_project_root()?;

    let since = get_flag_value(args, "--since");
    let all = args.iter().any(|a| a == "--all");
    let branch = get_flag_value(args, "--branch").unwrap_or_else(|| {
        crate::history::git::current_branch(&root)
    });
    let no_llm = args.iter().any(|a| a == "--no-llm");

    let config = history::ScanConfig {
        branch: branch.clone(),
        since: if all { None } else { since },
        max_commits: crate::history::git::DEFAULT_MAX_COMMITS,
        use_llm: !no_llm,
        heuristic: history::heuristics::HeuristicConfig::default(),
    };

    println!(
        "{} Scanning commits on '{}'...",
        style::accent("History:"),
        branch
    );

    let result = history::scan(&root, &config)?;

    println!(
        "{} {} commits processed, {} bundles created, {} updated, {} unsorted",
        style::ok("OK"),
        result.commits_processed,
        result.bundles_created,
        result.bundles_updated,
        result.unsorted_count,
    );

    // Validate
    let issues = history::validate(&root);
    if !issues.is_empty() {
        println!("\n{} Validation issues:", style::warn("Warning:"));
        for issue in &issues {
            println!("  - {}", issue);
        }
    }

    Ok(())
}

/// `barkcli history watch [--interval <sec>]`
pub fn run_watch(args: &[String]) -> Result<()> {
    let root = crate::storage::board_dir::find_project_root()?;
    let interval = get_flag_value(args, "--interval")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(30);

    let branch = crate::history::git::current_branch(&root);

    println!(
        "{} Watching '{}' every {}s (Ctrl+C to stop)...",
        style::accent("History:"),
        branch,
        interval
    );

    loop {
        let config = history::ScanConfig {
            branch: branch.clone(),
            since: None,
            max_commits: 50, // Small batch for incremental
            use_llm: false, // Fast path for watch mode
            heuristic: history::heuristics::HeuristicConfig::default(),
        };

        match history::scan(&root, &config) {
            Ok(result) => {
                if result.commits_processed > 0 {
                    println!(
                        "{} +{} commits, {} new bundles",
                        style::muted("scan"),
                        result.commits_processed,
                        result.bundles_created,
                    );
                }
            }
            Err(e) => {
                eprintln!("{} scan failed: {}", style::warn("Warning:"), e);
            }
        }

        std::thread::sleep(std::time::Duration::from_secs(interval));
    }
}

/// `barkcli history install-hooks`
pub fn run_install_hooks(_args: &[String]) -> Result<()> {
    let root = crate::storage::board_dir::find_project_root()?;
    let installed = history::hooks::install_hooks(&root)?;
    if installed.is_empty() {
        println!("{}", style::muted("All hooks already installed."));
    } else {
        println!(
            "{} Installed hooks: {}",
            style::ok("OK"),
            installed.join(", ")
        );
    }
    Ok(())
}

/// `barkcli history uninstall-hooks`
pub fn run_uninstall_hooks(_args: &[String]) -> Result<()> {
    let root = crate::storage::board_dir::find_project_root()?;
    let removed = history::hooks::uninstall_hooks(&root)?;
    if removed.is_empty() {
        println!("{}", style::muted("No barkcli hooks found."));
    } else {
        println!(
            "{} Removed hooks: {}",
            style::ok("OK"),
            removed.join(", ")
        );
    }
    Ok(())
}

/// `barkcli history tree`
pub fn run_tree(_args: &[String]) -> Result<()> {
    let tree = history::bundle_tree()?;
    println!("{}", tree);
    Ok(())
}

/// `barkcli history validate`
pub fn run_validate(_args: &[String]) -> Result<()> {
    let root = crate::storage::board_dir::find_project_root()?;
    let issues = history::validate(&root);
    if issues.is_empty() {
        println!("{}", style::ok("All bundles valid."));
    } else {
        for issue in &issues {
            println!("{} {}", style::err("ERR"), issue);
        }
        std::process::exit(1);
    }
    Ok(())
}

/// Extract a flag value from args (e.g., `--branch main` -> "main").
fn get_flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}
