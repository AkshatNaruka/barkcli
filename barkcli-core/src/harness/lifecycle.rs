//! Lifecycle hooks: deterministic project policy around one attempt.
//!
//! Gate, guard and receipts are barkcli's built-ins, but real projects have
//! policy the harness cannot know: "no merge without a changeset entry", "tag
//! the ticket", "run the linter a second time". Today those require patching
//! Rust. Hooks make them configuration.
//!
//! Events: `attempt.start`, `pre_spawn`, `post_agent`, `post_gate`,
//! `pre_merge`, `attempt.end`.
//!
//! Contract: the hook receives one JSON object on stdin describing the attempt
//! and exits **0** to proceed, **2** to veto, anything else to warn. Timeouts
//! and unexpected exits follow the hook's `on_failure` policy (`warn` by
//! default, `block` to veto). Every run is appended to `hooks.jsonl` next to
//! the transcript so a failed attempt is diagnosable after the fact.
//!
//! Guard deliberately stays a built-in step that runs *before* user
//! `pre_merge` hooks: receipts and the merge decision depend on its report, and
//! re-homing it would rewrite the trust layer for no behavioural gain.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::agent::usage::UsageTotals;
use crate::models::config::{HarnessHook, HookFailure};
use crate::util::style;

/// Every event the bus emits.
pub const EVENTS: &[&str] = &[
    "attempt.start",
    "pre_spawn",
    "post_agent",
    "post_gate",
    "pre_merge",
    "attempt.end",
];

/// What a hook knows about the attempt.
#[derive(Debug, Clone, Default, Serialize)]
pub struct HookContext {
    pub task_id: String,
    pub card_id: String,
    pub title: String,
    pub branch: String,
    pub worktree: String,
    pub attempt: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gate_ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gate_cmd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gate_tail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageTotals>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff_files: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff_lines: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl HookContext {
    pub fn new(
        task_id: &str,
        card_id: &str,
        title: &str,
        branch: &str,
        worktree: &Path,
        attempt: u32,
    ) -> Self {
        Self {
            task_id: task_id.into(),
            card_id: card_id.into(),
            title: title.into(),
            branch: branch.into(),
            worktree: worktree.display().to_string(),
            attempt,
            ..Self::default()
        }
    }
}

/// One hook execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookRun {
    pub event: String,
    pub command: String,
    pub exit_code: Option<i32>,
    /// `ok` | `warned` | `blocked` | `timed_out`.
    pub outcome: String,
    pub duration_ms: u64,
    /// Tail of combined stdout/stderr, for the log and the console.
    pub output: String,
}

/// Result of every hook configured for one event.
#[derive(Debug, Clone, Default)]
pub struct HookReport {
    pub runs: Vec<HookRun>,
    /// Why the attempt must not proceed, when a hook vetoed it.
    pub blocked: Option<String>,
}

impl HookReport {
    pub fn is_empty(&self) -> bool {
        self.runs.is_empty()
    }

    pub fn warnings(&self) -> usize {
        self.runs.iter().filter(|r| r.outcome != "ok").count()
    }

    /// Print the runs in the house style.
    pub fn announce(&self) {
        for run in &self.runs {
            let mark = if run.outcome == "ok" {
                style::ok("✔")
            } else if run.outcome == "blocked" {
                style::warn("✘")
            } else {
                style::warn("⚠")
            };
            println!(
                "  {} hook {}: {} ({}ms)",
                mark, run.event, run.outcome, run.duration_ms
            );
            if run.outcome != "ok" && !run.output.is_empty() {
                for line in run.output.lines().take(3) {
                    println!("      {}", style::muted(line));
                }
            }
        }
    }
}

fn payload(event: &str, ctx: &HookContext) -> Value {
    let mut value = serde_json::to_value(ctx).unwrap_or_else(|_| json!({}));
    if let Some(obj) = value.as_object_mut() {
        obj.insert("event".into(), json!(event));
    }
    value
}

