//! Integration test for the `barkcli run` autonomy loop (separate process so
//! the process-wide CWD + env mutations here can't race the lib unit tests).
//!
//! Drives both branches of the completion contract deterministically, with a
//! scripted "agent" (no LLM):
//!   success — agent writes passing code → gate passes → task merges, card
//!             completes.
//!   failure — agent writes failing code → gate fails → verdict re-dispatch →
//!             ceiling reached → task failed + memory fact recorded.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use barkcli_core::commands::run_cmd::{run, RunOptions};
use barkcli_core::memory::store::MemoryStore;
use barkcli_core::storage::board_file::{read_board, write_board};
use barkcli_core::models::board::Board;

/// The tests here mutate process-wide state (CWD, env) — serialize them.
static SERIAL: Mutex<()> = Mutex::new(());

fn unique_root(tag: &str, n: u32) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "bark_run_{}_{}_{}",
        tag,
        std::process::id(),
        n
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join(".board")).unwrap();
    dir
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

fn seed_repo(root: &Path, agent_script: &str) {
    // A tiny npm-style repo the gate can run deterministically.
    std::fs::write(
        root.join("package.json"),
        r#"{ "name": "run-demo", "version": "1.0.0", "scripts": { "test": "node test.js" } }"#,
    )
    .unwrap();
    std::fs::write(
        root.join("test.js"),
        r#"console.log("no fizz module yet");"#,
    )
    .unwrap();
    std::fs::write(root.join("fake-agent.sh"), agent_script).unwrap();
    // The BARKCLI_AGENT_CMD contract runs the script in-place: it must be
    // executable in the committed repo (git preserves the mode).
    let mut perms = std::fs::metadata(root.join("fake-agent.sh")).unwrap().permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(root.join("fake-agent.sh"), perms).unwrap();
    git(root, &["init", "-b", "main"]);
    git(root, &["config", "user.name", "Run Test"]);
    git(root, &["config", "user.email", "run@test.local"]);
    git(root, &["add", "-A"]);
    git(root, &["commit", "-m", "seed"]);
}

/// Happy path: fake agent writes a passing fizz module; gate passes; the
/// task merges; the card completes; the worktree is released.
#[test]
fn run_loop_success_then_failure_paths() {
    let _serial = SERIAL.lock().unwrap();
    // ── setup #1: the success repo ──
    let root = unique_root("ok", 1);
    let ok_agent = r#"#!/bin/sh
# $1 = prompt file path
set -e
cp "$1" ./received-prompt.md
cat > fizz.js <<'EOF'
function fizzBuzz(n) {
  if (n % 15 === 0) return "FizzBuzz";
  if (n % 3 === 0) return "Fizz";
  if (n % 5 === 0) return "Buzz";
  return String(n);
}
module.exports = fizzBuzz;
EOF
cat > test.js <<'EOF'
const f = require("./fizz.js");
if (f(15) !== "FizzBuzz" || f(3) !== "Fizz" || f(5) !== "Buzz" || f(7) !== "7") {
  console.error("fizzbuzz broken");
  process.exit(1);
}
console.log("all fizzbuzz cases pass");
EOF
echo "fake agent finished"
exit 0
"#;
    seed_repo(&root, ok_agent);
    std::env::set_current_dir(&root).unwrap();

    // Board the run will use.
    write_board("run-board", &Board::new("run-board")).unwrap();

    std::env::set_var("BARKCLI_AGENT_CMD", "./fake-agent.sh");
    let report = run(RunOptions {
        intent: "Create a fizzbuzz module with tests for 15, 3, 5 and 7".into(),
        board: Some("run-board".into()),
        offline: true,
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 2,
        max_minutes: 2,
        idle_minutes: 1,
        ..Default::default()
    })
    .unwrap();

    assert!(
        report.completed >= 1,
        "expected at least one completed task, got {:?} (note: {:?})",
        report
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.attempts, t.note.clone()))
            .collect::<Vec<_>>(),
        report.note
    );
    assert!(report.tasks.iter().all(|t| t.status != "failed"));
    assert!(
        report.tasks.iter().all(|t| t.merged || t.status == "queued"),
        "completed tasks must merge"
    );

    // Gate actually ran and recorded output.
    let gate_ran = report
        .tasks
        .iter()
        .any(|t| t.gate.as_ref().map(|g| g.cmd.as_deref() == Some("node test.js")).unwrap_or(false)
            && g_ok_pass(t));
    assert!(gate_ran, "gate must run and pass");

    // History shows the merge on main.
    let log = String::from_utf8(
        std::process::Command::new("git")
            .args(["log", "--oneline", "-20"])
            .current_dir(&root)
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap();
    assert!(
        log.contains("Merge branch 'bark/") && log.contains("bark(run):"),
        "expected merge commit + task commit in log, got:\n{}",
        log
    );

    // Parent card moved to done.
    let board = read_board("run-board").unwrap();
    let card = board
        .cards
        .iter()
        .find(|c| c.id == report.card_id)
        .expect("created card");
    assert_eq!(card.column, "done", "card must be done after all tasks merge");

    // Worktree released.
    assert_eq!(
        std::fs::read_dir(root.join(".board/worktrees")).map(|d| d.count()).unwrap_or(0),
        0,
        "worktrees must be released after merge"
    );

    // Transcripts captured something.
    let sessions = root.join(".board/sessions");
    let transcripts: Vec<String> = std::fs::read_dir(&sessions)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path().join("transcript.log"))
        .filter(|p| p.exists())
        .map(|p| std::fs::read_to_string(p).unwrap())
        .collect();
    assert!(
        transcripts.iter().any(|t| t.contains("fake agent finished")),
        "transcript must tee agent output"
    );

    // ── setup #2: the failure repo ──
    let root2 = unique_root("fail", 2);
    let broken_agent = r#"#!/bin/sh
