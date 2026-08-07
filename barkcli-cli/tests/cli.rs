use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

fn board_binary() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // workspace root (board-cli/ -> project root)
    path.push("target");
    path.push("debug");
    path.push("barkcli");
    path
}

fn run_board(args: &[&str], dir: &PathBuf) -> (String, String, bool) {
    let output = Command::new(board_binary())
        .args(args)
        .current_dir(dir)
        .output()
        .expect("failed to run board");
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    (stdout, stderr, output.status.success())
}

fn in_temp_dir() -> PathBuf {
    let n = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("board_test_{}_{}", std::process::id(), n));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("failed to create temp dir");
    dir
}

#[test]
fn test_init_creates_board_dir() {
    let dir = in_temp_dir();
    let (out, err, ok) = run_board(&["init"], &dir);
    assert!(ok, "init failed: {}\n{}", err, out);
    assert!(dir.join(".board").is_dir(), ".board/ not created");
    assert!(dir.join(".board").join("config.json").is_file(), "config.json not created");
    assert!(out.contains("Initialized"));
}

#[test]
fn test_create_board() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    let (out, err, ok) = run_board(&["create", "test"], &dir);
    assert!(ok, "create failed: {}\n{}", err, out);
    assert!(dir.join("test.board").is_file(), "test.board not created");
    assert!(out.contains("Created"));
}

#[test]
fn test_init_adds_gitignore() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    let gitignore = dir.join(".gitignore");
    assert!(gitignore.is_file(), ".gitignore not created");
    let content = std::fs::read_to_string(&gitignore).unwrap();
    assert!(content.contains(".board/"), ".gitignore missing .board/ entry");
}

#[test]
fn test_add_and_list_cards() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "project"], &dir);

    let (out, err, ok) = run_board(&["project", "add", "JWT Login", "-p", "high", "-l", "backend", "-a", "alice"], &dir);
    assert!(ok, "add failed: {}\n{}", err, out);
    assert!(out.contains("Added card"));
    assert!(out.contains("jwt-login"));

    let (out, err, ok) = run_board(&["project", "add", "OAuth Setup", "-d", "Implement OAuth"], &dir);
    assert!(ok, "add failed: {}\n{}", err, out);
    assert!(out.contains("oauth-setup"));

    let (out, err, ok) = run_board(&["project", "list"], &dir);
    assert!(ok, "list failed: {}\n{}", err, out);
    assert!(out.contains("jwt-login"));
    assert!(out.contains("oauth-setup"));
    assert!(out.contains("high"));
}

#[test]
fn test_move_card() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "project"], &dir);
    run_board(&["project", "add", "Task One"], &dir);

    let (out, err, ok) = run_board(&["project", "move", "task-one", "doing"], &dir);
    assert!(ok, "move failed: {}\n{}", err, out);
    assert!(out.contains("task-one"));

    let (out, _, _) = run_board(&["project", "list", "-c", "doing"], &dir);
    assert!(out.contains("task-one"), "card not in doing column");
}

#[test]
fn test_status_transition() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "project"], &dir);
    run_board(&["project", "add", "Task One"], &dir);

    let (out, err, ok) = run_board(&["project", "status", "task-one", "done"], &dir);
    assert!(ok, "status failed: {}\n{}", err, out);
    assert!(out.contains("task-one"));

    let (out, _, _) = run_board(&["project", "list", "-c", "done"], &dir);
    assert!(out.contains("task-one"), "card not in done column");
}

#[test]
fn test_show_card() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "project"], &dir);
    run_board(&["project", "add", "Task One", "-d", "A test task"], &dir);

    let (out, err, ok) = run_board(&["project", "show", "task-one"], &dir);
    assert!(ok, "show failed: {}\n{}", err, out);
    assert!(out.contains("Task One"));
    assert!(out.contains("A test task"));
    assert!(out.contains("task-one"));
}

#[test]
fn test_update_card() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "project"], &dir);
    run_board(&["project", "add", "Task One", "-p", "low"], &dir);

    let (out, err, ok) = run_board(&["project", "update", "task-one", "-p", "high", "-t", "Updated Title"], &dir);
    assert!(ok, "update failed: {}\n{}", err, out);

    let (out, _, _) = run_board(&["project", "show", "task-one"], &dir);
    assert!(out.contains("Updated Title"));
    assert!(out.contains("high"));
}

