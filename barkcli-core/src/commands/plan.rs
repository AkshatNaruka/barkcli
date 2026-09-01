use anyhow::{Context, Result};
use serde::Deserialize;

use crate::ai::{chat_json, resolve_config, ChatMessage};
use crate::agent::queue::{create_task, populate_context_files, TaskQueue};
use crate::code::SymbolIndex;
use crate::models::Board;
use crate::storage::board_file::{read_board, write_board};
use crate::storage::context::read_context;
use crate::util::style;

/// LLM output for planning.
#[derive(Debug, Deserialize)]
struct PlanOutput {
    requirements: Vec<PlanRequirement>,
    child_cards: Vec<PlanChildCard>,
    estimated_total_effort: u32,
    risk_level: String,
    rationale: String,
}

#[derive(Debug, Deserialize)]
struct PlanRequirement {
    title: String,
    description: String,
    acceptance_criteria: Vec<String>,
    effort: u32,
    area: String,
}

#[derive(Debug, Deserialize)]
struct PlanChildCard {
    title: String,
    description: String,
    priority: String,
    effort: u32,
    labels: Vec<String>,
    acceptance_criteria: Vec<String>,
}

/// `barkcli plan <card-id>` — Generate spec + decomposition for a card.
///
/// Flags:
///   --auto       Plan all unplanned cards in todo
///   --dry-run    Show plan without creating
///   --board <n>  Target board
///   --tasks      Also create tasks in the queue
pub fn run_plan(args: &[String]) -> Result<()> {
    let dry_run = args.iter().any(|a| a == "--dry-run");
    let create_tasks = args.iter().any(|a| a == "--tasks");
    let auto = args.iter().any(|a| a == "--auto");

    let board_name = find_board(args)?;
    let board = read_board(&board_name)
        .context(format!("board '{}' not found", board_name))?;

    let cfg = resolve_config().ok();
    let root = find_project_root()?;
    let index = SymbolIndex::build(&root);
    let context = read_context(&board_name).unwrap_or_default();

    if auto {
        return run_plan_auto(&board_name, &board, &cfg, &index, &context, dry_run, create_tasks);
    }

    // Find card ID
    let card_id = args
        .iter()
        .filter(|a| !a.starts_with('-'))
        .find(|a| !a.contains('/') && !a.contains('.'))
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli plan <card-id> [--auto] [--dry-run] [--tasks]"))?;

    // Extract card data before mutating board
    let card_data = board
        .cards
        .iter()
        .find(|c| c.id == card_id)
        .map(|c| (c.id.clone(), c.title.clone(), c.description.clone(), c.priority.clone(), c.labels.clone(), c.checklist.clone()))
        .ok_or_else(|| anyhow::anyhow!("card '{}' not found", card_id))?;

    let (ref _card_id_val, ref card_title, ref card_desc, ref card_priority, ref card_labels, ref card_checklist) = card_data;

    println!(
        "{} Planning '{}' with {}...",
        style::accent("Plan:"),
        style::strong(card_title),
        cfg.as_ref()
            .map(|c| c.model.as_str())
            .unwrap_or("LLM"),
    );

    // Gather context
    let card_context = context.cards.get(card_id.as_str());
    let file_lines: Vec<String> = card_context
        .map(|e| {
            e.files
                .iter()
                .map(|f| format!("  - {} [{}]", f.path, f.status))
                .collect()
        })
        .unwrap_or_default();

    let related_files: Vec<String> = index
        .match_title(card_title, 3, 5)
        .iter()
        .map(|m| format!("  - {} (score: {:.2})", m.path, m.score))
        .collect();

    let system = r#"You are a software planning specialist. Given a card (task/feature/bug) and its context, generate a detailed implementation plan.

Return JSON with exactly these fields:
{
  "requirements": [
    {
      "title": "Requirement title",
      "description": "What this requirement covers",
      "acceptance_criteria": ["Given/When/Then criteria"],
      "effort": 1-10,
      "area": "frontend" | "backend" | "infra" | "docs"
    }
  ],
  "child_cards": [
    {
      "title": "Child card title (concise)",
      "description": "What needs to be done",
      "priority": "critical" | "high" | "medium" | "low",
      "effort": 1-10,
      "labels": ["label"],
      "acceptance_criteria": ["testable criterion"]
    }
  ],
  "estimated_total_effort": 1-100,
  "risk_level": "low" | "medium" | "high" | "critical",
  "rationale": "Why this decomposition makes sense"
}

Planning rules:
- Break large work into 2-6 child cards (each implementable in 1-3 days)
- Each child card should be independently deliverable
- Include testing as a child card if effort > 3
- Set effort from 1 (trivial) to 10 (very complex)
- Risk: low = well-understood, high = unknowns or dependencies
- Acceptance criteria must be testable
- Keep child card titles under 60 characters"#;

    let file_context = if file_lines.is_empty() {
        "(no code context mapped yet — run `barkcli context scan` first)".to_string()
    } else {
        file_lines.join("\n")
    };

    let related_context = if related_files.is_empty() {
        "(no related files found)".to_string()
    } else {
        related_files.join("\n")
    };

    let user_msg = format!(
        r#"Plan implementation for this card:

Title: {title}
Description: {desc}
Priority: {priority}
Labels: {labels}

Mapped code files:
{file_ctx}

Related code (by symbol match):
{related_ctx}

Existing acceptance criteria:
{existing_ac}"#,
        title = card_title,
        desc = card_desc.as_deref().unwrap_or("(none)"),
        priority = card_priority,
        labels = card_labels.join(", "),
        file_ctx = file_context,
        related_ctx = related_context,
        existing_ac = if card_checklist.is_empty() {
            "(none)".to_string()
        } else {
            card_checklist
                .iter()
                .map(|c| format!("- {}", c.text))
                .collect::<Vec<_>>()
                .join("\n")
        },
    );

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system.to_string(),
        },
        ChatMessage {
            role: "user".into(),
            content: user_msg,
        },
    ];

    let cfg = cfg.ok_or_else(|| anyhow::anyhow!("AI provider not configured. Run `barkcli ai config set provider ollama` or set BARKCLI_API_KEY."))?;

    let plan: PlanOutput = chat_json(&cfg, &messages)?;

    if dry_run {
        println!();
        println!("{} Plan (dry run):", style::accent("Plan:"));
        println!("  Total effort: {}", plan.estimated_total_effort);
        println!("  Risk: {}", plan.risk_level);
        println!("  Rationale: {}", plan.rationale);
        println!();
        println!("  Requirements ({}):", plan.requirements.len());
        for (i, req) in plan.requirements.iter().enumerate() {
            println!("    {}. {} (effort: {})", i + 1, req.title, req.effort);
            for ac in &req.acceptance_criteria {
                println!("       - {}", ac);
            }
        }
        println!();
        println!("  Child cards ({}):", plan.child_cards.len());
        for (i, child) in plan.child_cards.iter().enumerate() {
            println!("    {}. {} [{}] (effort: {})", i + 1, child.title, child.priority, child.effort);
        }
        return Ok(());
    }

    // Update card with plan
    let mut board_mut = board.clone();
    if let Some(c) = board_mut.cards.iter_mut().find(|c| c.id == card_id) {
        for req in &plan.requirements {
            for ac in &req.acceptance_criteria {
                if !c.checklist.iter().any(|item| item.text == *ac) {
                    c.checklist.push(crate::models::card::ChecklistItem {
                        text: ac.clone(),
                        done: false,
                    });
                }
            }
        }
    }

    // Create child cards
    let mut child_ids = Vec::new();
    for child in &plan.child_cards {
        let child_id = crate::util::slug::to_slug(&child.title);
        let mut new_card = crate::models::card::Card::new(&child_id, &child.title, "todo");
        new_card.description = Some(child.description.clone());
        new_card.priority = child.priority.clone();
        new_card.labels = child.labels.clone();
        new_card.effort = Some(child.effort);

        for ac in &child.acceptance_criteria {
            new_card.checklist.push(crate::models::card::ChecklistItem {
                text: ac.clone(),
                done: false,
            });
        }

        new_card.links.push(crate::models::card::CardLink {
            ty: crate::models::card::LinkType::Parent,
            target: card_id.clone(),
        });

        child_ids.push(new_card.id.clone());
        board_mut.cards.push(new_card);
    }

    // Add parent links on original card
    if let Some(c) = board_mut.cards.iter_mut().find(|c| c.id == card_id) {
        for child_id in &child_ids {
            if !c.links.iter().any(|l| l.target == *child_id) {
                c.links.push(crate::models::card::CardLink {
                    ty: crate::models::card::LinkType::Child,
                    target: child_id.clone(),
                });
            }
        }
    }

    write_board(&board_name, &board_mut)?;

    println!(
        "{} Plan created for '{}':",
        style::ok("OK"),
        style::strong(card_title),
    );
    println!("  {} requirements, {} child cards", plan.requirements.len(), plan.child_cards.len());
    println!("  Total effort: {}, Risk: {}", plan.estimated_total_effort, plan.risk_level);
    println!();
    for (i, child) in plan.child_cards.iter().enumerate() {
        println!("  {}. {} [{}] (effort: {})", i + 1, child.title, child.priority, child.effort);
    }

    // Create tasks if requested
    if create_tasks {
        let tasks_dir = crate::storage::board_dir::find_board_dir()?.join("tasks");
        std::fs::create_dir_all(&tasks_dir)?;
        let tasks_path = tasks_dir.join(format!("{}.json", board_name));

        let mut queue = TaskQueue::load(&tasks_path).unwrap_or_default();

        for (i, child) in plan.child_cards.iter().enumerate() {
            let context_files = populate_context_files(&card_id, &board_name);
            let mut task = create_task(
                &child_ids[i],
                &child.title,
                &child.description,
                child.acceptance_criteria.clone(),
                context_files,
                &child.priority,
            );
            task.metadata.estimated_effort = Some(child.effort);
            task.metadata.created_by = Some("plan".into());
            queue.add(task);
        }

        queue.save(&tasks_path)?;
        println!();
        println!(
            "{} Created {} tasks in queue",
            style::ok("OK"),
            plan.child_cards.len()
        );
    }

    println!();
    println!("Next steps:");
    if !create_tasks {
        println!("  barkcli plan {} --tasks  # Also create tasks in queue", card_id);
    }
    println!("  barkcli dispatch        # Assign tasks to agents");
    println!("  barkcli move {} doing    # Start working", card_id);

    Ok(())
}

