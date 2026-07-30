use std::path::Path;

use anyhow::{Context, Result};

use crate::models::Config;

const CONFIG_FILENAME: &str = "config.json";

pub fn init_config(board_dir: &Path) -> Result<()> {
    let config = Config::default();
    let path = board_dir.join(CONFIG_FILENAME);
    let content =
        serde_json::to_string_pretty(&config).context("failed to serialize config")?;
    std::fs::write(&path, &content).context(format!("failed to write {}", path.display()))?;
    Ok(())
}

#[allow(dead_code)]
pub fn read_config(board_dir: &Path) -> Result<Config> {
    let path = board_dir.join(CONFIG_FILENAME);
    let content =
        std::fs::read_to_string(&path).context(format!("failed to read {}", path.display()))?;
    let config: Config =
        serde_json::from_str(&content).context(format!("failed to parse {}", path.display()))?;
    Ok(config)
}