#[test]
fn test_remove_card() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "project"], &dir);
    run_board(&["project", "add", "Task One"], &dir);
    run_board(&["project", "add", "Task Two"], &dir);

    let (out, err, ok) = run_board(&["project", "remove", "task-one"], &dir);
    assert!(ok, "remove failed: {}\n{}", err, out);

    let (out, _, _) = run_board(&["project", "list"], &dir);
    assert!(!out.contains("task-one"), "card still listed after remove");
    assert!(out.contains("task-two"));
}

#[test]
fn test_list_boards() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "alpha"], &dir);
    run_board(&["create", "beta"], &dir);

    let (out, _, _) = run_board(&["boards"], &dir);
    assert!(out.contains("alpha"));
    assert!(out.contains("beta"));
}

#[test]
fn test_board_status_summary() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "project"], &dir);
    run_board(&["project", "add", "Task One"], &dir);
    run_board(&["project", "add", "Task Two"], &dir);
    run_board(&["project", "move", "task-one", "doing"], &dir);

    let (out, _, _) = run_board(&["status"], &dir);
    assert!(out.contains("project"));
    assert!(out.contains("2")); // total count
}

#[test]
fn test_full_workflow() {
    let dir = in_temp_dir();

    // init
    assert!(run_board(&["init"], &dir).2);

    // create board
    assert!(run_board(&["create", "sprint1"], &dir).2);

    // add cards
    assert!(run_board(&["sprint1", "add", "Login page"], &dir).2);
    assert!(run_board(&["sprint1", "add", "Logout", "-p", "low"], &dir).2);
    assert!(run_board(&["sprint1", "add", "API auth", "-p", "high", "-l", "backend"], &dir).2);

    // list shows 3 cards
    let (out, _, _) = run_board(&["sprint1", "list"], &dir);
    assert!(out.contains("login-page"), "login-page not listed");
    assert!(out.contains("logout"), "logout not listed");
    assert!(out.contains("api-auth"), "api-auth not listed");

    // move card
    assert!(run_board(&["sprint1", "move", "login-page", "doing"], &dir).2);
    assert!(run_board(&["sprint1", "status", "api-auth", "doing"], &dir).2);

    // verify in doing column
    let (out, _, _) = run_board(&["sprint1", "list", "-c", "doing"], &dir);
    assert!(out.contains("login-page"));
    assert!(out.contains("api-auth"));

    // update card
    assert!(run_board(&["sprint1", "update", "logout", "-p", "medium", "-a", "bob"], &dir).2);

    // show card details
    let (out, _, _) = run_board(&["sprint1", "show", "logout"], &dir);
    assert!(out.contains("bob"));

    // remove card
    assert!(run_board(&["sprint1", "remove", "logout"], &dir).2);
    let (out, _, _) = run_board(&["sprint1", "list"], &dir);
    assert!(!out.contains("logout"));

    // board list and status
    let (out, _, _) = run_board(&["boards"], &dir);
    assert!(out.contains("sprint1"));

    let (out, _, _) = run_board(&["status"], &dir);
    assert!(out.contains("sprint1"));
}

#[test]
fn test_validate_valid_board() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    let (out, err, ok) = run_board(&["validate"], &dir);
    assert!(ok, "validate failed: {}\n{}", err, out);
    assert!(out.contains("valid"));
}

#[test]
fn test_doctor_fixes_missing_title() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);

    // Corrupt the board file
    let board_path = dir.join("test.board");
    std::fs::write(&board_path, "columns:\n  - id: todo\n    name: Todo\ncards: []\n").unwrap();

    let (out, err, ok) = run_board(&["doctor"], &dir);
    assert!(ok, "doctor failed: {}\n{}", err, out);
    assert!(out.contains("fixed"), "doctor didn't fix: {}", out);
}

#[test]
fn test_export_json() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    run_board(&["test", "add", "Card One"], &dir);

    let (out, err, ok) = run_board(&["export", "test"], &dir);
    assert!(ok, "export failed: {}\n{}", err, out);
    assert!(out.contains("\"title\""));
    assert!(out.contains("\"Card One\""));
}