/// Auto-plan all unplanned cards in todo column.
fn run_plan_auto(
    board_name: &str,
    board: &Board,
    cfg: &Option<crate::ai::AiConfig>,
    index: &SymbolIndex,
    context: &crate::models::context::BoardContext,
    dry_run: bool,
    _create_tasks: bool,
) -> Result<()> {
    let unplanned: Vec<_> = board
        .cards
        .iter()
        .filter(|c| c.column.as_str() == "todo")
        .filter(|c| c.checklist.is_empty())
        .collect();

    if unplanned.is_empty() {
        println!("{} No unplanned cards in todo column", style::ok("OK"));
        return Ok(());
    }

    println!(
        "{} Planning {} unplanned card(s)...",
        style::accent("Plan:"),
        unplanned.len()
    );

    let cfg = cfg.as_ref().ok_or_else(|| anyhow::anyhow!("AI provider not configured"))?;

    for card in &unplanned {
        println!();
        println!("Planning: {}", style::strong(&card.title));

        let card_context = context.cards.get(&card.id);
        let file_lines: Vec<String> = card_context
            .map(|e| {
                e.files
                    .iter()
                    .map(|f| format!("  - {} [{}]", f.path, f.status))
                    .collect()
            })
            .unwrap_or_default();

        let related_files: Vec<String> = index
            .match_title(&card.title, 3, 5)
            .iter()
            .map(|m| format!("  - {} (score: {:.2})", m.path, m.score))
            .collect();

        let system = r#"You are a software planning specialist. Given a card and its context, generate an implementation plan.

Return JSON with exactly these fields:
{
  "requirements": [{"title": "...", "description": "...", "acceptance_criteria": ["..."], "effort": 1-10, "area": "frontend|backend|infra|docs"}],
  "child_cards": [{"title": "...", "description": "...", "priority": "critical|high|medium|low", "effort": 1-10, "labels": ["..."], "acceptance_criteria": ["..."]}],
  "estimated_total_effort": 1-100,
  "risk_level": "low|medium|high|critical",
  "rationale": "..."
}

Rules: 2-6 child cards, each 1-3 days. Include testing if effort > 3. Titles under 60 chars."#;

        let file_ctx_str = if file_lines.is_empty() { "(none)".to_string() } else { file_lines.join("\n") };
        let related_ctx_str = if related_files.is_empty() { "(none)".to_string() } else { related_files.join("\n") };

        let user_msg = format!(
            "Plan: {} — {}\nPriority: {}\nLabels: {}\n\nCode:\n{}\n\nRelated:\n{}",
            card.title,
            card.description.as_deref().unwrap_or(""),
            card.priority,
            card.labels.join(", "),
            file_ctx_str,
            related_ctx_str,
        );

        let messages = vec![
            ChatMessage { role: "system".into(), content: system.to_string() },
            ChatMessage { role: "user".into(), content: user_msg },
        ];

        match chat_json::<PlanOutput>(cfg, &messages) {
            Ok(plan) => {
                if dry_run {
                    println!("  {} effort: {}, risk: {}", style::muted("→"), plan.estimated_total_effort, plan.risk_level);
                    for child in &plan.child_cards {
                        println!("    - {} [{}]", child.title, child.priority);
                    }
                } else {
                    println!("  {} effort: {}, {} child cards", style::ok("OK"), plan.estimated_total_effort, plan.child_cards.len());
                }
            }
            Err(e) => {
                eprintln!("  {} Failed: {}", style::err("Error"), e);
            }
        }
    }

    Ok(())
}

/// Find the project root.
fn find_project_root() -> Result<std::path::PathBuf> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    Ok(board_dir.parent().unwrap_or(&std::path::Path::new(".")).to_path_buf())
}

/// Find the target board from args or default.
fn find_board(args: &[String]) -> Result<String> {
    let mut i = 0;
    while i < args.len() {
        if (args[i] == "--board" || args[i] == "-b") && i + 1 < args.len() {
            return Ok(args[i + 1].clone());
        }
        i += 1;
    }

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