set -e
cat > fizz.js <<'EOF'
// deliberately broken: always "X"
module.exports = function fizzBuzz(n) { return "X"; };
EOF
cat > test.js <<'EOF'
const f = require("./fizz.js");
if (f(15) !== "FizzBuzz") { console.error("FAIL: f(15)"); process.exit(1); }
console.log("pass");
EOF
echo "broken agent finished"
exit 0
"#;
    seed_repo(&root2, broken_agent);
    std::env::set_current_dir(&root2).unwrap();
    write_board("run-board2", &Board::new("run-board2")).unwrap();

    let report2 = run(RunOptions {
        intent: "Fix the fizz module so f(15) returns FizzBuzz".into(),
        board: Some("run-board2".into()),
        offline: true,
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 2,
        max_minutes: 2,
        idle_minutes: 1,
        ..Default::default()
    })
    .unwrap();

    assert!(
        report2.failed >= 1 && report2.completed == 0,
        "broken agent must fail the gate: {:?}",
        report2
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.attempts))
            .collect::<Vec<_>>()
    );
    // Retries burned: attempts == max_attempts on final failed tasks.
    for t in report2.tasks.iter().filter(|t| t.status == "failed") {
        assert_eq!(t.attempts, 2, "attempts must hit the ceiling before failing");
        assert!(t.gate.as_ref().map(|g| !g.ok).unwrap_or(false));
    }

    // Failure facts were recorded in project memory.
    let store = MemoryStore::open("run-board2").unwrap();
    let runs: Vec<_> = store
        .memory
        .project_facts
        .iter()
        .filter(|f| f.fact.starts_with("run:"))
        .collect();
    assert!(
        !runs.is_empty(),
        "gate failures must be recorded as memory facts"
    );

    std::env::remove_var("BARKCLI_AGENT_CMD");
}

fn g_ok_pass(t: &barkcli_core::commands::run_cmd::TaskOutcome) -> bool {
    t.gate.as_ref().map(|g| g.ok).unwrap_or(false) && t.status == "completed"
}

/// P1 parallel pool: `--agents 2` runs two tasks at the same time, each in
/// its own worktree. The agent keys its output file off the worktree name
/// (the task id), so the branches never conflict. Both must complete, both
/// must merge through the merge train, and the peak concurrency must be 2.
#[test]
fn run_loop_parallel_pool_agents_two() {
    let _serial = SERIAL.lock().unwrap();

    let root = unique_root("par", 3);
    let parallel_agent = r#"#!/bin/sh
# $1 = prompt file path — writes a file unique to this worktree (task id).
set -e
cp "$1" ./received-prompt.md
name="$(basename "$(pwd)")"
echo "done: ${name}" > "out-${name}.txt"
echo "task ${name} finished"
exit 0
"#;
    seed_repo(&root, parallel_agent);
    std::env::set_current_dir(&root).unwrap();
    write_board("run-board3", &Board::new("run-board3")).unwrap();

    std::env::set_var("BARKCLI_AGENT_CMD", "./fake-agent.sh");
    let report = run(RunOptions {
        intent: "Create two independent feature deliverables with passing tests".into(),
        board: Some("run-board3".into()),
        offline: true,
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 2,
        max_minutes: 2,
        idle_minutes: 1,
        max_agents: 2,
        ..Default::default()
    })
    .unwrap();

    assert_eq!(
        report.parallel,
        Some(2),
        "report must record the worker cap"
    );
    assert_eq!(
        report.workers_peak,
        Some(2),
        "two tasks must have run concurrently (got {:?})",
        report
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.attempts))
            .collect::<Vec<_>>()
    );
    assert!(
        report.failed == 0,
        "no task may fail when branches are disjoint: {:?}",
        report
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.note.clone()))
            .collect::<Vec<_>>()
    );
    assert!(
        report.completed >= 2,
        "both parallel tasks must complete: {:?}",
        report
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.attempts))
            .collect::<Vec<_>>()
    );
    assert!(report.tasks.iter().all(|t| t.merged || t.status == "queued"));

    // Merge train order: every completed branch landed on main.
    assert_eq!(
        report.merged_branches.as_ref().map(|m| m.len()),
        Some(report.tasks.iter().filter(|t| t.merged).count()),
        "merged_branches must match merged outcomes"
    );

    // Card completes; worktrees are released.
    let board = read_board("run-board3").unwrap();
    let card = board
        .cards
        .iter()
        .find(|c| c.id == report.card_id)
        .expect("created card");
    assert_eq!(card.column, "done");
    assert_eq!(
        std::fs::read_dir(root.join(".board/worktrees"))
            .map(|d| d.count())
            .unwrap_or(0),
        0
    );
    std::env::remove_var("BARKCLI_AGENT_CMD");
}