#[test]
fn test_export_yaml() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    run_board(&["test", "add", "Card One"], &dir);

    let (out, err, ok) = run_board(&["export", "test", "yaml"], &dir);
    assert!(ok, "export yaml failed: {}\n{}", err, out);
    assert!(out.contains("title:"));
    assert!(out.contains("Card One"));
}

#[test]
fn test_import_from_stdin() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);

    // Import via piping JSON
    let mut child = Command::new(board_binary())
        .args(&["import", "imported"])
        .current_dir(&dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("failed to spawn board import");

    let json = serde_json::json!({
        "title": "Imported Board",
        "columns": [{"id": "todo", "name": "Todo"}, {"id": "done", "name": "Done"}],
        "cards": [{"id": "task-1", "title": "Imported Task", "column": "todo", "priority": "high"}]
    });

    use std::io::Write;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(json.to_string().as_bytes()).unwrap();
    }
    let output = child.wait_with_output().expect("failed to wait");
    assert!(output.status.success(), "import failed: {}", String::from_utf8_lossy(&output.stderr));

    let (out, _, _) = run_board(&["imported", "list"], &dir);
    assert!(out.contains("Imported Task"));
}

#[test]
fn test_clean_with_locks() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);

    // Create a fake lock file
    let locks_dir = dir.join(".board").join("locks");
    std::fs::create_dir_all(&locks_dir).unwrap();
    std::fs::write(locks_dir.join("test.lock"), "").unwrap();

    let (out, err, ok) = run_board(&["clean"], &dir);
    assert!(ok, "clean failed: {}\n{}", err, out);
    assert!(out.contains("Cleaned"), "clean didn't find locks: {}", out);
}

#[test]
fn test_history_logged_on_add() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    run_board(&["test", "add", "Card One"], &dir);

    let history_path = dir.join(".board").join("history").join("test.log");
    assert!(history_path.is_file(), "history file not created");
    let content = std::fs::read_to_string(&history_path).unwrap();
    assert!(content.contains("add"));
    assert!(content.contains("card-one"));
}

#[test]
fn test_history_logged_on_move() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    run_board(&["test", "add", "Card One"], &dir);
    run_board(&["test", "move", "card-one", "done"], &dir);

    let history_path = dir.join(".board").join("history").join("test.log");
    let content = std::fs::read_to_string(&history_path).unwrap();
    assert!(content.contains("move"));
    assert!(content.contains("todo"));
    assert!(content.contains("done"));
}

#[test]
fn test_session_log_via_stdin() {
    use std::io::Write;

    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);

    let mut child = Command::new(board_binary())
        .args(["session", "log", "--agent", "opencode", "--board", "test"])
        .current_dir(&dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("failed to spawn session log");

    let payload = r#"{"prompt":"Implement JWT login","commit":"abcdef1234567890","files":["src/auth.rs","src/main.rs"]}"#;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(payload.as_bytes()).unwrap();
    }
    let output = child.wait_with_output().expect("failed to wait");
    assert!(output.status.success(), "session log failed: {}", String::from_utf8_lossy(&output.stderr));

    let sessions_path = dir.join(".board").join("sessions").join("test.jsonl");
    assert!(sessions_path.is_file(), "sessions log not created");
    let content = std::fs::read_to_string(&sessions_path).unwrap();
    assert!(content.contains("Implement JWT login"));
    assert!(content.contains("abcdef1234567890"));
    assert!(content.contains("opencode"));
}

#[test]
fn test_session_list_and_resume() {
    use std::io::Write;

    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);

    let mut child = Command::new(board_binary())
        .args(["session", "log", "--agent", "opencode", "--board", "test"])
        .current_dir(&dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("failed to spawn session log");
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(br#"{"prompt":"Fix the flaky test"}"#).unwrap();
    }
    child.wait_with_output().expect("failed to wait");

    let (out, err, ok) = run_board(&["session", "list", "--board", "test"], &dir);
    assert!(ok, "session list failed: {}\n{}", err, out);
    assert!(out.contains("Fix the flaky test"));
    assert!(out.contains("opencode"));

    let (out, err, ok) = run_board(&["session", "resume", "--board", "test"], &dir);
    assert!(ok, "session resume failed: {}\n{}", err, out);
    assert!(out.contains("Resume context"));
    assert!(out.contains("Fix the flaky test"));
}

