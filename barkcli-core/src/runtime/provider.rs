use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use super::event::{RunOutcome, RuntimeEvent, StartRun};

/// Receives normalized events from a provider adapter.
pub type EventSink = Arc<dyn Fn(RuntimeEvent) + Send + Sync>;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderCapabilities {
    #[serde(default)]
    pub resume: bool,
    #[serde(default)]
    pub stream_json: bool,
    #[serde(default)]
    pub tool_events: bool,
    #[serde(default)]
    pub approvals: bool,
    #[serde(default)]
    pub questions: bool,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub usage: bool,
    #[serde(default)]
    pub skills: bool,
    #[serde(default)]
    pub mcp: bool,
    /// True when the adapter can start work without a terminal UI.
    #[serde(default)]
    pub headless: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub available: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// Real local credential state. `None` means the CLI does not expose a
    /// reliable status (or is not installed), not "ready".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authenticated: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_hint: Option<String>,
    pub capabilities: ProviderCapabilities,
}

pub trait ProviderAdapter: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn command(&self) -> &'static str;
    fn probe(&self) -> ProviderStatus;
    fn capabilities(&self) -> ProviderCapabilities;
    fn start(&self, req: StartRun, sink: EventSink) -> Result<Box<dyn RunHandle>>;
    /// Models the local CLI advertises. Empty means "the provider accepts a
    /// free-form model id" rather than inventing a list.
    fn models(&self) -> Vec<String> {
        Vec::new()
    }
}

pub trait RunHandle: Send {
    fn run_id(&self) -> &str;
    fn pid(&self) -> Option<u32> {
        None
    }
    fn send(&self, input: &str) -> Result<()>;
    fn steer(&self, text: &str) -> Result<()>;
    fn interrupt(&self) -> Result<()>;
    fn wait(self: Box<Self>) -> Result<RunOutcome>;
}

/// Registry of local providers available to the runtime.
pub struct ProviderRegistry {
    adapters: Vec<Arc<dyn ProviderAdapter>>,
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::standard()
    }
}

impl ProviderRegistry {
    pub fn new(adapters: Vec<Arc<dyn ProviderAdapter>>) -> Self {
        Self { adapters }
    }

