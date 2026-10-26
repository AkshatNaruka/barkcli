//! `barkcli run` — the autonomy loop: prompt → finished product.
//!
//! intent → intake card → plan (decompose) → task queue → spawn coding
//! agents in worktrees → watch the transcripts → acceptance gates (run the
//! project's tests) → merge train into main, or re-dispatch the task with
//! the failure verdict injected.
//!
//! The completion contract is deliberate: **a task is done when the plan's
//! acceptance gate passes in the worktree — never when the agent says so.**
//! A killed or crashed agent whose tests pass still merges; a chatty agent
//! whose tests fail still re-dispatches.
//!
//! Worker model (P0 ran one serial worker):
//!   `barkcli run ... --agents N` keeps up to N attempts running at once,
//!   each in its own worktree (`bark/<task-id>`). A worker owns its child
//!   process, transcript, and gate; the dispatcher owns the queue file and
//!   all merges. Workers mail beats (lease refresh) and results back over a
//!   channel. Each gate-passing branch merges the moment its worker
//!   finishes — the **merge train**: branches merge in finish order; a
//!   branch that no longer applies aborts and re-queues with the conflict
//!   verdict, so the next attempt bases off a main containing every
//!   previously merged change.
//!
//! `BARKCLI_AGENT_CMD` overrides the backend command for tests and demos —
//! the script runs inside the worktree with the prompt-file path as `$1`
//! (also exposed as `BARKCLI_PROMPT_FILE`).

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::Serialize;

use crate::agent::decompose::{decompose_task, CardDecompositionContext};
use crate::agent::queue::{create_task, populate_context_files, TaskRequest, TaskStatus};
use crate::agent::recipe::{prompt_arg_ok, AgentVerdict, Recipe, Stream};
use crate::agent::worktree::{acquire_worktree, release_worktree};
use crate::agent::{
    build_task_prompt, load_session, save_session, sessions_dir, skills_for_task, AgentRole,
    Session, SessionBackend, SessionStatus, TaskQueue,
};
use crate::memory::store::{MemoryStore, ProjectFact};
use crate::storage::board_dir::{find_board_dir, find_project_root};
use crate::storage::board_file::{read_board, update_board};
use crate::util::style;
use super::fleet::{ensure_agent, load_queue, load_registry, save_queue, save_registry};
use super::intake::{
    classify_input, create_card_from_classification, create_spec_from_intake, heuristic_intake,
    IntakeClassification,
};

// ── options ──

#[derive(Debug, Clone)]
pub struct RunOptions {
    /// Optional existing card identifier to run without creating a duplicate card.
    pub card_id: Option<String>,
    /// Natural language intent.
    pub intent: String,
    /// Target board (defaults to the first `.board` file).
    pub board: Option<String>,
    /// Backend override; `None` = auto-detect (opencode → claude → codex).
    pub backend: Option<SessionBackend>,
    /// Auto-merge branches that pass the gate.
    pub yes: bool,
    /// Force offline heuristic intake (no LLM attempt).
    pub offline: bool,
    pub force_bug: bool,
    pub force_feature: bool,
    /// Skip spec creation.
    pub no_spec: bool,
    /// Explicit gate command (defaults to detection by repo markers).
    pub test_cmd: Option<String>,
    /// Per-attempt wall clock budget in minutes.
    pub max_minutes: u64,
    /// Terminate agents whose transcript is idle this long.
    pub idle_minutes: u64,
    /// Task-retry ceiling before a permanent failure.
    pub max_attempts: u32,
    /// Max attempts running concurrently (`--agents N`, capped at 16).
    /// Each attempt runs in its own worktree; branches merge through the
    /// merge train as workers finish.
    pub max_agents: usize,
    /// Classify + print, don't create anything.
    pub dry_run: bool,
    /// Emit the final report as JSON.
    pub json: bool,
}

impl Default for RunOptions {
    fn default() -> Self {
        Self {
            card_id: None,
            intent: String::new(),
            board: None,
            backend: None,
            yes: false,
            offline: false,
            force_feature: false,
            force_bug: false,
            no_spec: false,
            test_cmd: None,
            max_minutes: 20,
            idle_minutes: 5,
            max_attempts: 3,
            max_agents: 1,
            dry_run: false,
            json: false,
        }
    }
}

// ── report ──

