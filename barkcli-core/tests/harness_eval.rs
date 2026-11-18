//! Harness eval suite (plan H12).
//!
//! Each case is an *intent × stub backend × expected transition*: a scripted
//! agent, a fixed repo, and an assertion on what the harness did (merge,
//! retry, veto, spend cap, packet budget). No LLM is involved, so the whole
//! suite is deterministic and runs in CI.
//!
//! `cargo test --test harness_eval` is the harness's regression net: every
//! phase-2/3 behaviour that could silently regress (verdict injection,
//! checkpoint reset, verifier separation, budget ceiling, packet trimming) is
//! pinned here rather than in prose.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use barkcli_core::commands::run_cmd::{run, RunOptions};
use barkcli_core::models::board::Board;
use barkcli_core::models::card::Card;
use barkcli_core::models::config::{
    BudgetSettings, Config, HarnessHook, HookFailure, VerifySettings,
};
use barkcli_core::storage::board_file::write_board;
use barkcli_core::storage::config_store::write_config;

/// CWD + env are process-wide; run one scenario at a time.
static SERIAL: Mutex<()> = Mutex::new(());

const CARD_ID: &str = "eval-card";

struct Scenario {
    root: PathBuf,
}

impl Scenario {
    /// Seed a tiny git repo with one board, one card and an agent script.
    fn new(tag: &str, agent: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "bark_eval_{}_{}",
            tag,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join(".board")).unwrap();

        std::fs::write(
            root.join("package.json"),
            r#"{ "name": "eval-demo", "scripts": { "test": "node test.js" } }"#,
        )
        .unwrap();
        std::fs::write(root.join("test.js"), "console.log(\"seed\");\n").unwrap();
        std::fs::write(root.join("fake-agent.sh"), agent).unwrap();
        let mut perms = std::fs::metadata(root.join("fake-agent.sh"))
            .unwrap()
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(root.join("fake-agent.sh"), perms).unwrap();

        git(&root, &["init", "-b", "main"]);
        git(&root, &["config", "user.name", "Eval"]);
        git(&root, &["config", "user.email", "eval@test.local"]);
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-m", "seed"]);

        let mut board = Board::new("eval-board");
        let mut card = Card::new(CARD_ID, "Eval the harness", "todo");
        card.description = Some("One deterministic task for the eval suite".into());
        card.acceptance_criteria = vec!["The change is gated and merged".into()];
        board.cards.push(card);
        std::env::set_current_dir(&root).unwrap();
        write_board("eval-board", &board).unwrap();

        // A default config every scenario can amend.
        let config = Config::default();
        write_config(&root.join(".board"), &config).unwrap();

        std::env::set_var("BARKCLI_AGENT_CMD", "./fake-agent.sh");
        Self { root }
    }

    fn harness(&self, f: impl FnOnce(&mut Config)) -> &Self {
        let dir = self.root.join(".board");
        let mut config = barkcli_core::storage::config_store::read_config(&dir).unwrap();
        f(&mut config);
        write_config(&dir, &config).unwrap();
        self
    }

    fn run(&self, opts: RunOptions) -> barkcli_core::commands::run_cmd::RunReport {
        run(RunOptions {
            card_id: Some(CARD_ID.into()),
            board: Some("eval-board".into()),
            offline: true,
            max_minutes: 2,
            idle_minutes: 1,
            ..opts
        })
        .unwrap()
    }

    fn runs(&self) -> Vec<serde_json::Value> {
        let dir = self.root.join(".board/runs");
        let Ok(entries) = std::fs::read_dir(&dir) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
            .map(|p| serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap())
            .collect()
    }

    fn sessions(&self) -> Vec<PathBuf> {
        let mut dirs: Vec<PathBuf> = std::fs::read_dir(self.root.join(".board/sessions"))
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect()
            })
            .unwrap_or_default();
        dirs.sort();
        dirs
    }

    fn pending(&self) -> usize {
        let path = self.root.join(".board/tasks/eval-board.json");
        let queue = barkcli_core::agent::TaskQueue::load(&path).expect("queue readable");
        queue
            .tasks
            .iter()
            .filter(|t| t.status == barkcli_core::agent::queue::TaskStatus::Pending)
            .count()
    }
}

