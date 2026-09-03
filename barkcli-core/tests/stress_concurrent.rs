use std::sync::{Arc, Barrier};
use std::thread;

use barkcli_core::models::{Board, Card};
use barkcli_core::storage::board_file;

/// Stress test: concurrent board writes must not corrupt file (SPEC-001 R4).
#[test]
fn concurrent_board_writes_no_corruption() {
    // Create isolated temp project root
    let tmp = std::env::temp_dir().join(format!("barkcli-stress-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(tmp.join(".board")).unwrap();

    // We need to make find_project_root resolve to tmp.
    // board_file uses find_project_root which walks from cwd.
    // So we set cwd to tmp for this test.
    let orig_dir = std::env::current_dir().unwrap();
    std::env::set_current_dir(&tmp).unwrap();

    let board_name = "stress-board";
    let board = Board::new("Stress Board");
    board_file::write_board(board_name, &board).unwrap();

    let n_threads = 10usize;
    let n_writes_per_thread = 10usize;
    let barrier = Arc::new(Barrier::new(n_threads));

    let mut handles = Vec::new();
    for t in 0..n_threads {
        let b = barrier.clone();
        let name = board_name.to_string();
        let h = thread::spawn(move || {
            b.wait();
            for i in 0..n_writes_per_thread {
                // Use atomic RMW to prevent lost updates
                board_file::update_board(&name, |board| {
                    let card_id = format!("t{}-{}", t, i);
                    let card = Card::new(&card_id, format!("Card {}-{}", t, i), "todo");
                    board.cards.push(card);
                    Ok(())
                })
                .unwrap();
            }
        });
        handles.push(h);
    }

    for h in handles {
        h.join().expect("thread panicked");
    }

    // Verify: file is valid YAML, no tmp left, card count = n_threads * n_writes
    let final_board = board_file::read_board(board_name).expect("final read failed");
    assert_eq!(
        final_board.cards.len(),
        n_threads * n_writes_per_thread,
        "card count mismatch — lost writes"
    );

    // No .tmp file leaked in project root
    let entries: Vec<_> = std::fs::read_dir(&tmp).unwrap().collect();
    for e in entries {
        let p = e.unwrap().path();
        let s = p.to_string_lossy();
        assert!(!s.contains(".boardtmp"), "leaked tmp file {}", s);
        assert!(!s.contains(".tmp"), "leaked tmp file {}", s);
    }

    // Cleanup
    std::env::set_current_dir(orig_dir).unwrap();
    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
fn queue_persistence_atomic() {
    let tmp = std::env::temp_dir().join(format!("barkcli-queue-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp).unwrap();
    let qpath = tmp.join("test.json");
    let mut q = barkcli_core::agent::queue::TaskQueue::new();
    let task = barkcli_core::agent::queue::create_task("c1", "T1", "d", vec![], vec![], "high");
    q.add(task);
    q.save(&qpath).unwrap();
    assert!(qpath.exists());
    // No tmp left
    let tmp_left = tmp.join("test.json.tmp");
    assert!(!tmp_left.exists(), "tmp not cleaned");
    let loaded = barkcli_core::agent::queue::TaskQueue::load(&qpath).unwrap();
    assert_eq!(loaded.tasks.len(), 1);
    std::fs::remove_dir_all(&tmp).ok();
}