#[derive(Debug, Clone, Serialize)]
pub struct GateResult {
    pub cmd: Option<String>,
    pub ok: bool,
    pub skipped: bool,
    pub tail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskOutcome {
    pub task_id: String,
    pub title: String,
    pub attempts: u32,
    pub status: String, // completed | ready-unmerged | failed | queued
    pub merged: bool,
    pub gate: Option<GateResult>,
    pub transcript: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunReport {
    pub intent: String,
    pub card_id: String,
    pub backend_used: Option<String>,
    pub tasks: Vec<TaskOutcome>,
    pub completed: u32,
    pub failed: u32,
    pub queued: u32,
    pub duration_seconds: u64,
    pub note: Option<String>,
    /// Worker cap from `--agents` (None for the serial default).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parallel: Option<usize>,
    /// Highest number of attempts that ran simultaneously.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workers_peak: Option<usize>,
    /// Branches that landed on main, in merge-train order.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_branches: Option<Vec<String>>,
}

// ── CLI ──

/// Parse `barkcli run <intent> [flags]` and execute.
pub fn run_cli(args: &[String]) -> Result<()> {
    let mut opts = RunOptions::default();
    let mut text_parts = Vec::new();

    let mut i = 0usize;
    while i < args.len() {
        let a = &args[i];
        match a.as_str() {
            "--yes" | "-y" => opts.yes = true,
            "--offline" => opts.offline = true,
            "--bug" => opts.force_bug = true,
            "--feature" => opts.force_feature = true,
            "--no-spec" => opts.no_spec = true,
            "--dry-run" => opts.dry_run = true,
            "--json" => opts.json = true,
            "--board" | "-b" => {
                i += 1;
                opts.board = Some(
                    args.get(i)
                        .ok_or_else(|| anyhow!("--board expects a name"))?
                        .clone(),
                );
            }
            "--backend" => {
                i += 1;
                let v = args.get(i).ok_or_else(|| anyhow!("--backend expects a name"))?;
                opts.backend = Some(
                    SessionBackend::parse(v).ok_or_else(|| {
                        anyhow!("unknown backend '{}' (opencode|claude|codex|human)", v)
                    })?,
                );
            }
            "--test-cmd" => {
                i += 1;
                opts.test_cmd = Some(
                    args.get(i)
                        .ok_or_else(|| anyhow!("--test-cmd expects a command string"))?
                        .clone(),
                );
            }
            "--agents" => {
                i += 1;
                let n: usize = args
                    .get(i)
                    .ok_or_else(|| anyhow!("--agents expects a number"))?
                    .parse()
                    .map_err(|_| anyhow!("--agents expects a number"))?;
                if n == 0 {
                    anyhow::bail!("--agents must be at least 1");
                }
                opts.max_agents = n.min(16);
            }
            "--max-minutes" => {
                i += 1;
                opts.max_minutes = args
                    .get(i)
                    .ok_or_else(|| anyhow!("--max-minutes expects a number"))?
                    .parse()
                    .map_err(|_| anyhow!("--max-minutes expects a number"))?;
            }
            "--idle-minutes" => {
                i += 1;
                opts.idle_minutes = args
                    .get(i)
                    .ok_or_else(|| anyhow!("--idle-minutes expects a number"))?
                    .parse()
                    .map_err(|_| anyhow!("--idle-minutes expects a number"))?;
            }
            "--max-attempts" => {
                i += 1;
                opts.max_attempts = args
                    .get(i)
                    .ok_or_else(|| anyhow!("--max-attempts expects a number"))?
                    .parse()
                    .map_err(|_| anyhow!("--max-attempts expects a number"))?;
            }
            "--card" | "--card-id" => {
                i += 1;
                opts.card_id = Some(
                    args.get(i)
                        .ok_or_else(|| anyhow!("--card expects a card identifier"))?
                        .clone(),
                );
            }
            _ if a.starts_with('-') => {
                anyhow::bail!(
                    "unknown flag '{}'. usage: barkcli run \"<intent>\" [--card ID] [--backend NAME] [--agents N] [--yes] [--offline] [--bug|--feature] [--test-cmd CMD] [--max-minutes N] [--idle-minutes N] [--max-attempts N] [--no-spec] [--dry-run] [--json]",
                    a
                );
            }
            _ => text_parts.push(a.clone()),
        }
        i += 1;
    }

    opts.intent = text_parts.join(" ");
    if opts.intent.is_empty() && opts.card_id.is_none() {
        anyhow::bail!(
            "usage: barkcli run \"<intent>\" [--card ID] [--backend NAME] [--agents N] [--yes] [--offline] [--test-cmd CMD]"
        );
    }

    let report = run(opts.clone())?;
    print_report(&report, opts.json)
}

// ── worker protocol ──

/// Messages worker threads mail back to the dispatcher.
enum WMsg {
    /// Lease refresh (every 30s while the child is alive).
    Beat { task_id: String },
    /// The worker finished its attempt (child gone, gate run, committed).
    Done(Box<WDone>),
}

struct WDone {
    task_id: String,
    title: String,
    card_id: String,
    attempt: u32,
    session: Option<Session>,
    stream_verdict: Option<AgentVerdict>,
    exit_code: Option<i32>,
    gate: GateResult,
    dirty: bool,
    made_commits: u32,
    transcript_path: Option<String>,
    /// Worker-side fatal error (panic). The attempt still reports Done so
    /// the dispatcher can re-queue instead of hanging.
    error: Option<String>,
}

// ── the loop ──

/// Execute the full autonomy run. Returns a serializable report.
pub fn run(opts: RunOptions) -> Result<RunReport> {
    let started = Instant::now();

    // 0. Auto-init (same behavior as `serve`): no .board → bootstrap it.
    if find_board_dir().is_err() {
        super::init::run(&[])?;
    }

    let board_name = match &opts.board {
        Some(b) => b.clone(),
        None => first_board()?,
    };

    let (card_id, classification) = if let Some(ref cid) = opts.card_id {
        let card = find_card(&board_name, cid)?;
        let class = IntakeClassification {
            card_type: if card.labels.iter().any(|l| l == "bug") { "bug".into() } else { "feature".into() },
            priority: card.priority.clone(),
            scope: "medium".into(),
            area: card.area.clone().unwrap_or_else(|| "fullstack".into()),
            title: card.title.clone(),
            description: card.description.clone().unwrap_or_default(),
            labels: card.labels.clone(),
            acceptance_criteria: card.acceptance_criteria.clone(),
        };
        (cid.clone(), class)
    } else {
        // 1. Intake: classify the intent (LLM, falling back to heuristics when
        // no provider is configured; `--offline` skips the LLM entirely).
        let classification: IntakeClassification = if opts.offline {
            heuristic_intake(&opts.intent, opts.force_bug, opts.force_feature)
        } else {
            classify_input(&opts.intent, opts.force_bug, opts.force_feature)
        };

        if opts.dry_run {
            println!("{}", style::accent("Run (dry):"));
            println!("  Type:     {}", classification.card_type);
            println!("  Priority: {}", classification.priority);
            println!("  Title:    {}", classification.title);
            println!(
                "  AC:       {} criteria",
                classification.acceptance_criteria.len()
            );
            println!("  Board:    {}", board_name);
            println!("  Backend:  {}", backend_line(&opts));
            println!("  Workers:  {}", opts.max_agents);
            return Ok(RunReport {
                intent: opts.intent.clone(),
                card_id: String::new(),
                backend_used: None,
                tasks: Vec::new(),
                completed: 0,
                failed: 0,
                queued: 0,
                duration_seconds: started.elapsed().as_secs(),
                note: Some("dry run: nothing created".into()),
                parallel: parallel_opt(&opts),
                workers_peak: None,
                merged_branches: None,
            });
        }

        let cid = create_card_from_classification(&board_name, &classification)?;
        println!(
            "{} Intake: card {} created",
            style::ok("OK"),
            style::strong(&cid)
        );

        // Spec (never blocks the run on failure).
        if !opts.no_spec {
            if create_spec_from_intake(&board_name, &cid, &classification).unwrap_or(false) {
                let _ = update_board(&board_name, |b| {
                    if let Some(c) = b.cards.iter_mut().find(|c| c.id == cid) {
                        c.spec_id = Some(crate::util::slug::to_slug(&classification.title));
                        c.touch();
                    }
                    Ok(())
                });
            }
        }
        (cid, classification)
    };

    if opts.dry_run {
        println!("{}", style::accent("Run (dry):"));
        println!("  Card:     {}", card_id);
        println!("  Title:    {}", classification.title);
        println!("  Board:    {}", board_name);
        println!("  Backend:  {}", backend_line(&opts));
        println!("  Workers:  {}", opts.max_agents);
        return Ok(RunReport {
            intent: opts.intent.clone(),
            card_id,
            backend_used: None,
            tasks: Vec::new(),
            completed: 0,
            failed: 0,
            queued: 0,
            duration_seconds: started.elapsed().as_secs(),
            note: Some("dry run: nothing created".into()),
            parallel: parallel_opt(&opts),
            workers_peak: None,
            merged_branches: None,
        });
    }

    // 2. Plan and Queue: reuse existing queue tasks for this card if already present.
    let mut q = load_queue(&board_name)?;
    let existing_count = q.tasks.iter().filter(|t| t.card_id == card_id).count();
    if existing_count == 0 {
        let card = find_card(&board_name, &card_id)?;
        let plan = decompose_task(
            &card,
            &AgentRole::TechLead,
            Some(&CardDecompositionContext::default()),
        );
        println!(
            "{} Plan: {} tasks decomposed",
            style::ok("OK"),
            plan.child_cards.len()
        );

        for child in &plan.child_cards {
            let ctx_files = populate_context_files(&card_id, &board_name);
            let task = create_task(
                &card_id,
                &child.title,
                &child.description,
                child.acceptance_criteria.clone(),
                ctx_files,
                &child.priority,
            );
            q.add(task);
        }
        save_queue(&board_name, &q)?;
    } else {
        println!(
            "{} Queue: found {} existing tasks for card {}",
            style::ok("OK"),
            existing_count,
            style::strong(&card_id)
        );
    }

    // 4. Registry — the runner is itself an agent in the registry.
    let mut registry = load_registry()?;
    ensure_agent(&mut registry, "runner", AgentRole::TechLead)?;
    save_registry(&registry)?;

    // 5. Backend selection.
    let injected = std::env::var("BARKCLI_AGENT_CMD")
        .ok()
        .filter(|c| !c.trim().is_empty());
    let backend: Option<SessionBackend> = opts
        .backend
        .clone()
        .or_else(|| {
            SessionBackend::detect_available()
                .into_iter()
                .find(|b| *b != SessionBackend::Human)
        });
    if injected.is_some() && opts.backend.is_some() {
        anyhow::bail!("Set either BARKCLI_AGENT_CMD or --backend, not both");
    }

    if injected.is_none() && backend.is_none() {
        // No agent runtime installed: the queue is persisted; tell the user.
        let tasks: Vec<TaskOutcome> = q
            .tasks
            .iter()
            .map(|t| TaskOutcome {
                task_id: t.id.clone(),
                title: t.title.clone(),
                attempts: 0,
                status: "queued".into(),
                merged: false,
                gate: None,
                transcript: None,
                note: None,
            })
            .collect();
        let n = tasks.len() as u32;
        println!(
            "{} no coding-agent backend found (opencode/claude/codex) — tasks are queued",
            style::warn("Run:")
        );
        println!("  Install a backend or set BARKCLI_AGENT_CMD to drive them.");
        return Ok(RunReport {
            intent: opts.intent.clone(),
            card_id,
            backend_used: None,
            completed: 0,
            failed: 0,
            queued: n,
            tasks,
            duration_seconds: started.elapsed().as_secs(),
            note: Some(
                "no backend installed and no BARKCLI_AGENT_CMD override; tasks queued for a later run"
                    .into(),
            ),
            parallel: parallel_opt(&opts),
            workers_peak: None,
            merged_branches: None,
        });
    }

    let backend_used = injected
        .as_ref()
        .map(|_| "agent-cmd".to_string())
        .or_else(|| backend.as_ref().map(|b| b.display_name().to_string()));

    println!(
        "{} Backend: {}",
        style::ok("OK"),
        style::strong(backend_used.as_deref().unwrap_or("auto"))
    );
    if opts.max_agents > 1 {
        println!(
            "{} Pool: up to {} tasks in parallel — merge train on finish",
            style::ok("OK"),
            opts.max_agents
        );
    }

    // 6. The dispatcher: keep up to `max_agents` workers running. Workers
    //    own one attempt each (spawn → watch → gate → commit) and mail
    //    results back. The dispatcher owns queue writes + all merges.
    let (tx, rx) = mpsc::channel::<WMsg>();
    let mut outcomes: Vec<TaskOutcome> = Vec::new();
    let mut attempts: HashMap<String, u32> = HashMap::new();
    let mut verdicts: HashMap<String, String> = HashMap::new();
    let mut in_flight: usize = 0;
    let mut peak: usize = 0;
    let mut merged_branches: Vec<String> = Vec::new();
    // Merge-train solo backlog: tasks whose merge conflicted and are waiting
    // to be re-dispatched alone (pool drained, main frozen for the attempt).
    let mut solo: Vec<String> = Vec::new();

    loop {
        // Top up the pool while slots are free and pending work exists.
        // While the solo backlog is non-empty, only backlog tasks dispatch,
        // and only once the pool has fully drained.
        while in_flight < opts.max_agents {
            let mut only: Option<String> = None;
            if !solo.is_empty() {
                if in_flight > 0 {
                    break; // let the current wave finish before solo runs
                }
                let q = load_queue(&board_name)?;
                only = solo
                    .iter()
                    .find(|s| {
                        q.tasks
                            .iter()
                            .any(|t| &t.id == *s && t.status == TaskStatus::Pending)
                    })
                    .cloned();
                if only.is_none() {
                    // Every backlog task reached a terminal state meanwhile.
                    solo.clear();
                }
            }
            match dispatch_next(
                &board_name,
                &opts,
                injected.as_deref(),
                backend.as_ref(),
                only.as_deref(),
                &mut attempts,
                &verdicts,
                &tx,
            )? {
                DispatchNext::Spawned => {
                    in_flight += 1;
                    peak = peak.max(in_flight);
                }
                DispatchNext::Ceiling(task_id) => {
                    solo.retain(|s| s != &task_id);
                    outcomes.push(TaskOutcome {
                        title: title_of(&board_name, &task_id)?,
                        task_id,
                        attempts: opts.max_attempts,
                        status: "failed".into(),
                        merged: false,
                        gate: None,
                        transcript: None,
                        note: Some("retry ceiling reached".into()),
                    });
                }
                DispatchNext::HardFail(task_id, note) => {
                    solo.retain(|s| s != &task_id);
                    attempts.remove(&task_id);
                    outcomes.push(TaskOutcome {
                        title: title_of(&board_name, &task_id)?,
                        task_id,
                        attempts: opts.max_attempts,
                        status: "failed".into(),
                        merged: false,
                        gate: None,
                        transcript: None,
                        note: Some(format!(
                            "dispatch failed: {} — task marked failed",
                            note
                        )),
                    });
                }
                // Requeued for a later attempt, or nothing pending at all:
                // leave the top-up loop and check the drain conditions.
                DispatchNext::RetryPending | DispatchNext::Idle => break,
            }
        }

        if in_flight == 0 {
            // The run is over only when the queue has nothing pending.
            // When targeting a specific card, only pending tasks for that card are considered.
            let q = load_queue(&board_name)?;
            let pending_remains = match &opts.card_id {
                Some(cid) => q.tasks.iter().any(|t| &t.card_id == cid && t.status == TaskStatus::Pending),
                None => q.next_pending().is_some(),
            };
            if !pending_remains {
                break;
            }
            continue;
        }

        // Wait for exactly one worker event; the timeout keeps the
        // dispatcher responsive.
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(WMsg::Beat { task_id }) => {
                beat_lease(&board_name, &task_id, opts.max_minutes as i64)?;
            }
            Ok(WMsg::Done(done)) => {
                in_flight -= 1;
                match handle_done(
                    &board_name,
                    &opts,
                    done,
                    &mut outcomes,
                    &mut merged_branches,
                    &mut verdicts,
                )? {
                    HandleSignal::Normal => {}
                    HandleSignal::SoloWait(task_id) => {
                        if !solo.contains(&task_id) {
                            solo.push(task_id);
                        }
                    }
                    HandleSignal::SoloClear(task_id) => {
                        solo.retain(|s| s != &task_id);
                    }
                }
            }
            Err(_) => {}
        }
    }

    Ok(RunReport {
        intent: opts.intent.clone(),
        card_id,
        backend_used,
        completed: outcomes.iter().filter(|o| o.status == "completed").count() as u32,
        failed: outcomes.iter().filter(|o| o.status == "failed").count() as u32,
        queued: outcomes.iter().filter(|o| o.status == "queued").count() as u32,
        tasks: outcomes,
        duration_seconds: started.elapsed().as_secs(),
        note: None,
        parallel: parallel_opt(&opts),
        workers_peak: if peak > 1 { Some(peak) } else { None },
        merged_branches: if merged_branches.is_empty() {
            None
        } else {
            Some(merged_branches)
        },
    })
}

fn parallel_opt(opts: &RunOptions) -> Option<usize> {
    if opts.max_agents > 1 {
        Some(opts.max_agents)
    } else {
        None
    }
}

enum DispatchNext {
    /// A task was claimed and its worker spawned.
    Spawned,
    /// Task hit the retry ceiling; it was marked Failed.
    Ceiling(String),
    /// Terminal dispatch failure (task marked Failed; note included).
    HardFail(String, String),
    /// Failed to start this attempt (worktree/spawn); the task was re-queued
    /// and a fresh attempt runs on the next dispatch round.
    RetryPending,
    /// Nothing pending to start right now.
    Idle,
}

/// What a finished worker instructs the dispatcher to do next.
enum HandleSignal {
    /// Usual bookkeeping only.
    Normal,
    /// The task hit a merge conflict and was re-queued — it must be
    /// re-dispatched solo (pool drained) so its next attempt bases off a
    /// main that is frozen for the whole attempt window.
    SoloWait(String),
    /// The task reached a terminal state — drop it from the solo backlog.
    SoloClear(String),
}

/// Claim the next pending task and hand its attempt to a worker thread.
/// Runs only on the dispatcher thread — the sole owner of queue writes and
/// merges.
fn dispatch_next(
    board_name: &str,
    opts: &RunOptions,
    injected: Option<&str>,
    backend: Option<&SessionBackend>,
    only: Option<&str>,
    attempts: &mut HashMap<String, u32>,
    verdicts: &HashMap<String, String>,
    tx: &mpsc::Sender<WMsg>,
) -> Result<DispatchNext> {
    let mut q = load_queue(board_name)?;
    let task_id = match only {
        // Solo-dispatch mode: only the named backlog task may start.
        Some(tid) => match q.tasks.iter().find(|t| t.id == *tid) {
            Some(t) if t.status == TaskStatus::Pending => tid.to_string(),
            _ => return Ok(DispatchNext::Idle),
        },        None => match &opts.card_id {
            Some(cid) => match q.tasks.iter().find(|t| &t.card_id == cid && t.status == TaskStatus::Pending).map(|t| t.id.clone()) {
                Some(id) => id,
                None => return Ok(DispatchNext::Idle),
            },
            None => match q.next_pending().map(|t| t.id.clone()) {
                Some(id) => id,
                None => return Ok(DispatchNext::Idle),
            },
        },
    };
    let idx = q
        .tasks
        .iter()
        .position(|t| t.id == task_id)
        .ok_or_else(|| anyhow!("task {} vanished from queue", task_id))?;
    let task = q.tasks[idx].clone();

    let attempt_no = {
        let entry = attempts.entry(task_id.clone()).or_insert(0);
        *entry += 1;
        *entry
    };

    if attempt_no > opts.max_attempts {
        attempts.remove(&task_id);
        q.update_status(&task_id, TaskStatus::Failed)?;
        save_queue(board_name, &q)?;
        return Ok(DispatchNext::Ceiling(task_id));
    }

    // ── claim + lease ──
    let mut session = Session::new("runner", backend.cloned().unwrap_or(SessionBackend::Human));
    session.task_id = Some(task_id.clone());
    q.claim(&task_id, "runner", Some(&session.id), opts.max_minutes as i64)?;
    q.start(&task_id)?;
    save_queue(board_name, &q)?;

    let spawn_ev = crate::threads::ThreadEvent::new(
        &task.card_id,
        crate::threads::ThreadEventKind::TaskSpawned,
        "barkcli",
        format!("Worker attempt {} of {} started for {}", attempt_no, opts.max_attempts, task.title),
        Some(serde_json::json!({
            "task_id": task.id,
            "title": task.title,
            "session_id": session.id,
            "attempt": attempt_no,
        })),
    );
    let _ = crate::threads::append_event(&task.card_id, &spawn_ev);

    println!(
        "{} {} (attempt {}/{})",
        style::accent("▶"),
        style::strong(&task.title),
        attempt_no,
        opts.max_attempts
    );

    // ── worktree ──
    let slug = task_id.clone();
    let wt_path = match acquire_worktree(&slug) {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("worktree acquisition failed: {}", e);
            println!("{} {}", style::warn("✘"), msg);
            if attempt_no < opts.max_attempts {
                record_failure_fact(board_name, &task, attempt_no, "(worktree)")?;
                requeue(&mut q, &task_id)?;
                save_queue(board_name, &q)?;
                return Ok(DispatchNext::RetryPending);
            }
            q.update_status(&task_id, TaskStatus::Failed)?;
            save_queue(board_name, &q)?;
            return Ok(DispatchNext::HardFail(task_id, msg));
        }
    };
    let branch = format!("bark/{}", slug);
    // Base commit the branch was cut from (change-detection later).
    let base_commit = git_out(&find_project_root()?, &["rev-parse", "HEAD"])?;

