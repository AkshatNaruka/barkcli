use crate::plugin::context::PluginContext;
use crate::plugin::trait_def::Plugin;
use anyhow::{bail, Result};
use std::collections::HashMap;
use std::sync::Arc;

/// Plugin registry manages loaded plugins
#[derive(Default)]
pub struct PluginRegistry {
    plugins: HashMap<String, Arc<dyn Plugin>>,
    enabled: HashMap<String, bool>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self {
            plugins: HashMap::new(),
            enabled: HashMap::new(),
        }
    }

    /// Register a plugin
    pub fn register(&mut self, plugin: Arc<dyn Plugin>) -> Result<()> {
        let name = plugin.name().to_string();
        if self.plugins.contains_key(&name) {
            bail!("Plugin '{}' already registered", name);
        }
        // Check dependencies
        for dep in plugin.dependencies() {
            if !self.plugins.contains_key(&dep) {
                bail!("Plugin '{}' depends on missing plugin '{}'", name, dep);
            }
        }
        self.plugins.insert(name.clone(), plugin);
        self.enabled.insert(name, true);
        Ok(())
    }

    /// Get a plugin by name
    pub fn get(&self, name: &str) -> Option<Arc<dyn Plugin>> {
        self.plugins.get(name).cloned()
    }

    /// List all plugins
    pub fn list(&self) -> Vec<String> {
        self.plugins.keys().cloned().collect()
    }

    /// Check if a plugin is enabled
    pub fn is_enabled(&self, name: &str) -> bool {
        self.enabled.get(name).copied().unwrap_or(false)
    }

    /// Enable a plugin
    pub fn enable(&mut self, name: &str) -> Result<()> {
        if !self.plugins.contains_key(name) {
            bail!("Plugin '{}' not found", name);
        }
        self.enabled.insert(name.to_string(), true);
        Ok(())
    }

    /// Disable a plugin
    pub fn disable(&mut self, name: &str) -> Result<()> {
        if !self.plugins.contains_key(name) {
            bail!("Plugin '{}' not found", name);
        }
        self.enabled.insert(name.to_string(), false);
        Ok(())
    }

    /// Initialize all enabled plugins
    pub fn init_all(&self, ctx: &mut PluginContext) -> Result<()> {
        // Initialize in dependency order (simple approach)
        let mut initialized = std::collections::HashSet::new();
        let plugin_names: Vec<String> = self.plugins.keys().cloned().collect();
        
        for _ in 0..plugin_names.len() {
            let mut progress = false;
            for name in &plugin_names {
                if initialized.contains(name) || !self.is_enabled(name) {
                    continue;
                }
                if let Some(plugin) = self.plugins.get(name) {
                    // Check if all deps initialized
                    let deps_ok = plugin.dependencies().iter().all(|d| initialized.contains(d));
                    if deps_ok {
                        plugin.init(ctx)?;
                        plugin.enable()?;
                        initialized.insert(name.clone());
                        progress = true;
                    }
                }
            }
            if !progress {
                break;
            }
        }
        Ok(())
    }

    /// Shutdown all plugins
    pub fn shutdown_all(&self) -> Result<()> {
        for plugin in self.plugins.values() {
            plugin.shutdown()?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct DummyPlugin;

    impl Plugin for DummyPlugin {
        fn name(&self) -> &str {
            "dummy"
        }
        fn version(&self) -> &str {
            "1.0.0"
        }
    }

    #[test]
    fn test_registry_register() {
        let mut registry = PluginRegistry::new();
        registry.register(Arc::new(DummyPlugin)).unwrap();
        assert!(registry.get("dummy").is_some());
    }
}
