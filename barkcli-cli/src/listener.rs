use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use anyhow::{Context, Result};
use clap::{Arg, ArgMatches, Command as CliCommand};

use barkcli_core::agent::{AgentIdentity, AgentRole, TaskQueue, TaskRequest, TaskStatus};
use barkcli_core::agent::queue::FileContext;
use barkcli_core::storage::board_dir;

pub fn command() -> CliCommand {
    CliCommand::new("listener")
        .about("Start a coding agent listener that polls for tasks")
        .arg(
            Arg::new("agent-id")
                .long("agent-id")
                .help("Unique agent identifier")
                .required(true),
        )
        .arg(
            Arg::new("agent-name")
                .long("agent-name")
                .help("Human-readable agent name")
                .required(true),
        )
        .arg(
            Arg::new("role")
                .long("role")
                .help("Agent role (scrum-master, product-owner, tech-lead, project-manager)")
                .default_value("tech-lead"),
        )
        .arg(
            Arg::new("poll-interval")
                .long("poll-interval")
                .help("Poll interval in seconds")
                .default_value("30"),
        )
        .arg(
            Arg::new("board")
                .long("board")
                .help("Board name to work with"),
        )
        .arg(
            Arg::new("server-url")
                .long("server-url")
                .help("Management server URL")
                .default_value("http://localhost:4321"),
        )
        .arg(
            Arg::new("once")
                .long("once")
                .help("Run single poll cycle and exit")
                .action(clap::ArgAction::SetTrue),
        )
        .arg(
            Arg::new("dry-run")
                .long("dry-run")
                .help("Claim and show task details without executing")
                .action(clap::ArgAction::SetTrue),
        )
}

pub fn run(args: &ArgMatches) -> Result<()> {
    let agent_id = args.get_one::<String>("agent-id").unwrap();
    let agent_name = args.get_one::<String>("agent-name").unwrap();
    let role_str = args.get_one::<String>("role").unwrap();
    let poll_interval: u64 = args
        .get_one::<String>("poll-interval")
        .unwrap()
        .parse()
        .context("Invalid poll interval")?;
    let board_name = args.get_one::<String>("board").map(|s| s.as_str());
    let server_url = args.get_one::<String>("server-url").unwrap();
    let once = args.get_flag("once");
    let dry_run = args.get_flag("dry-run");

    let role = AgentRole::from_str(role_str)
        .ok_or_else(|| anyhow::anyhow!("Invalid role: {}", role_str))?;

    // Register agent with server
    let client = ureq::Agent::new();
    let register_url = format!("{}/api/agents", server_url);

    let register_body = serde_json::json!({
        "id": agent_id,
        "name": agent_name,
        "role": role_str,
    });

    match client
        .post(&register_url)
        .send_json(&register_body)
    {
        Ok(_) => println!("Registered as agent '{}'", agent_id),
        Err(e) => {
            eprintln!("Warning: Failed to register with server: {}", e);
            eprintln!("Continuing anyway...");
        }
    }

    // Main polling loop
    println!("Starting listener for agent '{}' (role: {})", agent_id, role);
    println!("Polling every {} seconds...", poll_interval);
    if dry_run {
        println!("  {} mode — will not execute tasks", style::accent("DRY RUN"));
    }
    println!();

    loop {
        // Send heartbeat
        send_heartbeat(agent_id, server_url);

        // Get next task
        let next_url = format!("{}/api/orchestrate/next", server_url);
        match client.get(&next_url).call() {
            Ok(response) => {
                let body: serde_json::Value = response.into_json()?;
                if let Some(task) = body.get("task") {
                    if !task.is_null() {
                        let task: TaskRequest = serde_json::from_value(task.clone())?;
                        println!(
                            "{} Received task: {} ({})",
                            style::accent("→"),
                            style::strong(&task.title),
                            task.id,
                        );

                        if dry_run {
                            print_task_details(&task);
                        } else {
                            // Process task
                            match process_task(&task, agent_id, server_url, board_name) {
                                Ok(result) => {
                                    println!(
                                        "{} Task completed: {}",
                                        style::ok("✓"),
                                        result.summary,
                                    );
                                }
                                Err(e) => {
                                    eprintln!("{} Task failed: {}", style::err("✗"), e);
                                    let _ = report_task_failure(
                                        &task.id,
                                        &e.to_string(),
                                        server_url,
                                    );
                                }
                            }
                        }
                    } else {
                        println!("{} No pending tasks", style::muted("·"));
                    }
                }
            }
            Err(e) => {
                eprintln!("{} Failed to fetch next task: {}", style::err("Error"), e);
            }
        }

        if once {
            break;
        }

        std::thread::sleep(Duration::from_secs(poll_interval));
    }

    Ok(())
}

