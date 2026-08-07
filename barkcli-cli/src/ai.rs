use anyhow::Result;
use serde::Deserialize;

use barkcli_core::ai::{chat_json, resolve_config, ChatMessage};
use barkcli_core::models::Card;
use barkcli_core::storage::board_file::{read_board, write_board};
use barkcli_core::storage::history;
use barkcli_core::util::slug::unique_slug;

#[derive(Deserialize)]
struct AiTask {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    labels: Option<Vec<String>>,
    assignee: Option<String>,
    effort: Option<u32>,
}

pub fn run(prompt: &str, dry_run: bool, model: &str) -> Result<()> {
    let mut cfg = resolve_config()?;
    if model != "gpt-4o-mini" {
        cfg.model = model.to_string();
    }

    let system = r#"You are a project manager. Break down the following task into individual, actionable subtasks for a Kanban board. Return ONLY a JSON array. Each item: title (short), description (optional, one sentence), priority (high/medium/low), labels (array of strings like backend/frontend/bug/docs/devops, optional), assignee (null unless specified), effort (story points 1-8, optional). Example: [{"title":"Set up JWT middleware","description":"Create middleware for JWT validation","priority":"high","labels":["backend","auth"],"assignee":null,"effort":3}]"#;

    let messages = vec![
        ChatMessage { role: "system".into(), content: system.into() },
        ChatMessage { role: "user".into(), content: format!("Break down: {}", prompt) },
    ];

    let tasks: Vec<AiTask> = chat_json(&cfg, &messages)?;

    if tasks.is_empty() {
        println!("AI generated no tasks. Try a more specific prompt.");
        return Ok(());
    }

    let board_name = barkcli_core::commands::boards::resolve_board(None)?;

    if dry_run {
        println!("Would create {} tasks (dry run):", tasks.len());
        for (i, t) in tasks.iter().enumerate() {
            println!("  {}. [{}] {}", i + 1, t.priority.as_deref().unwrap_or("medium"), t.title);
        }
        return Ok(());
    }

    let mut board = read_board(&board_name)?;
    let existing_ids: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
    let now = chrono::Utc::now();
    let first_col = board.columns.first().map(|c| c.id.clone()).unwrap_or_else(|| "todo".into());

    let mut added = 0;
    for t in &tasks {
        let id = unique_slug(&t.title, &existing_ids);
        let mut card = Card::new(&id, &t.title, &first_col);
        card.priority = t.priority.clone().unwrap_or_else(|| "medium".into());
        card.description = t.description.clone();
        card.labels = t.labels.clone().unwrap_or_default();
        card.assignee = t.assignee.clone();
        card.effort = t.effort;
        card.created_at = now;
        card.updated_at = now;
        board.cards.push(card);
        let _ = history::log_add(&board_name, &id, &t.title);
        added += 1;
    }

    write_board(&board_name, &board)?;
    println!("Generated {} tasks in {}.board:", added, board_name);
    for (i, t) in tasks.iter().enumerate() {
        println!("  {}. [{}] {}", i + 1, t.priority.as_deref().unwrap_or("medium"), t.title);
    }
    Ok(())
}