    pub fn standard() -> Self {
        Self {
            adapters: vec![
                Arc::new(super::providers::OpencodeProvider::new()),
                Arc::new(super::providers::ClaudeProvider::new()),
                Arc::new(super::providers::CodexProvider::new()),
                Arc::new(super::providers::ProbeOnlyProvider::new(
                    "cursor",
                    "Cursor",
                    "cursor-agent",
                    Some("cursor-agent login"),
                    Some("Install Cursor and sign in; Bark detects `cursor-agent`."),
                    vec!["gpt-5".into(), "claude-sonnet-4-6".into(), "auto".into()],
                )),
                Arc::new(super::providers::ProbeOnlyProvider::new(
                    "grok-build",
                    "Grok Build",
                    "grok-build",
                    Some("grok auth login"),
                    Some("Install the Grok Build CLI and sign in."),
                    vec!["grok-4".into(), "grok-3".into()],
                )),
                Arc::new(super::providers::ProbeOnlyProvider::new(
                    "antigravity",
                    "Antigravity",
                    "antigravity",
                    Some("antigravity auth login"),
                    Some("Install the Antigravity CLI and sign in."),
                    vec!["default".into()],
                )),
                Arc::new(super::providers::ProbeOnlyProvider::new(
                    "kimi",
                    "Kimi Code",
                    "kimi",
                    Some("kimi auth login"),
                    Some("Install Kimi Code and sign in."),
                    vec!["kimi-k2".into(), "kimi-k2.5".into()],
                )),
                Arc::new(super::providers::ProbeOnlyProvider::new(
                    "muse-code",
                    "Muse Code",
                    "muse-code",
                    Some("muse auth login"),
                    Some("Install Muse Code and sign in."),
                    vec!["muse-1".into()],
                )),
                Arc::new(super::providers::HumanProvider::new()),
            ],
        }
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn ProviderAdapter>> {
        self.adapters
            .iter()
            .find(|adapter| adapter.id() == id)
            .cloned()
    }

    pub fn statuses(&self) -> Vec<ProviderStatus> {
        self.adapters.iter().map(|adapter| adapter.probe()).collect()
    }

    pub fn models(&self, id: &str) -> Option<Vec<String>> {
        let mut models = if let Some(adapter) = self.get(id) {
            adapter.models()
        } else if id == "ollama" {
            let settings = crate::settings::load();
            crate::ai::provider::probe_ollama(&settings.api_keys.ollama_endpoint).unwrap_or_default()
        } else {
            return None;
        };

        let settings = crate::settings::load();
        if let Some(cached) = settings.models.cached_models.get(id) {
            for m in cached {
                if !models.contains(m) {
                    models.push(m.clone());
                }
            }
        }
        if let Some(custom) = settings.models.custom_models.get(id) {
            for m in custom {
                if !models.contains(m) {
                    models.push(m.clone());
                }
            }
        }
        Some(models)
    }

    pub fn available(&self) -> Vec<ProviderStatus> {
        self.statuses()
            .into_iter()
            .filter(|status| status.available)
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelReport {
    pub id: String,
    pub name: String,
    pub available: bool,
    pub count: usize,
    pub models: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSyncReport {
    pub success: bool,
    pub synced_at: String,
    pub auto_sync: bool,
    pub total_models: usize,
    pub providers: Vec<ProviderModelReport>,
    pub custom_models: std::collections::HashMap<String, Vec<String>>,
}

pub fn get_model_sync_status() -> ModelSyncReport {
    let registry = ProviderRegistry::standard();
    let settings = crate::settings::load();
    let mut reports = Vec::new();
    let mut total_count = 0;

    for adapter in &registry.adapters {
        let id = adapter.id();
        let status = adapter.probe();
        let models = registry.models(id).unwrap_or_default();
        total_count += models.len();
        let source = if !super::providers::t3_cached_models(id).is_empty() {
            "T3 Bridge & Live Registry".to_string()
        } else if status.available {
            "Local CLI & Registry".to_string()
        } else {
            "Frontier Catalog".to_string()
        };
        reports.push(ProviderModelReport {
            id: id.to_string(),
            name: adapter.name().to_string(),
            available: status.available,
            count: models.len(),
            models,
            source,
        });
    }

    // Include Ollama if configured
    let ollama_models = registry.models("ollama").unwrap_or_default();
    let ollama_available = !ollama_models.is_empty();
    total_count += ollama_models.len();
    reports.push(ProviderModelReport {
        id: "ollama".to_string(),
        name: "Ollama (Local)".to_string(),
        available: ollama_available,
        count: ollama_models.len(),
        models: ollama_models,
        source: "Local Daemon (/api/tags)".to_string(),
    });

    ModelSyncReport {
        success: true,
        synced_at: settings.models.last_synced_at.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        auto_sync: settings.models.auto_sync,
        total_models: total_count,
        providers: reports,
        custom_models: settings.models.custom_models,
    }
}

pub fn sync_all_models() -> Result<ModelSyncReport> {
    let registry = ProviderRegistry::standard();
    let mut settings = crate::settings::load();
    let now = chrono::Utc::now().to_rfc3339();

    for adapter in &registry.adapters {
        let id = adapter.id();
        let mut discovered = adapter.models();
        for m in super::providers::t3_cached_models(id) {
            if !discovered.contains(&m) {
                discovered.push(m);
            }
        }
        if !discovered.is_empty() {
            settings.models.cached_models.insert(id.to_string(), discovered);
        }
    }

    // Probe Ollama if endpoint configured
    if !settings.api_keys.ollama_endpoint.trim().is_empty() {
        if let Ok(models) = crate::ai::provider::probe_ollama(&settings.api_keys.ollama_endpoint) {
            if !models.is_empty() {
                settings.models.cached_models.insert("ollama".to_string(), models);
            }
        }
    }

    settings.models.last_synced_at = Some(now);
    crate::settings::save(&settings)?;

    Ok(get_model_sync_status())
}

pub fn add_custom_model(provider_id: &str, model: &str) -> Result<Vec<String>> {
    let mut settings = crate::settings::load();
    let model = model.trim();
    if model.is_empty() {
        anyhow::bail!("model id cannot be empty");
    }
    let entry = settings.models.custom_models.entry(provider_id.to_string()).or_default();
    if !entry.contains(&model.to_string()) {
        entry.push(model.to_string());
    }
    crate::settings::save(&settings)?;
    let registry = ProviderRegistry::standard();
    Ok(registry.models(provider_id).unwrap_or_default())
}

pub fn remove_custom_model(provider_id: &str, model: &str) -> Result<Vec<String>> {
    let mut settings = crate::settings::load();
    let model = model.trim();
    if let Some(entry) = settings.models.custom_models.get_mut(provider_id) {
        entry.retain(|m| m != model);
    }
    crate::settings::save(&settings)?;
    let registry = ProviderRegistry::standard();
    Ok(registry.models(provider_id).unwrap_or_default())
}

pub fn set_auto_sync(enabled: bool) -> Result<bool> {
    let mut settings = crate::settings::load();
    settings.models.auto_sync = enabled;
    crate::settings::save(&settings)?;
    Ok(enabled)
}

/// Deterministic adapter used by tests and demos. It never touches the network.
pub struct FakeProvider;

impl FakeProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for FakeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for FakeProvider {
    fn id(&self) -> &'static str {
        "fake"
    }

    fn name(&self) -> &'static str {
        "Fake provider"
    }

    fn command(&self) -> &'static str {
        "fake"
    }

    fn probe(&self) -> ProviderStatus {
        ProviderStatus {
            id: self.id().to_string(),
            name: self.name().to_string(),
            available: true,
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            command: self.command().to_string(),
            detail: Some("Deterministic test provider".to_string()),
            authenticated: Some(true),
            auth_command: None,
            auth_hint: None,
            capabilities: self.capabilities(),
        }
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            resume: true,
            stream_json: true,
            tool_events: true,
            approvals: true,
            questions: true,
            fork: true,
            usage: true,
            skills: true,
            mcp: true,
            headless: true,
        }
    }