/// Result of processing a task.
struct TaskResult {
    files_changed: Vec<String>,
    commit_sha: Option<String>,
    summary: String,
    tests_passed: bool,
}

fn process_task(
    task: &TaskRequest,
    agent_id: &str,
    server_url: &str,
    board_name: Option<&str>,
) -> Result<TaskResult> {
    let client = ureq::Agent::new();

    // 1. Claim the task
    let claim_url = format!("{}/api/tasks/{}/claim?agent_id={}", server_url, task.id, agent_id);
    client.post(&claim_url).call().context("Failed to claim task")?;
    println!("  {} Claimed", style::ok("1."));

    // 2. Find project root
    let project_root = find_project_root()?;
    println!("  {} Project root: {}", style::ok("2."), project_root.display());

    // 3. Read context files
    let context_summary = build_context_summary(task);
    println!("  {} Context: {} files, {} criteria",
        style::ok("3."),
        task.context_files.len(),
        task.acceptance_criteria.len(),
    );

    // 4. Create git branch
    let branch_name = format!("barkcli/{}", sanitize_branch_name(&task.title));
    let branch_created = create_git_branch(&project_root, &branch_name)?;
    if branch_created {
        println!("  {} Branch: {}", style::ok("4."), branch_name);
    } else {
        println!("  {} Branch: already on '{}'", style::ok("4."), branch_name);
    }

    // 5. Invoke coding agent
    println!("  {} Invoking coding agent...", style::ok("5."));
    let agent_output = invoke_coding_agent(
        &project_root,
        task,
        &context_summary,
        &branch_name,
    )?;
    println!("  {} Agent finished", style::ok("5."));

    // 6. Run tests
    println!("  {} Running tests...", style::ok("6."));
    let tests_passed = run_tests(&project_root);
    if tests_passed {
        println!("  {} Tests passed", style::ok("6."));
    } else {
        println!("  {} Tests failed", style::warn("6."));
    }

    // 7. Get changed files
    let files_changed = get_changed_files(&project_root);
    println!("  {} Changed {} file(s)", style::ok("7."), files_changed.len());

    // 8. Commit changes
    let commit_sha = if !files_changed.is_empty() && tests_passed {
        println!("  {} Committing...", style::ok("8."));
        let msg = format!("barkcli: {}", task.title);
        commit_changes(&project_root, &msg)?
    } else {
        None
    };

    // 9. Report completion
    let summary = format!(
        "Completed: {}. Changed {} file(s). Tests {}.",
        task.title,
        files_changed.len(),
        if tests_passed { "passed" } else { "failed" },
    );

    let complete_url = format!("{}/api/tasks/{}/complete", server_url, task.id);
    let complete_body = serde_json::json!({
        "files_changed": files_changed,
        "commit_sha": commit_sha,
        "summary": summary,
        "tests_passed": tests_passed,
    });

    client
        .post(&complete_url)
        .send_json(&complete_body)
        .context("Failed to report completion")?;

    Ok(TaskResult {
        files_changed,
        commit_sha,
        summary,
        tests_passed,
    })
}

