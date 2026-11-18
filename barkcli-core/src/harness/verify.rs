//! Verifier subagent: an independent review of a candidate change.
//!
//! Gate, guard and receipts answer "does it build" and "is it policy-clean".
//! Neither answers "does the diff actually satisfy the acceptance criteria",
//! which is the failure mode a passing test suite hides. Claude Code's answer
//! is a second agent with a *fresh* context; bark already models that as a
//! contribution graph node (`kind: verification`, `verified_by`), and
//! `RunRecord::add_verification` refuses self-verification — so the graph is
//! ready and only the reviewer process was missing.
//!
//! The verifier deliberately does **not** inherit the author's transcript. It
//! gets the task, the acceptance criteria, the diff and the gate tail, in a
//! prompt that never contains the author's reasoning, so "I already did that"
//! cannot substitute for evidence. It must answer with a single machine-readable
//! verdict line:
//!
//! ```text
//! VERDICT: PASS
//! VERDICT: FAIL — the acceptance criteria ask for a redirect test; no test was added
//! ```
//!
//! A missing or unparseable verdict counts as `Uncertain` and never blocks by
//! itself — the verifier is an extra signal, not a replacement for the gate.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::agent::queue::TaskRequest;

/// How the review came out.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Pass,
    Fail,
    /// No verdict line, a timeout, or a crash. Never blocks on its own.
    Uncertain,
}

impl Verdict {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pass => "pass",
            Self::Fail => "fail",
            Self::Uncertain => "uncertain",
        }
    }
}

/// One verifier run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub verdict: Verdict,
    /// Why, from the verifier's own words (first line of its reason).
    pub reason: String,
    /// Identity recorded on the contribution graph. Always distinct from the
    /// author, which is what makes the verification admissible.
    pub verifier: String,
    pub duration_ms: u64,
    /// Tail of the verifier's output, for the transcript and the run view.
    pub output: String,
}

impl Review {
    pub fn passed(&self) -> bool {
        self.verdict == Verdict::Pass
    }

    /// `verifier:claude → pass (2.1s): tests cover the redirect`
    pub fn summary(&self) -> String {
        let mut s = format!(
            "{} → {} ({:.1}s)",
            self.verifier,
            self.verdict.as_str(),
            self.duration_ms as f64 / 1000.0
        );
        if !self.reason.is_empty() {
            s.push_str(&format!(": {}", self.reason));
        }
        s
    }
}

/// What the verifier is shown. Built fresh — nothing from the author's run.
pub struct ReviewInput<'a> {
    pub task: &'a TaskRequest,
    pub branch: &'a str,
    pub gate_command: Option<&'a str>,
    pub gate_output: &'a str,
    pub diff: &'a str,
    pub files: &'a [String],
}

/// The review prompt. Kept short on purpose: the verifier's job is to check
/// claims against a diff, not to re-plan the task.
pub fn build_prompt(input: &ReviewInput<'_>) -> String {
    let mut prompt = String::new();
    prompt.push_str(
        "# Independent review\n\nYou are reviewing another agent's change. You did not write it and you cannot assume it is correct.\n\n",
    );
    prompt.push_str("## Task\n\n");
    prompt.push_str(&format!("{}\n\n", input.task.title.trim()));
    if !input.task.description.trim().is_empty() {
        prompt.push_str(input.task.description.trim());
        prompt.push_str("\n\n");
    }

    if !input.task.acceptance_criteria.is_empty() {
        prompt.push_str("## Acceptance criteria\n\n");
        for ac in &input.task.acceptance_criteria {
            prompt.push_str(&format!("- {}\n", ac));
        }
        prompt.push('\n');
    }

    prompt.push_str(&format!("## Branch\n\n{}\n\n", input.branch));
    if !input.files.is_empty() {
        prompt.push_str("## Files changed\n\n");
        for file in input.files {
            prompt.push_str(&format!("- `{}`\n", file));
        }
        prompt.push('\n');
    }

    prompt.push_str("## Gate\n\n");
    prompt.push_str(&format!(
        "Command: {}\n\n```\n{}\n```\n\n",
        input.gate_command.unwrap_or("(none)"),
        tail(input.gate_output, 2000).trim()
    ));

    prompt.push_str("## Diff\n\n```diff\n");
    prompt.push_str(tail(input.diff, 12_000).trim_end());
    prompt.push_str("\n```\n\n");

    prompt.push_str(
        "## Verdict\n\nCheck each acceptance criterion against the diff. A passing test suite does not prove the criteria are met.\n\nAnswer with ONE line, first line of your reply:\n\n```\nVERDICT: PASS\n```\n\nor\n\n```\nVERDICT: FAIL — <one sentence: which criterion is unmet and what is missing>\n```\n",
    );
    prompt
}

