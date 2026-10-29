//! M1 vertical slice: a provider run gets an isolated worktree, commits its
//! output, passes the project gate, exposes a diff, and merges only after
//! human approval.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use barkcli_core::models::board::Board;
use barkcli_core::runtime::event::{RunOutcome, RunStatus, RuntimeEvent, StartRun};
use barkcli_core::runtime::provider::{
    EventSink, ProviderAdapter, ProviderCapabilities, ProviderStatus, RunHandle,
};
use barkcli_core::runtime::{
    CreateRunRequest, ProviderRegistry, RunService, RuntimeService, RuntimeStore,
};
use barkcli_core::storage::board_file::{read_board, write_board};

static SERIAL: Mutex<()> = Mutex::new(());

struct ScriptProvider;

struct ScriptHandle {
    run_id: String,
    join: Option<thread::JoinHandle<anyhow::Result<RunOutcome>>>,
}

impl RunHandle for ScriptHandle {
    fn run_id(&self) -> &str {
        &self.run_id
    }

    fn send(&self, _input: &str) -> anyhow::Result<()> {
        Ok(())
    }

    fn steer(&self, _text: &str) -> anyhow::Result<()> {
        Ok(())
    }

    fn interrupt(&self) -> anyhow::Result<()> {
        Ok(())
    }

    fn wait(mut self: Box<Self>) -> anyhow::Result<RunOutcome> {
        let handle = self.join.take().expect("script provider joined twice");
        handle
            .join()
            .map_err(|_| anyhow::anyhow!("script provider panicked"))?
    }
}

impl ProviderAdapter for ScriptProvider {
    fn id(&self) -> &'static str {
        "script"
    }

    fn name(&self) -> &'static str {
        "Script provider"
    }

    fn command(&self) -> &'static str {
        "script"
    }

    fn probe(&self) -> ProviderStatus {
        ProviderStatus {
            id: self.id().into(),
            name: self.name().into(),
            available: true,
            version: None,
            command: self.command().into(),
            detail: None,
            authenticated: Some(true),
            auth_command: None,
            auth_hint: None,
            capabilities: self.capabilities(),
        }
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            stream_json: true,
            headless: true,
            usage: true,
            ..Default::default()
        }
    }

    fn start(&self, req: StartRun, sink: EventSink) -> anyhow::Result<Box<dyn RunHandle>> {
        anyhow::ensure!(
            req.raw_log_path.is_some(),
            "run service must provide a raw provider log path"
        );
        let api_stop = Arc::new(AtomicBool::new(false));
        let stop = api_stop.clone();
        let run_id = req.run_id.clone();
        let session_id = format!("script-session-{run_id}");
        let cwd = PathBuf::from(&req.cwd);
        let join = thread::spawn(move || -> anyhow::Result<RunOutcome> {
            sink(RuntimeEvent::Started {
                provider: "script".into(),
                model: None,
                cwd: cwd.to_string_lossy().to_string(),
            });
            sink(RuntimeEvent::Assistant {
                text: "Writing the feature and its test evidence.".into(),
                partial: false,
            });
            std::fs::write(
                cwd.join("feature.js"),
                "module.exports = function feature() { return 'shipped'; };\n",
            )?;
            std::fs::write(
                cwd.join("test.js"),
                "const feature = require('./feature.js');\n\
                 if (feature() !== 'shipped') { console.error('broken'); process.exit(1); }\n\
                 console.log('feature gate passes');\n",
            )?;
            sink(RuntimeEvent::ToolCall {
                name: "write_file".into(),
                input: serde_json::json!({ "path": "feature.js" }),
                output: None,
                status: "completed".into(),
            });
            sink(RuntimeEvent::FileChange {
                path: "feature.js".into(),
                change: "added".into(),
                additions: 1,
                deletions: 0,
            });
            sink(RuntimeEvent::Usage {
                input_tokens: 31,
                output_tokens: 12,
                cached_input_tokens: Some(10),
                cost_usd: Some(0.001),
            });
            if stop.load(Ordering::SeqCst) {
                sink(RuntimeEvent::Interrupted);
                return Ok(RunOutcome {
                    run_id,
                    exit_code: 130,
                    session_id: Some(session_id),
                    interrupted: true,
                });
            }
            sink(RuntimeEvent::Completed {
                exit_code: 0,
                session_id: Some(session_id.clone()),
            });
            Ok(RunOutcome {
                run_id,
                exit_code: 0,
                session_id: Some(session_id),
                interrupted: false,
            })
        });
        Ok(Box::new(ScriptHandle {
            run_id: req.run_id,
            join: Some(join),
        }))
    }
}

fn unique_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "bark_runtime_run_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(root.join(".board")).unwrap();
    root
}

