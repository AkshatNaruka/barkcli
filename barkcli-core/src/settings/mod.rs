//! User settings that actually affect execution.
//!
//! The desktop/web Settings panes are not decoration: everything here is read
//! by the server at the moment it matters. API keys and custom environment
//! variables are injected into every agent sub-process and shell execution;
//! the shell binary is used for `/api/exec`; the default agent/model seeds the
//! composer for a project that has no saved choice yet.
//!
//! Settings live outside any repository so they never leak into a worktree or
//! a commit: `$BARKCLI_HOME/settings.json`, or `~/.bark/settings.json`.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const SETTINGS_FILENAME: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
// `default` at the container level: a settings file written by an older build
// (or a partial PUT) must not reset every value just because one field is new.
#[serde(default, rename_all = "camelCase")]
pub struct GeneralSettings {
    /// `vscode` | `cursor` | `rider` | `sublime` | `terminal` | `finder`.
    pub default_editor: String,
    pub notifications: bool,
    pub auto_save: bool,
    pub telemetry: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            default_editor: "vscode".into(),
            notifications: true,
            auto_save: true,
            telemetry: false,
        }
    }
}

/// API credentials plus the default agent for new conversations.
///
/// Keys are stored locally and handed to agent sub-processes through their
/// conventional environment variables. They are never written into a board,
/// a thread event, or a worktree.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct ApiKeySettings {
    #[serde(default)]
    pub anthropic_key: String,
    #[serde(default)]
    pub openai_key: String,
    #[serde(default)]
    pub gemini_key: String,
    #[serde(default)]
    pub openrouter_key: String,
    #[serde(default = "default_ollama_endpoint")]
    pub ollama_endpoint: String,
    /// Provider id (e.g. `claude-code`, `opencode`) pre-selected in the composer.
    #[serde(default)]
    pub default_backend: String,
    /// Model pre-selected for [`default_backend`].
    #[serde(default)]
    pub default_model: String,
}

fn default_ollama_endpoint() -> String {
    "http://127.0.0.1:11434".into()
}