/// Parse the first verdict line out of a reviewer's output.
pub fn parse_verdict(output: &str) -> (Verdict, String) {
    for line in output.lines() {
        let trimmed = line.trim().trim_start_matches(['`', '-', '*', ' ']).trim();
        let upper = trimmed.to_uppercase();
        if !upper.starts_with("VERDICT:") {
            continue;
        }
        let rest = trimmed["VERDICT:".len()..].trim();
        let rest = rest.trim_start_matches(['`', '*', ' ']).trim();
        let upper_rest = rest.to_uppercase();
        if upper_rest.starts_with("PASS") {
            return (Verdict::Pass, String::new());
        }
        if upper_rest.starts_with("FAIL") {
            let reason = rest[4..]
                .trim_start_matches([':', '—', '-', '–', ' ', '.'])
                .trim()
                .trim_end_matches(['`', '*', ' '])
                .trim()
                .to_string();
            return (Verdict::Fail, one_line(&reason));
        }
    }
    (Verdict::Uncertain, String::new())
}

/// Run the verifier for one candidate change using a shell command that
/// receives the review prompt on stdin.
///
/// `command` is typically `harness.verify.command` or an injected
/// `BARKCLI_VERIFIER_CMD` (tests). `cwd` is the worktree, so the verifier can
/// inspect the code as well as the pasted diff.
pub fn review(
    input: &ReviewInput<'_>,
    command: Option<&str>,
    worktree: &Path,
    timeout: Duration,
) -> Result<Review> {
    let script = command.ok_or_else(|| anyhow::anyhow!("no verifier command available"))?;
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(script);
    run_child(input, cmd, verifier_id(command), worktree, timeout, true)
}

/// Run a coding-agent CLI as the verifier: the prompt is passed as the one CLI
/// argument (exactly like an author attempt), so the review sees a fresh
/// context with no transcript from the author.
pub fn review_with_backend(
    input: &ReviewInput<'_>,
    backend: &crate::agent::session::SessionBackend,
    permissions: &crate::models::config::PermissionSettings,
    worktree: &Path,
    timeout: Duration,
) -> Result<Review> {
    let prompt = build_prompt(input);
    let cmd = crate::agent::recipe::Recipe::for_backend(backend.clone())
        .command_with(&prompt, permissions);
    let label = format!("verifier:{}", backend.display_name());
    run_child(input, cmd, label, worktree, timeout, false)
}

fn run_child(
    input: &ReviewInput<'_>,
    mut cmd: Command,
    verifier: String,
    worktree: &Path,
    timeout: Duration,
    feed_stdin: bool,
) -> Result<Review> {
    let prompt = build_prompt(input);
    let started = Instant::now();

    cmd.current_dir(worktree)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut spawned = cmd
        .spawn()
        .with_context(|| format!("failed to spawn verifier in {}", worktree.display()))?;

    if feed_stdin {
        if let Some(mut stdin) = spawned.stdin.take() {
            let bytes = prompt.clone().into_bytes();
            std::thread::spawn(move || {
                let _ = stdin.write_all(&bytes);
            });
        }
    } else {
        // An agent CLI took the prompt as an argument; nothing to feed.
        drop(spawned.stdin.take());
    }
    let out_reader = spawned.stdout.take().map(drain);
    let err_reader = spawned.stderr.take().map(drain);

    let deadline = Instant::now() + timeout;
    loop {
        match spawned.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {}
            Err(err) => return Err(err.into()),
        }
        if Instant::now() >= deadline {
            let _ = spawned.kill();
            let _ = spawned.wait();
            let output = collect(out_reader, err_reader);
            return Ok(Review {
                verdict: Verdict::Uncertain,
                reason: "verifier timed out".into(),
                verifier,
                duration_ms: started.elapsed().as_millis() as u64,
                output: tail(&output, 2000),
            });
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let output = collect(out_reader, err_reader);
    let (verdict, reason) = parse_verdict(&output);
    Ok(Review {
        verdict,
        reason,
        verifier,
        duration_ms: started.elapsed().as_millis() as u64,
        output: tail(&output, 4000),
    })
}

fn verifier_id(command: Option<&str>) -> String {
    let label = command.unwrap_or("verifier");
    let first = label.split_whitespace().next().unwrap_or("verifier");
    let base = first.rsplit('/').next().unwrap_or(first);
    let base = base.trim_end_matches([';', ',']);
    format!(
        "verifier:{}",
        if base.is_empty() { "verifier" } else { base }
    )
}

fn collect(
    out: Option<std::thread::JoinHandle<Vec<u8>>>,
    err: Option<std::thread::JoinHandle<Vec<u8>>>,
) -> String {
    let mut text = String::new();
    if let Some(handle) = out {
        if let Ok(bytes) = handle.join() {
            text.push_str(&String::from_utf8_lossy(&bytes));
        }
    }
    if let Some(handle) = err {
        if let Ok(bytes) = handle.join() {
            let stderr = String::from_utf8_lossy(&bytes);
            if !stderr.trim().is_empty() {
                if !text.is_empty() && !text.ends_with('\n') {
                    text.push('\n');
                }
                text.push_str(&stderr);
            }
        }
    }
    text
}

fn drain<R: std::io::Read + Send + 'static>(
    mut reader: R,
) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = reader.read_to_end(&mut buf);
        buf
    })
}