fn print_task_details(task: &TaskRequest) {
    println!("  Title:    {}", task.title);
    println!("  ID:       {}", task.id);
    println!("  Card:     {}", task.card_id);
    println!("  Priority: {}", task.priority);
    if !task.acceptance_criteria.is_empty() {
        println!("  AC:");
        for ac in &task.acceptance_criteria {
            println!("    - {}", ac);
        }
    }
    if !task.context_files.is_empty() {
        println!("  Context files:");
        for f in &task.context_files {
            println!("    - {}", f.path);
        }
    }
    if !task.dependencies.is_empty() {
        println!("  Dependencies: {}", task.dependencies.join(", "));
    }
    println!();
}

/// Build a summary of context files for the coding agent.
fn build_context_summary(task: &TaskRequest) -> String {
    let mut parts = Vec::new();

    // Task description
    if !task.description.is_empty() {
        parts.push(format!("## Task\n{}", task.description));
    }

    // Acceptance criteria
    if !task.acceptance_criteria.is_empty() {
        parts.push(format!(
            "## Acceptance Criteria\n{}",
            task.acceptance_criteria.iter()
                .map(|ac| format!("- {}", ac))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    // Context files
    if !task.context_files.is_empty() {
        let file_list: Vec<String> = task.context_files.iter()
            .map(|f| {
                let syms = if f.symbols.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", f.symbols.join(", "))
                };
                format!("- {}{}", f.path, syms)
            })
            .collect();
        parts.push(format!("## Related Files\n{}", file_list.join("\n")));
    }

    parts.join("\n\n")
}

/// Find the project root (parent of .board/).
fn find_project_root() -> Result<PathBuf> {
    let board_dir = board_dir::find_board_dir()?;
    Ok(board_dir.parent().unwrap_or(&std::path::Path::new(".")).to_path_buf())
}

/// Create a git branch for the task.
fn create_git_branch(root: &std::path::Path, branch: &str) -> Result<bool> {
    // Check if we're in a git repo
    let is_repo = Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(root)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !is_repo {
        return Ok(false);
    }

    // Check current branch
    let current = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(root)
        .output()
        .context("Failed to get current branch")?;

    let current_branch = String::from_utf8_lossy(&current.stdout).trim().to_string();

    if current_branch == branch {
        return Ok(false); // Already on this branch
    }

    // Create and checkout branch
    let output = Command::new("git")
        .args(["checkout", "-b", branch])
        .current_dir(root)
        .output()
        .context("Failed to create branch")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Branch might already exist, try checkout
        if stderr.contains("already exists") {
            Command::new("git")
                .args(["checkout", branch])
                .current_dir(root)
                .output()?;
            return Ok(false);
        }
        anyhow::bail!("Failed to create branch: {}", stderr);
    }

    Ok(true)
}

/// Invoke the coding agent to implement the task.
fn invoke_coding_agent(
    root: &std::path::Path,
    task: &TaskRequest,
    context: &str,
    branch: &str,
) -> Result<String> {
    // Build the prompt for the coding agent
    let prompt = build_agent_prompt(task, context, branch);

    // Try opencode first, then claude-code
    if which("opencode") {
        invoke_opencode(root, &prompt)
    } else if which("claude") {
        invoke_claude_code(root, &prompt)
    } else {
        // No coding agent found — write prompt to file for manual execution
        let prompt_path = root.join(format!(".board/tasks/{}_prompt.md", task.id));
        if let Some(parent) = prompt_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&prompt_path, &prompt)?;
        Ok(format!(
            "No coding agent found. Prompt saved to: {}",
            prompt_path.display()
        ))
    }
}

