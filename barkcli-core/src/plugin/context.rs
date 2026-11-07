use crate::plugin::extension::{CommandExtension, ProviderExtension, UiExtension};
use crate::plugin::hook::{Hook, HookPoint, HookRegistry};
use std::sync::Arc;

/// Plugin context provides access to registries and extension points
pub struct PluginContext<'a> {
    pub hooks: &'a mut HookRegistry,
    pub commands: Vec<CommandExtension>,
    pub providers: Vec<ProviderExtension>,
    pub ui: Vec<UiExtension>,
}

impl<'a> PluginContext<'a> {
    pub fn new(hooks: &'a mut HookRegistry) -> Self {
        Self {
            hooks,
            commands: Vec::new(),
            providers: Vec::new(),
            ui: Vec::new(),
        }
    }

    /// Register a hook
    pub fn register_hook(&mut self, point: HookPoint, hook: Arc<dyn Hook>) {
        self.hooks.register(point, hook);
    }

    /// Register a command extension
    pub fn register_command(&mut self, ext: CommandExtension) {
        self.commands.push(ext);
    }

    /// Register a provider extension
    pub fn register_provider(&mut self, ext: ProviderExtension) {
        self.providers.push(ext);
    }

    /// Register a UI extension
    pub fn register_ui(&mut self, ext: UiExtension) {
        self.ui.push(ext);
    }

    /// Get all command extensions
    pub fn get_commands(&self) -> &[CommandExtension] {
        &self.commands
    }

    /// Get all provider extensions
    pub fn get_providers(&self) -> &[ProviderExtension] {
        &self.providers
    }

    /// Get all UI extensions
    pub fn get_ui(&self) -> &[UiExtension] {
        &self.ui
    }
}
