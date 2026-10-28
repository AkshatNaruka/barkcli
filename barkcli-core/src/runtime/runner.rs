use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use super::event::{
    GateSummary, RunDiffStats, RunRecord, RunStatus, RuntimeEvent, StartRun,
};
use super::provider::RunHandle;
use super::store::{RunRecorder, RuntimeStore};
use super::{RuntimeService, ThreadSink};
use crate::agent::worktree::{acquire_worktree, is_managed_worktree, release_worktree};
use crate::context::{CompileRequest, ContextEngine};
use crate::storage::board_dir::find_project_root;
use crate::storage::board_file::{read_board, update_board};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CreateRunRequest {
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub agent_id: Option<String>,
    #[serde(default)]
    pub permission_mode: Option<String>,
    /// Extra instruction from the composer. Combined with the card brief.
    #[serde(default)]
    pub prompt: Option<String>,
    /// Explicit gate command. Defaults to repo detection.
    #[serde(default)]
    pub test_cmd: Option<String>,
    /// Skills the composer or role wants attached to this run.
    #[serde(default)]
    pub skills: Vec<String>,
    /// Reuse the previous provider session for this thread when supported.
    #[serde(default = "default_resume")]
    pub resume: bool,
    /// Retry the previous attempt in a new worktree.
    #[serde(default)]
    pub parent_run_id: Option<String>,
    /// Review questions are answer-only: skip the project gate and mark the
    /// run complete without a test verdict.
    #[serde(default)]
    pub skip_gate: bool,
}