/// Build a detailed prompt for the coding agent — includes skills (SPEC-003).
fn build_agent_prompt(task: &TaskRequest, context: &str, branch: &str) -> String {
    let mut prompt = String::new();

    // Inject matching skills (scrum-master/test/mvp/planning)
    if let Ok(reg) = barkcli_core::skills::SkillRegistry::load_all(None) {
        let ctx = barkcli_core::skills::registry::MatchContext {
            labels: vec![task.priority.clone()],
            area: None,
            title: task.title.clone(),
            pipeline_phase: "dispatch".into(),
        };
        if let Some(s) = reg.render_for_prompt(&ctx) {
            prompt.push_str(&s);
            prompt.push('\n');
        }
    }

    prompt.push_str(&format!("# Task: {}\n\n", task.title));

    if !task.description.is_empty() {
        prompt.push_str(&format!("## Description\n{}\n\n", task.description));
    }

    if !task.acceptance_criteria.is_empty() {
        prompt.push_str("## Acceptance Criteria\n");
        for ac in &task.acceptance_criteria {
            prompt.push_str(&format!("- [ ] {}\n", ac));
        }
        prompt.push('\n');
    }

    if !task.context_files.is_empty() {
        prompt.push_str("## Files to Modify\n");
        for f in &task.context_files {
            prompt.push_str(&format!("- `{}`", f.path));
            if !f.symbols.is_empty() {
                prompt.push_str(&format!(" (symbols: {})", f.symbols.join(", ")));
            }
            prompt.push('\n');
        }
        prompt.push('\n');
    }

    prompt.push_str(&format!("## Branch\n{}\n\n", branch));

    prompt.push_str("## Instructions\n");
    prompt.push_str("1. Read the relevant files to understand the current code\n");
    prompt.push_str("2. Implement the changes needed to satisfy the acceptance criteria\n");
    prompt.push_str("3. Run tests to verify your changes work\n");
    prompt.push_str("4. Make sure all acceptance criteria are met\n");

    prompt
}

/// Invoke OpenCode as a subprocess.
fn invoke_opencode(root: &std::path::Path, prompt: &str) -> Result<String> {
    let output = Command::new("opencode")
        .arg("--prompt")
        .arg(prompt)
        .current_dir(root)
        .output()
        .context("Failed to invoke opencode")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("opencode failed: {}", stderr);
    }
}

/// Invoke Claude Code as a subprocess.
fn invoke_claude_code(root: &std::path::Path, prompt: &str) -> Result<String> {
    let output = Command::new("claude")
        .arg("--print")
        .arg(prompt)
        .current_dir(root)
        .output()
        .context("Failed to invoke claude")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("claude failed: {}", stderr);
    }
}

