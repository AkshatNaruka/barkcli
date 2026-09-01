use anyhow::{Context, Result};

use crate::memory::store::{MemoryEntry, MemoryStore, MemoryTier};
use crate::util::style;

/// `barkcli memory <subcommand>` — Manage cross-session memory.
///
/// Subcommands:
///   add <text> [--tier <tier>] [--tags <t1,t2>] [--source <id>]
///   search <query> [--top N]
///   list [--tier <tier>] [--recent N]
///   stats
///   compress         Compress short-term → long-term
///   clear [--tier <tier>]
///   fact add <text> [--category <cat>]
///   fact list [--category <cat>]
pub fn run_memory(args: &[String]) -> Result<()> {
    let sub = args.first().map(|s| s.as_str()).unwrap_or("help");
    let rest = &args[1..];

    match sub {
        "add" => run_add(rest),
        "search" | "find" | "query" => run_search(rest),
        "list" | "ls" => run_list(rest),
        "stats" | "status" => run_stats(rest),
        "compress" => run_compress(rest),
        "clear" | "reset" => run_clear(rest),
        "fact" => run_fact(rest),
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        _ => {
            anyhow::bail!("unknown memory subcommand '{}'. Try `barkcli memory help`", sub);
        }
    }
}

fn run_add(args: &[String]) -> Result<()> {
    let mut tier = MemoryTier::ShortTerm;
    let mut tags = Vec::new();
    let mut source = None;

    let mut text_parts = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--tier" | "-t" => {
                i += 1;
                tier = match args.get(i).map(|s| s.as_str()) {
                    Some("working") => MemoryTier::Working,
                    Some("short") | Some("short-term") => MemoryTier::ShortTerm,
                    Some("long") | Some("long-term") => MemoryTier::LongTerm,
                    Some("external") | Some("archive") => MemoryTier::External,
                    _ => anyhow::bail!("invalid tier. Use: working, short, long, external"),
                };
            }
            "--tags" => {
                i += 1;
                if let Some(tag_str) = args.get(i) {
                    tags = tag_str.split(',').map(|s| s.trim().to_string()).collect();
                }
            }
            "--source" | "-s" => {
                i += 1;
                source = args.get(i).cloned();
            }
            _ => text_parts.push(args[i].clone()),
        }
        i += 1;
    }

    let text = text_parts.join(" ");
    if text.is_empty() {
        anyhow::bail!("usage: barkcli memory add <text> [--tier working|short|long|external] [--tags t1,t2] [--source <id>]");
    }

    let board_name = find_board()?;
    let mut store = MemoryStore::open(&board_name)?;

    let mut entry = MemoryEntry::new(&text, tier);
    entry.tags = tags;
    entry.source = source;
    store.add(entry.clone());

    store.save()?;

    println!(
        "{} Memory added ({})",
        style::ok("OK"),
        tier.display_name(),
    );
    println!("  ID:   {}", entry.id);
    println!("  Text: {}", truncate(&entry.content, 80));

    Ok(())
}

fn run_search(args: &[String]) -> Result<()> {
    let mut top = 5;

    let mut text_parts = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--top" | "-n" => {
                i += 1;
                if let Some(n) = args.get(i).and_then(|s| s.parse().ok()) {
                    top = n;
                }
            }
            _ => text_parts.push(args[i].clone()),
        }
        i += 1;
    }

    let query = text_parts.join(" ");
    if query.is_empty() {
        anyhow::bail!("usage: barkcli memory search <query> [--top N]");
    }

    let board_name = find_board()?;
    let store = MemoryStore::open(&board_name)?;

    let results = store.search(&query, top);

    if results.is_empty() {
        println!("{} No memories found for '{}'", style::muted("Search:"), query);
        return Ok(());
    }

    println!(
        "{} Found {} memories for '{}':",
        style::accent("Search:"),
        results.len(),
        query,
    );
    println!();

    for (i, entry) in results.iter().enumerate() {
        println!(
            "  {}. [{}] {}",
            i + 1,
            style::column(entry.tier.display_name()),
            truncate(&entry.content, 100),
        );
        if !entry.tags.is_empty() {
            println!("     Tags: {}", entry.tags.join(", "));
        }
        if let Some(ref src) = entry.source {
            println!("     Source: {}", src);
        }
    }

    Ok(())
}

