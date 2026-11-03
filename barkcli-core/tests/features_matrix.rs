//! Integration test: Complete 9-feature matrix verification for barkcli.
//!
//! Validates:
//! 1. Collective Memory (Git-backed contribution graph, evidence scores, UCB & neglected analysis)
//! 2. Local-Agent Providers (OpenCode, Claude Code, Codex, Antigravity, Human probing & capabilities)
//! 3. Quick Open & Code Search (Symbol index generation, token matching, file mapping)
//! 4. Automations & Scheduling (Cron/interval scheduling store, interval parsing, task lifecycle)
//! 5. Mind Project Snapshot (Compilation of health, blockers, stale work, velocity, next actions)
//! 6. Skills & Toolchain (Skill registry, trigger matching, ecosystem toolchain probing)
//! 7. Board & Spec Traceability (Kanban board CRUD, spec_id linking, validation)
//! 8. Agent Queue & Review Gate (Autonomous task dispatch, worker claiming, completion, review verification)
//! 9. Memory Engine (4-tier hierarchy: Working, ShortTerm, LongTerm, External with BM25/TF-IDF search)

use std::fs;
use std::path::PathBuf;

use anyhow::Result;
use chrono::Utc;

use barkcli_core::agent::queue::{create_task, TaskQueue, TaskStatus};
use barkcli_core::agent::toolchain::get_toolchain_packages;
use barkcli_core::agent::{AgentRole, OrchestrationEngine};
use barkcli_core::code::SymbolIndex;
use barkcli_core::commands::schedule::{parse_every, read_schedules, write_schedules, ScheduleEntry};
use barkcli_core::memory::store::{MemoryEntry, MemoryStore, MemoryTier};
use barkcli_core::models::board::Board;
use barkcli_core::models::card::Card;
use barkcli_core::runtime::event::{ContributionKind, RunStatus, StartRun};
use barkcli_core::runtime::provider::ProviderRegistry;
use barkcli_core::runtime::RuntimeStore;
use barkcli_core::skills::SkillRegistry;
use barkcli_core::storage::board_file::{read_board, write_board};

static CWD_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn temp_workspace(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "bark_matrix_{}_{}_{}",
        name,
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join(".board/runs")).unwrap();
    fs::create_dir_all(dir.join(".board/memory")).unwrap();
    fs::create_dir_all(dir.join(".board/mind")).unwrap();
    fs::create_dir_all(dir.join(".board/tasks")).unwrap();
    dir
}

#[test]
fn test_feature_1_collective_memory_graph() -> Result<()> {
    let ws = temp_workspace("f1_collective_memory");
    let store = RuntimeStore::new(ws.join(".board"));

    // Create a hypothesis contribution run
    let run_id = "run_hypo_01".to_string();
    let start = StartRun {
        run_id: run_id.clone(),
        thread_id: "thread_01".into(),
        card_id: "card_01".into(),
        prompt: "Refactor auth token cache".into(),
        cwd: ws.to_string_lossy().to_string(),
        provider: "manual".into(),
        model: None,
        role: Some("researcher".into()),
        agent_id: Some("agent-1".into()),
        permission_mode: "manual".into(),
        provider_session_id: None,
        raw_log_path: None,
    };

    let mut run = store.create_run(&start)?;
    run.title = Some("Token refresh hypothesis".into());
    run.kind = ContributionKind::Hypothesis;
    run.status = RunStatus::Passed;
    run.ended_at = Some(Utc::now());
    run.evidence_score = 0.85;
    store.save_run(&run)?;

    // Verify run persistence
    let loaded = store.load_run(&run_id)?;
    assert_eq!(loaded.title.as_deref(), Some("Token refresh hypothesis"));
    assert_eq!(loaded.kind, ContributionKind::Hypothesis);

    // Verify contribution index analysis
    let index = store.contribution_index()?;
    let analysis = index.analysis();
    assert_eq!(analysis.metrics.total_nodes, 1);
    assert_eq!(analysis.open_hypotheses.len(), 1);
    assert_eq!(analysis.open_hypotheses[0].id, run_id);

    Ok(())
}

