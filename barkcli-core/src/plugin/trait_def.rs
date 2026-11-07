use crate::plugin::context::PluginContext;
use anyhow::Result;

/// Core plugin trait - all plugins must implement this
pub trait Plugin: Send + Sync {
    /// Unique name of the plugin
    fn name(&self) -> &str;

    /// Plugin version
    fn version(&self) -> &str;

    /// Plugin description
    fn description(&self) -> Option<&str> {
        None
    }

    /// Plugin author
    fn author(&self) -> Option<&str> {
        None
    }

    /// Initialize the plugin with the given context
    fn init(&self, _ctx: &mut PluginContext) -> Result<()> {
        Ok(())
    }

    /// Called when the plugin is enabled
    fn enable(&self) -> Result<()> {
        Ok(())
    }

    /// Called when the plugin is disabled
    fn disable(&self) -> Result<()> {
        Ok(())
    }

    /// Shutdown the plugin
    fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    /// Get dependencies of this plugin (other plugin names)
    fn dependencies(&self) -> Vec<String> {
        vec![]
    }
}
