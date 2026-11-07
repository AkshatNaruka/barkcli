//! Plugin system for barkcli (inspired by DeepSeek harness).
//!
//! A simple but powerful plugin architecture:
//! - Traits for plugins with lifecycle hooks
//! - Registry for managing loaded plugins
//! - Hook system (before/after) for key operations
//! - Extension points for providers, commands, UI
//! - Loader for discovering and loading plugins
//! - Core plugins built-in

pub mod core;
pub mod context;
pub mod extension;
pub mod hook;
pub mod loader;
pub mod registry;
pub mod trait_def;

pub use context::PluginContext;
pub use extension::{CommandExtension, ExtensionPoint, ProviderExtension, UiExtension};
pub use hook::{Hook, HookPoint, HookRegistry, HookResult};
pub use loader::PluginLoader;
pub use registry::PluginRegistry;
pub use trait_def::Plugin;

use anyhow::Result;

/// Global plugin manager that coordinates everything
#[derive(Default)]
pub struct PluginManager {
    pub registry: PluginRegistry,
    pub hooks: HookRegistry,
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            registry: PluginRegistry::new(),
            hooks: HookRegistry::new(),
        }
    }

    /// Initialize all loaded plugins
    pub fn init_all(&mut self) -> Result<()> {
        let mut ctx = PluginContext::new(&mut self.hooks);
        self.registry.init_all(&mut ctx)?;
        Ok(())
    }

    /// Load core plugins
    pub fn load_core_plugins(&mut self) -> Result<()> {
        core::load_core_plugins(self)?;
        Ok(())
    }

    /// Run a hook
    pub fn run_hook(&self, point: HookPoint, ctx: &hook::HookContext) -> Result<HookResult> {
        self.hooks.run(point, ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plugin_manager_creation() {
        let mut pm = PluginManager::new();
        assert!(pm.load_core_plugins().is_ok());
    }
}
