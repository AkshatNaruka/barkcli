use crate::plugin::registry::PluginRegistry;
use anyhow::Result;
use std::path::Path;

/// Plugin loader for discovering and loading plugins
pub struct PluginLoader {
    search_paths: Vec<String>,
}

impl Default for PluginLoader {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginLoader {
    pub fn new() -> Self {
        Self {
            search_paths: vec![
                ".board/plugins".to_string(),
                "plugins".to_string(),
                "~/.config/barkcli/plugins".to_string(),
            ],
        }
    }

    /// Add a search path
    pub fn add_search_path(&mut self, path: impl Into<String>) {
        self.search_paths.push(path.into());
    }

    /// Discover plugins in search paths
    pub fn discover(&self) -> Vec<String> {
        let mut found = Vec::new();
        for path in &self.search_paths {
            let p = Path::new(path);
            if p.exists() && p.is_dir() {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() {
                        if entry.path().is_file() {
                            if let Some(ext) = entry.path().extension() {
                                if ext == "toml" || ext == "json" || ext == "yaml" {
                                    found.push(entry.path().to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        found
    }

    /// Load a plugin from a file/config
    pub fn load_from_file(&self, _path: &Path, _registry: &mut PluginRegistry) -> Result<()> {
        // For now, support config-based plugin loading
        // In a full implementation, this could load dynamic libraries or WASM
        Ok(())
    }

    /// Load all discovered plugins
    pub fn load_all(&self, registry: &mut PluginRegistry) -> Result<()> {
        let discovered = self.discover();
        for path in discovered {
            self.load_from_file(Path::new(&path), registry)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_loader_discover() {
        let loader = PluginLoader::new();
        let _found = loader.discover();
        // Should not panic
    }
}