fn run_list(args: &[String]) -> Result<()> {
    let mut tier_filter: Option<MemoryTier> = None;
    let mut recent = 20;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--tier" | "-t" => {
                i += 1;
                tier_filter = match args.get(i).map(|s| s.as_str()) {
                    Some("working") => Some(MemoryTier::Working),
                    Some("short") | Some("short-term") => Some(MemoryTier::ShortTerm),
                    Some("long") | Some("long-term") => Some(MemoryTier::LongTerm),
                    Some("external") | Some("archive") => Some(MemoryTier::External),
                    _ => None,
                };
            }
            "--recent" | "-n" => {
                i += 1;
                if let Some(n) = args.get(i).and_then(|s| s.parse().ok()) {
                    recent = n;
                }
            }
            _ => {}
        }
        i += 1;
    }

    let board_name = find_board()?;
    let store = MemoryStore::open(&board_name)?;

    let entries: Vec<&MemoryEntry> = if let Some(tier) = tier_filter {
        store.by_tier(tier)
    } else {
        store.recent(recent)
    };

    if entries.is_empty() {
        println!("{} No memories stored", style::muted("Memory:"));
        return Ok(());
    }

    println!(
        "{} {} memories{}:",
        style::accent("Memory:"),
        entries.len(),
        if tier_filter.is_some() {
            format!(" (filtered)")
        } else {
            String::new()
        },
    );
    println!();

    for entry in &entries {
        println!(
            "  [{}] {} — {}",
            style::column(entry.tier.display_name()),
            style::muted(&entry.id),
            truncate(&entry.content, 80),
        );
    }

    Ok(())
}

fn run_stats(args: &[String]) -> Result<()> {
    let board_name = find_board()?;
    let store = MemoryStore::open(&board_name)?;

    let working = store.by_tier(MemoryTier::Working).len();
    let short = store.by_tier(MemoryTier::ShortTerm).len();
    let long = store.by_tier(MemoryTier::LongTerm).len();
    let external = store.by_tier(MemoryTier::External).len();
    let total = store.len();

    println!("{} Memory stats for '{}':", style::accent("Memory:"), board_name);
    println!();
    println!("  Total entries:    {}", total);
    println!("  {} Working:      {} / {}", style::column("Tier 1"), working, MemoryTier::Working.max_entries());
    println!("  {} Short-term:   {} / {}", style::column("Tier 2"), short, MemoryTier::ShortTerm.max_entries());
    println!("  {} Long-term:    {} / {}", style::column("Tier 3"), long, MemoryTier::LongTerm.max_entries());
    println!("  {} External:     {} / {}", style::column("Tier 4"), external, MemoryTier::External.max_entries());
    println!();

    if total > 0 {
        let recent = store.recent(5);
        println!("  Recent entries:");
        for entry in &recent {
            println!("    - [{}] {}", entry.tier.display_name(), truncate(&entry.content, 60));
        }
    }

    Ok(())
}

fn run_compress(args: &[String]) -> Result<()> {
    let board_name = find_board()?;
    let mut store = MemoryStore::open(&board_name)?;

    match store.compress_short_term() {
        Some(summary) => {
            store.save()?;
            println!("{} Compressed short-term memories into long-term", style::ok("OK"));
            println!("  Summary: {}", truncate(&summary, 100));
        }
        None => {
            println!("{} No short-term memories to compress", style::muted("Compress:"));
        }
    }

    Ok(())
}