fn default_resume() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunDiff {
    pub run_id: String,
    pub base_sha: Option<String>,
    pub head_sha: Option<String>,
    pub branch: Option<String>,
    pub worktree: Option<String>,
    pub diff: String,
    pub files: Vec<String>,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeOutcome {
    pub run: RunRecord,
    pub branch: String,
    pub commit: Option<String>,
}

/// Product-level run service: worktree acquisition, prompt assembly, provider
/// start, post-run commit/diff/gate, and human-approved merge.
pub struct RunService {
    runtime: RuntimeService,
    board_name: String,
}

impl RunService {
    pub fn from_project(board_name: impl Into<String>) -> Result<Self> {
        Ok(Self {
            runtime: RuntimeService::from_project()?,
            board_name: board_name.into(),
        })
    }

    pub fn with_runtime(board_name: impl Into<String>, runtime: RuntimeService) -> Self {
        Self {
            runtime,
            board_name: board_name.into(),
        }
    }

    pub fn store(&self) -> &RuntimeStore {
        self.runtime.store()
    }

    pub fn start_for_card(
        &self,
        card_id: &str,
        request: CreateRunRequest,
        sink: Option<ThreadSink>,
    ) -> Result<RunRecord> {
        let board = read_board(&self.board_name)
            .with_context(|| format!("board '{}' could not be read", self.board_name))?;
        let card = board
            .cards
            .iter()
            .find(|card| card.id == card_id)
            .cloned()
            .ok_or_else(|| anyhow!("card '{}' not found", card_id))?;

        let run_id = format!("run_{}", uuid::Uuid::new_v4().simple());
        let slug = run_slug(card_id, &run_id);
        let worktree = acquire_worktree(&slug).with_context(|| {
            format!(
                "could not acquire an isolated worktree for {card_id}; commit or stash tracked changes first"
            )
        })?;
        let base_sha = git_out(&worktree, &["rev-parse", "HEAD"]).unwrap_or_default();
        let branch = format!("bark/{slug}");
        let provider = request
            .provider
            .clone()
            .filter(|p| !p.trim().is_empty())
            .unwrap_or_else(|| "opencode".to_string());
        let permission_mode = request
            .permission_mode
            .clone()
            .filter(|p| !p.trim().is_empty())
            .unwrap_or_else(|| "auto".to_string());
        let role = request
            .role
            .clone()
            .filter(|role| !role.trim().is_empty())
            .unwrap_or_else(|| "builder".to_string());
        let provider_session_id = if request.resume {
            self.previous_session(card_id, &provider)?
        } else {
            None
        };

        // Compile the reusable context pack before the provider starts. If
        // compilation fails we still ship the run with the legacy prompt: a
        // context cache bug must never block implementation work.
        let (prompt, context_pack) = match ContextEngine::from_project(&self.board_name)
            .and_then(|engine| {
                engine.compile_and_store(&CompileRequest {
                    thread_id: card_id.to_string(),
                    card_id: card_id.to_string(),
                    card: card.clone(),
                    run_id: Some(run_id.clone()),
                    role: Some(role.clone()),
                    provider: provider.clone(),
                    permission_mode: permission_mode.clone(),
                    extra_prompt: request.prompt.clone(),
                    explicit_skills: request.skills.clone(),
                    budget_tokens: None,
                })
            }) {
            Ok(pack) => (pack.prompt.clone(), Some(pack)),
            Err(error) => {
                eprintln!("bark runtime: context compile failed, using base prompt: {error}");
                (
                    build_prompt(&card, request.prompt.as_deref()),
                    None,
                )
            }
        };
        let context_manifest_id = context_pack.as_ref().map(|pack| pack.id.clone());

        let start = StartRun {
            run_id: run_id.clone(),
            thread_id: card_id.to_string(),
            card_id: card_id.to_string(),
            prompt,
            cwd: worktree.to_string_lossy().to_string(),
            provider: provider.clone(),
            model: request.model.clone(),
            role: Some(role),
            agent_id: request.agent_id.clone(),
            permission_mode,
            provider_session_id,
            raw_log_path: None,
        };

        let mut run = RunRecord::new(&start);
        run.ordinal = self.store().next_ordinal(card_id)?;
        run.parent_run_id = request.parent_run_id.clone();
        run.context_manifest_id = context_manifest_id;
        run.worktree = Some(worktree.to_string_lossy().to_string());
        run.branch = Some(branch.clone());
        run.base_sha = Some(base_sha.clone());
        self.store().save_run(&run)?;

        if let Some(pack) = context_pack.as_ref() {
            let event = RuntimeEvent::Context {
                manifest_id: pack.id.clone(),
                tokens: pack.manifest.estimated_tokens,
                stable_tokens: pack.reuse.stable_prefix_tokens,
                dynamic_tokens: pack.reuse.dynamic_tokens,
                reused: pack.reuse.reused,
                reason: pack.reuse.reason.clone(),
                skills: pack.manifest.skills.iter().map(|skill| skill.id.clone()).collect(),
                files: pack.manifest.files.iter().map(|file| file.path.clone()).collect(),
            };
            self.store()
                .record(&mut run, event)
                .context("could not record context event")?;
        }

        let started = match self
            .runtime
            .start_existing(run.clone(), start, sink)
        {
            Ok(started) => started,
            Err(error) => {
                let _ = release_worktree(&slug, true);
                return Err(error);
            }
        };

        let pid = started.handle.pid();
        let run = started.recorder.update(|run| run.pid = pid)?;
        let recorder = started.recorder.clone();
        let handle = started.handle;
        let store = self.store().clone();
        let final_board = self.board_name.clone();
        let final_card = card_id.to_string();
        let final_title = card.title.clone();
        let final_worktree = worktree.clone();
        let final_test_cmd = request.test_cmd.clone();
        let skip_gate = request.skip_gate;
        let monitor = thread::Builder::new()
            .name(format!("bark-run-{run_id}"))
            .spawn(move || {
                if let Err(error) = finalize_run(
                    store,
                    recorder,
                    handle,
                    final_board,
                    final_card,
                    final_title,
                    final_worktree,
                    base_sha,
                    final_test_cmd,
                    skip_gate,
                ) {
                    eprintln!("bark runtime: run {run_id} finalize failed: {error}");
                }
            });
        if let Err(error) = monitor {
            let _ = release_worktree(&slug, true);
            return Err(anyhow!("failed to start run monitor: {error}"));
        }

        Ok(run)
    }

    /// Last provider session in this thread that a capable adapter can resume.
    fn previous_session(&self, card_id: &str, provider: &str) -> Result<Option<String>> {
        let runs = self.store().list_runs(Some(card_id))?;
        Ok(runs
            .into_iter()
            .rev()
            .find(|run| {
                run.provider == provider
                    && run.provider_session_id.is_some()
                    && run.status != RunStatus::Cancelled
            })
            .and_then(|run| run.provider_session_id))
    }

    pub fn diff(&self, run_id: &str) -> Result<RunDiff> {
        let run = self.store().load_run(run_id)?;
        let worktree = managed_worktree(&run)?;
        let base = run.base_sha.clone().ok_or_else(|| anyhow!("run has no base SHA"))?;
        let head = run
            .head_sha
            .clone()
            .or_else(|| git_out(&worktree, &["rev-parse", "HEAD"]).ok());
        let diff = match head.as_deref() {
            Some(head) => git_out(&worktree, &["diff", "--find-renames", &format!("{base}..{head}")])
                .unwrap_or_default(),
            None => String::new(),
        };
        let files = git_out(&worktree, &["diff", "--name-only", &format!("{base}..{}", head.as_deref().unwrap_or("HEAD"))])
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect::<Vec<_>>();
        Ok(RunDiff {
            run_id: run.id,
            base_sha: Some(base),
            head_sha: head,
            branch: run.branch,
            worktree: run.worktree,
            diff,
            files,
            additions: run.diff_stats.additions,
            deletions: run.diff_stats.deletions,
        })
    }

    /// Merge only a gate-passing run. `approved` is the human review gate;
    /// callers must pass it explicitly rather than relying on UI state.
    pub fn merge(&self, run_id: &str, approved: bool) -> Result<MergeOutcome> {
        if !approved {
            return Err(anyhow!("merge requires explicit human approval"));
        }
        let mut run = self.store().load_run(run_id)?;
        if run.status == RunStatus::Merged {
            return Err(anyhow!("run is already merged"));
        }
        let gate = run
            .gate
            .as_ref()
            .ok_or_else(|| anyhow!("run has no gate verdict; run the gate before merging"))?;
        if !gate.passed {
            return Err(anyhow!("run did not pass its gate"));
        }
        let worktree = managed_worktree(&run)?;
        let branch = run
            .branch
            .clone()
            .ok_or_else(|| anyhow!("run has no branch"))?;
        let slug = worktree
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("run worktree has no name"))?
            .to_string();
        let root = find_project_root()?;
        let merge = Command::new("git")
            .args(["merge", "--no-ff", "--no-edit", &branch])
            .current_dir(&root)
            .output()
            .context("git merge failed to start")?;
        if !merge.status.success() {
            let _ = Command::new("git")
                .args(["merge", "--abort"])
                .current_dir(&root)
                .output();
            return Err(anyhow!(
                "merge failed: {}",
                String::from_utf8_lossy(&merge.stderr).trim()
            ));
        }
        let commit = git_out(&root, &["rev-parse", "HEAD"]).ok();
        let event = RuntimeEvent::Merged {
            branch: branch.clone(),
            commit: commit.clone(),
        };
        let _ = self.store().record(&mut run, event);
        let _ = release_worktree(&slug, true);
        let board_name = self.board_name.clone();
        let card_id = run.card_id.clone();
        let _ = update_board(&board_name, |board| {
            if let Some(card) = board.cards.iter_mut().find(|card| card.id == card_id) {
                card.column = "done".into();
                card.touch();
            }
            Ok(())
        });
        Ok(MergeOutcome {
            run,
            branch,
            commit,
        })
    }

    pub fn stop(&self, run_id: &str) -> Result<RunRecord> {
        let mut run = self.store().load_run(run_id)?;
        if run.status.is_terminal() {
            return Ok(run);
        }
        if let Some(pid) = run.pid {
            let _ = crate::agent::backend::kill_pid(pid);
        }
        self.store().record(&mut run, RuntimeEvent::Interrupted)?;
        Ok(run)
    }
}

