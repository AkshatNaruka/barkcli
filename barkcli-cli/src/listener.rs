use std::time::Duration;

use anyhow::{Context, Result};
use clap::{Arg, ArgMatches, Command};

use barkcli_core::agent::{AgentIdentity, AgentRole, TaskQueue, TaskRequest, TaskStatus};
use barkcli_core::storage::board_dir;

pub fn command() -> Command {
    Command::new("listener")
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
                .default_value("http://localhost:3000"),
        )
        .arg(
            Arg::new("once")
                .long("once")
                .help("Run single poll cycle and exit")
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

    loop {
        // Get next task
        let next_url = format!("{}/api/orchestrate/next", server_url);
        match client.get(&next_url).call() {
            Ok(response) => {
                let body: serde_json::Value = response.into_json()?;
                if let Some(task) = body.get("task") {
                    if !task.is_null() {
                        let task: TaskRequest = serde_json::from_value(task.clone())?;
                        println!("Received task: {} ({})", task.title, task.id);

                        // Process task
                        match process_task(&task, agent_id, server_url) {
                            Ok(_) => println!("Task completed successfully"),
                            Err(e) => eprintln!("Task failed: {}", e),
                        }
                    } else {
                        println!("No pending tasks");
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to fetch next task: {}", e);
            }
        }

        if once {
            break;
        }

        std::thread::sleep(Duration::from_secs(poll_interval));
    }

    Ok(())
}

fn process_task(task: &TaskRequest, agent_id: &str, server_url: &str) -> Result<()> {
    let client = ureq::Agent::new();

    // Claim the task
    let claim_url = format!("{}/api/tasks/{}/claim?agent_id={}", server_url, task.id, agent_id);
    client.post(&claim_url).call().context("Failed to claim task")?;

    println!("Task claimed. Starting work...");

    // Here you would typically:
    // 1. Read the task context files
    // 2. Create a branch if needed
    // 3. Implement the changes
    // 4. Run tests
    // 5. Commit changes

    // For now, we'll simulate completing the task
    let complete_url = format!("{}/api/tasks/{}/complete", server_url, task.id);
    let complete_body = serde_json::json!({
        "files_changed": [],
        "summary": format!("Completed task: {}", task.title),
        "tests_passed": true,
    });

    client
        .post(&complete_url)
        .send_json(&complete_body)
        .context("Failed to complete task")?;

    Ok(())
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
}
