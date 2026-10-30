use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{bail, Context, Result};

use super::contribution::ContributionIndex;
use super::event::{RunRecord, RuntimeEvent, StartRun};
use crate::threads::{
    append_event_to_dir, append_event_to_dir_returning, read_events_from_dir, ThreadEvent,
    ThreadEventKind,
};

/// Local, append-only storage for runs. Thread events remain in
/// `.board/threads/`; runs add the attempt-level record.
#[derive(Debug, Clone)]
pub struct RuntimeStore {
    board_dir: PathBuf,
}

impl RuntimeStore {
    pub fn new(board_dir: impl Into<PathBuf>) -> Self {
        let board_dir = board_dir.into();
        let _ = create_dir_all(board_dir.join("runs"));
        let _ = create_dir_all(board_dir.join("threads"));
        Self { board_dir }
    }

    pub fn from_project() -> Result<Self> {
        let board_dir = crate::storage::board_dir::find_board_dir()?;
        Ok(Self::new(board_dir))
    }

    pub fn board_dir(&self) -> &Path {
        &self.board_dir
    }

    pub fn runs_dir(&self) -> PathBuf {
        self.board_dir.join("runs")
    }

    pub fn run_path(&self, run_id: &str) -> PathBuf {
        self.runs_dir().join(format!("{run_id}.json"))
    }

    pub fn raw_log_path(&self, run_id: &str) -> PathBuf {
        self.runs_dir().join(run_id).join("raw.log")
    }

    pub fn thread_dir(&self) -> PathBuf {
        self.board_dir.join("threads")
    }

    pub fn save_run(&self, run: &RunRecord) -> Result<()> {
        create_dir_all(self.runs_dir())?;
        let path = self.run_path(&run.id);
        crate::util::lock::with_lock(&path, || {
            let json = serde_json::to_string_pretty(run)?;
            let tmp = path.with_extension("json.tmp");
            std::fs::write(&tmp, json).context("failed to write run temp file")?;
            std::fs::rename(&tmp, &path).context("failed to commit run file")?;
            Ok(())
        })
    }

    pub fn load_run(&self, run_id: &str) -> Result<RunRecord> {
        let path = self.run_path(run_id);
        let json = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        Ok(serde_json::from_str(&json)?)
    }

