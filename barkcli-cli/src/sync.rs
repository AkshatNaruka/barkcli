use anyhow::{bail, Result};
use serde_json::json;
use barkcli_core::models::Card;
use barkcli_core::storage::board_file::read_board;

pub fn push() -> Result<()> {
    let board_name = barkcli_core::commands::boards::resolve_board(None)?;
    let board = read_board(&board_name)?;

    let token = std::env::var("GITHUB_TOKEN").or_else(|_| std::env::var("GH_TOKEN"))
        .map_err(|_| anyhow::anyhow!("GITHUB_TOKEN not set. Create one at https://github.com/settings/tokens"))?;

    // Get repo info from git remote
    let remote = get_repo_slug()?;
    let url = format!("https://api.github.com/repos/{}/issues", remote);

    let unsynced: Vec<_> = board.cards.iter()
        .filter(|c| !c.labels.contains(&"synced".to_string()))
        .collect();

    if unsynced.is_empty() {
        println!("No unsynced tasks.");
        return Ok(());
    }

    println!("Syncing {} tasks to GitHub Issues...", unsynced.len());
    for card in &unsynced {
        let body = json!({
            "title": card.title,
            "body": format!("**Board**: {}\n**Column**: {}\n**Priority**: {}\n**Labels**: {}\n**Assignee**: {}\n\n---\nSynced from board.",
                board_name, card.column, card.priority,
                card.labels.join(", "),
                card.assignee.as_deref().unwrap_or("-")),
            "labels": card.labels.clone(),
        });

        let resp = ureq::post(&url)
            .set("Authorization", &format!("Bearer {}", token))
            .set("Accept", "application/vnd.github+json")
            .set("User-Agent", "barkcli-cli")
            .send_json(body);

        match resp {
            Ok(r) if r.status() == 201 => {
                let issue: serde_json::Value = r.into_json()?;
                let number = issue["number"].as_u64().unwrap_or(0);
                // Mark as synced
                let mut board = read_board(&board_name)?;
                if let Some(c) = board.cards.iter_mut().find(|c| c.id == card.id) {
                    if !c.labels.contains(&"synced".to_string()) {
                        c.labels.push("synced".to_string());
                    }
                }
                barkcli_core::storage::board_file::write_board(&board_name, &board)?;
                println!("  ✓ #{} — {}", number, card.title);
            }
            Ok(r) => {
                let status = r.status();
                let body = r.into_string().unwrap_or_default();
                println!("  ✗ {} — HTTP {}: {}", card.title, status, &body[..body.len().min(200)]);
            }
            Err(e) => {
                println!("  ✗ {} — {}", card.title, e);
            }
        }
    }

    Ok(())
}

pub fn pull() -> Result<()> {
    let board_name = barkcli_core::commands::boards::resolve_board(None)?;
    let mut board = read_board(&board_name)?;

    let token = std::env::var("GITHUB_TOKEN").or_else(|_| std::env::var("GH_TOKEN"))
        .map_err(|_| anyhow::anyhow!("GITHUB_TOKEN not set."))?;

    let remote = get_repo_slug()?;
    let url = format!("https://api.github.com/repos/{}/issues?state=open&per_page=50", remote);

    let resp = ureq::get(&url)
        .set("Authorization", &format!("Bearer {}", token))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "board-cli")
        .call()
        .map_err(|e| anyhow::anyhow!("GitHub API error: {}", e))?;

    let issues: Vec<serde_json::Value> = resp.into_json()?;

    let existing_ids: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
    let first_col = board.columns.first().map(|c| c.id.clone()).unwrap_or_else(|| "todo".into());
    let now = chrono::Utc::now();
    let mut imported = 0;

    for issue in &issues {
        let title = issue["title"].as_str().unwrap_or("Untitled");
        let number = issue["number"].as_u64().unwrap_or(0);

        // Check if already imported
        let gh_label = format!("gh:{}", number);
        if board.cards.iter().any(|c| c.labels.contains(&gh_label)) {
            continue;
        }

        let id = barkcli_core::util::slug::unique_slug(title, &existing_ids);
        let labels: Vec<String> = issue["labels"].as_array()
            .map(|arr| arr.iter().filter_map(|l| l["name"].as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let mut card = Card::new(&id, title, &first_col);
        card.description = issue["body"].as_str().map(|s| s.to_string());
        card.labels = labels;
        card.labels.push(gh_label);
        card.labels.push("synced".to_string());
        card.created_at = now;
        card.updated_at = now;

        board.cards.push(card);
        imported += 1;
    }

    if imported > 0 {
        barkcli_core::storage::board_file::write_board(&board_name, &board)?;
        println!("Imported {} issues from GitHub to {}.board", imported, board_name);
    } else {
        println!("No new issues to import.");
    }

    Ok(())
}

fn get_repo_slug() -> Result<String> {
    let output = std::process::Command::new("git")
        .args(["remote", "get-url", "origin"])
        .output()
        .map_err(|_| anyhow::anyhow!("Not a git repository"))?;

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    // Extract owner/repo from various git URL formats
    let slug = url
        .trim_end_matches(".git")
        .split('/')
        .rev()
        .take(2)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("/");

    if slug.is_empty() || !slug.contains('/') {
        bail!("Could not determine repo from git remote: {}", url);
    }
    Ok(slug)
}
