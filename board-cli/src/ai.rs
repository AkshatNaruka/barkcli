use anyhow::Result;
use serde::{Deserialize, Serialize};

use board_core::models::Card;
use board_core::storage::board_file::{read_board, write_board};
use board_core::storage::history;
use board_core::util::slug::unique_slug;

#[derive(Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f64,
}

#[derive(Serialize)]
struct Message { role: String, content: String }

#[derive(Deserialize)]
struct OpenAiResponse { choices: Vec<Choice> }

#[derive(Deserialize)]
struct Choice { message: MessageContent }

#[derive(Deserialize)]
struct MessageContent { content: String }

#[derive(Deserialize)]
struct AiTask {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    labels: Option<Vec<String>>,
    assignee: Option<String>,
}

pub fn run(prompt: &str, dry_run: bool, model: &str) -> Result<()> {
    let api_key = std::env::var("OPENAI_API_KEY").ok().or_else(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let path = std::path::PathBuf::from(home).join(".board").join("config");
        std::fs::read_to_string(&path).ok().and_then(|c| {
            c.lines().find(|l| l.starts_with("OPENAI_API_KEY="))
                .map(|l| l.trim_start_matches("OPENAI_API_KEY=").trim().to_string())
        })
    }).ok_or_else(|| anyhow::anyhow!(
        "OPENAI_API_KEY not set.\n  export OPENAI_API_KEY=sk-...\n  or add to ~/.board/config: OPENAI_API_KEY=sk-..."
    ))?;

    let system = r#"You are a project manager. Break down the following task into individual, actionable subtasks for a Kanban board. Return ONLY a JSON array. Each item: title (short), description (optional, one sentence), priority (high/medium/low), labels (array of strings like backend/frontend/bug/docs/devops, optional), assignee (null unless specified). Example: [{"title":"Set up JWT middleware","description":"Create middleware for JWT validation","priority":"high","labels":["backend","auth"],"assignee":null}]"#;

    let req = OpenAiRequest {
        model: model.to_string(),
        messages: vec![
            Message { role: "system".into(), content: system.into() },
            Message { role: "user".into(), content: format!("Break down: {}", prompt) },
        ],
        temperature: 0.7,
    };

    let body = serde_json::to_string(&req)?;
    let resp: OpenAiResponse = ureq::post("https://api.openai.com/v1/chat/completions")
        .set("Authorization", &format!("Bearer {}", api_key))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .map_err(|e| anyhow::anyhow!("OpenAI API error: {}", e))?
        .into_json()
        .map_err(|e| anyhow::anyhow!("Parse error: {}", e))?;

    let empty = String::new();
    let content = resp.choices.first().map(|c| c.message.content.as_str()).unwrap_or(&empty);
    let tasks: Vec<AiTask> = serde_json::from_str(content)
        .map_err(|e| anyhow::anyhow!("AI returned invalid JSON: {}\nRaw: {}", e, content))?;

    if tasks.is_empty() {
        println!("AI generated no tasks. Try a more specific prompt.");
        return Ok(());
    }

    let board_name = board_core::commands::boards::resolve_board(None)?;

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