    pub fn list_runs(&self, thread_id: Option<&str>) -> Result<Vec<RunRecord>> {
        let dir = self.runs_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut runs = Vec::new();
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Ok(json) = std::fs::read_to_string(&path) else {
                continue;
            };
            let Ok(run) = serde_json::from_str::<RunRecord>(&json) else {
                continue;
            };
            if thread_id.map_or(true, |id| run.thread_id == id) {
                runs.push(run);
            }
        }
        runs.sort_by(|a, b| a.started_at.cmp(&b.started_at));
        Ok(runs)
    }

    /// Add a contribution edge. Edges are append-only and cycle-checked.
    pub fn link_run(&self, child_id: &str, parent_id: &str) -> Result<RunRecord> {
        if child_id == parent_id {
            bail!("a contribution cannot be its own parent");
        }
        let _parent = self.load_run(parent_id)?;
        let mut child = self.load_run(child_id)?;
        let index = self.contribution_index()?;
        if index.is_ancestor(child_id, parent_id) {
            bail!("linking {child_id} to {parent_id} would create a cycle");
        }
        child.add_parent(parent_id)?;
        self.save_run(&child)?;
        Ok(child)
    }

    /// Record an independent reproduction. Self-verification is rejected by
    /// `RunRecord::add_verification`; the thread gets a review event as well.
    pub fn verify_run(
        &self,
        run_id: &str,
        verifier: &str,
        passed: bool,
        note: Option<String>,
    ) -> Result<RunRecord> {
        let mut run = self.load_run(run_id)?;
        run.add_verification(verifier, passed, note.clone())?;
        self.save_run(&run)?;
        let mut event = ThreadEvent::new(
            &run.card_id,
            ThreadEventKind::Review,
            verifier,
            if passed {
                format!("Independent verification passed for run {}", run.id)
            } else {
                format!("Independent verification failed for run {}", run.id)
            },
            Some(serde_json::json!({
                "run_id": run.id,
                "verifier": verifier,
                "passed": passed,
                "note": note,
                "kind": "verification",
            })),
        );
        event.thread_id = Some(run.thread_id.clone());
        event.run_id = Some(run.id.clone());
        let _ = append_event_to_dir(&self.thread_dir(), &run.card_id, &event);
        Ok(run)
    }

    pub fn contribution_index(&self) -> Result<ContributionIndex> {
        Ok(ContributionIndex::from_runs(&self.list_runs(None)?))
    }

    pub fn next_ordinal(&self, thread_id: &str) -> Result<u32> {
        Ok(self
            .list_runs(Some(thread_id))?
            .iter()
            .map(|run| run.ordinal)
            .max()
            .unwrap_or(0)
            + 1)
    }

    /// Persist a new run before the provider starts.
    pub fn create_run(&self, start: &StartRun) -> Result<RunRecord> {
        let mut run = RunRecord::new(start);
        run.ordinal = self.next_ordinal(&run.thread_id)?;
        self.save_run(&run)?;
        Ok(run)
    }

    pub fn next_seq(&self, card_id: &str) -> Result<u64> {
        Ok(read_events_from_dir(&self.thread_dir(), card_id)?
            .iter()
            .map(|event| event.seq)
            .max()
            .unwrap_or(0)
            + 1)
    }

    /// Append a normalized runtime event and update the run projection.
    pub fn record(&self, run: &mut RunRecord, mut event: RuntimeEvent) -> Result<ThreadEvent> {
        let _projection = crate::util::lock::FileLock::acquire(&self.run_path(&run.id).with_extension("projection"))?;
        if let Ok(current) = self.load_run(&run.id) {
            if matches!(current.status, super::event::RunStatus::Interrupted | super::event::RunStatus::Cancelled) {
                *run = current;
                if matches!(event, RuntimeEvent::Completed { .. } | RuntimeEvent::Failed { .. } | RuntimeEvent::Gate { .. } | RuntimeEvent::Status { .. } | RuntimeEvent::Started { .. }) {
                    event = RuntimeEvent::Log { level: "info".into(), message: format!("After stop: {}", event.summary()) };
                }
            }
        }
        run.apply(&event);
        let author = run
            .agent_id
            .clone()
            .or_else(|| run.role.clone())
            .unwrap_or_else(|| run.provider.clone());
        let mut thread_event = event.to_thread_event(&run.card_id, &run.id, &author);
        thread_event.thread_id = Some(run.thread_id.clone());
        let thread_event =
            append_event_to_dir_returning(&self.thread_dir(), &run.card_id, &thread_event)?;
        self.save_run(run)?;
        Ok(thread_event)
    }

    pub fn read_thread_events(&self, card_id: &str) -> Result<Vec<ThreadEvent>> {
        read_events_from_dir(&self.thread_dir(), card_id)
    }

    /// Build a recorder that can be shared with a provider event sink.
    pub fn recorder(&self, run: RunRecord) -> Arc<RunRecorder> {
        Arc::new(RunRecorder {
            store: self.clone(),
            run: Mutex::new(run),
        })
    }

    /// Store raw provider output for debugging. Best-effort.
    pub fn append_raw_log(&self, run_id: &str, line: &str) {
        let path = self.raw_log_path(run_id);
        if let Some(parent) = path.parent() {
            let _ = create_dir_all(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{line}");
        }
    }

    pub fn gate_log_path(&self, run_id: &str) -> PathBuf {
        self.runs_dir().join(run_id).join("gate.log")
    }

    pub fn write_gate_log(&self, run_id: &str, content: &str) -> Result<PathBuf> {
        let path = self.gate_log_path(run_id);
        if let Some(parent) = path.parent() {
            create_dir_all(parent)?;
        }
        std::fs::write(&path, content)?;
        Ok(path)
    }

    pub fn status_event(status: &str, message: impl Into<String>) -> RuntimeEvent {
        RuntimeEvent::Status {
            status: status.to_string(),
            message: Some(message.into()),
        }
    }

    /// Human/checkpoint event helper so callers do not construct raw
    /// ThreadEventKind values by hand.
    pub fn note(&self, card_id: &str, text: impl Into<String>) -> Result<ThreadEvent> {
        let event = ThreadEvent::new(card_id, ThreadEventKind::Log, "barkcli", text, None);
        append_event_to_dir(&self.thread_dir(), card_id, &event)?;
        self.read_thread_events(card_id)?
            .into_iter()
            .last()
            .context("event was not persisted")
    }
}

