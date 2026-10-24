//! Integration test for the living context file (separate process so the
//! process-wide CWD mutations here can't race the lib unit tests).

use std::time::Duration;

use barkcli_core::context_file::{digest, file_path, parse, DigestOpts};
use barkcli_core::memory::store::{MemoryStore, ProjectFact};
use barkcli_core::models::board::Board;
use barkcli_core::models::card::Card;
use barkcli_core::models::context::{BoardContext, FileRef};
use barkcli_core::storage::board_file::write_board;
use barkcli_core::storage::context::write_context;

fn give_tmp_unique(tag: &str, n: u32) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "bark_ctxfile_{}_{}_{}",
        tag,
        std::process::id(),
        n
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join(".board")).unwrap();
    dir
}

#[test]
fn full_digest_roundtrip_writes_file_and_respects_manual() {
    let root = give_tmp_unique("roundtrip", 0);
    // This integration binary is the only CWD-mutating test binary in the
    // crate's default test config, so set_current_dir is safe here.
    std::env::set_current_dir(&root).unwrap();

    // Board with one active card mapped to a file.
    let mut board = Board::new("digest-board");
    let mut card = Card::default();
    card.id = "ctx-1".into();
    card.title = "Living context writer".into();
    card.column = "doing".into();
    board.cards.push(card);
    write_board("digest-board", &board).unwrap();

    let mut ctx = BoardContext::new();
    let entry = ctx.card_mut("ctx-1");
    entry.files.push(FileRef::new("src/ctx.rs"));
    ctx.rebuild_index();
    write_context("digest-board", &ctx).unwrap();

    // One project fact → conventions content.
    let mut store = MemoryStore::open("digest-board").unwrap();
    store.memory.project_facts.push(ProjectFact {
        fact: "always route board writes through update_board".into(),
        category: "convention".into(),
        confidence: 0.9,
        sources: vec!["sess-1".into()],
        created_at: chrono::Utc::now(),
    });
    store.save().unwrap();

    // Pre-existing CLAUDE.md so wiring has something to append to.
    std::fs::write(root.join("CLAUDE.md"), "# Rules\n\n- keep PRs small\n").unwrap();

    let opts = DigestOpts { wire: true, ..Default::default() };
    let report = digest::run_digest_core("digest-board", &opts).unwrap();
    assert!(report.added.contains(&"snapshot".to_string()));
    assert!(report.added.contains(&"active".to_string()));
    assert!(report.added.contains(&"conventions".to_string()));
    assert!(report.flagged_stale.is_empty(), "flagged: {:?}", report.flagged_stale);

    let path = file_path(&root);
    let content = std::fs::read_to_string(&path).unwrap();
    let parsed = parse(&content);
    let ids: Vec<&str> = parsed.blocks.iter().map(|b| b.meta.id.as_str()).collect();
    for want in ["snapshot", "active", "conventions", "architecture", "verify"] {
        assert!(ids.contains(&want), "missing {} (found {:?})", want, ids);
    }
    let snapshot = parsed.blocks.iter().find(|b| b.meta.id == "snapshot").unwrap();
    assert!(snapshot.body.iter().any(|l| l.contains("digest-board")));
    let active = parsed.blocks.iter().find(|b| b.meta.id == "active").unwrap();
    assert!(active.body.iter().any(|l| l.contains("ctx-1")));
    assert!(active.body.iter().any(|l| l.contains("src/ctx.rs")));

    // Wiring appended the import to the pre-existing CLAUDE.md.
    let claude = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
    assert!(claude.contains("@project_context.md"), "CLAUDE.md not wired:\n{}", claude);

    // Idempotent second run: no rewrites, same block set.
    let report2 = digest::run_digest_core("digest-board", &DigestOpts::default()).unwrap();
    assert!(report2.rewritten.is_empty(), "rewritten: {:?}", report2.rewritten);
    let content2 = std::fs::read_to_string(&path).unwrap();
    let parsed2 = parse(&content2);
    assert_eq!(parsed2.blocks.len(), parsed.blocks.len());

    // Cleanup after a short settle so git subprocesses spawned by other
    // binaries aren't hit with a vanished CWD.
    std::thread::sleep(Duration::from_millis(50));
    let _ = std::fs::remove_dir_all(&root);
}
