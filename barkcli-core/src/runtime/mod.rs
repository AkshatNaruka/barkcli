pub mod chat;
pub mod event;
pub mod provider;
pub mod providers;
pub mod runner;
pub mod store;

use std::sync::Arc;

use anyhow::{anyhow, Result};

pub use event::{
    GateSummary, RunDiffStats, RunOutcome, RunRecord, RunStatus, RunUsage, RuntimeEvent, StartRun,
};
pub use chat::{ChatRequest, ChatSession, PreparedChat};
pub use provider::{
    EventSink, FakeProvider, ProviderAdapter, ProviderCapabilities, ProviderRegistry, ProviderStatus,
    RunHandle,
};
pub use runner::{CreateRunRequest, MergeOutcome, RunDiff, RunService};
pub use store::{RunRecorder, RuntimeStore};

use crate::threads::ThreadEvent;

/// Optional callback used by the server to broadcast persisted thread events.
pub type ThreadSink = Arc<dyn Fn(ThreadEvent) + Send + Sync>;

/// A run whose provider process is live. The recorder owns the run projection.
pub struct StartedRun {
    pub run: RunRecord,
    pub recorder: Arc<RunRecorder>,
    pub handle: Box<dyn RunHandle>,
}

/// High-level entry point shared by the CLI, server, and tests.
pub struct RuntimeService {
    store: RuntimeStore,
    registry: ProviderRegistry,
}

impl RuntimeService {
    pub fn new(store: RuntimeStore, registry: ProviderRegistry) -> Self {
        Self { store, registry }
    }

    pub fn from_project() -> Result<Self> {
        Ok(Self {
            store: RuntimeStore::from_project()?,
            registry: ProviderRegistry::standard(),
        })
    }

    pub fn store(&self) -> &RuntimeStore {
        &self.store
    }

    pub fn registry(&self) -> &ProviderRegistry {
        &self.registry
    }

    pub fn providers(&self) -> Vec<ProviderStatus> {
        self.registry.statuses()
    }

    /// Persist the run, wire the recorder into the provider sink, and start.
    pub fn start(
        &self,
        mut start: StartRun,
        extra_sink: Option<ThreadSink>,
    ) -> Result<(RunRecord, Box<dyn RunHandle>)> {
        if start.raw_log_path.is_none() {
            start.raw_log_path = Some(
                self.store
                    .raw_log_path(&start.run_id)
                    .to_string_lossy()
                    .to_string(),
            );
        }
        let run = self.store.create_run(&start)?;
        let started = self.start_existing(run, start, extra_sink)?;
        Ok((started.run, started.handle))
    }

    /// Start a run that was already persisted with worktree/branch/base SHA.
    pub fn start_existing(
        &self,
        run: RunRecord,
        start: StartRun,
        extra_sink: Option<ThreadSink>,
    ) -> Result<StartedRun> {
        let provider = self
            .registry
            .get(&start.provider)
            .ok_or_else(|| anyhow!("unknown provider: {}", start.provider))?;
        let recorder = self.store.recorder(run.clone());
        let recorder_for_sink = recorder.clone();
        let sink: EventSink = Arc::new(move |event| {
            match recorder_for_sink.record(event) {
                Ok(thread_event) => {
                    if let Some(extra) = &extra_sink {
                        extra(thread_event);
                    }
                }
                Err(error) => {
                    eprintln!("bark runtime: failed to record event: {error}");
                }
            }
        });

        match provider.start(start, sink) {
            Ok(handle) => Ok(StartedRun {
                run,
                recorder,
                handle,
            }),
            Err(error) => {
                let mut failed = run;
                let _ = self.store.record(
                    &mut failed,
                    RuntimeEvent::Failed {
                        message: error.to_string(),
                        exit_code: None,
                    },
                );
                Err(error)
            }
        }
    }

    pub fn record_human_event(
        &self,
        run: &mut RunRecord,
        event: RuntimeEvent,
    ) -> Result<ThreadEvent> {
        self.store.record(run, event)
    }
}