/// Shared run recorder used by provider sinks.
pub struct RunRecorder {
    store: RuntimeStore,
    run: Mutex<RunRecord>,
}

impl RunRecorder {
    pub fn record(&self, event: RuntimeEvent) -> Result<ThreadEvent> {
        let mut run = self.run.lock().expect("run recorder poisoned");
        self.store.record(&mut run, event)
    }

    pub fn snapshot(&self) -> RunRecord {
        self.run.lock().expect("run recorder poisoned").clone()
    }

    /// Apply non-event fields such as worktree, pid, and head SHA.
    pub fn update<F>(&self, update: F) -> Result<RunRecord>
    where
        F: FnOnce(&mut RunRecord),
    {
        let mut run = self.run.lock().expect("run recorder poisoned");
        update(&mut run);
        self.store.save_run(&run)?;
        Ok(run.clone())
    }

    pub fn store(&self) -> &RuntimeStore {
        &self.store
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::event::RunStatus;

    fn temp_board() -> PathBuf {
        std::env::temp_dir().join(format!("bark_runtime_{}", uuid::Uuid::new_v4()))
    }

    fn start() -> StartRun {
        StartRun {
            run_id: format!("run_{}", uuid::Uuid::new_v4()),
            thread_id: "card-1".into(),
            card_id: "card-1".into(),
            prompt: "hello".into(),
            cwd: "/tmp".into(),
            provider: "fake".into(),
            model: None,
            role: Some("builder".into()),
            agent_id: Some("builder-1".into()),
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        }
    }

    #[test]
    fn creates_ordinals_and_persists_runs() {
        let dir = temp_board();
        let store = RuntimeStore::new(&dir);
        let first = store.create_run(&start()).unwrap();
        let second = store.create_run(&start()).unwrap();
        assert_eq!(first.ordinal, 1);
        assert_eq!(second.ordinal, 2);
        assert_eq!(store.list_runs(Some("card-1")).unwrap().len(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn record_updates_run_and_appends_thread_event() {
        let dir = temp_board();
        let store = RuntimeStore::new(&dir);
        let mut run = store.create_run(&start()).unwrap();
        let event = store
            .record(
                &mut run,
                RuntimeEvent::Started {
                    provider: "fake".into(),
                    model: None,
                    cwd: "/tmp".into(),
                },
            )
            .unwrap();
        assert_eq!(run.status, RunStatus::Running);
        assert_eq!(event.seq, 1);
        assert_eq!(event.run_id.as_deref(), Some(run.id.as_str()));
        let events = store.read_thread_events("card-1").unwrap();
        assert_eq!(events.len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn contribution_links_are_cycle_checked_and_verifiable() {
        let dir = temp_board();
        let store = RuntimeStore::new(&dir);
        let mut first = start();
        first.run_id = "run_a".into();
        first.agent_id = Some("agent-a".into());
        let mut second = start();
        second.run_id = "run_b".into();
        second.agent_id = Some("agent-b".into());
        store.create_run(&first).unwrap();
        store.create_run(&second).unwrap();

        let linked = store.link_run("run_b", "run_a").unwrap();
        assert_eq!(linked.effective_parents(), vec!["run_a"]);
        assert!(store.link_run("run_a", "run_b").is_err());

        assert!(store
            .verify_run("run_a", "agent-a", true, None)
            .is_err());
        let verified = store
            .verify_run("run_a", "agent-b", true, Some("reproduced".into()))
            .unwrap();
        assert_eq!(verified.independent_verifications(), 1);

        let index = store.contribution_index().unwrap();
        assert_eq!(index.ancestry("run_b").len(), 2);
        assert!(index.node("run_a").unwrap().verified);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn next_seq_is_monotonic() {
        let dir = temp_board();
        let store = RuntimeStore::new(&dir);
        let mut run = store.create_run(&start()).unwrap();
        store
            .record(
                &mut run,
                RuntimeEvent::Assistant {
                    text: "one".into(),
                    partial: false,
                },
            )
            .unwrap();
        store
            .record(
                &mut run,
                RuntimeEvent::Assistant {
                    text: "two".into(),
                    partial: false,
                },
            )
            .unwrap();
        assert_eq!(store.next_seq("card-1").unwrap(), 3);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
