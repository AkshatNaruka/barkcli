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
        self.get(id).map(|adapter| adapter.models())
    }

    pub fn available(&self) -> Vec<ProviderStatus> {
        self.statuses()
            .into_iter()
            .filter(|status| status.available)
            .collect()
    }
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