fn run_slug(card_id: &str, run_id: &str) -> String {
    let card = crate::util::slug::to_slug(card_id);
    let short = run_id.trim_start_matches("run_").chars().take(8).collect::<String>();
    let mut slug = format!("{}-{}", card, short);
    if slug.len() > 56 {
        slug.truncate(56);
        slug = slug.trim_end_matches('-').to_string();
    }
    slug
}

fn build_prompt(card: &crate::models::Card, extra: Option<&str>) -> String {
    let mut prompt = String::new();
    prompt.push_str("# Task\n\n");
    prompt.push_str(&format!("{}\n\n", card.title));
    if let Some(description) = card.description.as_deref().filter(|d| !d.trim().is_empty()) {
        prompt.push_str("## Description\n\n");
        prompt.push_str(description);
        prompt.push_str("\n\n");
    }
    if !card.acceptance_criteria.is_empty() {
        prompt.push_str("## Acceptance criteria\n\n");
        for criterion in &card.acceptance_criteria {
            prompt.push_str(&format!("- [ ] {criterion}\n"));
        }
        prompt.push('\n');
    }
    if let Some(extra) = extra.filter(|text| !text.trim().is_empty()) {
        prompt.push_str("## Additional instruction\n\n");
        prompt.push_str(extra.trim());
        prompt.push_str("\n\n");
    }
    prompt.push_str("## Contract\n\n");
    prompt.push_str("- Work only inside the current git worktree.\n");
    prompt.push_str("- Make the smallest correct change that satisfies the task.\n");
    prompt.push_str("- Run the project's tests or build before reporting done.\n");
    prompt.push_str("- Commit your work on the current branch. Do not merge or push.\n");
    prompt.push_str("- Report changed files, test evidence, and any remaining risk.\n");
    prompt
}

