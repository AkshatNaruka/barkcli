use anyhow::Result;

use board_core::models::Board;
use board_core::storage::board_file::read_board;

pub fn run(since: Option<&str>) -> Result<()> {
    let name = board_core::commands::boards::resolve_board(None)?;
    let board = read_board(&name)?;

    let git_ref = if let Some(s) = since {
        s.to_string()
    } else {
        let output = std::process::Command::new("git")
            .args(["describe", "--tags", "--abbrev=0"])
            .output();
        match output {
            Ok(o) if o.status.success() => {
                String::from_utf8_lossy(&o.stdout).trim().to_string()
            }
            _ => "HEAD~10".to_string(),
        }
    };

    let file = format!("{}.board", name);
    let output = std::process::Command::new("git")
        .args(["show", &format!("{}:{}", git_ref, file)])
        .output();

    let prev_cards: Vec<String> = match output {
        Ok(o) if o.status.success() => {
            match serde_yaml::from_slice::<Board>(&o.stdout) {
                Ok(prev) => prev.cards.iter().map(|c| c.id.clone()).collect(),
                Err(_) => vec![],
            }
        }
        _ => vec![],
    };

    let new_cards: Vec<_> = board.cards.iter()
        .filter(|c| !prev_cards.contains(&c.id))
        .collect();

    let done_cards: Vec<_> = board.cards.iter()
        .filter(|c| c.column == "done" && prev_cards.contains(&c.id))
        .collect();

    let heading = if since.is_some() { format!("Changes since {}", git_ref) } else { git_ref.clone() };
    println!("## {}", heading);
    println!();

    if !new_cards.is_empty() {
        println!("### Added ({})\n", new_cards.len());
        for c in &new_cards {
            println!("- {} [{}]", c.title, c.priority);
        }
        println!();
    }

    if !done_cards.is_empty() {
        println!("### Completed ({})\n", done_cards.len());
        for c in &done_cards {
            println!("- {}", c.title);
        }
        println!();
    }

    if new_cards.is_empty() && done_cards.is_empty() {
        println!("No changes detected.");
    }

    Ok(())
}