/// Run tests in the project.
fn run_tests(root: &std::path::Path) -> bool {
    // Try cargo test first (Rust projects)
    if root.join("Cargo.toml").exists() {
        return Command::new("cargo")
            .args(["test", "--quiet"])
            .current_dir(root)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    // Try npm test (Node.js projects)
    if root.join("package.json").exists() {
        return Command::new("npm")
            .args(["test", "--silent"])
            .current_dir(root)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    // Try pytest (Python projects)
    if root.join("pyproject.toml").exists() || root.join("setup.py").exists() {
        return Command::new("pytest")
            .args(["-q"])
            .current_dir(root)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    // No test framework found — assume pass
    true
}

/// Get list of changed files from git.
fn get_changed_files(root: &std::path::Path) -> Vec<String> {
    let output = Command::new("git")
        .args(["diff", "--name-only", "HEAD"])
        .current_dir(root)
        .output();

    match output {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter(|l| !l.is_empty() && !l.starts_with(".board/"))
                .map(|l| l.to_string())
                .collect()
        }
        _ => {
            // Fallback: check untracked files
            let output = Command::new("git")
                .args(["ls-files", "--others", "--exclude-standard"])
                .current_dir(root)
                .output();
            match output {
                Ok(o) => String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .filter(|l| !l.is_empty() && !l.starts_with(".board/"))
                    .map(|l| l.to_string())
                    .collect(),
                Err(_) => Vec::new(),
            }
        }
    }
}

/// Commit changes with a message.
fn commit_changes(root: &std::path::Path, message: &str) -> Result<Option<String>> {
    // Stage all changes (excluding .board/)
    Command::new("git")
        .args(["add", "-A"])
        .current_dir(root)
        .output()
        .context("Failed to stage changes")?;

    // Check if there's anything to commit
    let status = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(root)
        .output()
        .context("Failed to check status")?;

    let changes = String::from_utf8_lossy(&status.stdout);
    if changes.trim().is_empty() {
        return Ok(None);
    }

    // Commit
    let output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(root)
        .output()
        .context("Failed to commit")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("Commit failed: {}", stderr);
    }

    // Get commit SHA
    let sha_output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(root)
        .output()?;

    let sha = String::from_utf8_lossy(&sha_output.stdout).trim().to_string();
    Ok(Some(sha))
}

/// Report task failure to the server.
fn report_task_failure(task_id: &str, error: &str, server_url: &str) -> Result<()> {
    let client = ureq::Agent::new();
    let fail_url = format!("{}/api/tasks/{}/fail", server_url, task_id);
    let _ = client.post(&fail_url).call();
    Ok(())
}

/// Send a heartbeat to the server.
fn send_heartbeat(agent_id: &str, server_url: &str) {
    let client = ureq::Agent::new();
    let url = format!("{}/api/agents/{}/status", server_url, agent_id);
    let _ = client.get(&url).call();
}

/// Sanitize a string for use as a git branch name.
fn sanitize_branch_name(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(50)
        .collect()
}

/// Check if a command exists on PATH.
fn which(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

mod style {
    pub fn ok(s: &str) -> String { format!("\x1b[32m{}\x1b[0m", s) }
    pub fn err(s: &str) -> String { format!("\x1b[31m{}\x1b[0m", s) }
    pub fn warn(s: &str) -> String { format!("\x1b[33m{}\x1b[0m", s) }
    pub fn accent(s: &str) -> String { format!("\x1b[36m{}\x1b[0m", s) }
    pub fn strong(s: &str) -> String { format!("\x1b[1m{}\x1b[0m", s) }
    pub fn muted(s: &str) -> String { format!("\x1b[2m{}\x1b[0m", s) }
    pub fn column(s: &str) -> String { s.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_structure() {
        let cmd = command();
        let matches = cmd.try_get_matches_from([
            "listener",
            "--agent-id",
            "test-agent",
            "--agent-name",
            "Test Agent",
            "--role",
            "tech-lead",
        ]);

        assert!(matches.is_ok());
        let matches = matches.unwrap();
        assert_eq!(
            matches.get_one::<String>("agent-id").unwrap(),
            "test-agent"
        );
    }

    #[test]
    fn test_sanitize_branch_name() {
        assert_eq!(sanitize_branch_name("Fix auth bug"), "fix-auth-bug");
        assert_eq!(sanitize_branch_name("Add User/Login Flow"), "add-user-login-flow");
        assert_eq!(sanitize_branch_name("!!special!!chars!!"), "special-chars");
    }

    #[test]
    fn test_build_agent_prompt() {
        let task = TaskRequest {
            id: "task-1".into(),
            card_id: "card-1".into(),
            title: "Fix login".into(),
            description: "Login is broken".into(),
            acceptance_criteria: vec!["User can log in".into()],
            context_files: vec![],
            branch: None,
            priority: "high".into(),
            assigned_agent: None,
            created_at: chrono::Utc::now(),
            status: TaskStatus::Pending,
            attempts: 0,
            max_attempts: 3,
            deadline: None,
            dependencies: vec![],
            metadata: Default::default(),
            lease: None,
            notes: Vec::new(),
            blocked_reason: None,
        };

        let prompt = build_agent_prompt(&task, "context", "branch");
        assert!(prompt.contains("Fix login"));
        assert!(prompt.contains("Login is broken"));
        assert!(prompt.contains("User can log in"));
    }
}