#[test]
fn test_session_payload_redacted() {
    use std::io::Write;

    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);

    let mut child = Command::new(board_binary())
        .args(["session", "log", "--board", "test"])
        .current_dir(&dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("failed to spawn session log");
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(br#"{"prompt":"Use the key sk-abcdefghijklmnopqrstuvwxyz123456"}"#).unwrap();
    }
    child.wait_with_output().expect("failed to wait");

    let content = std::fs::read_to_string(dir.join(".board").join("sessions").join("test.jsonl")).unwrap();
    assert!(!content.contains("sk-abcdefghijklmnopqrstuvwxyz123456"), "secret leaked to sessions log");
    assert!(content.contains("[REDACTED]"));
}

#[test]
fn test_history_payload_redacted() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);

    // Title with a secret-shaped value flows through log_add -> history append.
    // The card id is the slugified title (an identifier, stored unredacted);
    // the new_value field is what must be redacted.
    let secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    run_board(&["test", "add", secret], &dir);

    let history_path = dir.join(".board").join("history").join("test.log");
    let content = std::fs::read_to_string(&history_path).unwrap();
    assert!(!content.contains(&format!("\"new_value\":\"{}\"", secret)), "secret leaked into history new_value");
    assert!(content.contains("\"new_value\":\"[REDACTED]\""), "history log missing redaction token");
}

#[test]
fn test_checkpoint_save_list_restore() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    run_board(&["switch", "test"], &dir);
    run_board(&["test", "add", "Card A"], &dir);

    let (out, err, ok) = run_board(&["checkpoint", "save", "v1"], &dir);
    assert!(ok, "checkpoint save failed: {}\n{}", err, out);
    assert!(out.contains("v1"));

    let snap = dir.join(".board").join("snapshots").join("v1.yaml");
    assert!(snap.is_file(), "checkpoint file not created");

    // Move the card, then restore from checkpoint
    run_board(&["test", "move", "card-a", "done"], &dir);

    let (out, err, ok) = run_board(&["checkpoint", "list"], &dir);
    assert!(ok, "checkpoint list failed: {}\n{}", err, out);
    assert!(out.contains("v1"));

    let (out, err, ok) = run_board(&["checkpoint", "restore", "v1"], &dir);
    assert!(ok, "checkpoint restore failed: {}\n{}", err, out);
    assert!(out.contains("Restored"));

    let (out, err, ok) = run_board(&["test", "show", "card-a"], &dir);
    assert!(ok, "show failed: {}\n{}", err, out);
    assert!(out.contains("todo"), "card not restored to original column: {}", out);
}

#[test]
fn test_checkpoint_show() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    run_board(&["switch", "test"], &dir);
    run_board(&["checkpoint", "save", "v1"], &dir);

    let (out, err, ok) = run_board(&["checkpoint", "show", "v1"], &dir);
    assert!(ok, "checkpoint show failed: {}\n{}", err, out);
    assert!(out.contains("title: test"));
}

#[test]
fn test_hooks_install_remove_status() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);

    let (out, err, ok) = run_board(&["hooks", "install", "--agent", "opencode"], &dir);
    assert!(ok, "hooks install failed: {}\n{}", err, out);

    let plugin = dir.join(".opencode").join("plugins").join("barkcli.ts");
    assert!(plugin.is_file(), "opencode plugin not installed");
    let content = std::fs::read_to_string(&plugin).unwrap();
    assert!(content.contains("session log"), "plugin missing session log call");

    let (out, err, ok) = run_board(&["hooks", "install", "--agent", "claude-code"], &dir);
    assert!(ok, "claude hooks install failed: {}\n{}", err, out);
    let settings = dir.join(".claude").join("settings.json");
    assert!(settings.is_file(), "claude settings not created");
    let settings_content = std::fs::read_to_string(&settings).unwrap();
    assert!(settings_content.contains("session log"), "claude hooks missing session log");

    let (out, err, ok) = run_board(&["hooks", "status"], &dir);
    assert!(ok, "hooks status failed: {}\n{}", err, out);
    assert!(out.contains("installed"));

    let (out, err, ok) = run_board(&["hooks", "remove", "--agent", "opencode"], &dir);
    assert!(ok, "hooks remove failed: {}\n{}", err, out);
    assert!(!plugin.exists(), "opencode plugin not removed");
}