fn finalize_run(
    store: RuntimeStore,
    recorder: Arc<RunRecorder>,
    handle: Box<dyn RunHandle>,
    board_name: String,
    card_id: String,
    card_title: String,
    worktree: PathBuf,
    base_sha: String,
    test_cmd: Option<String>,
    skip_gate: bool,
) -> Result<()> {
    let outcome = handle.wait();
    let run = recorder.snapshot();
    if run.status == RunStatus::Interrupted || outcome.as_ref().map(|o| o.interrupted).unwrap_or(false) {
        // Stop is a deliberate state, not a failure. Leave the worktree for resume.
        return Ok(());
    }
    if let Err(error) = outcome {
        recorder.record(RuntimeEvent::Failed {
            message: error.to_string(),
            exit_code: None,
        })?;
        return Ok(());
    }

    let status_before = git_out(&worktree, &["status", "--porcelain"]).unwrap_or_default();
    let dirty = !status_before.trim().is_empty();
    if dirty {
        git_out(&worktree, &["add", "-A"])?;
        git_out(
            &worktree,
            &[
                "commit",
                "--no-verify",
                "-m",
                &format!("bark(run): {card_title}"),
            ],
        )
        .context("could not commit the agent's changes")?;
    }
    let head_sha = git_out(&worktree, &["rev-parse", "HEAD"]).unwrap_or_default();
    recorder.update(|run| {
        run.head_sha = if head_sha.is_empty() {
            None
        } else {
            Some(head_sha.clone())
        };
    })?;

    if !dirty && head_sha == base_sha {
        recorder.record(RuntimeEvent::Failed {
            message: "agent exited without producing changes".into(),
            exit_code: run.exit_code,
        })?;
        return Ok(());
    }

    let stats = diff_stats(&worktree, &base_sha);
    recorder.record(RuntimeEvent::Diff {
        files: stats.files,
        additions: stats.additions,
        deletions: stats.deletions,
    })?;

    let gate = if skip_gate {
        GateOutcome {
            passed: true,
            command: None,
            summary: "Gate skipped for this answer-only run".into(),
            log_path: None,
        }
    } else {
        run_gate(&store, &recorder.snapshot(), &worktree, test_cmd.as_deref())?
    };
    let run_id = recorder.snapshot().id;
    recorder.record(RuntimeEvent::Gate {
        passed: gate.passed,
        command: gate.command.clone(),
        summary: gate.summary.clone(),
        log_path: gate.log_path.clone(),
    })?;
    if gate.passed {
        let _ = update_board(&board_name, |board| {
            if let Some(card) = board.cards.iter_mut().find(|card| card.id == card_id) {
                card.column = "review".into();
                card.touch();
            }
            Ok(())
        });
    }
    let final_run = recorder.snapshot();
    store.save_run(&final_run)?;
    eprintln!(
        "bark runtime: run {} finished ({})",
        run_id,
        final_run.status.as_str()
    );
    Ok(())
}

struct GateOutcome {
    passed: bool,
    command: Option<String>,
    summary: String,
    log_path: Option<String>,
}