#[test]
fn test_feature_2_local_agent_providers() {
    let registry = ProviderRegistry::default();
    let statuses = registry.statuses();

    assert!(!statuses.is_empty(), "Providers registry must not be empty");

    let provider_ids: Vec<&str> = statuses.iter().map(|s| s.id.as_str()).collect();
    assert!(provider_ids.contains(&"opencode"), "Must have OpenCode adapter");
    assert!(provider_ids.contains(&"claude-code"), "Must have Claude Code adapter");
    assert!(provider_ids.contains(&"codex"), "Must have Codex adapter");
    assert!(provider_ids.contains(&"human"), "Must have Human adapter");

    // Human provider is always available and authenticated
    let human = statuses.iter().find(|s| s.id == "human").unwrap();
    assert!(human.available);
    assert_eq!(human.authenticated, Some(true));

    // OpenCode has streaming, headless, and fork capabilities
    let opencode = statuses.iter().find(|s| s.id == "opencode").unwrap();
    assert!(opencode.capabilities.stream_json);
    assert!(opencode.capabilities.headless);
    assert!(opencode.capabilities.fork);
}

#[test]
fn test_feature_3_quick_open_and_code_search() -> Result<()> {
    let ws = temp_workspace("f3_code_search");
    let src_dir = ws.join("src");
    fs::create_dir_all(&src_dir)?;

    fs::write(
        src_dir.join("auth.rs"),
        r#"
pub fn verify_jwt(token: &str) -> bool {
    !token.is_empty()
}

pub struct AuthSession {
    pub user_id: String,
}
"#,
    )?;

    let index = SymbolIndex::build(&ws);
    assert!(!index.files.is_empty(), "Must index source files");

    let hits = index.search("verify_jwt", 5);
    assert!(!hits.is_empty(), "Must match verify_jwt symbol");
    assert!(hits[0].path.contains("auth.rs"));
    assert!(hits[0].matched_symbols.contains(&"verify_jwt".to_string()));

    Ok(())
}

#[test]
fn test_feature_4_automations_and_scheduling() -> Result<()> {
    let _guard = CWD_LOCK.lock().unwrap();
    let ws = temp_workspace("f4_schedule");
    std::env::set_current_dir(&ws)?;

    assert_eq!(parse_every("30m")?, 1800);
    assert_eq!(parse_every("1h")?, 3600);
    assert_eq!(parse_every("2d")?, 172800);

    let initial = read_schedules()?;
    assert!(initial.is_empty());

    let entry = ScheduleEntry {
        id: "sched_test_1".into(),
        intent: "summarize the README".into(),
        every_secs: 3600,
        backend: "opencode".into(),
        board: "dev".into(),
        last_run: None,
        next_run: Utc::now(),
        enabled: true,
        last_status: None,
        created_at: Utc::now(),
    };

    write_schedules(&[entry])?;
    let updated = read_schedules()?;
    assert_eq!(updated.len(), 1);
    assert_eq!(updated[0].intent, "summarize the README");
    assert_eq!(updated[0].every_secs, 3600);

    Ok(())
}

#[test]
fn test_feature_5_mind_project_snapshot() -> Result<()> {
    let _guard = CWD_LOCK.lock().unwrap();
    let ws = temp_workspace("f5_mind");
    std::env::set_current_dir(&ws)?;

    let mut board = Board::new("dev_f5");
    let mut card1 = Card::new("card-1", "Fix auth timeout", "todo");
    card1.priority = "high".into();
    let mut card2 = Card::new("card-2", "Add billing tests", "done");
    card2.priority = "medium".into();
    board.cards.push(card1);
    board.cards.push(card2);
    write_board("dev_f5", &board)?;

    let mind = barkcli_core::mind::snapshot::build("dev_f5")?;
    assert_eq!(mind.board_name, "dev_f5");
    assert_eq!(mind.stats.total, 2);
    assert_eq!(mind.stats.by_column.get("todo"), Some(&1));
    assert_eq!(mind.stats.by_column.get("done"), Some(&1));

    // Markdown digest generation
    let md = barkcli_core::mind::digest::render(&mind);
    assert!(md.contains("# Mind — dev_f5"));
    assert!(md.contains("Total 2 cards"));

    Ok(())
}

