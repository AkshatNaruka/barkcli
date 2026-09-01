use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::ai::{chat_json, resolve_config, ChatMessage};
use crate::models::Board;
use crate::storage::board_file::{read_board, write_board};
use crate::util::style;

/// LLM output for intake classification.
#[derive(Debug, Deserialize)]
struct IntakeClassification {
    card_type: String,     // feature | bug | chore | spike
    priority: String,      // critical | high | medium | low
    scope: String,         // small | medium | large
    area: String,          // frontend | backend | infra | docs | fullstack
    labels: Vec<String>,
    title: String,
    description: String,
    acceptance_criteria: Vec<String>,
}

#[derive(Debug, Serialize)]
struct IntakeOutput {
    card_id: String,
    card_type: String,
    priority: String,
    scope: String,
    area: String,
    labels: Vec<String>,
    spec_created: bool,
}

/// `barkcli intake <text>` — Parse natural language input into a structured card + spec.
///
/// Flags:
///   --bug        Force bug classification
///   --feature    Force feature classification
///   --board <n>  Target board (default: first available)
///   --dry-run    Show classification without creating
///   --no-spec    Skip spec creation
pub fn run_intake(args: &[String]) -> Result<()> {
    let dry_run = args.iter().any(|a| a == "--dry-run");
    let no_spec = args.iter().any(|a| a == "--no-spec");
    let force_bug = args.iter().any(|a| a == "--bug");
    let force_feature = args.iter().any(|a| a == "--feature");

    // Extract the text (everything that's not a flag)
    let text: String = args
        .iter()
        .filter(|a| !a.starts_with('-'))
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");

    if text.is_empty() {
        anyhow::bail!("usage: barkcli intake <text> [--bug|--feature] [--dry-run] [--no-spec]");
    }

    // Find target board
    let board_name = find_board(args)?;
    let mut board = read_board(&board_name)
        .context(format!("board '{}' not found. Run barkcli create {}", board_name, board_name))?;

    let cfg = resolve_config().ok();

    println!(
        "{} Analyzing input with {}...",
        style::accent("Intake:"),
        cfg.as_ref()
            .map(|c| c.model.as_str())
            .unwrap_or("LLM"),
    );

    // Build classification prompt
    let mut forced_hints = Vec::new();
    if force_bug {
        forced_hints.push("The user explicitly said this is a BUG.".to_string());
    }
    if force_feature {
        forced_hints.push("The user explicitly said this is a FEATURE.".to_string());
    }

    let system = format!(
        r#"You are a project intake specialist. Given a user's natural language input, classify it and create a structured work item.

Return JSON with exactly these fields:
{{
  "card_type": "feature" | "bug" | "chore" | "spike",
  "priority": "critical" | "high" | "medium" | "low",
  "scope": "small" | "medium" | "large",
  "area": "frontend" | "backend" | "infra" | "docs" | "fullstack",
  "labels": ["label1", "label2"],
  "title": "Concise card title (max 60 chars)",
  "description": "Clear description of what needs to be done",
  "acceptance_criteria": [" criterion 1", "criterion 2"]
}}

Classification rules:
- Bugs: things that are broken, crashes, errors, regressions
- Features: new functionality, enhancements, user requests
- Chores: refactoring, dependency updates, config changes, cleanup
- Spikes: research, investigation, proof-of-concept
- Priority: critical = blocks other work or production down; high = important feature/bug; medium = normal work; low = nice-to-have
- Scope: small = < 1 day; medium = 1-3 days; large = > 3 days
- Acceptance criteria should be specific and testable
- Keep title under 60 characters"#
    );

    let user_msg = if forced_hints.is_empty() {
        format!("Classify this input:\n\n{}", text)
    } else {
        format!(
            "Classify this input:\n\n{}\n\nHints: {}",
            text,
            forced_hints.join(" ")
        )
    };

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system,
        },
        ChatMessage {
            role: "user".into(),
            content: user_msg,
        },
    ];

    let cfg = cfg.ok_or_else(|| anyhow::anyhow!(
        "AI provider not configured.\n  Set BARKCLI_API_KEY env var, or\n  Add OPENAI_API_KEY to ~/.board/config, or\n  Use a local provider: barkcli ai config set provider ollama"
    ))?;

    let classification: IntakeClassification = chat_json(&cfg, &messages)?;

    // Create the card
    let card_id = crate::util::slug::to_slug(&classification.title);
    let mut card = crate::models::card::Card::new(&card_id, &classification.title, "todo");
    card.description = Some(classification.description.clone());
    card.priority = classification.priority.clone();
    card.labels = classification.labels.clone();

    // Add acceptance criteria as checklist
    for ac in &classification.acceptance_criteria {
        card.checklist.push(crate::models::card::ChecklistItem {
            text: ac.clone(),
            done: false,
        });
    }

    let output_card_id = card.id.clone();

    if dry_run {
        println!();
        println!("{} Classification (dry run):", style::accent("Intake:"));
        println!("  Type:     {}", classification.card_type);
        println!("  Priority: {}", classification.priority);
        println!("  Scope:    {}", classification.scope);
        println!("  Area:     {}", classification.area);
        println!("  Labels:   {}", classification.labels.join(", "));
        println!("  Title:    {}", classification.title);
        println!("  AC:       {} criteria", classification.acceptance_criteria.len());
        println!();
        println!("  {} Card would be created on board '{}'", style::muted("→"), board_name);
        return Ok(());
    }

    // Add card to board
    board.cards.push(card);
    write_board(&board_name, &board)?;

    println!(
        "{} Created card '{}' on board '{}'",
        style::ok("OK"),
        style::strong(&classification.title),
        board_name,
    );
    println!("  ID:       {}", output_card_id);
    println!("  Type:     {}", classification.card_type);
    println!("  Priority: {}", classification.priority);
    println!("  Scope:    {}", classification.scope);
    println!("  Area:     {}", classification.area);

    // Create spec if not disabled
    let spec_created = if !no_spec {
        match create_spec_from_intake(&board_name, &output_card_id, &classification) {
            Ok(true) => {
                println!("  {} Spec created", style::ok("OK"));
                true
            }
            Ok(false) => false,
            Err(e) => {
                eprintln!("  {} Spec creation skipped: {}", style::warn("Warning:"), e);
                false
            }
        }
    } else {
        false
    };

    println!();
    println!("Next steps:");
    println!("  barkcli plan {}       # Generate decomposition", output_card_id);
    println!("  barkcli move {} doing  # Start working", output_card_id);
    println!("  barkcli list          # View all cards");

    let output = IntakeOutput {
        card_id: output_card_id,
        card_type: classification.card_type,
        priority: classification.priority,
        scope: classification.scope,
        area: classification.area,
        labels: classification.labels,
        spec_created,
    };

    // Write JSON output for programmatic use
    let json_path = std::env::temp_dir().join("barkcli-intake-last.json");
    std::fs::write(&json_path, serde_json::to_string_pretty(&output)?).ok();

    Ok(())
}