#[test]
fn test_init_installs_post_commit_hook() {
    let dir = in_temp_dir();
    std::fs::create_dir_all(dir.join(".git/hooks")).unwrap();
    run_board(&["init"], &dir);

    let hook = dir.join(".git").join("hooks").join("post-commit");
    assert!(hook.is_file(), "post-commit hook not installed");
    let content = std::fs::read_to_string(&hook).unwrap();
    assert!(content.contains("checkpoint save --auto"), "post-commit hook missing auto-checkpoint");
}

#[test]
fn test_clean_removes_orphaned_sessions() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);

    // Orphan a sessions log for a board that no longer exists
    let sessions_dir = dir.join(".board").join("sessions");
    std::fs::create_dir_all(&sessions_dir).unwrap();
    std::fs::write(sessions_dir.join("ghost.jsonl"), "{}\n").unwrap();

    let (out, err, ok) = run_board(&["clean"], &dir);
    assert!(ok, "clean failed: {}\n{}", err, out);
    assert!(out.contains("orphaned sessions") || out.contains("Removed"), "clean output: {}", out);
    assert!(!sessions_dir.join("ghost.jsonl").exists(), "orphaned sessions log not removed");
}

#[test]
fn test_auto_checkpoint_after_commit() {
    let dir = in_temp_dir();
    let git_ok = Command::new("git")
        .args(["init", "-q"])
        .current_dir(&dir)
        .status()
        .unwrap()
        .success();
    assert!(git_ok, "git init failed");

    // .git must exist before init so the post-commit hook gets installed
    run_board(&["init"], &dir);
    run_board(&["create", "test"], &dir);
    run_board(&["switch", "test"], &dir);
    run_board(&["test", "add", "Card A"], &dir);

    for cmd in [
        vec!["config", "user.email", "test@test.test"],
        vec!["config", "user.name", "test"],
    ] {
        Command::new("git").args(&cmd).current_dir(&dir).status().unwrap();
    }

    // Hooks invoke `barkcli` bare — put the built binary on PATH for git
    let binding = board_binary();
    let bin_dir = binding.parent().unwrap();
    let path = format!("{}:{}", bin_dir.display(), std::env::var("PATH").unwrap_or_default());
    let commit_ok = Command::new("git")
        .args(["add", "-A"])
        .current_dir(&dir)
        .env("PATH", &path)
        .status()
        .unwrap()
        .success()
        && Command::new("git")
            .args(["commit", "-q", "-m", "add cards"])
            .current_dir(&dir)
            .env("PATH", &path)
            .status()
            .unwrap()
            .success();
    assert!(commit_ok, "git commit failed");

    let auto_dir = dir.join(".board").join("snapshots").join("auto");
    assert!(auto_dir.is_dir(), "auto checkpoint dir not created");

    let files: Vec<String> = std::fs::read_dir(&auto_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".yaml"))
        .collect();
    assert!(files.iter().any(|f| f.starts_with("test-")), "auto checkpoint for test board missing: {:?}", files);

    let (out, err, ok) = run_board(&["checkpoint", "list"], &dir);
    assert!(ok, "checkpoint list failed: {}\n{}", err, out);
    assert!(out.contains("auto"), "auto checkpoint not listed: {}", out);
}

#[test]
fn test_today_shows_agenda() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "agenda"], &dir);
    run_board(&["switch", "agenda"], &dir);

    let (out, err, ok) = run_board(&["agenda", "add", "Overdue card", "--due", "2020-01-01"], &dir);
    assert!(ok, "add overdue failed: {}\n{}", err, out);
    let (out, err, ok) = run_board(&["agenda", "add", "Backlog card"], &dir);
    assert!(ok, "add backlog failed: {}\n{}", err, out);

    let (out, err, ok) = run_board(&["today"], &dir);
    assert!(ok, "today failed: {}\n{}", err, out);
    assert!(out.contains("Overdue"), "missing Overdue section: {}", out);
    assert!(out.contains("overdue-card"), "overdue card missing: {}", out);
    assert!(out.contains("Backlog"), "missing Backlog section: {}", out);
    assert!(out.contains("backlog-card"), "backlog card missing: {}", out);
}