fn run_clear(args: &[String]) -> Result<()> {
    let mut tier_filter: Option<MemoryTier> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--tier" | "-t" => {
                i += 1;
                tier_filter = match args.get(i).map(|s| s.as_str()) {
                    Some("working") => Some(MemoryTier::Working),
                    Some("short") | Some("short-term") => Some(MemoryTier::ShortTerm),
                    Some("long") | Some("long-term") => Some(MemoryTier::LongTerm),
                    Some("external") | Some("archive") => Some(MemoryTier::External),
                    _ => None,
                };
            }
            _ => {}
        }
        i += 1;
    }

    let board_name = find_board()?;
    let mut store = MemoryStore::open(&board_name)?;

    if let Some(tier) = tier_filter {
        store.clear_tier(tier);
        store.save()?;
        println!("{} Cleared {} memories", style::ok("OK"), tier.display_name());
    } else {
        store.clear();
        store.save()?;
        println!("{} Cleared all memories", style::ok("OK"));
    }

    Ok(())
}

fn run_fact(args: &[String]) -> Result<()> {
    let sub = args.first().map(|s| s.as_str()).unwrap_or("list");
    let rest = &args[1..];

    match sub {
        "add" => {
            let mut category = "pattern".to_string();
            let mut text_parts = Vec::new();

            let mut i = 0;
            while i < rest.len() {
                match rest[i].as_str() {
                    "--category" | "-c" => {
                        i += 1;
                        if let Some(c) = rest.get(i) {
                            category = c.clone();
                        }
                    }
                    _ => text_parts.push(rest[i].clone()),
                }
                i += 1;
            }

            let text = text_parts.join(" ");
            if text.is_empty() {
                anyhow::bail!("usage: barkcli memory fact add <text> [--category convention|pattern|decision|preference]");
            }

            let board_name = find_board()?;
            let mut store = MemoryStore::open(&board_name)?;

            let fact = crate::memory::store::ProjectFact {
                fact: text,
                category,
                confidence: 0.8,
                sources: Vec::new(),
                created_at: chrono::Utc::now(),
            };

            store.add_fact(fact);
            store.save()?;
            println!("{} Fact added", style::ok("OK"));
        }
        "list" => {
            let mut category_filter = None;
            let mut i = 0;
            while i < rest.len() {
                if rest[i] == "--category" || rest[i] == "-c" {
                    i += 1;
                    category_filter = rest.get(i).cloned();
                }
                i += 1;
            }

            let board_name = find_board()?;
            let store = MemoryStore::open(&board_name)?;

            let facts = if let Some(ref cat) = category_filter {
                store.facts_by_category(cat)
            } else {
                store.memory.project_facts.iter().collect()
            };

            if facts.is_empty() {
                println!("{} No project facts stored", style::muted("Facts:"));
                return Ok(());
            }

            println!("{} {} project facts:", style::accent("Facts:"), facts.len());
            for fact in &facts {
                println!("  [{}] {} (confidence: {:.0}%)", fact.category, fact.fact, fact.confidence * 100.0);
            }
        }
        _ => {
            anyhow::bail!("usage: barkcli memory fact <add|list>");
        }
    }

    Ok(())
}

fn print_help() {
    println!("Usage: barkcli memory <command> [args]");
    println!();
    println!("Commands:");
    println!("  add <text>                Store a memory");
    println!("  search <query>            Search memories (BM25)");
    println!("  list                      List recent memories");
    println!("  stats                     Show memory statistics");
    println!("  compress                  Compress short-term → long-term");
    println!("  clear                     Clear all memories");
    println!("  fact add <text>           Add a project fact");
    println!("  fact list                 List project facts");
    println!();
    println!("Flags:");
    println!("  --tier <tier>             working | short | long | external");
    println!("  --tags <t1,t2>            Comma-separated tags");
    println!("  --source <id>             Source context (card/session id)");
    println!("  --top <N>                 Number of search results");
    println!("  --category <cat>          convention | pattern | decision | preference");
}

/// Find the default board.
fn find_board() -> Result<String> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let config = crate::storage::config_store::read_config(&board_dir)?;
    config
        .default_board
        .or_else(|| {
            let root = board_dir.parent()?;
            std::fs::read_dir(root)
                .ok()?
                .filter_map(|e| e.ok())
                .find(|e| {
                    e.path()
                        .extension()
                        .map(|ext| ext == "board")
                        .unwrap_or(false)
                })
                .map(|e| {
                    e.path()
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                })
        })
        .ok_or_else(|| anyhow::anyhow!("No boards found. Run barkcli create <name> first."))
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max - 1])
    }
}