/// Create a spec from intake classification.
fn create_spec_from_intake(
    board_name: &str,
    card_id: &str,
    classification: &IntakeClassification,
) -> Result<bool> {
    let specs_path = crate::storage::board_dir::find_board_dir()?
        .join("specs")
        .join(format!("{}.json", board_name));

    std::fs::create_dir_all(specs_path.parent().unwrap()).ok();

    let mut specs: Vec<crate::models::spec::Spec> = if specs_path.exists() {
        let content = std::fs::read_to_string(&specs_path)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    let spec_id = crate::util::slug::to_slug(&classification.title);
    let spec = crate::models::spec::Spec {
        id: spec_id,
        title: format!("{}: {}", classification.card_type, classification.title),
        description: Some(classification.description.clone()),
        status: crate::models::spec::SpecStatus::Draft,
        priority: classification.priority.clone(),
        tags: classification.labels.clone(),
        requirements: classification
            .acceptance_criteria
            .iter()
            .enumerate()
            .map(|(i, ac)| crate::models::spec::Requirement {
                id: format!("req-{}", i + 1),
                title: ac.clone(),
                description: None,
                status: crate::models::spec::RequirementStatus::Pending,
                acceptance_criteria: vec![ac.clone()],
                linked_code: Vec::new(),
                linked_tests: Vec::new(),
                linked_tasks: vec![card_id.to_string()],
                stale: false,
                stale_reason: None,
                updated_at: Utc::now(),
            })
            .collect(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    specs.push(spec);
    let json = serde_json::to_string_pretty(&specs)?;
    std::fs::write(&specs_path, json)?;

    Ok(true)
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