#[test]
fn test_calendar_renders_month() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "cal"], &dir);
    run_board(&["switch", "cal"], &dir);
    let (out, err, ok) = run_board(&["cal", "add", "Due card", "--due", "2026-08-15"], &dir);
    assert!(ok, "add failed: {}\n{}", err, out);

    let (out, err, ok) = run_board(&["calendar", "2026-08"], &dir);
    assert!(ok, "calendar failed: {}\n{}", err, out);
    assert!(out.contains("August 2026"), "month header missing: {}", out);
    assert!(out.contains("Su Mo Tu We Th Fr Sa"), "day header missing: {}", out);
}

#[test]
fn test_remind_lists_reminders() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "rem"], &dir);
    run_board(&["switch", "rem"], &dir);
    let (out, err, ok) = run_board(&["rem", "add", "Remind me", "--due", "2026-08-20", "--remind", "2026-08-07T12:00"], &dir);
    assert!(ok, "add with --remind failed: {}\n{}", err, out);

    // The reminder is due within the default 24h window only if today matches;
    // use a wide window to make the test deterministic.
    let (out, err, ok) = run_board(&["remind", "--hours", "8760"], &dir);
    assert!(ok, "remind failed: {}\n{}", err, out);
    assert!(out.contains("remind-me"), "reminded card missing: {}", out);
}

#[test]
fn test_link_parent_child_and_tree() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "links"], &dir);
    run_board(&["switch", "links"], &dir);
    run_board(&["links", "add", "Auth PBI", "--effort", "8", "--area", "backend", "--ac", "Users can log in", "--ac", "Tokens refresh"], &dir);
    run_board(&["links", "add", "JWT Login"], &dir);
    run_board(&["links", "add", "Refresh Token"], &dir);

    let (out, err, ok) = run_board(&["links", "link", "jwt-login", "auth-pbi", "--as", "child"], &dir);
    assert!(ok, "link failed: {}\n{}", err, out);
    assert!(out.contains("Linked"));

    let (out, _, ok) = run_board(&["links", "link", "refresh-token", "auth-pbi", "--as", "child"], &dir);
    assert!(ok, "second link failed: {}", out);

    let (out, err, ok) = run_board(&["links", "tree"], &dir);
    assert!(ok, "tree failed: {}\n{}", err, out);
    assert!(out.contains("Auth PBI"), "tree missing parent: {}", out);
    assert!(out.contains("JWT Login"), "tree missing child: {}", out);

    // Cycle guard: making auth-pbi a child of jwt-login must fail
    let (out, err, ok) = run_board(&["links", "link", "auth-pbi", "jwt-login", "--as", "child"], &dir);
    assert!(!ok, "cycle link should have failed: {}", out);
    assert!(err.contains("cycle") || out.contains("cycle"), "expected cycle message: {}{}", err, out);

    let (out, err, ok) = run_board(&["links", "unlink", "jwt-login", "auth-pbi", "--as", "child"], &dir);
    assert!(ok, "unlink failed: {}\n{}", err, out);

    // show renders AC + effort + area
    let (out, _, ok) = run_board(&["links", "show", "auth-pbi"], &dir);
    assert!(ok, "show failed");
    assert!(out.contains("Acceptance criteria"), "missing AC section: {}", out);
    assert!(out.contains("Users can log in"), "missing AC text: {}", out);
    assert!(out.contains("Effort"), "missing effort: {}", out);
    assert!(out.contains("Area"), "missing area: {}", out);
}