fn git(root: &Path, args: &[&str]) -> String {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn wait_for_terminal(store: &RuntimeStore, run_id: &str) -> barkcli_core::runtime::event::RunRecord {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let run = store.load_run(run_id).unwrap();
        if run.status.is_terminal() {
            return run;
        }
        assert!(Instant::now() < deadline, "run never became terminal: {run:?}");
        thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn run_gets_worktree_diff_gate_and_human_merge() {
    let _serial = SERIAL.lock().unwrap();
    let root = unique_root();
    std::fs::write(
        root.join("package.json"),
        r#"{ "name": "runtime-demo", "version": "1.0.0", "scripts": { "test": "node test.js" } }"#,
    )
    .unwrap();
    std::fs::write(root.join("test.js"), "console.log('seed');").unwrap();
    std::fs::write(root.join(".gitignore"), ".board/\n").unwrap();
    git(&root, &["init", "-b", "main"]);
    git(&root, &["config", "user.name", "Runtime Test"]);
    git(&root, &["config", "user.email", "runtime@test.local"]);
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-m", "seed"]);

    std::env::set_current_dir(&root).unwrap();
    let mut board = Board::new("runtime-board");
    let mut card = barkcli_core::models::Card::new(
        "ship-feature",
        "Ship a feature module",
        "todo",
    );
    card.description = Some("Add the feature module and keep the test green.".into());
    card.acceptance_criteria = vec!["the gate passes".into()];
    board.cards.push(card);
    write_board("runtime-board", &board).unwrap();

    let store = RuntimeStore::new(root.join(".board"));
    let runtime = RuntimeService::new(
        store.clone(),
        ProviderRegistry::new(vec![Arc::new(ScriptProvider)]),
    );
    let service = RunService::with_runtime("runtime-board", runtime);

    let run = service
        .start_for_card(
            "ship-feature",
            CreateRunRequest {
                provider: Some("script".into()),
                prompt: Some("Keep it small.".into()),
                test_cmd: Some("node test.js".into()),
                ..Default::default()
            },
            None,
        )
        .unwrap();

    assert!(run.worktree.is_some(), "run must start in a managed worktree");
    assert!(run.branch.as_deref().unwrap().starts_with("bark/"));

    let finished = wait_for_terminal(&store, &run.id);
    assert_eq!(
        finished.status,
        RunStatus::Passed,
        "gate should pass: {finished:?}"
    );
    assert!(finished.gate.as_ref().unwrap().passed);
    assert_eq!(finished.diff_stats.files, 2, "feature.js and test.js changed");
    let manifest_id = finished
        .context_manifest_id
        .clone()
        .expect("run should carry a context manifest");
    let pack = barkcli_core::context::ContextStore::new(root.join(".board"))
        .load_pack(&manifest_id)
        .expect("context pack should be persisted");
    assert!(pack.prompt.contains("Ship a feature module"));
    assert!(pack.manifest.files.iter().any(|file| file.path == "package.json"));

    let worktree = PathBuf::from(finished.worktree.as_deref().unwrap());
    assert!(worktree.exists(), "worktree remains for review");
    let branch_log = git(&worktree, &["log", "--oneline"]);
    assert!(
        branch_log.contains("bark(run):"),
        "agent changes must be committed, got: {branch_log}"
    );

    let diff = service.diff(&run.id).unwrap();
    assert!(diff.diff.contains("feature.js"));
    assert!(diff.diff.contains("shipped"));

    let events = store.read_thread_events("ship-feature").unwrap();
    for kind in [
        "context_compiled",
        "run_started",
        "assistant",
        "tool_call",
        "file_change",
        "diff",
        "gate",
        "run_completed",
    ] {
        assert!(
            events.iter().any(|event| event.kind.as_str() == kind),
            "missing {kind} in thread events: {:?}",
            events.iter().map(|event| &event.kind).collect::<Vec<_>>()
        );
    }
    let seqs = events.iter().map(|event| event.seq).collect::<Vec<_>>();
    assert!(
        seqs.windows(2).all(|pair| pair[0] < pair[1]),
        "thread seq must be monotonic: {seqs:?}"
    );

    // A run that has not been approved cannot merge.
    let unapproved = service.merge(&run.id, false);
    assert!(unapproved.is_err(), "merge must require human approval");

    let merged = service.merge(&run.id, true).unwrap();
    assert_eq!(merged.run.status, RunStatus::Merged);
    assert!(!worktree.exists(), "worktree released after merge");
    assert!(
        root.join("feature.js").exists(),
        "merged branch content is on main"
    );
    let card = read_board("runtime-board")
        .unwrap()
        .cards
        .into_iter()
        .find(|card| card.id == "ship-feature")
        .unwrap();
    assert_eq!(card.column, "done");

    let _ = std::fs::remove_dir_all(&root);
}
