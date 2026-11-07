//! Production metrics: file-backed counters at `.board/metrics.json`.
//! All operations are best-effort (never fail the caller).

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Metrics {
    pub counters: HashMap<String, u64>,
    pub updated_at: String,
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            counters: HashMap::new(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
    pub fn inc(&mut self, name: &str, by: u64) {
        *self.counters.entry(name.to_string()).or_insert(0) += by;
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
    pub fn get(&self, name: &str) -> u64 {
        self.counters.get(name).copied().unwrap_or(0)
    }
}

pub fn metrics_path() -> Result<PathBuf> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    Ok(board_dir.join("metrics.json"))
}

pub fn load() -> Metrics {
    metrics_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(metrics: &Metrics) -> Result<()> {
    let path = metrics_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(metrics)?;
    std::fs::write(&path, json)?;
    Ok(())
}

pub fn inc(name: &str) {
    let mut metrics = load();
    metrics.inc(name, 1);
    let _ = save(&metrics);
}

pub fn inc_by(name: &str, by: u64) {
    let mut metrics = load();
    metrics.inc(name, by);
    let _ = save(&metrics);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inc_and_get() {
        let mut m = Metrics::new();
        m.inc("gate_passed", 2);
        m.inc("gate_passed", 1);
        assert_eq!(m.get("gate_passed"), 3);
        assert_eq!(m.get("missing"), 0);
    }
}