impl Drop for Scenario {
    fn drop(&mut self) {
        std::env::remove_var("BARKCLI_AGENT_CMD");
        std::env::remove_var("BARKCLI_VERIFIER_CMD");
        std::env::remove_var("LEANTOKEN_BIN");
        let _ = std::env::set_current_dir(std::env::temp_dir());
    }
}

fn git(root: &Path, args: &[&str]) {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&out.stderr)
    );
}

/// The stub agent every scenario starts from: copies the prompt, writes a
/// file, reports usage the way Claude's stream does.
fn writing_agent() -> &'static str {
    r#"#!/bin/sh
set -e
cp "$1" ./received-prompt.md
echo "work" > work.txt
printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"done","usage":{"input_tokens":100,"output_tokens":10},"total_cost_usd":0.05}'
exit 0
"#
}

// ── 1. the happy path, end to end ──

#[test]
fn eval_clean_change_merges_and_records_history() {
    let _serial = SERIAL.lock().unwrap();
    let scenario = Scenario::new("clean", writing_agent());

    let report = scenario.run(RunOptions {
        intent: "Add a work marker".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 1,
        ..Default::default()
    });

    assert!(report.completed >= 1, "tasks: {:?}", report.tasks);
    assert_eq!(report.failed, 0);
    assert!(report.merged_branches.is_some());
    assert!(
        (report.cost_per_merged_change.unwrap_or_default() - 0.05).abs() < 1e-9,
        "cost per merge: {:?}",
        report.cost_per_merged_change
    );

    let runs = scenario.runs();
    assert!(!runs.is_empty(), "the CLI must write shared run records");
    assert!(runs.iter().all(|r| r["status"] == "merged"));
    assert!(runs.iter().all(|r| r["provider"] == "agent-cmd"));
    assert!(runs
        .iter()
        .all(|r| r["context_manifest_id"].as_str().unwrap_or("").starts_with("ctx-")));
    assert!(runs.iter().all(|r| r["diff_stats"]["files"].as_u64().unwrap_or(0) >= 1));

    // The packet is on disk next to the prompt, so a prompt can be diffed later.
    let session = scenario.sessions().into_iter().next().expect("a session");
    assert!(session.join("prompt.md").is_file());
    assert!(session.join("context.json").is_file());
    assert!(session.join("usage.json").is_file());
}

// ── 2. gate failure → verdict injection + retry ──

#[test]
fn eval_gate_failure_retries_with_the_verdict_and_resets() {
    let _serial = SERIAL.lock().unwrap();
    let agent = r#"#!/bin/sh
set -e
root="$(git rev-parse --git-common-dir)/.."
if [ -f "$root/.eval-attempt-two" ]; then
  printf 'console.log("fixed");\n' > test.js
else
  : > "$root/.eval-attempt-two"
  printf 'console.error("broken"); process.exit(1);\n' > test.js
fi
printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"done","usage":{"input_tokens":50,"output_tokens":5},"total_cost_usd":0.01}'
exit 0
"#;
    let scenario = Scenario::new("retry", agent);

    let report = scenario.run(RunOptions {
        intent: "Make the test pass".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 2,
        ..Default::default()
    });

    let first = report.tasks.first().expect("an outcome");
    assert_eq!(first.status, "completed", "outcomes: {:?}", report.tasks);
    assert_eq!(first.attempts, 2, "a gate failure must be retried");

    // The retry prompt carries the gate verdict, not a fresh description.
    let prompts: Vec<String> = scenario
        .sessions()
        .iter()
        .map(|dir| std::fs::read_to_string(dir.join("prompt.md")).unwrap_or_default())
        .collect();
    assert!(
        prompts.iter().any(|p| p.contains("## Previous attempt failed")
            && p.contains("failed the acceptance gate")),
        "a retry must be told what failed"
    );

    // Attempt 2's packet is a distinct record with the retry attempt number.
    let manifests: Vec<serde_json::Value> = scenario
        .sessions()
        .iter()
        .filter_map(|dir| std::fs::read_to_string(dir.join("context.json")).ok())
        .map(|json| serde_json::from_str(&json).unwrap())
        .collect();
    assert!(manifests.iter().any(|m| m["attempt"] == 2));

    // Merged work is the fixed test: the gate really gated.
    assert!(report.merged_branches.is_some());
}

// ── 3. the honesty rule: a no-op gate cannot complete a task ──