/// Run every hook registered for `event`, in config order.
///
/// Hooks see the attempt as JSON on stdin and run with the worktree as cwd, so
/// a project hook can `git diff` without extra setup.
pub fn run_event(
    hooks: &[HarnessHook],
    event: &str,
    ctx: &HookContext,
    cwd: &Path,
    log: Option<&Path>,
) -> HookReport {
    let mut report = HookReport::default();
    let body = payload(event, ctx).to_string();

    for hook in hooks.iter().filter(|h| h.event == event) {
        let started = Instant::now();
        let timeout = Duration::from_secs(hook.timeout_secs.max(1));
        let result = execute(&hook.command, cwd, &body, timeout);
        let duration_ms = started.elapsed().as_millis() as u64;

        let (exit_code, timed_out, output) = match result {
            Ok(value) => value,
            Err(err) => {
                let outcome = match hook.on_failure {
                    HookFailure::Block => "blocked",
                    HookFailure::Warn => "warned",
                };
                let message = format!("{}: {}", hook.command, err);
                if hook.on_failure == HookFailure::Block {
                    report.blocked.get_or_insert_with(|| message.clone());
                }
                let run = HookRun {
                    event: event.into(),
                    command: hook.command.clone(),
                    exit_code: None,
                    outcome: outcome.into(),
                    duration_ms,
                    output: message,
                };
                append_log(log, &run);
                report.runs.push(run);
                continue;
            }
        };

        // Contract: 0 proceed, 2 veto, anything else warn — unless the hook is
        // configured to treat every failure as blocking.
        let outcome = if timed_out {
            match hook.on_failure {
                HookFailure::Block => "blocked",
                HookFailure::Warn => "timed_out",
            }
        } else {
            match exit_code {
                Some(0) => "ok",
                Some(2) => "blocked",
                _ => match hook.on_failure {
                    HookFailure::Block => "blocked",
                    HookFailure::Warn => "warned",
                },
            }
        };

        if outcome == "blocked" {
            let reason = if output.is_empty() {
                format!("{} hook vetoed the attempt", event)
            } else {
                format!("{} hook vetoed the attempt: {}", event, first_line(&output))
            };
            report.blocked.get_or_insert(reason);
        }

        let run = HookRun {
            event: event.into(),
            command: hook.command.clone(),
            exit_code,
            outcome: outcome.into(),
            duration_ms,
            output,
        };
        append_log(log, &run);
        report.runs.push(run);
    }

    report
}

fn append_log(path: Option<&Path>, run: &HookRun) {
    let Some(path) = path else { return };
    let Ok(line) = serde_json::to_string(run) else {
        return;
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(file, "{}", line);
    }
}

fn first_line(text: &str) -> String {
    text.lines().next().unwrap_or("").trim().to_string()
}

fn execute(
    command: &str,
    cwd: &Path,
    stdin_body: &str,
    timeout: Duration,
) -> Result<(Option<i32>, bool, String)> {
    let mut child = Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to spawn hook `{}`", command))?;

    if let Some(mut stdin) = child.stdin.take() {
        let bytes = stdin_body.as_bytes().to_vec();
        // Write on a thread: a hook that never reads stdin must not deadlock
        // the harness on a full pipe.
        std::thread::spawn(move || {
            let _ = stdin.write_all(&bytes);
        });
    }
    let out_reader = child.stdout.take().map(drain);
    let err_reader = child.stderr.take().map(drain);

    let started = Instant::now();
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(err) => return Err(err.into()),
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            timed_out = true;
            break None;
        }
        std::thread::sleep(Duration::from_millis(25));
    };

    let mut output = String::new();
    if let Some(handle) = out_reader {
        if let Ok(bytes) = handle.join() {
            output.push_str(&String::from_utf8_lossy(&bytes));
        }
    }
    if let Some(handle) = err_reader {
        if let Ok(bytes) = handle.join() {
            let text = String::from_utf8_lossy(&bytes);
            if !text.trim().is_empty() {
                if !output.is_empty() && !output.ends_with('\n') {
                    output.push('\n');
                }
                output.push_str(&text);
            }
        }
    }

    Ok((status.and_then(|s| s.code()), timed_out, tail(&output, 2000)))
}

fn drain<R: Read + Send + 'static>(mut reader: R) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = reader.read_to_end(&mut buf);
        buf
    })
}

