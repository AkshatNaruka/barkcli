//! Integration tests for milestones, gate v2, merge train, agent loop, worktree lifecycle.
use anyhow::Result;
use barkcli_core::models::{Board, Card, Milestone};

#[test]
fn milestone_progress_zero_when_no_cards() {
    let board = Board::new("t");
    let m = Milestone::new("m", "Test");
    assert_eq!(m.progress(&board), 0.0);
}

#[test]
fn milestone_progress_counts_done() {
    let mut board = Board::new("t");
    board.cards.push(Card::new("a", "A", "done"));
    board.cards.push(Card::new("b", "B", "todo"));
    let mut m = Milestone::new("m", "Test");
    m.card_ids = vec!["a".into(), "b".into()];
    assert_eq!(m.progress(&board), 50.0);
}

#[test]
fn gate_empty_profile_passes() {
    let profile = barkcli_core::agent::verify::VerifyProfile { steps: vec![] };
    let v = barkcli_core::agent::gate::run_gate_v2(&profile, std::path::Path::new("/tmp"), "h", "t", None, &barkcli_core::agent::gate::GateConfig::default());
    assert!(v.passed);
}

#[test]
fn merge_train_orders_by_ordinal() {
    use barkcli_core::runtime::merge_train::{TrainItem, TrainItemStatus};
    use barkcli_core::runtime::event::{RunRecord, StartRun, RunStatus};
    let mk = |id: &str, ord: u32| {
        let mut r = RunRecord::new(&StartRun {
            run_id: id.into(),
            thread_id: "c".into(),
            card_id: "c".into(),
            prompt: "".into(),
            cwd: "/tmp".into(),
            provider: "fake".into(),
            model: None,
            role: None,
            agent_id: None,
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        });
        r.ordinal = ord;
        r
    };
    let runs = vec![mk("r1", 1), mk("r2", 2)];
    let items = vec![
        TrainItem { run_id: "r2".into(), card_id: "c".into(), branch: None, head_sha: None, status: TrainItemStatus::Ready, reason: None, conflict_files: vec![] },
        TrainItem { run_id: "r1".into(), card_id: "c".into(), branch: None, head_sha: None, status: TrainItemStatus::Ready, reason: None, conflict_files: vec![] },
    ];
    let ordered = barkcli_core::runtime::merge_train::order_items(items, &runs);
    assert_eq!(ordered[0].run_id, "r1");
}

#[test]
fn agent_loop_registry_has_builtins() {
    let r = barkcli_core::agent::agent_loop::default_registry();
    assert!(r.list().contains(&"bash".to_string()));
}

#[test]
fn worktree_detect_setup_cargo() {
    let dir = std::env::temp_dir().join(format!("bark-test-setup-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("Cargo.toml"), "[package]").unwrap();
    let cmd = barkcli_core::agent::worktree_lifecycle::detect_setup(&dir);
    assert_eq!(cmd.as_deref(), Some("cargo build --quiet"));
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn metrics_inc_and_get() {
    let mut m = barkcli_core::util::metrics::Metrics::new();
    m.inc("x", 3);
    assert_eq!(m.get("x"), 3);
}
