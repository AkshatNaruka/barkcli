//! Provider-agnostic LLM layer.
//!
//! One OpenAI-compatible Chat Completions code path works with OpenAI, Ollama
//! (`http://localhost:11434/v1`), LM Studio, or any compatible gateway.
//! Config resolution order: env → `~/.board/config` → `.board/config.json` ai
//! key → defaults. Local-first: `barkcli ai config` can switch to Ollama with
//! no API key.

pub mod provider;

pub use provider::{resolve_config, AiConfig, ChatMessage, chat, chat_json};

/// Sanitize model names / base URLs for display.
pub fn describe(config: &AiConfig) -> String {
    format!("{} @ {}", config.model, config.base_url)
}