fn tail(text: &str, limit: usize) -> String {
    let text = text.trim();
    if text.len() <= limit {
        return text.to_string();
    }
    let mut cut = text.len() - limit;
    while cut < text.len() && !text.is_char_boundary(cut) {
        cut += 1;
    }
    format!("…{}", &text[cut..])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::config::HarnessHook;

    fn hook(event: &str, command: &str, on_failure: HookFailure) -> HarnessHook {
        HarnessHook {
            event: event.into(),
            command: command.into(),
            timeout_secs: 5,
            on_failure,
        }
    }

    fn ctx() -> HookContext {
        HookContext::new(
            "task-1",
            "card-1",
            "Fix login",
            "bark/task-1",
            Path::new("."),
            2,
        )
    }

    #[test]
    fn only_matching_events_run_and_stdin_carries_the_attempt() {
        let dir = std::env::temp_dir().join(format!("bark-hook-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let hooks = vec![
            hook("pre_merge", "cat > seen.json", HookFailure::Warn),
            hook("post_gate", "exit 0", HookFailure::Warn),
        ];

        let report = run_event(&hooks, "pre_merge", &ctx(), &dir, None);

        assert_eq!(report.runs.len(), 1);
        assert_eq!(report.runs[0].outcome, "ok");
        assert!(report.blocked.is_none());
        let seen: Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("seen.json")).unwrap()).unwrap();
        assert_eq!(seen["event"], "pre_merge");
        assert_eq!(seen["task_id"], "task-1");
        assert_eq!(seen["attempt"], 2);
        assert_eq!(seen["branch"], "bark/task-1");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn exit_two_vetoes_even_when_the_policy_is_warn() {
        let dir = std::env::temp_dir().join(".");
        let hooks = vec![hook(
            "pre_merge",
            "echo 'changeset entry missing'; exit 2",
            HookFailure::Warn,
        )];
        let report = run_event(&hooks, "pre_merge", &ctx(), &dir, None);
        assert_eq!(report.runs[0].outcome, "blocked");
        let reason = report.blocked.unwrap();
        assert!(reason.contains("changeset entry missing"), "{}", reason);
    }

    #[test]
    fn other_failures_follow_on_failure_policy() {
        let dir = std::env::temp_dir().join(".");
        let warn = run_event(
            &[hook("post_gate", "echo boom; exit 7", HookFailure::Warn)],
            "post_gate",
            &ctx(),
            &dir,
            None,
        );
        assert_eq!(warn.runs[0].outcome, "warned");
        assert!(!warn.blocked.is_some(), "warn policy must not block");
        assert_eq!(warn.warnings(), 1);

        let block = run_event(
            &[hook("post_gate", "echo boom; exit 7", HookFailure::Block)],
            "post_gate",
            &ctx(),
            &dir,
            None,
        );
        assert_eq!(block.runs[0].outcome, "blocked");
        assert!(block.blocked.unwrap().contains("post_gate"));
    }

    #[test]
    fn timeouts_kill_the_hook_and_respect_policy() {
        let dir = std::env::temp_dir().join(".");
        let mut slow = hook("pre_spawn", "sleep 10", HookFailure::Warn);
        slow.timeout_secs = 1;
        let started = Instant::now();
        let report = run_event(&[slow], "pre_spawn", &ctx(), &dir, None);
        assert!(started.elapsed() < Duration::from_secs(5));
        assert_eq!(report.runs[0].outcome, "timed_out");
        assert!(report.blocked.is_none());
    }

    #[test]
    fn runs_are_appended_to_the_hook_log() {
        let dir = std::env::temp_dir().join(format!("bark-hooklog-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("hooks.jsonl");
        let hooks = vec![hook("attempt.start", "echo hello", HookFailure::Warn)];
        run_event(&hooks, "attempt.start", &ctx(), &dir, Some(&log));
        run_event(&hooks, "attempt.start", &ctx(), &dir, Some(&log));

        let lines: Vec<String> = std::fs::read_to_string(&log)
            .unwrap()
            .lines()
            .map(str::to_string)
            .collect();
        assert_eq!(lines.len(), 2);
        let first: HookRun = serde_json::from_str(&lines[0]).unwrap();
        assert_eq!(first.event, "attempt.start");
        assert!(first.output.contains("hello"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn payload_omits_absent_fields() {
        let value = payload("pre_spawn", &ctx());
        assert!(value.get("exit_code").is_none());
        assert!(value.get("usage").is_none());
        let full = HookContext {
            exit_code: Some(0),
            usage: Some(UsageTotals {
                input_tokens: 12,
                ..UsageTotals::default()
            }),
            ..ctx()
        };
        let value = payload("post_agent", &full);
        assert_eq!(value["exit_code"], 0);
        assert_eq!(value["usage"]["input_tokens"], 12);
    }

    #[test]
    fn events_cover_the_documented_lifecycle() {
        let mut seen = std::collections::HashSet::new();
        for event in EVENTS {
            assert!(seen.insert(*event), "duplicate event {}", event);
            assert!(
                event.starts_with("attempt.") || event.starts_with("pre_") || event.starts_with("post_"),
                "unexpected event name {}",
                event
            );
        }
        assert!(EVENTS.contains(&"pre_merge"));
        assert!(EVENTS.contains(&"attempt.end"));
    }
}