/// P1 merge train: two parallel tasks both add `log.txt` with task-specific
/// content. The first to finish merges cleanly; the second hits an add/add
/// conflict, aborts, re-queues with the conflict verdict, and its next
/// attempt rebases off the new main (modify) and merges cleanly. Both tasks
/// must eventually complete.
#[test]
fn run_loop_merge_train_conflict_redispatches() {
    let _serial = SERIAL.lock().unwrap();

    let root = unique_root("train", 4);
    let clashing_agent = r#"#!/bin/sh
# $1 = prompt file path — every task adds the SAME file with DIFFERENT
# content, keyed off the worktree name (the task id).
set -e
cp "$1" ./received-prompt.md
name="$(basename "$(pwd)")"
echo "log: ${name}" > log.txt
echo "task ${name} finished"
exit 0
"#;
    seed_repo(&root, clashing_agent);
    std::env::set_current_dir(&root).unwrap();
    write_board("run-board4", &Board::new("run-board4")).unwrap();

    std::env::set_var("BARKCLI_AGENT_CMD", "./fake-agent.sh");
    let report = run(RunOptions {
        intent: "Create two overlapping deliverables that both update the changelog".into(),
        board: Some("run-board4".into()),
        offline: true,
        yes: true,
        test_cmd: Some("node test.js".into()),
        max_attempts: 3,
        max_minutes: 3,
        idle_minutes: 1,
        max_agents: 2,
        ..Default::default()
    })
    .unwrap();

    assert!(
        report.completed >= 2,
        "both conflicting tasks must eventually complete via the merge train: {:?}",
        report
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.attempts, t.note.clone()))
            .collect::<Vec<_>>()
    );
    assert!(
        report.failed == 0,
        "the rebase re-dispatch must resolve the conflict: {:?}",
        report
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.attempts, t.note.clone()))
            .collect::<Vec<_>>()
    );
    // The conflict actually negotiated: one task needed a second attempt.
    assert!(
        report
            .tasks
            .iter()
            .any(|t| t.status == "completed" && t.attempts >= 2),
        "the losing branch must be re-dispatched and succeed on attempt 2: {:?}",
        report
            .tasks
            .iter()
            .map(|t| (t.status.clone(), t.attempts, t.note.clone()))
            .collect::<Vec<_>>()
    );
    // Every completed task's branch landed on main, in train order.
    assert_eq!(
        report.merged_branches.as_ref().map(|m| m.len()),
        Some(report.completed as usize),
        "completed tasks must match landed branches: {:?}",
        report.merged_branches
    );

    // log.txt exists on main with exactly one task's content.
    let log = std::fs::read_to_string(root.join("log.txt")).unwrap();
    assert!(
        log.starts_with("log: "),
        "log.txt must exist on main after both merges, got: {:?}",
        log
    );

    // Card completes; worktrees released (incl. the conflicted attempt's).
    let board = read_board("run-board4").unwrap();
    let card = board
        .cards
        .iter()
        .find(|c| c.id == report.card_id)
        .expect("created card");
    assert_eq!(card.column, "done");
    assert_eq!(
        std::fs::read_dir(root.join(".board/worktrees"))
            .map(|d| d.count())
            .unwrap_or(0),
        0
    );
    std::env::remove_var("BARKCLI_AGENT_CMD");
}