#[test]
fn test_context_scan_and_code_query() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "ctx"], &dir);
    run_board(&["switch", "ctx"], &dir);
    run_board(&["ctx", "add", "JWT Login"], &dir);

    // Seed a source file that matches the card title
    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::write(dir.join("src/auth.rs"), "pub fn login() {}\npub fn verify_token() {}\n").unwrap();

    let (out, err, ok) = run_board(&["context", "scan"], &dir);
    assert!(ok, "context scan failed: {}\n{}", err, out);
    assert!(out.contains("Scan"), "missing scan output: {}", out);

    let (out, err, ok) = run_board(&["context", "status"], &dir);
    assert!(ok, "context status failed: {}\n{}", err, out);
    assert!(out.contains("Coverage"), "missing coverage: {}", out);

    let (out, err, ok) = run_board(&["context", "show", "jwt-login"], &dir);
    assert!(ok, "context show failed: {}\n{}", err, out);
    assert!(out.contains("src/auth.rs"), "mapped file missing: {}", out);

    let (out, err, ok) = run_board(&["code", "verify_token"], &dir);
    assert!(ok, "code query failed: {}\n{}", err, out);
    assert!(out.contains("src/auth.rs"), "code query missing file: {}", out);
    assert!(out.contains("jwt-login"), "code query missing linked card: {}", out);
}

#[test]
fn test_context_sync_git_aware() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "ctxg"], &dir);
    run_board(&["switch", "ctxg"], &dir);
    run_board(&["ctxg", "add", "Auth Work"], &dir);

    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::write(dir.join("src/auth.rs"), "pub fn login() {}\n").unwrap();

    let _ = std::process::Command::new("git")
        .args(["init", "-q"]).current_dir(&dir).status();
    let _ = std::process::Command::new("git")
        .args(["config", "user.email", "t@t.co"]).current_dir(&dir).status();
    let _ = std::process::Command::new("git")
        .args(["config", "user.name", "T"]).current_dir(&dir).status();

    let (out, err, ok) = run_board(&["context", "link", "auth-work", "src/auth.rs"], &dir);
    assert!(ok, "context link failed: {}\n{}", err, out);

    let (out, _, ok) = run_board(&["context", "sync"], &dir);
    assert!(ok, "context sync failed: {}", out);

    // Change the file → status should become "changed"
    std::fs::write(dir.join("src/auth.rs"), "pub fn login() {}\npub fn logout() {}\n").unwrap();
    let (out, err, ok) = run_board(&["context", "sync"], &dir);
    assert!(ok, "context sync (dirty) failed: {}\n{}", err, out);
    assert!(out.contains("touched"), "expected touched message: {}", out);

    let (out, _, _) = run_board(&["context", "show", "auth-work"], &dir);
    assert!(out.contains("changed"), "expected changed status: {}", out);
}

#[test]
fn test_context_autosync_hook() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "autos"], &dir);
    run_board(&["switch", "autos"], &dir);

    let (out, err, ok) = run_board(&["context", "autosync", "on"], &dir);
    assert!(ok, "autosync on failed: {}\n{}", err, out);
    let hook = dir.join(".git").join("hooks").join("post-commit");
    if hook.exists() {
        let content = std::fs::read_to_string(&hook).unwrap();
        assert!(content.contains("barkcli-context-autosync"), "marker missing: {}", content);
    }

    let (out, _, ok) = run_board(&["context", "autosync", "off"], &dir);
    assert!(ok, "autosync off failed: {}", out);
}

#[test]
fn test_effort_and_area_on_update() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "upd"], &dir);
    run_board(&["switch", "upd"], &dir);
    run_board(&["upd", "add", "PBI One"], &dir);

    let (out, err, ok) = run_board(&["upd", "update", "pbi-one", "--effort", "5", "--area", "frontend"], &dir);
    assert!(ok, "update failed: {}\n{}", err, out);

    let (out, _, _) = run_board(&["upd", "show", "pbi-one"], &dir);
    assert!(out.contains("5"), "effort not set: {}", out);
    assert!(out.contains("frontend"), "area not set: {}", out);

    let (out, _, _) = run_board(&["upd", "update", "pbi-one", "--rm-ac", "x"], &dir);
    assert!(out.contains("Updated"), "rm-ac should still succeed: {}", out);
}