    // ── prompt (retry attempts get the failure verdict injected) ──
    let skills_md = skills_for_task(&task);
    let mut prompt = build_task_prompt(&task, &branch, skills_md.as_deref());
    if let Some(v) = verdicts.get(&task_id) {
        prompt = format!(
            "# Previous attempt failed\n\nAttempt {} failed the acceptance gate:\n\n{}\n\nFix the reported failure. Rerun the project's tests yourself before finishing.\n\n---\n\n{}",
            attempt_no.saturating_sub(1),
            v,
            prompt
        );
    }
    prompt.push_str("\n\n## Session contract\n\n");
    prompt.push_str("- Work entirely inside this checkout.\n");
    prompt.push_str("- Commit your work when done.\n");
    prompt.push_str(
        "- The supervisor re-runs the project's tests after you exit; only a passing gate merges.\n",
    );
    if !prompt_arg_ok(&prompt) {
        anyhow::bail!("prompt exceeds single-arg budget; reduce context files");
    }

    let sess_dir: PathBuf = sessions_dir()?.join(&session.id);
    std::fs::create_dir_all(&sess_dir).ok();
    let transcript = sess_dir.join("transcript.log");
    let prompt_file = sess_dir.join("prompt.md");
    std::fs::write(&prompt_file, &prompt)?;
    session.worktree_path = Some(wt_path.to_string_lossy().into_owned());
    session.branch = Some(branch.clone());
    session.transcript_path = Some(transcript.to_string_lossy().into_owned());
    session.prompt_path = Some(prompt_file.to_string_lossy().into_owned());

