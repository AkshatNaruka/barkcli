use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;

use anyhow::{Context, Result};

use crate::agent::{
    acquire_worktree, auto_backend, backend_for, build_task_prompt, kill_pid,
    list_sessions, load_session, pid_alive, release_worktree, remove_session,
    resolve_session_id, save_session, skills_for_task, AgentIdentity, AgentRegistry, AgentRole,
    FleetReconciler, Session, SessionBackend, SessionStatus, TaskQueue, TaskStatus,
    dispatch_scores,
};
use crate::storage::board_dir::find_board_dir;
use crate::util::style;

// ── shared helpers (crate-visible for prime/ready/verify/handoff/task_cmd) ──

pub(crate) fn resolve_board_arg(args: &[String]) -> Result<String> {
    let mut i = 0;
    while i < args.len() {
        if (args[i] == "--board" || args[i] == "-b") && i + 1 < args.len() {
            return Ok(args[i + 1].clone());
        }
        i += 1;
    }
    crate::commands::boards::resolve_board(None)
}

pub(crate) fn flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

pub(crate) fn tasks_path_for(board: &str) -> Result<PathBuf> {
    Ok(find_board_dir()?.join("tasks").join(format!("{}.json", board)))
}

pub(crate) fn load_queue(board: &str) -> Result<TaskQueue> {
    let path = tasks_path_for(board)?;
    if path.exists() {
        TaskQueue::load(&path).map_err(|e| anyhow::anyhow!(e))
    } else {
        Ok(TaskQueue::new())
    }
}

pub(crate) fn save_queue(board: &str, queue: &TaskQueue) -> Result<()> {
    let path = tasks_path_for(board)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    queue.save(&path).map_err(|e| anyhow::anyhow!(e))
}

pub(crate) fn registry_path() -> Result<PathBuf> {
    Ok(find_board_dir()?.join("agents").join("registry.json"))
}

pub(crate) fn load_registry() -> Result<AgentRegistry> {
    let path = registry_path()?;
    if path.exists() {
        AgentRegistry::load(&path).map_err(|e| anyhow::anyhow!(e))
    } else {
        Ok(AgentRegistry::new())
    }
}

pub(crate) fn save_registry(registry: &AgentRegistry) -> Result<()> {
    let path = registry_path()?;
    registry.save(&path).map_err(|e| anyhow::anyhow!(e))
}

pub(crate) fn ensure_agent(
    registry: &mut AgentRegistry,
    agent_id: &str,
    role: AgentRole,
) -> Result<()> {
    if registry.get(agent_id).is_none() {
        let name = agent_id.to_string();
        registry.register(AgentIdentity::new(agent_id, &name, role));
    }
    Ok(())
}

/// Live session ids: non-terminal sessions with a live pid (or human sessions
/// with a recent heartbeat — humans have no process to check).
pub(crate) fn live_session_ids(sessions: &[Session]) -> HashSet<String> {
    sessions
        .iter()
        .filter(|s| !s.status.is_terminal())
        .filter(|s| match s.backend {
            SessionBackend::Human => s.is_alive(120),
            _ => s.pid.map(pid_alive).unwrap_or(false),
        })
        .map(|s| s.id.clone())
        .collect()
}

// ── entry point ──

/// `barkcli fleet <up|down|status|logs|merge|retry|spawn|list|sessions|kill|note>`
pub fn run_fleet(args: &[String]) -> Result<()> {
    let Some(sub) = args.first().map(|s| s.as_str()) else {
        print_help();
        return Ok(());
    };
    let rest = &args[1..];
    match sub {
        "up" => run_up(rest),
        "down" => run_down(rest),
        "status" | "st" => run_status(rest),
        "logs" | "log" => run_logs(rest),
        "merge" => run_merge(rest),
        "retry" | "retry-failed" => run_retry(rest),
        "spawn" => run_spawn(rest),
        "list" | "ls" | "sessions" => run_list(rest),
        "kill" => run_kill(rest),
        "note" => run_note(rest),
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        _ => anyhow::bail!("unknown fleet subcommand '{}' (up | down | status | logs | merge | retry | spawn | list | kill | note)", sub),
    }
}