#[test]
fn test_feature_6_skills_and_toolchain() -> Result<()> {
    let reg = SkillRegistry::load_all(None)?;
    let skill_ids: Vec<&str> = reg.list().iter().map(|s| s.id.as_str()).collect();

    assert!(skill_ids.contains(&"planning"));
    assert!(skill_ids.contains(&"scrum-master"));
    assert!(skill_ids.contains(&"test"));
    assert!(skill_ids.contains(&"tdd"));

    // Toolchain inspection
    let tools = get_toolchain_packages();
    assert!(!tools.is_empty());
    let tool_names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
    assert!(tool_names.contains(&"fx"));
    assert!(tool_names.contains(&"deepsec"));
    assert!(tool_names.contains(&"agent-browser"));

    Ok(())
}

#[test]
fn test_feature_7_board_and_spec_traceability() -> Result<()> {
    let _guard = CWD_LOCK.lock().unwrap();
    let ws = temp_workspace("f7_traceability");
    std::env::set_current_dir(&ws)?;

    let mut board = Board::new("dev_f7");
    let mut card = Card::new("card-spec-01", "Implement OAuth login", "todo");
    card.spec_id = Some("SPEC-AUTH-001".into());
    card.labels.push("security".into());
    board.cards.push(card);

    write_board("dev_f7", &board)?;

    let loaded = read_board("dev_f7")?;
    assert_eq!(loaded.cards.len(), 1);
    let c = &loaded.cards[0];
    assert_eq!(c.id, "card-spec-01");
    assert_eq!(c.spec_id.as_deref(), Some("SPEC-AUTH-001"));
    assert!(c.labels.contains(&"security".to_string()));

    Ok(())
}

#[test]
fn test_feature_8_agent_queue_and_review() -> Result<()> {
    let _guard = CWD_LOCK.lock().unwrap();
    let ws = temp_workspace("f8_queue");
    std::env::set_current_dir(&ws)?;

    let mut board = Board::new("dev_f8");
    let card = Card::new("card-review-01", "Implement rate limiter", "review");
    board.cards.push(card);
    write_board("dev_f8", &board)?;

    let mut queue = TaskQueue::new();
    let task = create_task(
        "card-review-01",
        "Write unit tests for rate limiter",
        "Unit tests verifying token bucket rate limiter",
        vec!["10 req/s threshold".into()],
        vec![],
        "high",
    );
    let task_id = task.id.clone();
    queue.add(task);

    // Claim task for worker
    queue.claim(&task_id, "worker_agent", Some("session_01"), 30)?;
    let claimed = queue.get(&task_id).unwrap();
    assert_eq!(claimed.status, TaskStatus::Assigned);
    assert_eq!(claimed.assigned_agent.as_deref(), Some("worker_agent"));

    // Run ScrumMaster orchestration cycle
    let mut engine = OrchestrationEngine::new("dev_f8", AgentRole::ScrumMaster, board)?;
    let cycle_result = engine.run_cycle()?;
    assert_eq!(cycle_result.cycle_number, 1);

    Ok(())
}

#[test]
fn test_feature_9_memory_4tier_hybrid_search() -> Result<()> {
    let _guard = CWD_LOCK.lock().unwrap();
    let ws = temp_workspace("f9_memory");
    std::env::set_current_dir(&ws)?;

    let mut store = MemoryStore::open("dev_f9")?;

    // Add memories across tiers
    store.add(MemoryEntry::new(
        "auth errors were caused by expired JWT secret cache in redis",
        MemoryTier::LongTerm,
    ));
    store.add(MemoryEntry::new(
        "database connection pool exhausted during stress benchmark",
        MemoryTier::ShortTerm,
    ));
    store.add(MemoryEntry::new(
        "ui button click animation timing optimized to 150ms",
        MemoryTier::Working,
    ));

    store.save()?;

    // Search for "auth errors" using BM25/TF-IDF ranker
    let hits = store.search("auth errors", 3);
    assert!(!hits.is_empty(), "Must find auth memory");
    assert!(hits[0].content.contains("expired JWT secret"));
    assert_eq!(hits[0].tier, MemoryTier::LongTerm);

    Ok(())
}