    let stream = stream_for(injected.is_some(), backend);

    // ── spawn ──
    let mut child = match spawn_agent(injected, backend.cloned(), &prompt, &prompt_file, &wt_path) {
        Ok(c) => c,
        Err(e) => {
            release_worktree(&slug, true).ok();
            let msg = format!("backend failed to launch: {}", e);
            println!("{} {}", style::warn("✘"), msg);
            if attempt_no < opts.max_attempts {
                record_failure_fact(board_name, &task, attempt_no, &msg)?;
                requeue(&mut q, &task_id)?;
                save_queue(board_name, &q)?;
                return Ok(DispatchNext::RetryPending);
            }
            q.update_status(&task_id, TaskStatus::Failed)?;
            save_queue(board_name, &q)?;
            return Ok(DispatchNext::HardFail(task_id, msg));
        }
    };
    session.pid = Some(child.id());
    session.status = SessionStatus::Working;
    session.add_note(
        "runner",
        &format!("spawned attempt {} (pid {})", attempt_no, child.id()),
    );
    save_session(&session)?;

    // ── hand the attempt to a worker thread ──
    let tx_w = tx.clone();
    let task_w = task.clone();
    let test_cmd = opts.test_cmd.clone();
    let idle_min = opts.idle_minutes;
    let max_min = opts.max_minutes;
    let tid = task_id.clone();
    thread::spawn(move || {
        // Panic isolation: a worker must never strand the dispatcher. Any
        // panic surfaces as a Done with an error note (the dispatcher then
        // re-queues or fails the task).
        let tid_inner = tid.clone();
        let tx_inner = tx_w.clone();
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            run_attempt(
                tid_inner,
                task_w,
                attempt_no,
                max_min,
                idle_min,
                test_cmd,
                &mut child,
                stream,
                &transcript,
                &wt_path,
                &base_commit,
                session,
                tx_inner,
            )
        }));
        let msg = match res {
            Ok(m) => m,
            Err(_) => WMsg::Done(Box::new(WDone {
                task_id: tid,
                title: String::new(),
                card_id: String::new(),
                attempt: 0,
                session: None,
                stream_verdict: None,
                exit_code: None,
                gate: GateResult {
                    cmd: None,
                    ok: false,
                    skipped: true,
                    tail: String::new(),
                },
                dirty: false,
                made_commits: 0,
                transcript_path: None,
                error: Some("worker thread panicked".into()),
            })),
        };
        let _ = tx_w.send(msg);
    });

    Ok(DispatchNext::Spawned)
}

