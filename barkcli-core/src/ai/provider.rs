use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;
use crate::storage::config_store::read_config;

/// AI provider configuration. Resolved in order:
/// 1. env: `BARKCLI_API_BASE`, `BARKCLI_MODEL`, `BARKCLI_API_KEY`
/// 2. `~/.board/config` lines: `BARKCLI_API_BASE=…`, `BARKCLI_MODEL=…`, `OPENAI_API_KEY=…`
/// 3. `.board/config.json` `ai` key (per project)
/// 4. defaults
#[derive(Debug, Clone)]
pub struct AiConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            base_url: "https://api.openai.com/v1".into(),
            model: "gpt-4o-mini".into(),
            api_key: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChatMessage,
}

/// Resolve config: env → user config → project config → defaults.
pub fn resolve_config() -> Result<AiConfig> {
    let mut cfg = AiConfig::default();

    // 1. ~/.board/config (user-level key/value lines)
    if let Some(home) = std::env::var_os("HOME") {
        let path = std::path::PathBuf::from(home).join(".board").join("config");
        if let Ok(content) = std::fs::read_to_string(&path) {
            for line in content.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    let v = v.trim().to_string();
                    match k.trim() {
                        "BARKCLI_API_BASE" | "AI_BASE_URL" => cfg.base_url = v,
                        "BARKCLI_MODEL" | "AI_MODEL" => cfg.model = v,
                        "OPENAI_API_KEY" | "BARKCLI_API_KEY" => cfg.api_key = Some(v),
                        _ => {}
                    }
                }
            }
        }
    }

    // 2. .board/config.json `ai` key (per project)
    if let Ok(board_dir) = find_board_dir() {
        if let Ok(project_cfg) = read_config(&board_dir) {
            if let Some(ai) = &project_cfg.ai {
                if !ai.base_url.is_empty() {
                    cfg.base_url = ai.base_url.clone();
                }
                if !ai.model.is_empty() {
                    cfg.model = ai.model.clone();
                }
            }
        }
    }

    // 3. env (highest priority)
    if let Ok(v) = std::env::var("BARKCLI_API_BASE") {
        if !v.is_empty() {
            cfg.base_url = v;
        }
    }
    if let Ok(v) = std::env::var("BARKCLI_MODEL") {
        if !v.is_empty() {
            cfg.model = v;
        }
    }
    if let Ok(v) = std::env::var("BARKCLI_API_KEY") {
        if !v.is_empty() {
            cfg.api_key = Some(v);
        }
    }

    // Ollama / local providers need no key; OpenAI-compatible gateways do.
    if cfg.base_url.contains("localhost") || cfg.base_url.contains("127.0.0.1") {
        if cfg.api_key.is_none() {
            cfg.api_key = Some("ollama".into());
        }
    }

    Ok(cfg)
}

/// `provider` name → base URL + default model (for `ai config set provider`).
pub fn provider_defaults(provider: &str) -> Result<(String, String)> {
    match provider {
        "openai" => Ok(("https://api.openai.com/v1".into(), "gpt-4o-mini".into())),
        "ollama" => Ok(("http://localhost:11434/v1".into(), "llama3.2".into())),
        "lmstudio" | "lm-studio" => Ok(("http://localhost:1234/v1".into(), "local-model".into())),
        "compatible" | "openai-compatible" | "gateway" => {
            anyhow::bail!("usage: barkcli ai config set base-url <url> model <name> (provider '{}' needs explicit base-url)", provider)
        }
        other => anyhow::bail!("unknown provider '{}' (openai | ollama | lmstudio)", other),
    }
}

/// Single chat completion turn. Returns the assistant message content.
pub fn chat(cfg: &AiConfig, messages: &[ChatMessage]) -> Result<String> {
    let key = cfg.api_key.as_deref().ok_or_else(|| {
        anyhow::anyhow!(
            "no API key configured.\n  export BARKCLI_API_KEY=...\n  or add OPENAI_API_KEY=... to ~/.board/config\n  or switch to a local provider: barkcli ai config set provider ollama"
        )
    })?;

    let req = ChatRequest {
        model: cfg.model.clone(),
        messages: messages.to_vec(),
        temperature: 0.7,
    };
    let body = serde_json::to_string(&req).context("serialize chat request")?;
    let url = format!("{}/chat/completions", cfg.base_url.trim_end_matches('/'));

    let resp = ureq::post(&url)
        .set("Authorization", &format!("Bearer {}", key))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .map_err(|e| anyhow::anyhow!("LLM request failed ({}): {}", cfg.base_url, e))?;

    let parsed: ChatResponse = resp
        .into_json()
        .map_err(|e| anyhow::anyhow!("LLM response parse error: {}", e))?;

    parsed
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| anyhow::anyhow!("LLM returned no choices"))
}

/// Chat + extract JSON from the response (best-effort: strips code fences).
pub fn chat_json<T: for<'de> Deserialize<'de>>(
    cfg: &AiConfig,
    messages: &[ChatMessage],
) -> Result<T> {
    let content = chat(cfg, messages)?;
    let stripped = strip_fences(&content);
    serde_json::from_str::<T>(&stripped)
        .map_err(|e| anyhow::anyhow!("LLM returned invalid JSON: {}\nRaw: {}", e, strip_fences(&content).chars().take(600).collect::<String>()))
}

fn strip_fences(s: &str) -> String {
    let t = s.trim();
    if let Some(rest) = t.strip_prefix("```") {
        if let Some(rest) = rest.split_once('\n') {
            return rest.1.trim().trim_end_matches("```").trim().to_string();
        }
        return t.trim_end_matches("```").trim().to_string();
    }
    t.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_json_fences() {
        assert_eq!(strip_fences("```json\n{\"a\": 1}\n```"), "{\"a\": 1}");
        assert_eq!(strip_fences("```\n{\"a\": 1}\n```"), "{\"a\": 1}");
        assert_eq!(strip_fences("{\"a\": 1}"), "{\"a\": 1}");
    }

    #[test]
    fn provider_defaults_map() {
        assert_eq!(provider_defaults("openai").unwrap(), ("https://api.openai.com/v1".into(), "gpt-4o-mini".into()));
        assert_eq!(provider_defaults("ollama").unwrap(), ("http://localhost:11434/v1".into(), "llama3.2".into()));
        assert!(provider_defaults("bogus").is_err());
    }
}