impl Default for ApiKeySettings {
    fn default() -> Self {
        Self {
            anthropic_key: String::new(),
            openai_key: String::new(),
            gemini_key: String::new(),
            openrouter_key: String::new(),
            ollama_endpoint: default_ollama_endpoint(),
            default_backend: String::new(),
            default_model: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub key: String,
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct TerminalSettings {
    pub shell: String,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f64,
    /// `block` | `bar` | `underline`.
    pub cursor_style: String,
    #[serde(default)]
    pub env_vars: Vec<EnvVar>,
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self {
            shell: "/bin/zsh".into(),
            font_family: "JetBrains Mono".into(),
            font_size: 13,
            line_height: 1.5,
            cursor_style: "block".into(),
            env_vars: vec![
                EnvVar {
                    key: "RUST_LOG".into(),
                    value: "info".into(),
                },
                EnvVar {
                    key: "COLORTERM".into(),
                    value: "truecolor".into(),
                },
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredSettings {
    #[serde(default)]
    pub general: GeneralSettings,
    #[serde(default)]
    pub api_keys: ApiKeySettings,
    #[serde(default)]
    pub terminal: TerminalSettings,
    /// Opaque MCP server list, kept in the shape the web client authored.
    #[serde(default)]
    pub mcp_servers: Vec<Value>,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings::default(),
            api_keys: ApiKeySettings::default(),
            terminal: TerminalSettings::default(),
            mcp_servers: Vec::new(),
        }
    }
}

impl StoredSettings {
    /// Normalize user input before it is stored or applied.
    pub fn sanitize(&mut self) {
        self.general.default_editor = self.general.default_editor.trim().to_lowercase();
        if !self.terminal.shell.trim().starts_with('/') {
            self.terminal.shell = TerminalSettings::default().shell;
        }
        self.terminal.shell = self.terminal.shell.trim().to_string();
        self.terminal.font_size = self.terminal.font_size.clamp(9, 24);
        if !(1.0..=2.4).contains(&self.terminal.line_height) {
            self.terminal.line_height = 1.5;
        }
        if !["block", "bar", "underline"].contains(&self.terminal.cursor_style.as_str()) {
            self.terminal.cursor_style = "block".into();
        }
        let mut seen: Vec<String> = Vec::new();
        let mut env: Vec<EnvVar> = Vec::new();
        for item in std::mem::take(&mut self.terminal.env_vars) {
            let key = normalize_env_key(&item.key);
            if key.is_empty() || seen.iter().any(|existing| existing == &key) {
                continue;
            }
            seen.push(key.clone());
            env.push(EnvVar {
                key,
                value: item.value,
            });
        }
        self.terminal.env_vars = env;
        self.api_keys.anthropic_key = self.api_keys.anthropic_key.trim().to_string();
        self.api_keys.openai_key = self.api_keys.openai_key.trim().to_string();
        self.api_keys.gemini_key = self.api_keys.gemini_key.trim().to_string();
        self.api_keys.openrouter_key = self.api_keys.openrouter_key.trim().to_string();
        self.api_keys.ollama_endpoint = self.api_keys.ollama_endpoint.trim().to_string();
        self.api_keys.default_backend = self.api_keys.default_backend.trim().to_string();
        self.api_keys.default_model = self.api_keys.default_model.trim().to_string();
    }

    /// Add or replace one credential. Used by the in-thread credential request
    /// flow, so a missing key can be supplied without leaving the conversation.
    pub fn set_secret(&mut self, key: &str, value: &str) {
        let key = normalize_env_key(key);
        if key.is_empty() {
            return;
        }
        let value = value.trim().to_string();
        // Known provider keys belong in their own field so the Keys pane shows
        // one entry, not a duplicate custom variable.
        let provider_key = match key.as_str() {
            "ANTHROPIC_API_KEY" => Some(&mut self.api_keys.anthropic_key),
            "OPENAI_API_KEY" => Some(&mut self.api_keys.openai_key),
            "GEMINI_API_KEY" | "GOOGLE_API_KEY" => Some(&mut self.api_keys.gemini_key),
            "OPENROUTER_API_KEY" => Some(&mut self.api_keys.openrouter_key),
            _ => None,
        };
        if let Some(field) = provider_key {
            *field = value;
            return;
        }
        if let Some(existing) = self
            .terminal
            .env_vars
            .iter_mut()
            .find(|item| item.key == key)
        {
            existing.value = value;
            return;
        }
        self.terminal.env_vars.push(EnvVar { key, value });
    }

    /// Environment handed to every agent sub-process and shell execution.
    ///
    /// Explicit environment variables win; API keys fill in only when the same
    /// variable is not already defined, so a project-level override survives.
    pub fn env_for_runs(&self) -> Vec<(String, String)> {
        let mut pairs: Vec<(String, String)> = self
            .terminal
            .env_vars
            .iter()
            .filter(|item| !item.key.trim().is_empty())
            .map(|item| (item.key.clone(), item.value.clone()))
            .collect();
        for (key, value) in [
            ("ANTHROPIC_API_KEY", &self.api_keys.anthropic_key),
            ("OPENAI_API_KEY", &self.api_keys.openai_key),
            ("GEMINI_API_KEY", &self.api_keys.gemini_key),
            ("OPENROUTER_API_KEY", &self.api_keys.openrouter_key),
        ] {
            if value.trim().is_empty() {
                continue;
            }
            if pairs.iter().any(|(existing, _)| existing == key) {
                continue;
            }
            pairs.push((key.to_string(), value.trim().to_string()));
        }
        pairs
    }

    /// `false` when a key is present, so the UI can show "Configured" without
    /// re-reading the value from storage.
    pub fn has_secret(&self, key: &str) -> bool {
        let key = normalize_env_key(key);
        self.env_for_runs()
            .iter()
            .any(|(existing, value)| existing == &key && !value.is_empty())
    }
}

pub fn normalize_env_key(value: &str) -> String {
    value
        .trim()
        .to_uppercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '_' { ch } else { '_' })
        .collect()
}

/// `$BARKCLI_HOME/settings.json`, else `~/.bark/settings.json`.
pub fn settings_path() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("BARKCLI_HOME").filter(|value| !value.is_empty()) {
        return Some(PathBuf::from(home).join(SETTINGS_FILENAME));
    }
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    Some(PathBuf::from(home).join(".bark").join(SETTINGS_FILENAME))
}

pub fn load() -> StoredSettings {
    match settings_path() {
        Some(path) => load_from(&path),
        None => StoredSettings::default(),
    }
}

pub fn load_from(path: &std::path::Path) -> StoredSettings {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return StoredSettings::default();
    };
    let mut settings: StoredSettings = serde_json::from_str(&raw).unwrap_or_default();
    settings.sanitize();
    settings
}

pub fn save(settings: &StoredSettings) -> Result<StoredSettings> {
    let path = settings_path().context("no home directory available for settings")?;
    save_to(&path, settings)
}

pub fn save_to(path: &std::path::Path, settings: &StoredSettings) -> Result<StoredSettings> {
    let mut settings = settings.clone();
    settings.sanitize();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }
    let body = serde_json::to_string_pretty(&settings)?;
    std::fs::write(path, body).with_context(|| format!("failed to write {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_keys_become_provider_environment_variables() {
        let mut settings = StoredSettings::default();
        settings.api_keys.anthropic_key = "sk-ant-1".into();
        settings.api_keys.openai_key = "sk-2".into();
        settings.api_keys.gemini_key = "AIza-3".into();
        settings.api_keys.openrouter_key = "sk-or-4".into();
        let env = settings.env_for_runs();
        for (key, value) in [
            ("ANTHROPIC_API_KEY", "sk-ant-1"),
            ("OPENAI_API_KEY", "sk-2"),
            ("GEMINI_API_KEY", "AIza-3"),
            ("OPENROUTER_API_KEY", "sk-or-4"),
        ] {
            assert!(
                env.iter().any(|(name, actual)| name == key && actual == value),
                "{key} missing from {env:?}"
            );
        }
    }

    #[test]
    fn empty_keys_are_not_injected() {
        let settings = StoredSettings::default();
        assert!(settings
            .env_for_runs()
            .iter()
            .all(|(key, _)| !key.ends_with("_API_KEY")));
    }

    #[test]
    fn explicit_env_var_wins_over_api_key() {
        let mut settings = StoredSettings::default();
        settings.api_keys.openai_key = "from-settings".into();
        settings.terminal.env_vars.push(EnvVar {
            key: "OPENAI_API_KEY".into(),
            value: "explicit".into(),
        });
        let env = settings.env_for_runs();
        let values: Vec<&str> = env
            .iter()
            .filter(|(key, _)| key == "OPENAI_API_KEY")
            .map(|(_, value)| value.as_str())
            .collect();
        assert_eq!(values, vec!["explicit"]);
    }

    #[test]
    fn set_secret_uses_the_provider_field_for_known_keys() {
        let mut settings = StoredSettings::default();
        settings.set_secret("openai api key", "sk-1");
        settings.set_secret("OPENAI_API_KEY", "sk-2");
        assert_eq!(settings.api_keys.openai_key, "sk-2");
        // ...so the Keys pane shows one entry, not a duplicate env var.
        assert!(settings
            .terminal
            .env_vars
            .iter()
            .all(|item| item.key != "OPENAI_API_KEY"));
        assert!(settings.has_secret("OPENAI_API_KEY"));
    }

    #[test]
    fn set_secret_stores_unknown_keys_as_environment_variables() {
        let mut settings = StoredSettings::default();
        settings.set_secret("custom token", "abc");
        assert_eq!(
            settings
                .terminal
                .env_vars
                .iter()
                .find(|item| item.key == "CUSTOM_TOKEN")
                .map(|item| item.value.as_str()),
            Some("abc")
        );
    }

    #[test]
    fn set_secret_normalizes_and_deduplicates() {
        let mut settings = StoredSettings::default();
        settings.set_secret("my token", "one");
        settings.set_secret("MY_TOKEN", "two");
        let matches = settings
            .terminal
            .env_vars
            .iter()
            .filter(|item| item.key == "MY_TOKEN")
            .count();
        assert_eq!(matches, 1);
        assert_eq!(
            settings
                .terminal
                .env_vars
                .iter()
                .find(|item| item.key == "MY_TOKEN")
                .map(|item| item.value.as_str()),
            Some("two")
        );
    }

    #[test]
    fn sanitize_clamps_and_normalizes() {
        let mut settings = StoredSettings::default();
        settings.terminal.env_vars = vec![EnvVar {
            key: "bad key!".into(),
            value: "1".into(),
        }];
        settings.terminal.font_size = 400;
        settings.terminal.shell = "zsh".into();
        settings.sanitize();
        assert_eq!(settings.terminal.env_vars[0].key, "BAD_KEY_");
        assert_eq!(settings.terminal.font_size, 24);
        assert_eq!(settings.terminal.shell, "/bin/zsh");
    }

    #[test]
    fn round_trips_through_json_with_camel_case_fields() {
        let mut settings = StoredSettings::default();
        settings.api_keys.default_backend = "claude-code".into();
        settings.general.default_editor = "cursor".into();
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("\"defaultBackend\""));
        assert!(json.contains("\"defaultEditor\""));
        assert!(json.contains("\"envVars\""));
        let back: StoredSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back, settings);
    }

    #[test]
    fn accepts_the_payload_the_web_client_sends() {
        // Mirrors `StoredSettings` in web/src/lib/appSettings.ts. If the two
        // shapes drift, Settings silently stops applying — so pin it here.
        let payload = serde_json::json!({
            "general": {
                "defaultEditor": "cursor",
                "notifications": false,
                "autoSave": true,
                "telemetry": false
            },
            "apiKeys": {
                "anthropicKey": "sk-ant-x",
                "openaiKey": "",
                "geminiKey": "",
                "openrouterKey": "",
                "ollamaEndpoint": "http://127.0.0.1:11434",
                "defaultBackend": "opencode",
                "defaultModel": "opencode/pulse-alpha-free"
            },
            "terminal": {
                "shell": "/bin/zsh",
                "fontFamily": "JetBrains Mono",
                "fontSize": 13,
                "lineHeight": 1.5,
                "cursorStyle": "bar",
                "envVars": [{ "key": "MY_TOKEN", "value": "abc" }]
            },
            "mcpServers": [{ "name": "local", "command": "node", "args": ["server.js"] }]
        });

        let settings: StoredSettings = serde_json::from_value(payload).unwrap();
        assert_eq!(settings.general.default_editor, "cursor");
        assert!(!settings.general.notifications);
        assert_eq!(settings.api_keys.default_backend, "opencode");
        assert_eq!(settings.api_keys.default_model, "opencode/pulse-alpha-free");
        assert_eq!(settings.terminal.cursor_style, "bar");
        assert!(settings.has_secret("MY_TOKEN"));
        assert!(settings.has_secret("ANTHROPIC_API_KEY"));
        assert_eq!(settings.mcp_servers.len(), 1);

        // and it serializes back into the same camelCase shape
        let back = serde_json::to_value(&settings).unwrap();
        assert_eq!(back["apiKeys"]["defaultBackend"], "opencode");
        assert_eq!(back["terminal"]["envVars"][0]["key"], "MY_TOKEN");
        assert_eq!(back["mcpServers"][0]["name"], "local");
    }

    #[test]
    fn accepts_a_partial_payload_without_losing_defaults() {
        let settings: StoredSettings = serde_json::from_value(serde_json::json!({
            "general": { "defaultEditor": "sublime" }
        }))
        .unwrap();
        assert_eq!(settings.general.default_editor, "sublime");
        assert_eq!(settings.terminal.shell, "/bin/zsh");
        assert_eq!(settings.api_keys.ollama_endpoint, "http://127.0.0.1:11434");
        assert_eq!(settings.api_keys.default_backend, "");
    }

    #[test]
    fn load_returns_defaults_when_no_file_exists() {
        let dir = std::env::temp_dir().join(format!("bark-settings-{}", uuid::Uuid::new_v4()));
        let settings = load_from(&dir.join("settings.json"));
        assert_eq!(settings.general.default_editor, "vscode");
        assert_eq!(settings.terminal.shell, "/bin/zsh");
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = std::env::temp_dir().join(format!("bark-settings-{}", uuid::Uuid::new_v4()));
        let path = dir.join("settings.json");
        let mut settings = StoredSettings::default();
        settings.set_secret("MY_TOKEN", "abc");
        save_to(&path, &settings).unwrap();
        let loaded = load_from(&path);
        assert!(loaded.has_secret("MY_TOKEN"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