fn print_help() {
    println!("Usage: barkcli fleet <command> [args]");
    println!();
    println!("Commands:");
    println!("  up [--agents N] [--backend NAME] [--once] [--watch]  Spin up agents until queue drains");
    println!("  down [--hard]            Stop reconciling (hard: kill sessions, release leases)");
    println!("  status                   Sessions x tasks x worktrees, one view");
    println!("  logs <session> [--tail N]  Show session transcript");
    println!("  merge <task-id>          Merge task branch to current HEAD (review gate)");
    println!("  retry                    Reset failed tasks to pending");
    println!("  spawn --agent ID [--backend NAME] [--task TASK]  Spawn one session");
    println!("  list                     List sessions");
    println!("  kill <session>           Kill a session (releases its lease)");
    println!("  note <session> <text>    Append a note to a session");
}

// ── session spawn ──

pub(crate) struct SpawnOptions {
    pub agent_id: String,
    pub backend_name: Option<String>,
    pub task_id: Option<String>,
    pub lease_minutes: i64,
    pub role: AgentRole,
}

pub(crate) fn parse_role(s: Option<&str>) -> AgentRole {
    match s {
        Some("product-owner") | Some("po") => AgentRole::ProductOwner,
        Some("tech-lead") | Some("techlead") | Some("dev") => AgentRole::TechLead,
        Some("project-manager") | Some("pm") => AgentRole::ProjectManager,
        _ => AgentRole::ScrumMaster,
    }
}