#[test]
fn test_agent_config_provider_ollama() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "agc"], &dir);
    run_board(&["switch", "agc"], &dir);

    let (out, err, ok) = run_board(&["agent", "config", "set", "provider", "ollama"], &dir);
    assert!(ok, "agent config set failed: {}\n{}", err, out);

    let (out, _, ok) = run_board(&["agent", "config", "show"], &dir);
    assert!(ok, "agent config show failed: {}", out);
    assert!(out.contains("localhost:11434"), "ollama base url missing: {}", out);
    assert!(out.contains("llama3.2"), "ollama model missing: {}", out);
}

#[test]
fn test_agent_config_reset() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "agr"], &dir);
    run_board(&["switch", "agr"], &dir);

    let (out, _, ok) = run_board(&["agent", "config", "set", "provider", "ollama"], &dir);
    assert!(ok, "set failed: {}", out);
    let (out, _, ok) = run_board(&["agent", "config", "reset"], &dir);
    assert!(ok, "reset failed: {}", out);
    let (out, _, _) = run_board(&["agent", "config", "show"], &dir);
    assert!(out.contains("api.openai.com"), "default base url missing after reset: {}", out);
}

#[test]
fn test_context_refresh_dry_run_no_llm_call() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "ref"], &dir);
    run_board(&["switch", "ref"], &dir);
    run_board(&["ref", "add", "Auth Work", "--ac", "Users can log in"], &dir);

    // --dry-run must not call the LLM; it prints the prompt instead.
    let (out, err, ok) = run_board(&["context", "refresh", "auth-work", "--dry-run"], &dir);
    assert!(ok, "refresh --dry-run failed: {}\n{}", err, out);
    assert!(out.contains("prompt"), "expected dry-run prompt output: {}", out);
    assert!(out.contains("auth-work"), "expected card in prompt: {}", out);
}

#[test]
fn test_session_log_matches_cards() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "sessl"], &dir);
    run_board(&["switch", "sessl"], &dir);
    run_board(&["sessl", "add", "Card CRUD"], &dir);

    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::write(dir.join("src/cards.rs"), "pub fn create_card() {}\npub fn delete_card() {}\n").unwrap();
    let (out, err, ok) = run_board(&["context", "link", "card-crud", "src/cards.rs"], &dir);
    assert!(ok, "context link failed: {}\n{}", err, out);

    // Pipe a session payload on stdin
    let mut child = std::process::Command::new(board_binary())
        .args(["session", "log", "--agent", "opencode"])
        .current_dir(&dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("spawn session log");
    {
        use std::io::Write;
        let payload = serde_json::json!({
            "prompt": "implement card crud",
            "files": ["src/cards.rs"],
            "model": "gpt-4o-mini"
        });
        child.stdin.as_mut().unwrap().write_all(payload.to_string().as_bytes()).unwrap();
    }
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success(), "session log failed: {}", String::from_utf8_lossy(&out.stderr));

    let (out, _, ok) = run_board(&["session", "list"], &dir);
    assert!(ok, "session list failed: {}", out);
    assert!(out.contains("implement card crud"), "session missing: {}", out);

    let (out, _, ok) = run_board(&["context", "show", "card-crud"], &dir);
    assert!(ok, "context show failed: {}", out);
    assert!(out.contains("Sessions:"), "session not linked to card context: {}", out);
    assert!(out.contains("src/cards.rs"), "mapped file missing: {}", out);
}

#[test]
fn test_report_sprint_burndown() {
    let dir = in_temp_dir();
    run_board(&["init"], &dir);
    run_board(&["create", "sprr"], &dir);
    run_board(&["switch", "sprr"], &dir);
    run_board(&["sprr", "add", "Feature A", "--effort", "3", "-l", "sprint:s1"], &dir);
    run_board(&["sprr", "add", "Feature B", "--effort", "5", "-l", "sprint:s1"], &dir);
    run_board(&["sprr", "move", "feature-a", "done"], &dir);

    let (out, err, ok) = run_board(&["report", "--sprint", "s1"], &dir);
    assert!(ok, "sprint report failed: {}\n{}", err, out);
    assert!(out.contains("Sprint Burndown"), "header missing: {}", out);
    assert!(out.contains("Feature A"), "card missing: {}", out);
    assert!(out.contains("3"), "effort missing: {}", out);
}
