use anyhow::Result;
use std::collections::HashMap;

/// Extension points
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ExtensionPoint {
    Command,
    Provider,
    Ui,
    Custom(String),
}

/// Command extension - add new CLI commands
#[derive(Debug, Clone)]
pub struct CommandExtension {
    pub name: String,
    pub description: String,
    pub usage: Option<String>,
}

/// Provider extension - add new agent providers/backends
#[derive(Debug, Clone)]
pub struct ProviderExtension {
    pub name: String,
    pub description: String,
    pub supported_models: Vec<String>,
}

/// UI extension - add UI components/routes
#[derive(Debug, Clone)]
pub struct UiExtension {
    pub name: String,
    pub route: Option<String>,
    pub component: Option<String>,
}

impl CommandExtension {
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            usage: None,
        }
    }
}

impl ProviderExtension {
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            supported_models: vec![],
        }
    }
}

impl UiExtension {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            route: None,
            component: None,
        }
    }
}