#[test]
fn eval_no_change_with_a_noop_gate_is_a_failure() {
    let _serial = SERIAL.lock().unwrap();
    // A crashed agent that changed nothing must never ride a passing no-op gate.
    let idle_agent = r#"#!/bin/sh
printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"done"}'
exit 1
"#;
    let scenario = Scenario::new("noop", idle_agent);

    let report = scenario.run(RunOptions {
        intent: "Look busy".into(),
        yes: true,
        test_cmd: Some("true".into()),
        max_attempts: 1,
        ..Default::default()
    });

    assert_eq!(report.completed, 0, "a passing no-op gate must not count");
    assert!(report.failed >= 1);
    assert!(report.merged_branches.is_none());
}

// ── 4. the verifier is a separate identity and can veto ──

#[test]
fn eval_verifier_rejection_requeues_and_is_recorded_independently() {
    let _serial = SERIAL.lock().unwrap();
    let scenario = Scenario::new("verify-fail", writing_agent());
    std::env::set_var(
        "BARKCLI_VERIFIER_CMD",
        "cat > /dev/null; echo 'VERDICT: FAIL — the acceptance criteria need a test'",
    );
    scenario.harness(|config| {
        config.harness.verify = VerifySettings {
            enabled: true,
            command: None,
            timeout_secs: 30,
            block_on_fail: true,
        };
    });

    let report = scenario.run(RunOptions {
        intent: "Ship without a test".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 1,
        ..Default::default()
    });

    assert_eq!(report.completed, 0, "the verifier blocked the merge");
    assert!(report.merged_branches.is_none());
    assert!(
        report
            .tasks
            .iter()
            .any(|t| t.note.as_deref().unwrap_or("").contains("verifier rejected")),
        "outcomes: {:?}",
        report.tasks
    );

    // The review landed on the contribution graph with a distinct verifier.
    let runs = scenario.runs();
    let verified = runs
        .iter()
        .find(|r| r["verifications"].as_array().is_some_and(|v| !v.is_empty()))
        .expect("verification recorded");
    let entry = &verified["verifications"][0];
    assert_eq!(entry["passed"], false);
    let verifier = entry["verifier"].as_str().unwrap();
    let author = verified["author"].as_str().unwrap_or("runner:agent-cmd");
    assert_ne!(verifier, author, "self-verification must stay rejected");
}

// ── 5. an unparseable review is a signal, never a veto ──

#[test]
fn eval_uncertain_verifier_does_not_block_the_merge() {
    let _serial = SERIAL.lock().unwrap();
    let scenario = Scenario::new("verify-uncertain", writing_agent());
    std::env::set_var("BARKCLI_VERIFIER_CMD", "cat > /dev/null; echo 'looks fine'");
    scenario.harness(|config| {
        config.harness.verify = VerifySettings {
            enabled: true,
            command: None,
            timeout_secs: 30,
            block_on_fail: true,
        };
    });

    let report = scenario.run(RunOptions {
        intent: "Merge anyway".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 1,
        ..Default::default()
    });

    assert!(report.completed >= 1, "outcomes: {:?}", report.tasks);
    assert!(report.merged_branches.is_some());
    // No verification was recorded, because no verdict was given.
    assert!(scenario
        .runs()
        .iter()
        .all(|r| r["verifications"].as_array().is_none_or(|v| v.is_empty())));
}

// ── 6. the spend ceiling stops dispatching, it does not kill in-flight work ──

#[test]
fn eval_budget_ceiling_stops_new_dispatch() {
    let _serial = SERIAL.lock().unwrap();
    let scenario = Scenario::new("budget", writing_agent());
    scenario.harness(|config| {
        config.harness.budget = BudgetSettings {
            max_run_usd: Some(0.001),
        };
    });

    let report = scenario.run(RunOptions {
        intent: "Spend too much".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 1,
        ..Default::default()
    });

    assert_eq!(report.completed, 1, "only the first attempt may run: {:?}", report.tasks);
    assert_eq!(report.budget_ceiling_usd, Some(0.001));
    assert!(
        scenario.pending() > 0,
        "the ceiling leaves work queued, not failed"
    );
}

// ── 7. a project hook can veto the merge without a Rust patch ──