/// Spawn one session, optionally bound to a task (acquire worktree + claim
/// with lease + build prompt + spawn backend detached). Returns session id.
pub(crate) fn spawn_session(board: &str, opts: SpawnOptions) -> Result<String> {
    let backend: Box<dyn crate::agent::Backend> = match &opts.backend_name {
        Some(name) => backend_for(name),
        None => auto_backend(),
    };
    let backend_kind = backend.backend();

    let mut session = Session::new(&opts.agent_id, backend_kind.clone());
    let board_dir = find_board_dir()?;
    session.transcript_path = Some(
        board_dir
            .join("sessions")
            .join(format!("{}.log", session.id))
            .to_string_lossy()
            .into_owned(),
    );

    // Ensure agent identity exists.
    let mut registry = load_registry()?;
    ensure_agent(&mut registry, &opts.agent_id, opts.role)?;
    save_registry(&registry)?;

    if let Some(ref task_id) = opts.task_id {
        let mut queue = load_queue(board)?;
        let task = queue
            .get(task_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;

        // 1. Acquire worktree (refuses dirty main).
        let slug = task.id.clone();
        let wt_path = acquire_worktree(&slug)?;
        let branch = format!("bark/{}", slug);

        // 2. Claim with lease bound to this session.
        queue.claim(&task.id, &opts.agent_id, Some(&session.id), opts.lease_minutes)?;
        if let Some(t) = queue.get_mut(&task.id) {
            t.branch = Some(branch.clone());
            t.status = TaskStatus::InProgress;
        }
        save_queue(board, &queue)?;

        // 3. Build prompt (skills + packet) and write prompt file.
        let skills_md = skills_for_task(&task);
        let prompt = build_task_prompt(&task, &branch, skills_md.as_deref());
        let prompt_path = board_dir
            .join("tasks")
            .join(format!("{}_prompt.md", task.id));
        std::fs::write(&prompt_path, &prompt).context("Failed to write prompt file")?;

        session.task_id = Some(task.id.clone());
        session.branch = Some(branch);
        session.worktree_path = Some(wt_path.to_string_lossy().into_owned());
        session.prompt_path = Some(prompt_path.to_string_lossy().into_owned());

        // 4. Spawn backend detached (humans: no process, prompt file is the handoff).
        if backend_kind == SessionBackend::Human {
            session.status = SessionStatus::Working;
            session.add_note(
                &opts.agent_id,
                "prompt written for human; no process spawned",
            );
        } else {
            let pid = backend.spawn(
                &prompt,
                &wt_path,
                &std::path::PathBuf::from(session.transcript_path.as_ref().unwrap()),
            )?;
            session.pid = Some(pid);
            session.status = SessionStatus::Working;
            session.add_note(&opts.agent_id, &format!("spawned {} (pid {})", backend_kind.display_name(), pid));
        }

        // Mark agent working.
        let mut registry = load_registry()?;
        if let Some(agent) = registry.get_mut(&opts.agent_id) {
            agent.start_task(&task.id);
        }
        save_registry(&registry)?;
    } else {
        // Idle session: no task, just registered + recorded.
        session.status = SessionStatus::Idle;
        session.add_note(&opts.agent_id, "spawned idle (no task bound)");
    }

    let id = session.id.clone();
    save_session(&session)?;
    Ok(id)
}

fn run_spawn(args: &[String]) -> Result<()> {
    let agent_id = flag_value(args, "--agent")
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli fleet spawn --agent ID [--backend NAME] [--task TASK] [--role ROLE]"))?;
    let board = resolve_board_arg(args)?;
    let opts = SpawnOptions {
        agent_id: agent_id.clone(),
        backend_name: flag_value(args, "--backend"),
        task_id: flag_value(args, "--task"),
        lease_minutes: flag_value(args, "--lease-minutes")
            .and_then(|v| v.parse().ok())
            .unwrap_or(30),
        role: parse_role(flag_value(args, "--role").as_deref()),
    };
    let id = spawn_session(&board, opts)?;
    let session = load_session(&id)?;
    println!("{} session {} ({})", style::ok("Spawned"), style::strong(&id), session.backend.display_name());
    if let Some(ref task) = session.task_id {
        println!("  task:     {}", task);
    }
    if let Some(ref wt) = session.worktree_path {
        println!("  worktree: {}", wt);
    }
    if let Some(pid) = session.pid {
        println!("  pid:      {}", pid);
    }
    if let Some(ref tp) = session.transcript_path {
        println!("  log:      {}", tp);
    }
    Ok(())
}

// ── reconcile ──

/// One reconcile pass. Returns (spawned, released, runnable_left).
/// Pure-ish: mutates queue/sessions/registry on disk, spawns processes.
pub(crate) fn reconcile(
    board: &str,
    max_agents: usize,
    backend_name: Option<&str>,
    lease_minutes: i64,
    quiet: bool,
) -> Result<(usize, usize, usize)> {
    let mut queue = load_queue(board)?;
    let mut registry = load_registry()?;
    let mut sessions = crate::agent::session::list_sessions().unwrap_or_default();
    let now = chrono::Utc::now();

    // 1. Mark dead sessions (process gone, not terminal).
    let mut dead = 0;
    for s in sessions.iter_mut() {
        if s.status.is_terminal() {
            continue;
        }
        let alive = match s.backend {
            SessionBackend::Human => s.is_alive(120),
            _ => s.pid.map(pid_alive).unwrap_or(false),
        };
        if !alive {
            s.status = SessionStatus::Failed;
            s.ended_at = Some(now);
            s.add_note("fleet", "process gone — marked failed");
            save_session(s).ok();
            dead += 1;
        }
    }

    // 2. Release leases held by dead/terminal sessions immediately.
    let live: HashSet<String> = sessions
        .iter()
        .filter(|s| !s.status.is_terminal())
        .map(|s| s.id.clone())
        .collect();
    let mut released_live = 0;
    for task in queue.tasks.iter_mut() {
        let orphaned = task.status.is_active()
            && task
                .lease
                .as_ref()
                .and_then(|l| l.session_id.as_ref())
                .map(|sid| !live.contains(sid))
                .unwrap_or(false);
        if orphaned {
            task.status = TaskStatus::Pending;
            task.assigned_agent = None;
            task.lease = None;
            task.notes.push(crate::agent::queue::ProgressNote {
                at: now,
                author: "fleet".to_string(),
                text: "session gone — released back to pending".to_string(),
            });
            released_live += 1;
        }
    }

    // 3. Release time-expired leases.
    let released_stale = queue.release_stale_leases(now).len();
    save_queue(board, &queue)?;

    // 4. Spawn budget and dispatch.
    let rec = FleetReconciler::load(board).unwrap_or_else(|_| FleetReconciler::new(board, max_agents, lease_minutes));
    let live_ids = live_session_ids(&sessions);
    let budget = rec.spawn_budget(&queue, &registry, &live_ids);
    let ranked = dispatch_scores(&queue, &registry, &AgentRole::TechLead);

    let mut spawned = 0;
    for item in ranked.iter().take(budget) {
        let agent_id = format!(
            "fleet-{}-{}",
            backend_name.unwrap_or("auto"),
            &item.task_id.replace("task-", "").chars().take(8).collect::<String>()
        );
        match spawn_session(
            board,
            SpawnOptions {
                agent_id,
                backend_name: backend_name.map(|s| s.to_string()),
                task_id: Some(item.task_id.clone()),
                lease_minutes,
                role: AgentRole::TechLead,
            },
        ) {
            Ok(id) => {
                spawned += 1;
                if !quiet {
                    println!("  {} {} → session {}", style::ok("+"), item.task_id, &id[..13]);
                }
            }
            Err(e) => {
                if !quiet {
                    eprintln!("  {} {}: {}", style::err("x"), item.task_id, e);
                }
                // Typical cause: dirty main or duplicate worktree — stop this pass.
                break;
            }
        }
    }

    // Refresh for accurate runnable_left.
    let queue = load_queue(board)?;
    let registry = load_registry()?;
    let runnable_left = dispatch_scores(&queue, &registry, &AgentRole::TechLead).len();

    if !quiet {
        println!(
            "{} pass: spawned {}, released {} ({} dead sessions)",
            style::accent("Reconcile:"),
            spawned,
            released_live + released_stale,
            dead
        );
    }
    Ok((spawned, released_live + released_stale, runnable_left))
}

fn run_up(args: &[String]) -> Result<()> {
    let board = resolve_board_arg(args)?;
    let max_agents: usize = flag_value(args, "--agents")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);
    let backend = flag_value(args, "--backend");
    let lease_minutes: i64 = flag_value(args, "--lease-minutes")
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
    let once = args.iter().any(|a| a == "--once");
    let watch = args.iter().any(|a| a == "--watch");
    let poll_secs: u64 = flag_value(args, "--poll")
        .and_then(|v| v.parse().ok())
        .unwrap_or(15);

    // Mark reconciler running.
    let mut rec = FleetReconciler::load(&board).unwrap_or_else(|_| FleetReconciler::new(&board, max_agents, lease_minutes));
    rec.state.running = true;
    rec.state.max_agents = max_agents;
    rec.state.lease_minutes = lease_minutes;
    rec.state.backend = backend.clone();
    rec.state.started_at = Some(chrono::Utc::now());
    rec.save()?;

    println!(
        "{} fleet up on '{}' (max {} agents, backend {})",
        style::ok("Fleet:"),
        style::strong(&board),
        max_agents,
        backend.as_deref().unwrap_or("auto")
    );

    loop {
        let (_spawned, _released, runnable_left) =
            reconcile(&board, max_agents, backend.as_deref(), lease_minutes, false)?;

        let mut rec = FleetReconciler::load(&board).unwrap_or_else(|_| FleetReconciler::new(&board, max_agents, lease_minutes));
        rec.state.cycles += 1;
        rec.save().ok();

        // External stop?
        let stopped = FleetReconciler::load(&board).map(|r| !r.state.running).unwrap_or(true);
        if stopped {
            println!("{} fleet stopped", style::warn("Fleet:"));
            break;
        }
        if once {
            break;
        }
        if !watch && runnable_left == 0 {
            // Check live sessions: if none working, we're drained.
            let sessions = crate::agent::session::list_sessions().unwrap_or_default();
            let live = live_session_ids(&sessions);
            if live.is_empty() {
                println!("{} queue drained, no live sessions — fleet idle", style::ok("Fleet:"));
                break;
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(poll_secs));
    }
    Ok(())
}

fn run_down(args: &[String]) -> Result<()> {
    let board = resolve_board_arg(args)?;
    let hard = args.iter().any(|a| a == "--hard");

    let mut rec = FleetReconciler::load(&board).unwrap_or_else(|_| FleetReconciler::new(&board, 5, 30));
    rec.state.running = false;
    rec.save()?;

    if !hard {
        println!("{} reconciler stopped; live sessions finish current tasks", style::ok("Fleet:"));
        return Ok(());
    }

    // Hard: kill all live sessions and release their leases.
    let sessions = crate::agent::session::list_sessions().unwrap_or_default();
    let mut queue = load_queue(&board)?;
    let mut killed = 0;
    for mut s in sessions {
        if s.status.is_terminal() {
            continue;
        }
        if let Some(pid) = s.pid {
            if pid_alive(pid) {
                kill_pid(pid).ok();
            }
        }
        s.finish(SessionStatus::Killed, None);
        s.add_note("fleet", "killed by fleet down --hard");
        save_session(&s).ok();
        killed += 1;
        // Release any lease bound to this session.
        for task in queue.tasks.iter_mut() {
            let bound = task
                .lease
                .as_ref()
                .and_then(|l| l.session_id.as_ref())
                .map(|sid| sid == &s.id)
                .unwrap_or(false);
            if bound && task.status.is_active() {
                task.status = TaskStatus::Pending;
                task.assigned_agent = None;
                task.lease = None;
            }
        }
    }
    save_queue(&board, &queue)?;
    println!("{} killed {} sessions, leases released", style::ok("Fleet:"), killed);
    Ok(())
}

// ── status / logs / merge / retry ──

fn run_status(args: &[String]) -> Result<()> {
    let board = resolve_board_arg(args)?;
    let queue = load_queue(&board)?;
    let registry = load_registry()?;
    let sessions = crate::agent::session::list_sessions().unwrap_or_default();
    let live = live_session_ids(&sessions);

    println!("{} fleet status for '{}'", style::accent("Fleet:"), style::strong(&board));
    println!();

    // Sessions table.
    println!("  {}", style::strong("Sessions"));
    if sessions.is_empty() {
        println!("    {}", style::muted("none — run `barkcli fleet up`"));
    }
    for s in sessions.iter().take(20) {
        let alive = live.contains(&s.id);
        let st = if s.status.is_terminal() {
            style::muted(s.status.display_name())
        } else if alive {
            style::ok(s.status.display_name())
        } else {
            style::err(format!("{} (dead)", s.status.display_name()))
        };
        println!(
            "    {} {} · {} · task {} · {}",
            style::strong(&s.id[..13.min(s.id.len())]),
            s.backend.display_name(),
            s.agent_id,
            s.task_id.as_deref().unwrap_or("-"),
            st
        );
    }
    println!();

    // Tasks by status.
    println!("  {}", style::strong("Tasks"));
    for (status, count) in FleetReconciler::task_counts(&queue) {
        println!("    {:>12}: {}", status, count);
    }
    println!();

    // Agents by status.
    println!("  {}", style::strong("Agents"));
    if registry.agents.is_empty() {
        println!("    {}", style::muted("none registered"));
    }
    for (status, count) in FleetReconciler::agent_counts(&registry) {
        println!("    {:>12}: {}", status, count);
    }
    println!();

    // Worktrees.
    println!("  {}", style::strong("Worktrees"));
    match crate::agent::worktree::list_worktrees() {
        Ok(rows) => {
            let managed: Vec<_> = rows
                .into_iter()
                .filter(|(p, _, _)| crate::agent::worktree::is_managed_worktree(p))
                .collect();
            if managed.is_empty() {
                println!("    {}", style::muted("none"));
            }
            for (path, branch, _commit) in managed {
                println!("    {} ({})", path, branch);
            }
        }
        Err(_) => println!("    {}", style::muted("not a git repo")),
    }
    Ok(())
}

fn run_logs(args: &[String]) -> Result<()> {
    let session_id = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli fleet logs <session> [--tail N]"))?;
    let tail: usize = flag_value(args, "--tail").and_then(|v| v.parse().ok()).unwrap_or(50);
    let session_id = resolve_session_id(&session_id)?;
    let session = load_session(&session_id)?;
    let lines = crate::agent::session::transcript_tail(&session, tail);
    if lines.is_empty() {
        println!("{}", style::muted("no transcript yet"));
        return Ok(());
    }
    for line in lines {
        println!("{}", line);
    }
    Ok(())
}

fn run_merge(args: &[String]) -> Result<()> {
    let task_id = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli fleet merge <task-id>"))?;
    let board = resolve_board_arg(args)?;

    // Refuse to merge from inside a worktree.
    let cwd = std::env::current_dir()?;
    if crate::agent::worktree::is_managed_worktree(&cwd.to_string_lossy()) {
        anyhow::bail!("run merge from the main checkout, not from inside a worktree");
    }

    let mut queue = load_queue(&board)?;
    let task = queue
        .get(&task_id)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("task '{}' not found", task_id))?;
    if task.status != TaskStatus::Completed {
        anyhow::bail!(
            "task '{}' is {} — only completed tasks merge (review gate)",
            task_id,
            task.status.display_name()
        );
    }
    let branch = task
        .branch
        .clone()
        .unwrap_or_else(|| format!("bark/{}", task.id));

    // Merge branch into current HEAD.
    let out = Command::new("git")
        .args(["merge", "--no-edit", &branch])
        .output()
        .context("git merge failed to run")?;
    if !out.status.success() {
        let conflicts = Command::new("git")
            .args(["diff", "--name-only", "--diff-filter=U"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default();
        // Mark for review, keep the branch.
        queue.add_note(&task_id, "fleet", &format!("merge conflict on {}: {}", branch, conflicts.trim()))?;
        save_queue(&board, &queue)?;
        anyhow::bail!(
            "merge conflict — task kept for review. Conflicting files:\n{}",
            conflicts.trim()
        );
    }

    // Success: remove worktree + branch, move card to done.
    release_worktree(&task.id, true)?;
    if let Some(t) = queue.get_mut(&task_id) {
        t.branch = None;
    }
    save_queue(&board, &queue)?;
    crate::commands::card::move_cmd::run(&board, &[task.card_id.clone(), "done".into()])?;
    println!("{} merged {} → card {} done", style::ok("Merged"), style::strong(&branch), task.card_id);
    Ok(())
}

fn run_retry(args: &[String]) -> Result<()> {
    let board = resolve_board_arg(args)?;
    let mut queue = load_queue(&board)?;
    let mut reset = 0;
    for task in queue.tasks.iter_mut() {
        if task.status == TaskStatus::Failed {
            task.status = TaskStatus::Pending;
            task.attempts = 0;
            task.assigned_agent = None;
            task.lease = None;
            reset += 1;
        }
    }
    save_queue(&board, &queue)?;
    println!("{} reset {} failed tasks to pending", style::ok("Fleet:"), reset);
    Ok(())
}

fn run_list(_args: &[String]) -> Result<()> {
    let sessions = list_sessions()?;
    if sessions.is_empty() {
        println!("{}", style::muted("no sessions"));
        return Ok(());
    }
    let live = live_session_ids(&sessions);
    for s in &sessions {
        let mark = if s.status.is_terminal() {
            style::muted("·")
        } else if live.contains(&s.id) {
            style::ok("●")
        } else {
            style::err("●")
        };
        println!(
            "{} {} {} · {} · task {}",
            mark,
            &s.id[..13.min(s.id.len())],
            s.backend.display_name(),
            s.status.display_name(),
            s.task_id.as_deref().unwrap_or("-")
        );
    }
    Ok(())
}

fn run_kill(args: &[String]) -> Result<()> {
    let session_id = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli fleet kill <session>"))?;
    let board = resolve_board_arg(args)?;
    let session_id = resolve_session_id(&session_id)?;
    let mut session = load_session(&session_id)?;
    if session.status.is_terminal() {
        println!("{}", style::muted("session already terminal"));
        return Ok(());
    }
    if let Some(pid) = session.pid {
        if pid_alive(pid) {
            kill_pid(pid)?;
        }
    }
    session.finish(SessionStatus::Killed, None);
    session.add_note("fleet", "killed via CLI");
    save_session(&session)?;

    // Release its lease so the task isn't stranded.
    let mut queue = load_queue(&board)?;
    for task in queue.tasks.iter_mut() {
        let bound = task
            .lease
            .as_ref()
            .and_then(|l| l.session_id.as_ref())
            .map(|sid| sid == &session.id)
            .unwrap_or(false);
        if bound && task.status.is_active() {
            task.status = TaskStatus::Pending;
            task.assigned_agent = None;
            task.lease = None;
            task.notes.push(crate::agent::queue::ProgressNote {
                at: chrono::Utc::now(),
                author: "fleet".to_string(),
                text: "session killed — released back to pending".to_string(),
            });
        }
    }
    save_queue(&board, &queue)?;
    remove_session(&session.id).ok();
    println!("{} session {} killed, lease released", style::ok("Fleet:"), session_id);
    Ok(())
}

fn run_note(args: &[String]) -> Result<()> {
    let mut parts = args.iter().filter(|a| !a.starts_with('-'));
    let session_id = parts
        .next()
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli fleet note <session> <text>"))?;
    let text: String = parts.cloned().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        anyhow::bail!("usage: barkcli fleet note <session> <text>");
    }
    let session_id = resolve_session_id(&session_id)?;
    let mut session = load_session(&session_id)?;
    session.add_note("human", &text);
    save_session(&session)?;
    println!("{} note added", style::ok("Fleet:"));
    Ok(())
}
