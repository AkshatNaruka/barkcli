use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

fn board_binary() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop(); // workspace root (board-cli/ -> project root)
    path.push("target");
    path.push("debug");
    path.push("board");
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
    assert!(run_board(&["create", "sprint"], &dir).2);

    // add cards
    assert!(run_board(&["sprint", "add", "Login page"], &dir).2);
    assert!(run_board(&["sprint", "add", "Logout", "-p", "low"], &dir).2);
    assert!(run_board(&["sprint", "add", "API auth", "-p", "high", "-l", "backend"], &dir).2);

    // list shows 3 cards
    let (out, _, _) = run_board(&["sprint", "list"], &dir);
    assert!(out.contains("login-page"), "login-page not listed");
    assert!(out.contains("logout"), "logout not listed");
    assert!(out.contains("api-auth"), "api-auth not listed");

    // move card
    assert!(run_board(&["sprint", "move", "login-page", "doing"], &dir).2);
    assert!(run_board(&["sprint", "status", "api-auth", "doing"], &dir).2);

    // verify in doing column
    let (out, _, _) = run_board(&["sprint", "list", "-c", "doing"], &dir);
    assert!(out.contains("login-page"));
    assert!(out.contains("api-auth"));

    // update card
    assert!(run_board(&["sprint", "update", "logout", "-p", "medium", "-a", "bob"], &dir).2);

    // show card details
    let (out, _, _) = run_board(&["sprint", "show", "logout"], &dir);
    assert!(out.contains("bob"));

    // remove card
    assert!(run_board(&["sprint", "remove", "logout"], &dir).2);
    let (out, _, _) = run_board(&["sprint", "list"], &dir);
    assert!(!out.contains("logout"));

    // board list and status
    let (out, _, _) = run_board(&["boards"], &dir);
    assert!(out.contains("sprint"));

    let (out, _, _) = run_board(&["status"], &dir);
    assert!(out.contains("sprint"));
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