fn tail(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let mut cut = text.len() - limit;
    while cut < text.len() && !text.is_char_boundary(cut) {
        cut += 1;
    }
    format!("…{}", &text[cut..])
}

fn one_line(text: &str) -> String {
    let line = text.lines().next().unwrap_or("").trim();
    if line.chars().count() > 240 {
        let cut = line
            .char_indices()
            .nth(240)
            .map(|(i, _)| i)
            .unwrap_or(line.len());
        format!("{}…", &line[..cut])
    } else {
        line.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::queue::{create_task, FileContext};
    use crate::models::config::VerifySettings;

    fn task() -> TaskRequest {
        create_task(
            "card-1",
            "Add SSO redirect",
            "SSO users bounce to the login page",
            vec![
                "SSO login succeeds".into(),
                "A test covers the redirect".into(),
            ],
            vec![FileContext {
                path: "src/auth/login.rs".into(),
                content: None,
                symbols: vec![],
                call_graph: None,
                test_coverage: None,
            }],
            "high",
        )
    }

    fn input<'a>(task: &'a TaskRequest, diff: &'a str, gate: &'a str) -> ReviewInput<'a> {
        ReviewInput {
            task,
            branch: "bark/fix-sso",
            gate_command: Some("cargo test"),
            gate_output: gate,
            diff,
            files: &[],
        }
    }

    #[test]
    fn prompt_carries_claims_and_diff_but_no_author_context() {
        let t = task();
        let prompt = build_prompt(&input(&t, "+ redirect()\n", "test result: ok"));

        assert!(prompt.contains("Independent review"));
        assert!(prompt.contains("SSO login succeeds"));
        assert!(prompt.contains("+ redirect()"));
        assert!(prompt.contains("test result: ok"));
        assert!(prompt.contains("VERDICT: PASS"));
        assert!(!prompt.contains("transcript"));
    }

    #[test]
    fn verdict_parsing_accepts_the_documented_shapes() {
        assert_eq!(parse_verdict("VERDICT: PASS").0, Verdict::Pass);
        assert_eq!(parse_verdict("```\nVERDICT: PASS\n```").0, Verdict::Pass);
        assert_eq!(parse_verdict("**VERDICT: PASS**").0, Verdict::Pass);

        let (verdict, reason) =
            parse_verdict("thinking…\nVERDICT: FAIL — no redirect test was added");
        assert_eq!(verdict, Verdict::Fail);
        assert_eq!(reason, "no redirect test was added");

        let (verdict, reason) = parse_verdict("VERDICT: FAIL: criteria 2 unmet");
        assert_eq!(verdict, Verdict::Fail);
        assert_eq!(reason, "criteria 2 unmet");

        assert_eq!(parse_verdict("looks fine to me").0, Verdict::Uncertain);
        assert_eq!(parse_verdict("").0, Verdict::Uncertain);
    }

    #[test]
    fn verifier_identity_differs_from_the_author() {
        assert_eq!(verifier_id(Some("/tmp/review.sh")), "verifier:review.sh");
        assert_eq!(verifier_id(Some("claude -p")), "verifier:claude");
        assert_ne!(verifier_id(Some("claude")), "runner:claude-code");
    }

    #[test]
    fn review_runs_a_real_process_and_reads_stdin() {
        let t = task();
        let dir = std::env::temp_dir().join(format!("bark-verify-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = "cat > prompt.txt; echo 'VERDICT: FAIL — criteria 2 unmet'";
        let review = review(
            &input(&t, "+ x\n", "ok"),
            Some(script),
            &dir,
            Duration::from_secs(10),
        )
        .unwrap();

        assert_eq!(review.verdict, Verdict::Fail);
        assert_eq!(review.reason, "criteria 2 unmet");
        assert!(std::fs::read_to_string(dir.join("prompt.txt"))
            .unwrap()
            .contains("SSO login succeeds"));
        assert!(review.summary().starts_with("verifier:"));
        assert!(review.summary().contains("→ fail"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn timeout_is_uncertain_not_a_pass() {
        let t = task();
        let dir = std::env::temp_dir().join(format!("bark-verify-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let review = review(
            &input(&t, "", ""),
            Some("sleep 10; echo 'VERDICT: PASS'"),
            &dir,
            Duration::from_millis(200),
        )
        .unwrap();
        assert_eq!(review.verdict, Verdict::Uncertain);
        assert!(!review.passed());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn settings_default_off_and_keep_the_gate_authoritative() {
        let settings = VerifySettings::default();
        assert!(!settings.enabled);
        assert!(settings.block_on_fail);
        assert_eq!(settings.timeout_secs, 180);
    }
}
