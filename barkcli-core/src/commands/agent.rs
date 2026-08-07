use anyhow::{Context, Result};
use chrono::Utc;

use crate::ai::{chat_json, resolve_config, ChatMessage};
use crate::code::SymbolIndex;
use crate::models::context::AiSummary;
use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::{read_board, write_board};
use crate::storage::context::{read_context, write_context};
use crate::util::{git, style};

/// LLM prompt payload for one card.
#[derive(serde::Deserialize)]
struct CardRefresh {
    summary: String,
    confidence: f32,
    next_steps: Vec<String>,
}

/// `barkcli context refresh [<card-id>...]` — LLM refresh of card↔code context.
/// Gated Pro at dispatch. `--dry-run` prints the prompt without calling.
pub fn run_refresh(board: &str, args: &[String]) -> Result<()> {
    let dry_run = args.iter().any(|a| a == "--dry-run");
    let apply = args.iter().any(|a| a == "--apply");
    let explicit: Vec<String> = args
        .iter()
        .filter(|a| !a.starts_with('-'))
        .cloned()
        .collect();

    let cfg = resolve_config()?;
    let b = read_board(board).context(format!("board '{}' not found", board))?;
    let ctx = read_context(board)?;
    let root = project_root()?;
    let _index = SymbolIndex::build(&root);

    let cards: Vec<_> = b
        .cards
        .iter()
        .filter(|c| explicit.is_empty() || explicit.iter().any(|id| id == &c.id))
        .filter(|c| c.links.iter().any(|l| l.ty == crate::models::card::LinkType::Child) || true)
        .collect();

    if cards.is_empty() {
        println!("{} no cards to refresh on '{}'", style::muted("Refresh:"), board);
        return Ok(());
    }

    println!(
        "{} refreshing {} card(s) with {}",
        style::accent("Refresh:"),
        cards.len(),
        crate::ai::describe(&cfg)
    );

    let mut updated = 0usize;
    let mut failed = 0usize;
    for card in cards {
        let entry = ctx.cards.get(&card.id);
        let file_lines: Vec<String> = entry
            .map(|e| {
                e.files
                    .iter()
                    .map(|f| {
                        let syms = if f.symbols.is_empty() { String::new() } else { format!(" ({})", f.symbols.join(", ")) };
                        let commit = f.last_commit.as_deref().unwrap_or("-");
                        format!("  - {} [{}] @{}{}", f.path, f.status, commit, syms)
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Recent commits touching this card's files
        let mut commits = String::new();
        if let Some(e) = entry {
            if !e.files.is_empty() {
                let files: Vec<&str> = e.files.iter().map(|f| f.path.as_str()).collect();
                if let Ok(out) = std::process::Command::new("git")
                    .args(["-C", root.to_str().unwrap_or("."), "log", "--oneline", "-5", "--"])
                    .args(&files)
                    .output()
                {
                    if out.status.success() {
                        commits = String::from_utf8_lossy(&out.stdout).to_string();
                    }
                }
            }
        }

        let linked: Vec<String> = card
            .links
            .iter()
            .map(|l| format!("{} → {}", l.ty, l.target))
            .collect();

        let checklist_items = if card.checklist.is_empty() {
            "(none)".to_string()
        } else {
            card.checklist.iter().map(|c| c.text.clone()).collect::<Vec<_>>().join(" | ")
        };

        let prompt = format!(
            "You are a senior engineer maintaining a project board. Analyze this work item against its mapped code and produce a concise context summary.\n\n\
CARD\n\
- id: {}\n\
- title: {}\n\
- description: {}\n\
- column: {}\n\
- priority: {}\n\
- labels: {}\n\
- links: {}\n\
- acceptance criteria: {}\n\
- checklist: {} ({}/{} done)\n\n\
MAPPED CODE\n{}\n\
RECENT COMMITS ON THOSE FILES\n{}\n\
\n\
Respond ONLY with JSON: {{\"summary\": \"2-4 sentence status: what's implemented, what's missing, risks\", \"confidence\": 0.0-1.0, \"next_steps\": [\"short actions\"]}}",
            card.id,
            card.title,
            card.description.as_deref().unwrap_or("(none)"),
            card.column,
            card.priority,
            card.labels.join(", "),
            if linked.is_empty() { "(none)".into() } else { linked.join("; ") },
            if card.acceptance_criteria.is_empty() { "(none)".into() } else { card.acceptance_criteria.join(" | ") },
            checklist_items,
            card.checklist.iter().filter(|c| c.done).count(),
            card.checklist.len(),
            if file_lines.is_empty() { "(no files mapped)".to_string() } else { file_lines.join("\n") },
            if commits.is_empty() { "(none)".to_string() } else { commits }
        );

        if dry_run {
            println!("{}", style::muted("── prompt (dry run) ──"));
            println!("{}", prompt);
            continue;
        }

        let messages = vec![
            ChatMessage { role: "system".into(), content: "You are a precise, terse senior engineer. JSON only.".into() },
            ChatMessage { role: "user".into(), content: prompt },
        ];

        match chat_json::<CardRefresh>(&cfg, &messages) {
            Ok(r) => {
                let summary = r.summary.trim().to_string();
                let next_steps = r.next_steps;
                {
                    let mut ctx = read_context(board)?;
                    ctx.card_mut(&card.id).ai = Some(AiSummary {
                        summary: summary.clone(),
                        at: Utc::now().to_rfc3339(),
                        model: Some(cfg.model.clone()),
                        confidence: r.confidence.clamp(0.0, 1.0),
                        next_steps,
                    });
                    write_context(board, &ctx)?;
                }
                if apply {
                    // Attach an [ai] comment to the card (visible in YAML)
                    let mut b = read_board(board)?;
                    if let Some(c) = b.cards.iter_mut().find(|c| c.id == card.id) {
                        c.comments.push(crate::models::card::Comment {
                            author: format!("ai[{}]", cfg.model),
                            text: summary.clone(),
                            at: Utc::now(),
                        });
                    }
                    write_board(board, &b)?;
                }
                updated += 1;
                println!("  {} {}", style::ok("✓"), style::strong(&card.id));
            }
            Err(e) => {
                failed += 1;
                eprintln!("  {} {}: {}", style::err("✗"), card.id, e);
            }
        }
    }

    println!(
        "{} {} updated, {} failed{}",
        style::accent("Refresh:"),
        updated,
        failed,
        if dry_run { " (dry run)" } else { "" }
    );
    Ok(())
}

/// `barkcli agent propose <card-id> [--accept]` — LLM proposes acceptance
/// criteria + linked child tasks for a PBI. Dry-run by default.
pub fn run_propose(board: &str, args: &[String]) -> Result<()> {
    let card_id = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli agent propose <card-id> [--accept] [--dry-run]"))?;
    let accept = args.iter().any(|a| a == "--accept");
    let dry_run = args.iter().any(|a| a == "--dry-run");

    let cfg = resolve_config()?;
    let b = read_board(board).context(format!("board '{}' not found", board))?;
    let card = b
        .cards
        .iter()
        .find(|c| c.id == *card_id)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found", card_id))?;

    #[derive(serde::Deserialize)]
    struct Proposal {
        acceptance_criteria: Vec<String>,
        tasks: Vec<Task>,
    }
    #[derive(serde::Deserialize)]
    struct Task {
        title: String,
        description: Option<String>,
        priority: Option<String>,
        labels: Option<Vec<String>>,
        effort: Option<u32>,
    }

    let prompt = format!(
        "You are a product manager. For this PBI, propose acceptance criteria and a breakdown into child tasks.\n\n\
CARD\n- title: {}\n- description: {}\n- existing acceptance criteria: {}\n\n\
Respond ONLY with JSON: {{\"acceptance_criteria\": [\"...\"], \"tasks\": [{{\"title\": \"...\", \"description\": \"...\", \"priority\": \"high|medium|low\", \"labels\": [...], \"effort\": 1-8}}]}}",
        card.title,
        card.description.as_deref().unwrap_or("(none)"),
        if card.acceptance_criteria.is_empty() { "(none)".to_string() } else { card.acceptance_criteria.join(" | ") }
    );

    if dry_run {
        println!("{}", style::muted("── prompt (dry run) ──"));
        println!("{}", prompt);
        return Ok(());
    }

    let messages = vec![
        ChatMessage { role: "system".into(), content: "You are a precise product manager. JSON only.".into() },
        ChatMessage { role: "user".into(), content: prompt },
    ];
    let proposal: Proposal = chat_json(&cfg, &messages)?;

    if accept {
        let mut board = b.clone();
        if let Some(c) = board.cards.iter_mut().find(|c| c.id == *card_id) {
            for ac in &proposal.acceptance_criteria {
                if !c.acceptance_criteria.contains(ac) {
                    c.acceptance_criteria.push(ac.clone());
                }
            }
        }
        let first_col = board.columns.first().map(|c| c.id.clone()).unwrap_or_else(|| "todo".into());
        let existing_ids: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
        let now = Utc::now();
        let mut added = 0;
        for t in &proposal.tasks {
            let id = crate::util::slug::unique_slug(&t.title, &existing_ids);
            let mut c = crate::models::Card::new(&id, &t.title, &first_col);
            c.description = t.description.clone();
            c.priority = t.priority.clone().unwrap_or_else(|| "medium".into());
            c.labels = t.labels.clone().unwrap_or_default();
            c.effort = t.effort;
            c.created_at = now;
            c.updated_at = now;
            c.links.push(crate::models::card::CardLink {
                ty: crate::models::card::LinkType::Parent,
                target: card_id.clone(),
            });
            // mirror: parent card gets child links
            if let Some(parent) = board.cards.iter_mut().find(|p| p.id == *card_id) {
                parent.add_link(crate::models::card::LinkType::Child, &id);
            }
            board.cards.push(c);
            let _ = crate::storage::history::log_add(board_name_of(&board), &id, &t.title);
            added += 1;
        }
        crate::storage::board_file::write_board(board_name_of(&board), &board)?;
        println!(
            "{} applied {} criteria + {} child tasks to '{}'",
            style::ok("Propose:"),
            proposal.acceptance_criteria.len(),
            added,
            card_id
        );
    } else {
        println!("{} acceptance criteria:", style::accent("Proposed"));
        for (i, ac) in proposal.acceptance_criteria.iter().enumerate() {
            println!("  {}. {}", i + 1, ac);
        }
        println!("{} child tasks:", style::accent("Proposed"));
        for (i, t) in proposal.tasks.iter().enumerate() {
            println!(
                "  {}. [{}] {} ({})",
                i + 1,
                t.priority.as_deref().unwrap_or("medium"),
                t.title,
                t.effort.map(|e| format!("{}pts", e)).unwrap_or_else(|| "?".into())
            );
        }
        println!("{} rerun with --accept to apply", style::muted("Tip:"));
    }
    Ok(())
}

fn board_name_of(board: &crate::models::Board) -> &str {
    &board.title
}

/// `barkcli agent sync` — git-aware refresh WITHOUT LLM (free tier alias).
pub fn run_agent_sync(board: &str, quiet: bool) -> Result<()> {
    crate::commands::context::run_sync(board, quiet)
}

/// `barkcli agent watch` — watch source files; on change run context sync
/// (free) and optionally LLM refresh (`--llm`). One-shot poll loop for CLI;
/// server mode uses the notify watcher.
pub fn run_watch(board: &str, args: &[String]) -> Result<()> {
    let with_llm = args.iter().any(|a| a == "--llm");
    let interval_secs = args
        .iter()
        .position(|a| a == "--interval")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(30);
    let max_runs = args
        .iter()
        .position(|a| a == "--once")
        .map(|_| 1)
        .unwrap_or(usize::MAX);

    println!(
        "{} watching source changes (interval {}s, llm={}) — Ctrl-C to stop",
        style::accent("Watch:"),
        interval_secs,
        if with_llm { "on" } else { "off" }
    );

    let root = project_root()?;
    let mut last_dirty: Vec<String> = git::dirty_files(&root);

    let mut runs = 0usize;
    while runs < max_runs {
        std::thread::sleep(std::time::Duration::from_secs(interval_secs));
        runs += 1;
        let dirty = git::dirty_files(&root);
        if dirty == last_dirty {
            continue;
        }
        last_dirty = dirty.clone();
        if dirty.is_empty() {
            continue;
        }
        println!("{} detected change in: {}", style::ok("Watch:"), dirty.join(", "));
        let _ = crate::commands::context::run_sync(board, true);
        if with_llm {
            let args: Vec<String> = vec!["--apply".into()];
            let _ = run_refresh(board, &args);
        }
    }
    Ok(())
}

pub fn project_root() -> Result<std::path::PathBuf> {
    let board_dir = find_board_dir()?;
    board_dir
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| anyhow::anyhow!("cannot determine project root"))
}

/// `barkcli ai config` — show/reset provider config.
pub fn run_ai_config(args: &[String]) -> Result<()> {
    let sub = args.first().map(|s| s.as_str());
    match sub {
        Some("show") | None => {
            let cfg = resolve_config()?;
            let key = cfg.api_key.as_deref().map(|k| {
                if k.len() > 8 { format!("{}…", &k[..8]) } else { "set".into() }
            }).unwrap_or_else(|| "none".into());
            println!("{} {}", style::accent("Base URL:"), cfg.base_url);
            println!("{} {}", style::accent("Model:"), cfg.model);
            println!("{} {}", style::accent("Key:"), key);
            Ok(())
        }
        Some("reset") => {
            let board_dir = find_board_dir()?;
            let mut cfg = crate::storage::config_store::read_config(&board_dir).unwrap_or_default();
            cfg.ai = None;
            crate::storage::config_store::write_config(&board_dir, &cfg)?;
            println!("{} project AI config reset to defaults", style::ok("Config:"));
            Ok(())
        }
        Some("set") => {
            let board_dir = find_board_dir()?;
            let mut cfg = crate::storage::config_store::read_config(&board_dir).unwrap_or_default();
            let mut ai = cfg.ai.clone().unwrap_or_default();
            let rest = &args[1..];
            let mut i = 0;
            while i < rest.len() {
                match rest[i].as_str() {
                    "base-url" | "base_url" => {
                        i += 1;
                        if let Some(v) = rest.get(i) {
                            ai.base_url = v.trim_end_matches('/').to_string();
                        }
                    }
                    "model" => {
                        i += 1;
                        if let Some(v) = rest.get(i) {
                            ai.model = v.clone();
                        }
                    }
                    "provider" => {
                        i += 1;
                        if let Some(p) = rest.get(i) {
                            let (url, model) = crate::ai::provider::provider_defaults(p)?;
                            ai.base_url = url;
                            ai.model = model;
                        }
                    }
                    _ => {}
                }
                i += 1;
            }
            cfg.ai = Some(ai.clone());
            crate::storage::config_store::write_config(&board_dir, &cfg)?;
            println!(
                "{} project AI: {} @ {}",
                style::ok("Config:"),
                ai.model,
                ai.base_url
            );
            Ok(())
        }
        _ => anyhow::bail!("usage: barkcli ai config [show|set provider <p>|set base-url <url>|set model <m>|reset]"),
    }
}