fn run_gate(
    store: &RuntimeStore,
    run: &RunRecord,
    worktree: &Path,
    override_cmd: Option<&str>,
) -> Result<GateOutcome> {
    let command = override_cmd
        .map(str::to_string)
        .or_else(|| detect_test_cmd(worktree));
    let Some(command) = command else {
        return Ok(GateOutcome {
            passed: true,
            command: None,
            summary: "No test command detected; gate skipped".into(),
            log_path: None,
        });
    };
    let output = Command::new("sh")
        .args(["-c", &command])
        .current_dir(worktree)
        .output()
        .with_context(|| format!("gate command failed to start: {command}"))?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let log_path = store.write_gate_log(&run.id, &combined).ok();
    Ok(GateOutcome {
        passed: output.status.success(),
        command: Some(command),
        summary: tail(&combined, 40),
        log_path: log_path.map(|path| path.to_string_lossy().to_string()),
    })
}

fn detect_test_cmd(dir: &Path) -> Option<String> {
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

fn diff_stats(worktree: &Path, base_sha: &str) -> RunDiffStats {
    let numstat = git_out(
        worktree,
        &["diff", "--numstat", &format!("{base_sha}..HEAD")],
    )
    .unwrap_or_default();
    let mut stats = RunDiffStats::default();
    for line in numstat.lines() {
        let mut parts = line.split('\t');
        let additions = parts.next().and_then(|n| n.parse::<u32>().ok()).unwrap_or(0);
        let deletions = parts.next().and_then(|n| n.parse::<u32>().ok()).unwrap_or(0);
        if parts.next().is_some() {
            stats.files += 1;
            stats.additions += additions;
            stats.deletions += deletions;
        }
    }
    stats
}

fn managed_worktree(run: &RunRecord) -> Result<PathBuf> {
    let worktree = run
        .worktree
        .as_deref()
        .ok_or_else(|| anyhow!("run has no worktree"))?;
    if !is_managed_worktree(worktree) {
        return Err(anyhow!("refusing to operate outside a bark-managed worktree"));
    }
    let path = PathBuf::from(worktree);
    if !path.exists() {
        return Err(anyhow!("run worktree no longer exists: {worktree}"));
    }
    Ok(path)
}

fn git_out(root: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .with_context(|| format!("git {} failed to start", args.join(" ")))?;
    if !output.status.success() {
        return Err(anyhow!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn tail(text: &str, lines: usize) -> String {
    let all = text.lines().collect::<Vec<_>>();
    all[all.len().saturating_sub(lines)..].join("\n")
}

/// Human-facing gate summary for the workbench.
pub fn gate_summary(run: &RunRecord) -> Option<GateSummary> {
    run.gate.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_is_bounded_and_stable() {
        let slug = run_slug("add-a-very-long-feature-name-that-keeps-going", "run_1234567890abcdef");
        assert!(slug.len() <= 56);
        assert!(slug.ends_with("12345678"));
    }

    #[test]
    fn prompt_includes_acceptance_and_contract() {
        let mut card = crate::models::Card::new("card", "Ship it", "todo");
        card.description = Some("Make it work".into());
        card.acceptance_criteria = vec!["tests pass".into()];
        let prompt = build_prompt(&card, Some("focus on the API"));
        assert!(prompt.contains("Ship it"));
        assert!(prompt.contains("tests pass"));
        assert!(prompt.contains("focus on the API"));
        assert!(prompt.contains("Do not merge or push"));
    }

    #[test]
    fn tail_keeps_last_lines() {
        let text = (1..=50).map(|n| n.to_string()).collect::<Vec<_>>().join("\n");
        let result = tail(&text, 3);
        assert_eq!(result, "48\n49\n50");
    }

    #[test]
    fn diff_stats_ignore_binary() {
        let dir = std::env::temp_dir().join(format!("bark-diff-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        // Not a git repo, so stats are empty rather than panicking.
        let stats = diff_stats(&dir, "HEAD");
        assert_eq!(stats.files, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn managed_worktree_rejects_outside_paths() {
        let run = RunRecord::new(&StartRun {
            run_id: "r".into(),
            thread_id: "c".into(),
            card_id: "c".into(),
            prompt: "p".into(),
            cwd: "/tmp".into(),
            provider: "fake".into(),
            model: None,
            role: None,
            agent_id: None,
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        });
        assert!(managed_worktree(&run).is_err());
    }
}