/// One worker attempt: watch the child, run the gate, detect changes, commit
/// what the agent left uncommitted. Then the dispatcher takes over.
/// Everything here touches only thread-local data (child, files, own worktree).
#[allow(clippy::too_many_arguments)]
fn run_attempt(
    task_id: String,
    task: TaskRequest,
    attempt_no: u32,
    max_minutes: u64,
    idle_minutes: u64,
    test_cmd: Option<String>,
    child: &mut Child,
    stream: Stream,
    transcript: &Path,
    wt_path: &Path,
    base_commit: &str,
    mut session: Session,
    tx: mpsc::Sender<WMsg>,
) -> WMsg {
    // Beats go through the channel; the dispatcher (single owner of the
    // queue file) refreshes the lease on receipt.
    let beat_task = task_id.clone();
    let beat_sid = session.id.clone();
    let beat_tx = tx.clone();
    let mut beat = move || -> Result<()> {
        let _ = beat_tx.send(WMsg::Beat {
            task_id: beat_task.clone(),
        });
        // Refresh the session file heartbeat too — the web live panel reads
        // this file, and every writer must be last-wins safe.
        if let Ok(mut s) = load_session(&beat_sid) {
            s.heartbeat();
            save_session(&s).ok();
        }
        Ok(())
    };

    let mut verdict_seen: Option<AgentVerdict> = None;
    let watch_err = watch(child, stream, transcript, max_minutes, idle_minutes, &mut beat)
        .map(|v| {
            verdict_seen = v;
        })
        .err()
        .map(|e| e.to_string());
    // One final beat so a long gate can't expire the lease.
    let _ = tx.send(WMsg::Beat {
        task_id: task_id.clone(),
    });

    let exit_code = child.wait().ok().and_then(|s| s.code());
    let agent_failed = matches!(verdict_seen.as_ref(), Some(AgentVerdict::Failed(_)))
        || exit_code.map(|c| c != 0).unwrap_or(false);

    session.exit_code = exit_code;
    session.ended_at = Some(Utc::now());
    session.status = if agent_failed {
        SessionStatus::Failed
    } else {
        SessionStatus::Done
    };
    save_session(&session).ok();
    println!(
        "… agent finished (exit {:?}, verdict: {})",
        exit_code,
        match &verdict_seen {
            Some(AgentVerdict::Ok(t)) => format!("ok: {}", truncate(t, 60)),
            Some(AgentVerdict::Failed(t)) => format!("fail: {}", truncate(t, 60)),
            None => "none".to_string(),
        }
    );

    if let Some(e) = watch_err {
        // Transcript-only failure: the honesty contract keeps running.
        println!("{} transcript error: {}", style::warn("⚠"), e);
    }

    let sess_dir = session
        .prompt_path
        .as_ref()
        .and_then(|p| Path::new(p).parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    // The honesty rule, in two layers:
    //   1. the agent's self-report NEVER completes a task — the gate runs
    //      regardless of exit code or stream verdict;
    //   2. an agent that crashed and produced no changes can't claim a
    //      passing gate either (an empty worktree passes a trivial gate) —
    //      that attempt counts as failed.
    let gate = match detect_test_cmd(wt_path, test_cmd) {
        Some(cmd) => {
            println!("{} gate `{} …`", style::accent("Gate:"), style::muted(&cmd));
            run_gate(wt_path, &cmd, &sess_dir)
        }
        None => GateResult {
            cmd: None,
            ok: true,
            skipped: true,
            tail: "No test command detected (no Cargo.toml / package.json test script / pyproject / go.mod) — gate skipped; pass --test-cmd for real verification"
                .into(),
        },
    };
    let dirty = !git_out(wt_path, &["status", "--porcelain"])
        .unwrap_or_default()
        .trim()
        .is_empty();
    let branch_wt = session.branch.clone().unwrap_or_default();
    let made_commits = git_out(
        wt_path,
        &[
            "rev-list",
            "--count",
            &format!("{}..{}", base_commit, branch_wt),
        ],
    )
    .ok()
    .and_then(|s| s.parse::<u32>().ok())
    .unwrap_or(0);
    let agent_ok = !agent_failed;
    let changes = dirty || made_commits > 0;
    let candidates_ok = gate.ok && (agent_ok || changes);
    if !candidates_ok && gate.ok && !agent_ok && !changes {
        println!(
            "{} agent exited nonzero and produced no changes — a no-op gate doesn't count",
            style::warn("⚠")
        );
    }

    // Commit whatever the agent left uncommitted (the merge needs it; a
    // released worktree loses nothing otherwise).
    if candidates_ok {
        if let Err(e) = commit_worktree(wt_path, &task) {
            println!("{} commit in worktree failed: {}", style::warn("⚠"), e);
        }
    }

    WMsg::Done(Box::new(WDone {
        task_id,
        title: task.title.clone(),
        card_id: task.card_id.clone(),
        attempt: attempt_no,
        session: Some(session),
        stream_verdict: verdict_seen,
        exit_code,
        gate,
        dirty,
        made_commits,
        transcript_path: Some(transcript.to_string_lossy().into_owned()),
        error: None,
    }))
}

// ── outcome handling (dispatcher side; single-threaded) ──

/// Handle a finished worker: merge (or hand back as ready-unmerged), or
/// re-queue with the failure verdict — the merge train: branches merge in
/// finish order.
fn handle_done(
    board_name: &str,
    opts: &RunOptions,
    done: Box<WDone>,
    outcomes: &mut Vec<TaskOutcome>,
    merged_branches: &mut Vec<String>,
    verdicts: &mut HashMap<String, String>,
) -> Result<HandleSignal> {
    let task_id = done.task_id.clone();
    let attempt_no = done.attempt;
    let transcript_path = done.transcript_path.clone();

    // Worker panic: requeue (or fail at the ceiling) without touching gates.
    if let Some(err) = done.error {
        let mut q = load_queue(board_name)?;
        release_worktree(&task_id, true).ok();
        if attempt_no < opts.max_attempts {
            verdicts.insert(task_id.clone(), format!("worker error: {}", err));
            requeue(&mut q, &task_id)?;
            save_queue(board_name, &q)?;
            println!("{} worker error — re-queued: {}", style::warn("↺"), err);
            return Ok(HandleSignal::Normal);
        }
        q.update_status(&task_id, TaskStatus::Failed)?;
        save_queue(board_name, &q)?;
        outcomes.push(TaskOutcome {
            task_id: task_id.clone(),
            title: done.title,
            attempts: attempt_no,
            status: "failed".into(),
            merged: false,
            gate: None,
            transcript: transcript_path,
            note: Some(err),
        });
        return Ok(HandleSignal::SoloClear(task_id));
    }

    let mut q = load_queue(board_name)?;
    let task: TaskRequest = q
        .tasks
        .iter()
        .find(|t| t.id == task_id)
        .cloned()
        .ok_or_else(|| anyhow!("task {} vanished from the queue", task_id))?;
    let session = match done.session {
        Some(s) => s,
        None => return Ok(HandleSignal::Normal),
    };
    let branch = session
        .branch
        .clone()
        .unwrap_or_else(|| format!("bark/{}", task_id));
    let slug = task_id.clone();

    let agents_failed = matches!(done.stream_verdict.as_ref(), Some(AgentVerdict::Failed(_)))
        || done.exit_code.map(|c| c != 0).unwrap_or(false);
    let agent_ok = !agents_failed;
    let changes = done.dirty || done.made_commits > 0;
    let candidates_ok = done.gate.ok && (agent_ok || changes);

    match (&done.gate.cmd, done.gate.ok) {
        (Some(_), true) => println!("{} gate passed", style::ok("✔")),
        (Some(_), false) => println!(
            "{} gate {} (tail follows below)",
            style::warn("✘"),
            style::strong("FAILED")
        ),
        (None, _) => println!(
            "{} gate skipped — no test command detected",
            style::warn("⚠")
        ),
    }

    let gate_ev = crate::threads::ThreadEvent::new(
        &task.card_id,
        crate::threads::ThreadEventKind::Gate,
        "barkcli",
        format!(
            "Gate {}: {}",
            if done.gate.ok { "passed" } else { "failed" },
            done.gate.cmd.as_deref().unwrap_or("no test command detected")
        ),
        Some(serde_json::json!({
            "task_id": task.id,
            "passed": done.gate.ok,
            "command": done.gate.cmd,
            "output": done.gate.tail,
        })),
    );
    let _ = crate::threads::append_event(&task.card_id, &gate_ev);

    if candidates_ok {
        if !opts.yes {
            q.add_note(
                &task_id,
                "runner",
                "gate passed; branch ready — rerun the task with --yes to merge",
            )?;
            save_queue(board_name, &q)?;
            outcomes.push(TaskOutcome {
                task_id: task_id.clone(),
                title: done.title,
                attempts: attempt_no,
                status: "ready-unmerged".into(),
                merged: false,
                gate: Some(done.gate),
                transcript: transcript_path,
                note: Some(format!(
                    "branch {} ready; pass --yes to auto-merge",
                    branch
                )),
            });
            return Ok(HandleSignal::SoloClear(task_id));
        }

        let root = find_project_root()?;
        match git_out(&root, &["merge", "--no-ff", "--no-edit", &branch]) {
            Ok(_) => {
                release_worktree(&slug, true).ok();
                q.complete(&task_id)?;
                // Parent card completes when all of its queue tasks do.
                let all_done = q
                    .tasks
                    .iter()
                    .all(|t| t.card_id != task.card_id || t.status == TaskStatus::Completed);
                if all_done {
                    update_board(board_name, |b| {
                        if let Some(c) = b.cards.iter_mut().find(|c| c.id == task.card_id) {
                            c.column = "done".into();
                            c.touch();
                        }
                        Ok(())
                    })?;
                }
                save_queue(board_name, &q)?;
                println!("{} merged {}", style::ok("✔"), style::strong(&branch));
                let merge_ev = crate::threads::ThreadEvent::new(
                    &task.card_id,
                    crate::threads::ThreadEventKind::Merge,
                    "barkcli",
                    format!("Merged branch {} into main", branch),
                    Some(serde_json::json!({
                        "task_id": task.id,
                        "branch": branch,
                    })),
                );
                let _ = crate::threads::append_event(&task.card_id, &merge_ev);
                merged_branches.push(branch);
                outcomes.push(TaskOutcome {
                    task_id: task_id.clone(),
                    title: done.title,
                    attempts: attempt_no,
                    status: "completed".into(),
                    merged: true,
                    gate: Some(done.gate),
                    transcript: transcript_path,
                    note: None,
                });
                return Ok(HandleSignal::SoloClear(task_id));
            }
            Err(conflict) => {
                // Roll the merge back; the re-dispatch attempt bases off a
                // main that already contains the previously merged work.
                git_out(&root, &["merge", "--abort"]).ok();
                let msg = format!("merge conflict with main:\n{}", conflict);
                verdicts.insert(task_id.clone(), msg);
                let mut session = session;
                session.add_note("runner", "merge conflict; re-queued");
                save_session(&session)?;
                release_worktree(&slug, true).ok();
                if attempt_no < opts.max_attempts {
                    requeue(&mut q, &task_id)?;
                    save_queue(board_name, &q)?;
                    println!(
                        "{} merge conflict — re-queued for a solo rebase attempt",
                        style::warn("↺")
                    );
                    return Ok(HandleSignal::SoloWait(task_id));
                }
                q.update_status(&task_id, TaskStatus::Failed)?;
                save_queue(board_name, &q)?;
                outcomes.push(TaskOutcome {
                    task_id: task_id.clone(),
                    title: done.title,
                    attempts: attempt_no,
                    status: "failed".into(),
                    merged: false,
                    gate: Some(done.gate),
                    transcript: transcript_path,
                    note: Some("final attempt hit a merge conflict".into()),
                });
                return Ok(HandleSignal::SoloClear(task_id));
            }
        }
    }

    // Either the gate failed outright, or the agent crashed without
    // producing changes (a no-op gate doesn't count). Store the verdict,
    // write a memory fact, re-queue.
    let verdict = if done.gate.ok {
        format!(
            "agent exited nonzero ({:?}) and produced no repository changes — a passing no-op gate cannot complete a task. {}",
            done.exit_code,
            agent_verdict_text(&done.stream_verdict, done.exit_code)
        )
    } else {
        format!(
            "gate `{}` failed:\n{}{}",
            truncate(done.gate.cmd.as_deref().unwrap_or("(skipped)"), 80),
            done.gate.tail,
            agent_verdict_text(&done.stream_verdict, done.exit_code)
        )
    };
    verdicts.insert(task_id.clone(), verdict);
    record_failure_fact(
        board_name,
        &task,
        attempt_no,
        if done.gate.skipped {
            "(no-op gate)"
        } else {
            done.gate.cmd.as_deref().unwrap_or("(skipped)")
        },
    )?;
    let mut session = session;
    session.add_note(
        "runner",
        &format!(
            "attempt {} failed: {}",
            attempt_no,
            if done.gate.ok {
                "agent crashed with no changes"
            } else {
                "gate failure"
            }
        ),
    );
    save_session(&session)?;
    release_worktree(&slug, true).ok();

    if attempt_no < opts.max_attempts {
        requeue(&mut q, &task_id)?;
        save_queue(board_name, &q)?;
        println!("{} re-queued with the failure verdict", style::warn("↺"));
        return Ok(HandleSignal::Normal);
    }
    q.update_status(&task_id, TaskStatus::Failed)?;
    save_queue(board_name, &q)?;
    print_gate_failure(&done.gate);
    outcomes.push(TaskOutcome {
        task_id: task_id.clone(),
        title: done.title,
        attempts: attempt_no,
        status: "failed".into(),
        merged: false,
        gate: Some(done.gate),
        transcript: transcript_path,
        note: Some("final attempt failed the gate".into()),
    });
    Ok(HandleSignal::SoloClear(task_id))
}

/// Refresh one task's lease when a worker beats (30s cadence).
fn beat_lease(board_name: &str, task_id: &str, lease_minutes: i64) -> Result<()> {
    let mut q = load_queue(board_name)?;
    if q.heartbeat(task_id, "runner", lease_minutes).is_ok() {
        save_queue(board_name, &q)?;
    }
    Ok(())
}

fn title_of(board_name: &str, task_id: &str) -> Result<String> {
    let q = load_queue(board_name)?;
    Ok(q.tasks
        .iter()
        .find(|t| t.id == task_id)
        .map(|t| t.title.clone())
        .unwrap_or_else(|| task_id.to_string()))
}

// ── helpers ──

/// First `.board` file next to the board dir, alphabetically.
fn first_board() -> Result<String> {
    let dir = find_board_dir()?
        .parent()
        .ok_or_else(|| anyhow!("no project root"))?
        .to_path_buf();
    let mut names: Vec<String> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "board").unwrap_or(false))
        .filter_map(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .collect();
    if names.is_empty() {
        anyhow::bail!("no board files found — create one with `barkcli create <name>`");
    }
    names.sort();
    Ok(names.remove(0))
}

