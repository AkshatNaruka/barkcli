//! End-to-end check for `barkcli context wire` (own process: it mutates CWD).

use barkcli_core::commands::context::run_wire;
use barkcli_core::models::board::Board;
use barkcli_core::storage::board_dir::ensure_board_dir;
use barkcli_core::storage::board_file::write_board;

fn tmp_project(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("bark_wire_{}_{}", tag, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join(".board")).unwrap();
    dir
}

#[test]
fn wire_creates_core_files_then_syncs_without_duplicating() {
    let root = tmp_project("e2e");
    std::env::set_current_dir(&root).unwrap();
    ensure_board_dir().unwrap();
    write_board("wire-board", &Board::new("wire-board")).unwrap();

    // First run on a bare repo: create the files every agent looks for.
    run_wire("wire-board", &["--create".to_string()]).unwrap();
    let claude_path = root.join("CLAUDE.md");
    let agents_path = root.join("AGENTS.md");
    assert!(claude_path.exists(), "CLAUDE.md was not created");
    assert!(agents_path.exists(), "AGENTS.md was not created");

    let claude = std::fs::read_to_string(&claude_path).unwrap();
    assert!(claude.contains("<!-- barkcli:context:start -->"));
    assert!(claude.contains("@project_context.md"));

    // A human adds their own rules below the managed block.
    std::fs::write(&claude_path, format!("{}\n## House rules\n\n- keep PRs small\n", claude)).unwrap();

    // Second run is a sync, not an append: one block, hand edits intact.
    run_wire("wire-board", &[]).unwrap();
    let synced = std::fs::read_to_string(&claude_path).unwrap();
    assert_eq!(synced.matches("<!-- barkcli:context:start -->").count(), 1);
    assert!(synced.contains("- keep PRs small"));

    // And it is byte-stable: a third run changes nothing.
    run_wire("wire-board", &[]).unwrap();
    assert_eq!(std::fs::read_to_string(&claude_path).unwrap(), synced);

    // `--all` seeds the remaining surfaces without touching the core two.
    run_wire("wire-board", &["--all".to_string()]).unwrap();
    assert!(root.join(".cursor/rules/barkcli.mdc").exists());
    assert!(root.join(".github/copilot-instructions.md").exists());
    assert_eq!(std::fs::read_to_string(&claude_path).unwrap(), synced);
}
