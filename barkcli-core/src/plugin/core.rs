use crate::plugin::context::PluginContext;
use crate::plugin::extension::CommandExtension;
use crate::plugin::hook::{Hook, HookContext, HookPoint, HookResult};
use crate::plugin::trait_def::Plugin;
use crate::plugin::PluginManager;
use anyhow::Result;
use std::sync::Arc;

/// Core logging plugin
pub struct LoggingPlugin;

impl Plugin for LoggingPlugin {
    fn name(&self) -> &str {
        "core.logging"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    fn description(&self) -> Option<&str> {
        Some("Core logging and tracing plugin")
    }

    fn init(&self, ctx: &mut PluginContext) -> Result<()> {
        struct LogHook;
        impl Hook for LogHook {
            fn name(&self) -> &str {
                "core.logger"
            }
            fn priority(&self) -> i32 {
                100
            }
            fn call(&self, ctx: &HookContext) -> Result<HookResult> {
                if let Some(cmd) = ctx.get("command") {
                    eprintln!("[plugin:logging] Executing: {}", cmd);
                }
                Ok(HookResult::default())
            }
        }
        ctx.register_hook(HookPoint::BeforeCommand, Arc::new(LogHook));
        ctx.register_hook(HookPoint::BeforeRun, Arc::new(LogHook));
        Ok(())
    }
}

/// Core metrics plugin
pub struct MetricsPlugin;

impl Plugin for MetricsPlugin {
    fn name(&self) -> &str {
        "core.metrics"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    fn description(&self) -> Option<&str> {
        Some("Core metrics collection plugin")
    }

    fn init(&self, _ctx: &mut PluginContext) -> Result<()> {
        Ok(())
    }
}

/// Core commands plugin - adds plugin management commands
pub struct CommandsPlugin;

impl Plugin for CommandsPlugin {
    fn name(&self) -> &str {
        "core.commands"
    }

    fn version(&self) -> &str {
        "1.0.0"
    }

    fn description(&self) -> Option<&str> {
        Some("Core plugin management commands")
    }

    fn init(&self, ctx: &mut PluginContext) -> Result<()> {
        ctx.register_command(CommandExtension::new("plugins", "Manage plugins"));
        ctx.register_command(CommandExtension::new("plugin", "Plugin management (alias)"));
        Ok(())
    }
}

/// Load all core plugins into the plugin manager
pub fn load_core_plugins(pm: &mut PluginManager) -> Result<()> {
    pm.registry.register(Arc::new(LoggingPlugin))?;
    pm.registry.register(Arc::new(MetricsPlugin))?;
    pm.registry.register(Arc::new(CommandsPlugin))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_core_plugins() {
        let mut pm = PluginManager::new();
        assert!(load_core_plugins(&mut pm).is_ok());
        assert_eq!(pm.registry.list().len(), 3);
    }
}