fn find_card(board_name: &str, card_id: &str) -> Result<crate::models::Card> {
    let board = read_board(board_name)?;
    board
        .cards
        .into_iter()
        .find(|c| c.id == card_id)
        .ok_or_else(|| anyhow!("card {} missing on board {}", card_id, board_name))
}

/// Launch the agent: either the injected demo/test command or the backend
/// recipe. Both run with cwd = worktree, stdin nulled, pipes captured.
///
/// Injected contract: `sh -c '<cmd>' /bin/sh '<prompt-file>'` — the command
/// gets the prompt-file path as `$1` (and `BARKCLI_PROMPT_FILE` in its env).
fn spawn_agent(
    injected: Option<&str>,
    backend: Option<SessionBackend>,
    prompt_text: &str,
    prompt_file: &Path,
    workdir: &Path,
) -> Result<Child> {
    let mut cmd = if let Some(script) = injected {
        let mut builder = Command::new("sh");
        // The cmdstring forwards the prompt-file path as `$1` to the
        // command, so both `my-agent.sh` (reads $1) and env-aware runners
        // (`BARKCLI_PROMPT_FILE`) work.
        let cmd_string = format!("{} \"$1\"", script);
        builder
            .arg("-c")
            .arg(cmd_string)
            .arg("/bin/sh")
            .arg(prompt_file)
            .env("BARKCLI_PROMPT_FILE", prompt_file);
        builder
    } else {
        let b = backend.ok_or_else(|| anyhow!("no backend to launch"))?;
        Recipe::for_backend(b).command(prompt_text)
    };
    cmd.current_dir(workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.spawn().map_err(|e| anyhow!("spawn failed: {}", e))
}

fn stream_for(injected: bool, backend: Option<&SessionBackend>) -> Stream {
    if injected {
        Stream::Plain
    } else {
        backend
            .map(|b| Recipe::for_backend(b.clone()).stream)
            .unwrap_or(Stream::Plain)
    }
}

/// Watch a running agent: tee output to the transcript, parse stream
/// verdicts, tick the heartbeat closure every 30s, enforce idle + wall-clock
/// limits (both kill). What happens after is gates' business.
fn watch(
    child: &mut Child,
    stream: Stream,
    transcript: &Path,
    max_minutes: u64,
    idle_minutes: u64,
    on_beat: &mut dyn FnMut() -> Result<()>,
) -> Result<Option<AgentVerdict>> {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Both streams flow into one channel; the loop below is the single
    // writer to the transcript file and the only parser (no locks needed).
    let (tx, rx) = mpsc::channel::<String>();

    if let Some(pipe) = stdout {
        let tx = tx.clone();
        thread::spawn(move || {
            let reader = std::io::BufReader::new(pipe);
            for line in reader.lines() {
                let Ok(mut l) = line else { break };
                l.push('\n');
                if tx.send(l).is_err() {
                    break;
                }
            }
        });
    }
    if let Some(pipe) = stderr {
        let tx = tx.clone();
        thread::spawn(move || {
            let mut reader = std::io::BufReader::new(pipe);
            let mut buf = String::new();
            loop {
                buf.clear();
                match reader.read_line(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        if tx.send(buf.clone()).is_err() {
                            break;
                        }
                    }
                }
            }
        });
    }
    drop(tx);

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(transcript)?;

    let started = Instant::now();
    let mut last_activity = Instant::now();
    let mut last_beat = Instant::now();

    let mut verdict: Option<AgentVerdict> = None;
    loop {
        match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(line) => {
                file.write_all(line.as_bytes()).ok();
                if let Some(v) = parse_stream(stream, &line) {
                    verdict = Some(v);
                }
                last_activity = Instant::now();
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if child.try_wait()?.is_some() {
                    // Child is gone: drain buffered lines until EOF.
                    for line in rx.iter() {
                        file.write_all(line.as_bytes()).ok();
                        if let Some(v) = parse_stream(stream, &line) {
                            verdict = Some(v);
                        }
                    }
                    break;
                }
                if last_activity.elapsed() >= Duration::from_secs(idle_minutes * 60)
                    || started.elapsed() >= Duration::from_secs(max_minutes * 60)
                {
                    let _ = child.kill();
                    break;
                }
                if last_beat.elapsed() >= Duration::from_secs(30) {
                    last_beat = Instant::now();
                    on_beat()?;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    file.flush().ok();

    Ok(verdict)
}

fn parse_stream(kind: Stream, line: &str) -> Option<AgentVerdict> {
    match kind {
        Stream::Plain => None,
        Stream::ClaudeJsonl => Recipe::for_backend(SessionBackend::ClaudeCode).stream_event(line),
        Stream::CodexJsonl => Recipe::for_backend(SessionBackend::Codex).stream_event(line),
    }
}

fn agent_verdict_text(verdict: &Option<AgentVerdict>, exit: Option<i32>) -> String {
    match verdict {
        Some(AgentVerdict::Ok(t)) => format!("agent reported success (exit {:?}): {}", exit, t),
        Some(AgentVerdict::Failed(t)) => {
            format!("agent reported failure (exit {:?}): {}", exit, t)
        }
        None => format!("no stream verdict (exit {:?})", exit),
    }
}

fn last_lines(s: &str, n: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

/// Put a task back on the Pending pile: clear assignment + lease + branch so
/// the next attempt starts fresh.
fn requeue(q: &mut TaskQueue, task_id: &str) -> Result<()> {
    q.update_status(task_id, TaskStatus::Pending)?;
    if let Some(t) = q.tasks.iter_mut().find(|t| t.id == task_id) {
        t.lease = None;
        t.branch = None;
        t.assigned_agent = None;
    }
    Ok(())
}

/// Record a gate failure as a project memory fact so later prompts can see it.
fn record_failure_fact(
    board_name: &str,
    task: &TaskRequest,
    attempt: u32,
    cmd: &str,
) -> Result<()> {
    let fact = ProjectFact {
        fact: format!(
            "run: task '{}' (attempt {}) failed the acceptance gate `{}`; verdict was recorded on the task",
            task.title, attempt, cmd
        ),
        category: "pattern".into(),
        confidence: 0.9,
        sources: vec!["run".into()],
        created_at: Utc::now(),
    };
    let mut store = MemoryStore::open(board_name)?;
    store.add_fact(fact);
    store.save()?;
    Ok(())
}

/// Detect the acceptance-gate command from repo markers in the worktree.
pub(crate) fn detect_test_cmd(dir: &Path, override_cmd: Option<String>) -> Option<String> {
    if let Some(c) = override_cmd {
        return Some(c);
    }
    if dir.join("Cargo.toml").exists() {
        return Some("cargo test --quiet".into());
    }
    if dir.join("package.json").exists()
        && std::fs::read_to_string(dir.join("package.json"))
            .map(|p| p.contains("\"test\""))
            .unwrap_or(false)
    {
        return Some("npm test --silent".into());
    }
    if dir.join("pyproject.toml").exists() || dir.join("pytest.ini").exists() {
        return Some("python3 -m pytest -q".into());
    }
    if dir.join("go.mod").exists() {
        return Some("go test ./...".into());
    }
    None
}

/// Run the gate in the worktree. Output is teed to `<session>/gate.log`; its
/// tail (40 lines) becomes the re-dispatch verdict on failure.
fn run_gate(dir: &Path, cmd: &str, sess_dir: &Path) -> GateResult {
    match Command::new("sh")
        .args(["-c", cmd])
        .current_dir(dir)
        .stdin(Stdio::null())
        .output()
    {
        Ok(o) => {
            let combined = format!(
                "{}{}",
                String::from_utf8_lossy(&o.stdout),
                String::from_utf8_lossy(&o.stderr)
            );
            let _ = std::fs::write(sess_dir.join("gate.log"), &combined);
            GateResult {
                cmd: Some(cmd.to_string()),
                ok: o.status.success(),
                skipped: false,
                tail: last_lines(&combined, 40),
            }
        }
        Err(e) => GateResult {
            cmd: Some(cmd.to_string()),
            ok: false,
            skipped: false,
            tail: format!("gate command failed to start: {}", e),
        },
    }
}

fn commit_worktree(wt: &Path, task: &TaskRequest) -> Result<bool> {
    let status = git_out(wt, &["status", "--porcelain"]).unwrap_or_default();
    if status.trim().is_empty() {
        return Ok(false);
    }
    git_out(wt, &["add", "-A"])?;
    git_out(
        wt,
        &[
            "commit",
            "--no-verify",
            "-m",
            &format!("bark(run): {}", task.title),
        ],
    )?;
    Ok(true)
}

fn git_out(root: &Path, args: &[&str]) -> Result<String> {
    let out = Command::new("git").args(args).current_dir(root).output()?;
    if !out.status.success() {
        anyhow::bail!("{}", String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn backend_line(opts: &RunOptions) -> String {
    if opts.offline {
        "auto + offline intake".to_string()
    } else {
        "auto (opencode → claude → codex)".to_string()
    }
}

fn truncate(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

fn print_gate_failure(gate: &GateResult) {
    println!("{}", style::strong("gate tail (last 15):"));
    for l in gate
        .tail
        .lines()
        .skip(gate.tail.lines().count().saturating_sub(15))
    {
        println!("  {}", style::muted(l));
    }
}

/// Print the report in the house style (or JSON).
fn print_report(report: &RunReport, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(report)?);
        return Ok(());
    }
    println!();
    println!("{}", style::strong("Run report"));
    println!("  card:     {}", report.card_id);
    println!(
        "  backend:  {}",
        report.backend_used.as_deref().unwrap_or("(none)")
    );
    if let Some(p) = report.parallel {
        println!(
            "  workers:  {} cap (peak {} concurrent)",
            p,
            report.workers_peak.unwrap_or(1)
        );
    }
    if let Some(m) = &report.merged_branches {
        println!("  merges:   {}", m.len());
    }
    println!("  time:     {}s", report.duration_seconds);
    println!();
    for t in &report.tasks {
        let mark = match t.status.as_str() {
            "completed" => style::ok("✔"),
            "ready-unmerged" => style::accent("→"),
            "queued" => style::muted("·"),
            _ => style::warn("✘"),
        };
        println!(
            "  {} {} ({} attempts, {})",
            mark, t.title, t.attempts, t.status
        );
        if let Some(g) = &t.gate {
            if let Some(cmd) = &g.cmd {
                println!("      gate: {}", style::muted(cmd));
            }
        }
        if let Some(n) = &t.note {
            println!("      {}", style::muted(n));
        }
    }
    println!();
    println!(
        "  {} completed · {} failed · {}s",
        report.completed, report.failed, report.duration_seconds
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_options_default_has_none_card_id() {
        let opts = RunOptions::default();
        assert!(opts.card_id.is_none());
        assert_eq!(opts.max_agents, 1);
        assert_eq!(opts.max_attempts, 3);
    }
}

