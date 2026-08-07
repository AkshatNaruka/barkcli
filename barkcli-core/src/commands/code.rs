use anyhow::Result;

use crate::code::SymbolIndex;
use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::read_board;
use crate::storage::context::read_context;
use crate::util::style;

/// `barkcli code <query>` — search the project for symbols/files and report
/// which cards touch them (via the context index).
pub fn run_code(board: &str, args: &[String]) -> Result<()> {
    let query = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli code <query>"))?;
    let top = args
        .iter()
        .position(|a| a == "--top")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    let root = board_dir_parent()?;
    let index = SymbolIndex::build(&root);
    if index.files.is_empty() {
        println!("{} no source files found", style::muted("Code:"));
        return Ok(());
    }

    let hits = index.search(query, top);
    if hits.is_empty() {
        println!("{} no symbols match '{}'", style::muted("Code:"), query);
        return Ok(());
    }

    let ctx = read_context(board)?;
    let board = read_board(board).ok();

    println!("{} matches for '{}':", style::accent("Code:"), query);
    for hit in &hits {
        let cards = ctx.index.get(&hit.path).cloned().unwrap_or_default();
        let linked: Vec<String> = cards
            .iter()
            .filter(|id| board.as_ref().map(|b| b.cards.iter().any(|c| c.id == **id)).unwrap_or(false))
            .cloned()
            .collect();
        let card_str = if linked.is_empty() {
            style::muted("no card").to_string()
        } else {
            linked
                .iter()
                .map(|id| style::accent(id))
                .collect::<Vec<_>>()
                .join(", ")
        };
        println!(
            "  {} {}  → {}",
            style::strong(&hit.path),
            if hit.matched_symbols.is_empty() {
                String::new()
            } else {
                style::muted(format!("({})", hit.matched_symbols.join(", ")))
            },
            card_str
        );
    }
    println!("{}", style::muted("Tip: `barkcli context show <card>` for full code context"));
    Ok(())
}

fn board_dir_parent() -> Result<std::path::PathBuf> {
    let board_dir = find_board_dir()?;
    board_dir
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| anyhow::anyhow!("cannot determine project root"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_requires_query() {
        let err = run_code("dev", &[]);
        assert!(err.is_err());
    }
}