#[test]
fn eval_pre_merge_hook_veto_keeps_the_branch() {
    let _serial = SERIAL.lock().unwrap();
    let scenario = Scenario::new("hook", writing_agent());
    scenario.harness(|config| {
        config.harness.hooks = vec![HarnessHook {
            event: "pre_merge".into(),
            command: "cat > /dev/null; echo 'changeset entry missing'; exit 2".into(),
            timeout_secs: 10,
            on_failure: HookFailure::Warn,
        }];
    });

    let report = scenario.run(RunOptions {
        intent: "Merge without a changeset".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 1,
        ..Default::default()
    });

    assert!(report.merged_branches.is_none(), "the hook vetoed the merge");
    assert!(report
        .tasks
        .iter()
        .any(|t| t.status == "ready-unmerged"
            && t.note.as_deref().unwrap_or("").contains("pre_merge hook blocked")));

    // The branch is kept for review, and the veto is in the hook log.
    let log = scenario
        .sessions()
        .iter()
        .map(|dir| std::fs::read_to_string(dir.join("hooks.jsonl")).unwrap_or_default())
        .find(|text| text.contains("pre_merge"))
        .expect("hook log");
    assert!(log.contains("\"outcome\":\"blocked\""));
}

// ── 8. code-index evidence reaches the packet (LeanToken adapter) ──

#[test]
fn eval_code_index_evidence_is_included_and_recorded() {
    let _serial = SERIAL.lock().unwrap();
    let scenario = Scenario::new("code-index", writing_agent());

    // A stand-in for the `leantoken` binary: the adapter only needs the
    // documented `--json context` shape, so CI never installs the real tool.
    let fake = scenario.root.join("fake-leantoken.sh");
    std::fs::write(
        &fake,
        r#"#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "context" ]; then
    echo '{"fragments":[{"path":"package.json","start_line":1,"end_line":1,"reason":"text"}],"meta":{"source_tokens":11}}'
    exit 0
  fi
done
exit 0
"#,
    )
    .unwrap();
    let mut perms = std::fs::metadata(&fake).unwrap().permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&fake, perms).unwrap();
    std::env::set_var("LEANTOKEN_BIN", &fake);

    let report = scenario.run(RunOptions {
        intent: "Point the packet at the right file".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 1,
        ..Default::default()
    });
    assert!(report.completed >= 1, "outcomes: {:?}", report.tasks);

    let prompt = scenario
        .sessions()
        .iter()
        .find_map(|dir| std::fs::read_to_string(dir.join("prompt.md")).ok())
        .expect("a prompt");
    assert!(
        prompt.contains("## Relevant code") && prompt.contains("`package.json:1-1`"),
        "the packet must carry the ranked ranges"
    );

    let manifest: serde_json::Value = scenario
        .sessions()
        .iter()
        .find_map(|dir| {
            std::fs::read_to_string(dir.join("context.json"))
                .ok()
                .and_then(|json| serde_json::from_str(&json).ok())
        })
        .expect("context manifest");
    assert_eq!(manifest["code_index"]["fragments"][0]["path"], "package.json");
    assert_eq!(manifest["code_index"]["source_tokens"], 11);

    std::env::remove_var("LEANTOKEN_BIN");
}

// ── 9. the packet budget trims instead of bailing ──

#[test]
fn eval_packet_budget_trims_a_huge_context_instead_of_bailing() {
    let _serial = SERIAL.lock().unwrap();
    let scenario = Scenario::new("budget-packet", writing_agent());
    std::fs::write(
        scenario.root.join("project_context.md"),
        "context line\n".repeat(60_000),
    )
    .unwrap();
    scenario.harness(|config| {
        config.harness.context.budget_tokens = 500;
    });

    let report = scenario.run(RunOptions {
        intent: "Survive a huge context".into(),
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 1,
        ..Default::default()
    });

    assert!(report.completed >= 1, "the run must not bail: {:?}", report.tasks);

    let manifest: serde_json::Value = scenario
        .sessions()
        .iter()
        .find_map(|dir| {
            std::fs::read_to_string(dir.join("context.json"))
                .ok()
                .and_then(|json| serde_json::from_str(&json).ok())
        })
        .expect("context manifest");
    assert!(
        manifest["dropped"]
            .as_array()
            .is_some_and(|d| !d.is_empty()),
        "the budget must record what it dropped: {}",
        manifest["dropped"]
    );
    assert!(manifest["bytes"].as_u64().unwrap() <= 500 * 4 + 200);
    assert_eq!(manifest["budget_tokens"], 500);
}