    fn start(&self, req: StartRun, sink: EventSink) -> Result<Box<dyn RunHandle>> {
        let run_id = req.run_id.clone();
        let interrupted = Arc::new(AtomicBool::new(false));
        let interrupted_clone = interrupted.clone();
        let model = req.model.clone();
        let cwd = req.cwd.clone();
        let join = thread::Builder::new()
            .name(format!("fake-provider-{run_id}"))
            .spawn(move || -> Result<RunOutcome> {
                sink(RuntimeEvent::Started {
                    provider: "fake".into(),
                    model: model.clone(),
                    cwd: cwd.clone(),
                });
                if interrupted_clone.load(Ordering::SeqCst) {
                    sink(RuntimeEvent::Interrupted);
                    return Ok(RunOutcome {
                        run_id: run_id.clone(),
                        exit_code: 130,
                        session_id: None,
                        interrupted: true,
                    });
                }
                if let Ok(relative) = std::env::var("BARKCLI_FAKE_WRITE") {
                    let relative_path = std::path::Path::new(&relative);
                    let safe = !relative_path.is_absolute()
                        && !relative_path.components().any(|component| {
                            matches!(component, std::path::Component::ParentDir)
                        });
                    if safe && !relative.trim().is_empty() {
                        let file = std::path::Path::new(&cwd).join(relative_path);
                        if let Some(parent) = file.parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        let content = std::env::var("BARKCLI_FAKE_CONTENT")
                            .unwrap_or_else(|_| "fake provider change\n".to_string());
                        std::fs::write(&file, content)?;
                        sink(RuntimeEvent::FileChange {
                            path: relative.clone(),
                            change: "modified".into(),
                            additions: 1,
                            deletions: 0,
                        });
                    }
                }
                sink(RuntimeEvent::Assistant {
                    text: "Fake provider received the task and is ready.".into(),
                    partial: false,
                });
                sink(RuntimeEvent::Usage {
                    input_tokens: 12,
                    output_tokens: 8,
                    cached_input_tokens: Some(0),
                    cost_usd: Some(0.0),
                });
                if interrupted_clone.load(Ordering::SeqCst) {
                    sink(RuntimeEvent::Interrupted);
                    return Ok(RunOutcome {
                        run_id: run_id.clone(),
                        exit_code: 130,
                        session_id: None,
                        interrupted: true,
                    });
                }
                sink(RuntimeEvent::Completed {
                    exit_code: 0,
                    session_id: Some(format!("fake-session-{run_id}")),
                });
                Ok(RunOutcome {
                    run_id: run_id.clone(),
                    exit_code: 0,
                    session_id: Some(format!("fake-session-{run_id}")),
                    interrupted: false,
                })
            })
            .map_err(|e| anyhow!("failed to spawn fake provider: {e}"))?;

        Ok(Box::new(FakeHandle {
            run_id: req.run_id,
            interrupted,
            join: Some(join),
        }))
    }
}

struct FakeHandle {
    run_id: String,
    interrupted: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<Result<RunOutcome>>>,
}

impl RunHandle for FakeHandle {
    fn run_id(&self) -> &str {
        &self.run_id
    }

    fn send(&self, _input: &str) -> Result<()> {
        Ok(())
    }

    fn steer(&self, _text: &str) -> Result<()> {
        Ok(())
    }

    fn interrupt(&self) -> Result<()> {
        self.interrupted.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn wait(mut self: Box<Self>) -> Result<RunOutcome> {
        match self.join.take() {
            Some(join) => join
                .join()
                .map_err(|_| anyhow!("fake provider thread panicked"))?,
            None => Err(anyhow!("fake provider already waited")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start_run() -> StartRun {
        StartRun {
            run_id: "run_test".into(),
            thread_id: "card".into(),
            card_id: "card".into(),
            prompt: "hello".into(),
            cwd: "/tmp".into(),
            provider: "fake".into(),
            model: None,
            role: None,
            agent_id: None,
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        }
    }

    #[test]
    fn fake_provider_streams_and_completes() {
        let provider = FakeProvider::new();
        let events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink_events = events.clone();
        let sink: EventSink = Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        });
        let handle = provider.start(start_run(), sink).unwrap();
        let outcome = handle.wait().unwrap();
        assert_eq!(outcome.exit_code, 0);
        let events = events.lock().unwrap();
        assert!(matches!(events.first(), Some(RuntimeEvent::Started { .. })));
        assert!(matches!(events.last(), Some(RuntimeEvent::Completed { .. })));
    }

    #[test]
    fn standard_registry_has_core_providers() {
        let registry = ProviderRegistry::standard();
        for id in ["opencode", "claude-code", "codex", "human"] {
            assert!(registry.get(id).is_some(), "missing provider {id}");
        }
        assert!(
            registry.get("fake").is_none(),
            "the fake provider must never ship in the standard registry"
        );
    }
}
