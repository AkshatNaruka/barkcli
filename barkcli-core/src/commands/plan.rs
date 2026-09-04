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
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PlanOutput {
    pub(crate) requirements: Vec<PlanRequirement>,
    pub(crate) child_cards: Vec<PlanChildCard>,
    pub(crate) estimated_total_effort: u32,
    pub(crate) risk_level: String,
    pub(crate) rationale: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PlanRequirement {
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) acceptance_criteria: Vec<String>,
    pub(crate) effort: u32,
    pub(crate) area: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PlanChildCard {
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) priority: String,
    pub(crate) effort: u32,
    pub(crate) labels: Vec<String>,
    pub(crate) acceptance_criteria: Vec<String>,
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

    let mut system = r#"You are a software planning specialist. Given a card (task/feature/bug) and its context, generate a detailed implementation plan.

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
- Keep child card titles under 60 characters"#.to_string();

    // Skill + memory injection (SPEC-003)
    if let Some(skills) = load_plan_skills(card_title, card_labels) {
        system.push_str("\n\n");
        system.push_str(&skills);
    }
    if let Some(memories) = load_plan_memories(card_title, &board_name) {
        system.push_str("\n\n## Relevant Memories\n");
        system.push_str(&memories);
    }

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

    // Heuristic fallback when offline (SPEC-003 R5)
    let plan: PlanOutput = if let Some(ref c) = cfg {
        match chat_json::<PlanOutput>(c, &messages) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("{} LLM failed ({}), falling back to heuristic", style::warn("Warning:"), e);
                heuristic_plan(card_title, card_desc)
            }
        }
    } else {
        println!("{} No AI provider — using heuristic plan (offline)", style::muted("Plan:"));
        heuristic_plan(card_title, card_desc)
    };

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

    // Update card with plan + create children + optional queue tasks.
    // Shared with the autopilot approval gate (agent/autopilot.rs).
    let _child_ids = apply_plan(&board_name, &board, &card_id, &plan, create_tasks)?;

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

    if create_tasks {
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

/// Apply a computed plan to the board: checklist AC, child cards with
/// Parent/Child links + spec anchor, optional task-queue entries.
/// Returns the new child card ids. Used by `run_plan` and autopilot approval.
pub(crate) fn apply_plan(
    board_name: &str,
    board: &Board,
    card_id: &str,
    plan: &PlanOutput,
    create_tasks: bool,
) -> Result<Vec<String>> {
use crate::storage::board_file::read_board;

    // Re-read for a fresh base (callers may hold a stale clone).
    let base = read_board(board_name).unwrap_or_else(|_| board.clone());
    let mut board_mut = base.clone();

    // Update card with plan
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

    // Create child cards — set spec_id to parent's spec anchor (R1)
    let parent_spec = board.cards.iter().find(|c| c.id == card_id).and_then(|c| c.spec_id.clone()).unwrap_or_else(|| card_id.to_string());
    let mut child_ids = Vec::new();
    for child in &plan.child_cards {
        let child_id = crate::util::slug::to_slug(&child.title);
        // Idempotency: skip if a card with this id already exists (re-approval safe).
        if board_mut.cards.iter().any(|c| c.id == child_id) {
            if !child_ids.contains(&child_id) {
                child_ids.push(child_id.clone());
            }
            continue;
        }
        let mut new_card = crate::models::card::Card::new(&child_id, &child.title, "todo");
        new_card.description = Some(child.description.clone());
        new_card.priority = child.priority.clone();
        new_card.labels = child.labels.clone();
        new_card.effort = Some(child.effort);
        new_card.spec_id = Some(parent_spec.clone());

        for ac in &child.acceptance_criteria {
            new_card.checklist.push(crate::models::card::ChecklistItem {
                text: ac.clone(),
                done: false,
            });
        }

        new_card.links.push(crate::models::card::CardLink {
            ty: crate::models::card::LinkType::Parent,
            target: card_id.to_string(),
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

    write_board(board_name, &board_mut)?;

    // Create tasks if requested
    if create_tasks {
        let tasks_dir = crate::storage::board_dir::find_board_dir()?.join("tasks");
        std::fs::create_dir_all(&tasks_dir)?;
        let tasks_path = tasks_dir.join(format!("{}.json", board_name));

        let mut queue = TaskQueue::load(&tasks_path).unwrap_or_default();

        for (i, child) in plan.child_cards.iter().enumerate() {
            let context_files = populate_context_files(card_id, board_name);
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
    }

    Ok(child_ids)
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

fn load_plan_skills(title: &str, labels: &[String]) -> Option<String> {
    let reg = crate::skills::SkillRegistry::load_all(None).ok()?;
    let ctx = crate::skills::registry::MatchContext {
        labels: labels.to_vec(),
        area: None,
        title: title.to_string(),
        pipeline_phase: "plan".into(),
    };
    reg.render_for_prompt(&ctx)
}

fn load_plan_memories(title: &str, board_name: &str) -> Option<String> {
    let store = crate::memory::store::MemoryStore::open(board_name).ok()?;
    let results = store.search(title, 3);
    if results.is_empty() {
        return None;
    }
    Some(results.iter().map(|e| format!("- {}", e.content)).collect::<Vec<_>>().join("\n"))
}

pub(crate) fn heuristic_plan(title: &str, desc: &Option<String>) -> PlanOutput {
    let base = title.trim();
    let desc_str = desc.clone().unwrap_or_default();
    PlanOutput {
        requirements: vec![PlanRequirement {
            title: format!("Implement {}", base),
            description: desc_str.clone(),
            acceptance_criteria: vec!["Feature works as described".into()],
            effort: 3,
            area: "fullstack".into(),
        }],
        child_cards: vec![
            PlanChildCard {
                title: format!("{} — slice 1", base.chars().take(40).collect::<String>()),
                description: desc_str.clone(),
                priority: "high".into(),
                effort: 2,
                labels: vec!["heuristic".into()],
                acceptance_criteria: vec!["Slice 1 done".into()],
            },
            PlanChildCard {
                title: format!("{} — tests", base.chars().take(40).collect::<String>()),
                description: "Add tests for the slice".into(),
                priority: "medium".into(),
                effort: 1,
                labels: vec!["test".into()],
                acceptance_criteria: vec!["Tests pass".into()],
            },
        ],
        estimated_total_effort: 3,
        risk_level: "low".into(),
        rationale: "Heuristic split (offline)".into(),
    }
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
