use anyhow::{Context, Result};

use crate::storage::board_file::read_board;

pub fn run(name: &str, args: &[String]) -> Result<()> {
    let format = args.first().map(|s| s.as_str()).unwrap_or("json");

    let board = read_board(name).context(format!("board '{}' not found", name))?;

    match format {
        "json" => {
            let json = serde_json::to_string_pretty(&board)
                .context("failed to serialize to JSON")?;
            println!("{}", json);
        }
        "yaml" => {
            let yaml = serde_yaml::to_string(&board)
                .context("failed to serialize to YAML")?;
            println!("{}", yaml);
        }
        other => {
            anyhow::bail!("unsupported format '{}'. Supported: json, yaml", other);
        }
    }
    Ok(())
}
