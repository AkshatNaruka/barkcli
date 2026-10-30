use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use super::event::{
    CheckOutcome, CheckVerification, ContributionKind, GateSummary, RunDiffStats, RunRecord, RunStatus, RuntimeEvent, StartRun,
};
use super::provider::RunHandle;
use super::store::{RunRecorder, RuntimeStore};
use super::{RuntimeService, ThreadSink};
use crate::agent::worktree::{acquire_worktree, is_managed_worktree, release_worktree};
use crate::context::{CompileRequest, ContextEngine};
use crate::guard::{self, DiffSet, GuardReport};
use crate::receipt::{
    self,
    builder::{self, ReceiptInput},
    AgentEvidence, DiffEvidence, GateEvidence, WorkspaceEvidence,
};
use crate::storage::board_dir::find_project_root;
use crate::storage::board_file::{read_board, update_board};
use crate::storage::config_store::read_config;

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
    /// Explicit contribution edges beyond the legacy single parent.
    #[serde(default)]
    pub contributes_to: Vec<String>,
    /// What this run claims: result, hypothesis, verification, report,
    /// insight, or failure. Defaults to `result` for old callers.
    #[serde(default)]
    pub kind: Option<ContributionKind>,
    /// Identity used for independent-verification checks. Falls back to the
    /// hired agent id, then the provider.
    #[serde(default)]
    pub author: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeEligibility {
    pub eligible: bool,
    pub reason: Option<String>,
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
        mut request: CreateRunRequest,
        sink: Option<ThreadSink>,
    ) -> Result<RunRecord> {
        // Serialize intake, not execution: independent threads still run in parallel.
        let _intake = crate::util::lock::FileLock::acquire(
            &self.store().board_dir().join("run-intake"),
        )?;
        if self.store().list_runs(Some(card_id))?.iter().any(|run| !run.status.is_terminal()) {
            return Err(anyhow!("This thread already has an active run. Stop it or wait before building again."));
        }
        let profile = match request.agent_id.as_deref().filter(|id| !id.trim().is_empty()) {
            Some(agent_id) => {
                let profile = crate::agent::ProfileStore::from_project()
                    .and_then(|store| store.load(agent_id))
                    .with_context(|| format!("agent profile '{agent_id}' was not found"))?;
                if profile.status != crate::agent::ProfileStatus::Active {
                    return Err(anyhow!(
                        "agent '{}' is {}; resume it before delegating work",
                        profile.name,
                        profile.status.as_str()
                    ));
                }
                Some(profile)
            }
            None => None,
        };

        if let Some(profile) = profile.as_ref() {
            if request
                .provider
                .as_deref()
                .map_or(true, |value| value.trim().is_empty())
            {
                request.provider = Some(profile.provider.clone());
            }
            if request
                .model
                .as_deref()
                .map_or(true, |value| value.trim().is_empty())
            {
                request.model = profile.model.clone();
            }
            if request
                .role
                .as_deref()
                .map_or(true, |value| value.trim().is_empty())
            {
                request.role = Some(profile.role.clone());
            }
            if request
                .permission_mode
                .as_deref()
                .map_or(true, |value| value.trim().is_empty())
            {
                request.permission_mode = Some(profile.permission_mode.clone());
            }
        }

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

        // Merge skills from every real source that applies to this run:
        // explicit request, the hired agent profile, and the role contract.
        // Duplicates are removed case-insensitively while preserving order.
        let role_skills = crate::agent::RoleRegistry::from_project()
            .ok()
            .and_then(|roles| roles.get(&role).map(|role_def| role_def.default_skills.clone()))
            .unwrap_or_default();
        request.skills = merge_run_skills(
            &role_skills,
            profile.as_ref().map(|profile| profile.skills.as_slice()).unwrap_or(&[]),
            &request.skills,
        );

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
            raw_log_path: Some(
                self.store()
                    .raw_log_path(&run_id)
                    .to_string_lossy()
                    .to_string(),
            ),
        };

        let mut run = RunRecord::new(&start);
        run.ordinal = self.store().next_ordinal(card_id)?;
        run.parent_run_id = request.parent_run_id.clone();
        run.kind = request.kind.unwrap_or_default();
        run.title = Some(card.title.clone());
        run.author = request.author.clone();
        for parent in &request.contributes_to {
            run.add_parent(parent)?;
        }
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
        let _check_lock = crate::util::lock::FileLock::acquire(
            &self.store().board_dir().join(format!("check-{run_id}")),
        )?;
        let mut run = self.store().load_run(run_id)?;
        if run.status == RunStatus::Merged {
            return Err(anyhow!("run is already merged"));
        }
        let _merge_lock = crate::util::lock::FileLock::acquire(
            &self.store().board_dir().join("merge-train"),
        )?;
        let gate = run
            .gate
            .as_ref()
            .ok_or_else(|| anyhow!("run has no gate verdict; run the gate before merging"))?;
        if !gate.verified() || run.status != RunStatus::Passed {
            return Err(anyhow!("Run real checks on the current revision before merging. Missing, skipped, or historical check results are not verification."));
        }
        let review = crate::review::ReviewStore::from_project()?.load(&run.id)?;
        if review.comments.iter().any(|comment| !comment.resolved) {
            return Err(anyhow!("Resolve the open review comments before merging."));
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
        let config = read_config(&root.join(".board")).unwrap_or_default();
        let base_sha = git_out(&root, &["merge-base", "HEAD", &branch]).ok();
        let head_sha = git_out(&root, &["rev-parse", &branch]).ok();
        let target_head = git_out(&root, &["rev-parse", "HEAD"])?;
        let proof = gate.verification.as_ref().expect("verified gate has proof");
        if head_sha.as_deref() != Some(proof.tested_head.as_str())
            || target_head != proof.target_head
            || run.head_sha.as_deref() != Some(proof.tested_head.as_str())
            || !git_out(&worktree, &["status", "--porcelain", "--untracked-files=no"])?.is_empty()
            || !git_out(&root, &["status", "--porcelain", "--untracked-files=no"])?.is_empty()
        {
            return Err(anyhow!("The reviewed code or target branch changed. Re-run checks and review the updated changes before merging."));
        }

        let guard_scan = if config.guard.enabled {
            match guard::scan_branch_diff(&root, &branch, &config.guard) {
                Ok(scan) => {
                    let (errors, warnings, _) = scan.1.counts();
                    eprintln!(
                        "guard: {} finding(s) ({} error(s), {} warning(s))",
                        scan.1.findings.len(),
                        errors,
                        warnings
                    );
                    Some(scan)
                }
                Err(err) => {
                    eprintln!("guard: skipped ({err})");
                    None
                }
            }
        } else {
            None
        };

        if config.guard.block
            && guard_scan
                .as_ref()
                .map(|(_, report)| !report.passed)
                .unwrap_or(false)
        {
            let errors = guard_scan
                .as_ref()
                .map(|(_, report)| report.counts().0)
                .unwrap_or(0);
            return Err(anyhow!("guard blocked merge: {errors} error(s)"));
        }

        let merge = Command::new("git")
            .args(["merge", "--no-ff", "--no-edit", "--no-commit", &proof.tested_head])
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
        // Catch a target checkout change between eligibility and git's index lock.
        if git_out(&root, &["rev-parse", "HEAD"])? != target_head {
            let _ = git_out(&root, &["merge", "--abort"]);
            return Err(anyhow!("Target branch moved during merge. Re-run checks before trying again."));
        }
        if let Err(error) = git_out(&root, &["commit", "--no-edit"]) {
            let _ = git_out(&root, &["merge", "--abort"]);
            return Err(error.context("could not finish the verified merge"));
        }
        let commit = git_out(&root, &["rev-parse", "HEAD"]).ok();

        let mut receipt_id = None;
        if config.receipts.auto {
            match write_merge_receipt(
                &root,
                &self.board_name,
                &run,
                &branch,
                base_sha,
                head_sha,
                guard_scan.as_ref(),
            ) {
                Ok(receipt) => {
                    eprintln!("receipt {}", receipt.id);
                    receipt_id = Some(receipt.id);
                }
                Err(err) => eprintln!("receipt skipped: {err}"),
            }
        }

        let event = RuntimeEvent::Merged {
            branch: branch.clone(),
            commit: commit.clone(),
            receipt_id,
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

    pub fn merge_eligibility(&self, run: &RunRecord) -> MergeEligibility {
        let result = (|| -> Result<()> {
            if run.status != RunStatus::Passed || !run.gate.as_ref().is_some_and(GateSummary::verified) {
                return Err(anyhow!("Run checks on this revision before merging."));
            }
            let gate = run.gate.as_ref().unwrap();
            let review = crate::review::ReviewStore::from_project()?.load(&run.id)?;
            if review.comments.iter().any(|comment| !comment.resolved) { return Err(anyhow!("Resolve the open review comments before merging.")); }
            let proof = gate.verification.as_ref().unwrap();
            let worktree = managed_worktree(run)?;
            let root = find_project_root()?;
            if git_out(&root, &["rev-parse", "HEAD"])? != proof.target_head
                || git_out(&worktree, &["rev-parse", "HEAD"])? != proof.tested_head
                || !git_out(&worktree, &["status", "--porcelain", "--untracked-files=no"])?.is_empty()
                || !git_out(&root, &["status", "--porcelain", "--untracked-files=no"])?.is_empty()
            {
                return Err(anyhow!("The code or target branch changed. Re-run checks and review the updated diff."));
            }
            Ok(())
        })();
        MergeEligibility { eligible: result.is_ok(), reason: result.err().map(|error| error.to_string()) }
    }

    /// Explicitly refresh evidence after a failed/skipped/stale check. Updating
    /// the isolated branch to the current target never edits the main checkout.
    pub fn check(&self, run_id: &str, command: Option<&str>) -> Result<RunRecord> {
        let _check_lock = crate::util::lock::FileLock::acquire(
            &self.store().board_dir().join(format!("check-{run_id}")),
        )?;
        let mut run = self.store().load_run(run_id)?;
        if !run.status.is_terminal() || run.status == RunStatus::Merged {
            return Err(anyhow!("Checks require a finished, unmerged run."));
        }
        let worktree = managed_worktree(&run)?;
        if !git_out(&worktree, &["status", "--porcelain", "--untracked-files=no"])?.is_empty() {
            return Err(anyhow!("The worktree has uncommitted edits. Review and commit them in that worktree before running checks."));
        }
        let root = find_project_root()?;
        let target_head = git_out(&root, &["rev-parse", "HEAD"])?;
        let ancestor = Command::new("git")
            .args(["merge-base", "--is-ancestor", &target_head, "HEAD"])
            .current_dir(&worktree).status()?;
        if !ancestor.success() {
            if let Err(error) = git_out(&worktree, &["merge", "--no-edit", &target_head]) {
                let _ = git_out(&worktree, &["merge", "--abort"]);
                return Err(error.context("Target changes conflict with this worktree; resolve the conflict before checking."));
            }
        }
        run.base_sha = Some(target_head);
        run.head_sha = Some(git_out(&worktree, &["rev-parse", "HEAD"])?);
        run.diff_stats = diff_stats(&worktree, run.base_sha.as_deref().unwrap_or("HEAD"));
        run.files_touched = git_out(&worktree, &["diff", "--name-only", &format!("{}..HEAD", run.base_sha.as_deref().unwrap_or("HEAD"))])?
            .lines().map(str::to_string).collect();
        let selected_command = command.map(str::to_string)
            .or_else(|| run.gate.as_ref().and_then(|gate| gate.command.clone()));
        let running = check_event(&run, CheckOutcome::Running, selected_command.clone(), "Running project checks".into(), None, None);
        self.store().record(&mut run, running)?;
        let gate = run_gate(self.store(), &run, &worktree, selected_command.as_deref());
        let event = gate_event(&run, gate);
        self.store().record(&mut run, event)?;
        Ok(run)
    }

    pub fn stop(&self, run_id: &str) -> Result<RunRecord> {
        let mut run = self.store().load_run(run_id)?;
        if run.status.is_terminal() {
            return Ok(run);
        }
        if run.gate.as_ref().and_then(|gate| gate.verification.as_ref()).is_some_and(|proof| proof.outcome == CheckOutcome::Running) {
            return Err(anyhow!("Project checks are running. They cannot be stopped through the agent stop action."));
        }
        // Persist the stop before signalling; late provider exit events must
        // not turn this deliberate interruption into a completed build.
        self.store().record(&mut run, RuntimeEvent::Interrupted)?;
        if let Some(pid) = run.pid {
            let _ = crate::agent::backend::kill_pid(pid);
        }
        Ok(run)
    }

    /// Independently reproduce a gate-passing contribution. The verifier must
    /// differ from the run's author. When the worktree still exists the gate
    /// runs there; after a merge it runs against the project root.
    pub fn verify(&self, run_id: &str, verifier: &str, note: Option<String>) -> Result<RunRecord> {
        let run = self.store().load_run(run_id)?;
        if verifier.trim().is_empty() {
            return Err(anyhow!("verifier is required"));
        }
        if run.author_id() == verifier.trim() {
            return Err(anyhow!(
                "self-verification is not allowed; use a different agent or account"
            ));
        }
        if !matches!(run.status, RunStatus::Passed | RunStatus::Merged) {
            return Err(anyhow!(
                "run must pass its gate before it can be independently verified"
            ));
        }
        let worktree = run
            .worktree
            .as_deref()
            .map(PathBuf::from)
            .filter(|path| path.exists());
        let worktree = match worktree {
            Some(path) => path,
            None if run.status == RunStatus::Merged => {
                find_project_root().unwrap_or_default()
            }
            None if run.provider == "manual" => {
                // A textual insight has no worktree to reproduce. Independent
                // identity is still required; record an explicit attestation.
                return self.store().verify_run(
                    run_id,
                    verifier,
                    true,
                    note.or_else(|| Some("Manual contribution: verification is an attestation".into())),
                );
            }
            None => {
                return Err(anyhow!(
                    "run worktree no longer exists; reproduce before merging or re-run the agent"
                ))
            }
        };
        let command = run
            .gate
            .as_ref()
            .and_then(|gate| gate.command.clone())
            .or_else(|| detect_test_cmd(&worktree));
        let (passed, summary) = match command {
            Some(command) => {
                let (exit_code, output) = run_gate_command(&command, &worktree)?;
                (exit_code == Some(0), output)
            },
            None => (
                true,
                "No test command detected; verification is an explicit attestation".to_string(),
            ),
        };
        self.store().verify_run(
            run_id,
            verifier,
            passed,
            note.or(Some(summary)),
        )
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

fn merge_run_skills(
    role_skills: &[String],
    profile_skills: &[String],
    explicit: &[String],
) -> Vec<String> {
    let mut merged = Vec::new();
    merged.extend(role_skills.iter().cloned());
    merged.extend(profile_skills.iter().cloned());
    merged.extend(explicit.iter().cloned());
    let mut seen = std::collections::BTreeSet::new();
    merged.retain(|skill| {
        let key = skill.trim().to_ascii_lowercase();
        !key.is_empty() && seen.insert(key)
    });
    merged
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
    let run = store.load_run(&recorder.snapshot().id)?;
    if run.status == RunStatus::Interrupted || outcome.as_ref().map(|o| o.interrupted).unwrap_or(false) {
        // Stop is a deliberate state, not a failure. Leave the worktree for resume.
        return Ok(());
    }
    if let Err(error) = outcome {
        recorder.record(RuntimeEvent::Failed {
            message: error.to_string(),
            exit_code: None,
        })?;
        record_terminal_session(
            &board_name,
            &card_id,
            &card_title,
            &recorder.snapshot(),
            &worktree,
            &base_sha,
        );
        return Ok(());
    }
    if outcome.as_ref().is_ok_and(|outcome| outcome.exit_code != 0) {
        recorder.record(RuntimeEvent::Failed { message: "The agent exited unsuccessfully. Its partial worktree is preserved.".into(), exit_code: outcome.as_ref().ok().map(|outcome| outcome.exit_code) })?;
        return Ok(());
    }
    recorder.update(|run| run.pid = None)?;

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
        record_terminal_session(
            &board_name,
            &card_id,
            &card_title,
            &recorder.snapshot(),
            &worktree,
            &base_sha,
        );
        return Ok(());
    }

    let stats = diff_stats(&worktree, &base_sha);
    let paths = git_out(
        &worktree,
        &["diff", "--name-only", &format!("{base_sha}..HEAD")],
    )
    .unwrap_or_default()
    .lines()
    .map(str::trim)
    .filter(|path| !path.is_empty())
    .map(str::to_string)
    .collect::<Vec<_>>();
    recorder.record(RuntimeEvent::Diff {
        files: stats.files,
        additions: stats.additions,
        deletions: stats.deletions,
        paths,
    })?;

    let gate = if skip_gate {
        Ok(GateOutcome {
            outcome: CheckOutcome::Skipped,
            command: None,
            summary: "Gate skipped for this answer-only run".into(),
            log_path: None,
            exit_code: None,
        })
    } else {
        let running = check_event(&recorder.snapshot(), CheckOutcome::Running, test_cmd.clone(), "Running project checks".into(), None, None);
        recorder.record(running)?;
        run_gate(&store, &recorder.snapshot(), &worktree, test_cmd.as_deref())
    };
    let run_id = recorder.snapshot().id;
    recorder.record(gate_event(&recorder.snapshot(), gate))?;
    if matches!(recorder.snapshot().status, RunStatus::Passed | RunStatus::NotVerified) {
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
    record_terminal_session(
        &board_name,
        &card_id,
        &card_title,
        &final_run,
        &worktree,
        &base_sha,
    );
    eprintln!(
        "bark runtime: run {} finished ({})",
        run_id,
        final_run.status.as_str()
    );
    Ok(())
}

/// Build the canonical session for a finished run. The run id is the session
/// id, which makes retries idempotent and ties memory back to the exact run.
fn terminal_session_entry(
    board_name: &str,
    card_id: &str,
    card_title: &str,
    run: &RunRecord,
    files: Vec<String>,
) -> crate::models::SessionEntry {
    let mut entry = crate::models::SessionEntry::new(board_name);
    entry.id = run.id.clone();
    entry.agent = Some(run.provider.clone());
    entry.model = run.model.clone();
    entry.prompt = Some(card_title.to_string());
    entry.commit_sha = run.head_sha.clone();
    entry.files_touched = files;
    entry.summary = Some(format!(
        "{} · {} · {}",
        card_title,
        run.status.as_str(),
        run.gate
            .as_ref()
            .map(|gate| {
                gate.summary
                    .as_deref()
                    .unwrap_or("gate")
                    .lines()
                    .next()
                    .unwrap_or("gate")
            })
            .unwrap_or("no gate")
    ));
    entry.at = run.started_at.to_rfc3339();
    entry.duration_ms = run.ended_at.map(|ended| {
        let millis = (ended - run.started_at).num_milliseconds();
        millis.max(0) as u64
    });
    entry.matched_card_ids = vec![card_id.to_string()];
    entry
}

/// Persist exactly one session per terminal run, then let the brain ingest it
/// and refresh the living context. Session ids are the run id, so a retried
/// finalize can never double-count the same work.
fn record_terminal_session(
    board_name: &str,
    card_id: &str,
    card_title: &str,
    run: &RunRecord,
    worktree: &Path,
    base_sha: &str,
) {
    let existing = crate::storage::sessions::read_sessions(board_name).unwrap_or_default();
    if existing.iter().any(|session| session.id == run.id) {
        return;
    }

    let files: Vec<String> = git_out(
        worktree,
        &["diff", "--name-only", &format!("{base_sha}..HEAD")],
    )
    .unwrap_or_default()
    .lines()
    .map(str::trim)
    .filter(|line| !line.is_empty())
    .map(str::to_string)
    .collect();

    let entry = terminal_session_entry(board_name, card_id, card_title, run, files);

    if let Err(error) = crate::storage::sessions::append(&entry) {
        eprintln!("bark runtime: could not record session for {}: {error}", run.id);
        return;
    }
    if let Err(error) = crate::memory::ingest::ingest(board_name, false) {
        eprintln!("bark runtime: memory ingest failed: {error}");
    }
    let opts = crate::context_file::DigestOpts {
        quiet: true,
        ..Default::default()
    };
    if let Err(error) = crate::context_file::digest::run_digest_core(board_name, &opts) {
        eprintln!("bark runtime: context digest failed: {error}");
    }
}

struct GateOutcome {
    outcome: CheckOutcome,
    command: Option<String>,
    summary: String,
    log_path: Option<String>,
    exit_code: Option<i32>,
}

fn check_event(run: &RunRecord, outcome: CheckOutcome, command: Option<String>, summary: String, log_path: Option<String>, exit_code: Option<i32>) -> RuntimeEvent {
    RuntimeEvent::Gate {
        passed: outcome == CheckOutcome::Passed,
        command,
        summary,
        log_path,
        verification: Some(CheckVerification {
            outcome,
            tested_head: run.head_sha.clone().unwrap_or_default(),
            target_head: run.base_sha.clone().unwrap_or_default(),
            exit_code,
        }),
    }
}

fn gate_event(run: &RunRecord, result: Result<GateOutcome>) -> RuntimeEvent {
    match result {
        Ok(gate) => check_event(run, gate.outcome, gate.command, gate.summary, gate.log_path, gate.exit_code),
        Err(error) => check_event(run, CheckOutcome::Error, None, error.to_string(), None, None),
    }
}

fn run_gate(
    store: &RuntimeStore,
    run: &RunRecord,
    worktree: &Path,
    override_cmd: Option<&str>,
) -> Result<GateOutcome> {
    let command = override_cmd
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| detect_test_cmd(worktree));
    let Some(command) = command else {
        return Ok(GateOutcome {
            outcome: CheckOutcome::NotRun,
            command: None,
            summary: "No test command detected; gate skipped".into(),
            log_path: None,
            exit_code: None,
        });
    };
    let (exit_code, combined) = run_gate_command(&command, worktree)?;
    let unchanged = run.head_sha.as_deref() == Some(git_out(worktree, &["rev-parse", "HEAD"])?.as_str())
        && git_out(worktree, &["status", "--porcelain", "--untracked-files=no"])?.is_empty();
    let log_path = store.write_gate_log(&run.id, &combined).ok();
    Ok(GateOutcome {
        outcome: if !unchanged { CheckOutcome::Stale } else if exit_code == Some(0) { CheckOutcome::Passed } else { CheckOutcome::Failed },
        command: Some(command),
        summary: tail(&combined, 40),
        log_path: log_path.map(|path| path.to_string_lossy().to_string()),
        exit_code,
    })
}

fn run_gate_command(command: &str, worktree: &Path) -> Result<(Option<i32>, String)> {
    let output = Command::new("sh")
        .args(["-c", command])
        .current_dir(worktree)
        .output()
        .with_context(|| format!("gate command failed to start: {command}"))?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok((output.status.code(), combined))
}

pub fn detect_test_cmd(dir: &Path) -> Option<String> {
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

fn gate_evidence_from_summary(summary: &GateSummary) -> GateEvidence {
    GateEvidence {
        command: summary.command.clone(),
        passed: summary.verified(),
        skipped: !summary.command.as_deref().is_some_and(|value| !value.trim().is_empty()),
        duration_ms: None,
        log_path: summary.log_path.clone(),
        tail: None,
        finished_at: Some(summary.finished_at),
    }
}

#[allow(clippy::too_many_arguments)]
fn write_merge_receipt(
    root: &Path,
    board_name: &str,
    run: &RunRecord,
    branch: &str,
    base_sha: Option<String>,
    head_sha: Option<String>,
    guard_scan: Option<&(DiffSet, GuardReport)>,
) -> Result<receipt::Receipt> {
    let board = read_board(board_name)?;
    let card = board
        .find_card(&run.card_id)
        .ok_or_else(|| anyhow!("card `{}` not found", run.card_id))?;

    let diff = guard_scan
        .map(|(diff, _)| builder::diff_evidence(diff))
        .unwrap_or(DiffEvidence {
            files: run.diff_stats.files,
            additions: run.diff_stats.additions,
            deletions: run.diff_stats.deletions,
            ..DiffEvidence::default()
        });
    let review = builder::review_evidence(&run.card_id, diff.files);

    let input = ReceiptInput {
        card_id: run.card_id.clone(),
        card_title: card.title.clone(),
        card_description: card.description.clone(),
        task_id: None,
        run_id: Some(run.id.clone()),
        thread_id: Some(run.thread_id.clone()),
        agent: AgentEvidence {
            provider: run.provider.clone(),
            model: run.model.clone(),
            role: run.role.clone(),
            agent_id: run.agent_id.clone(),
        },
        workspace: WorkspaceEvidence {
            branch: Some(branch.to_string()),
            base_sha: base_sha.or_else(|| run.base_sha.clone()),
            head_sha: head_sha.or_else(|| run.head_sha.clone()),
            worktree: run.worktree.clone(),
        },
        diff,
        gate: run.gate.as_ref().map(gate_evidence_from_summary),
        guard: guard_scan.map(|(_, report)| report.clone()),
        review,
        created_at: None,
    };

    let receipt = builder::build(input);
    receipt::save_receipt(root, receipt)
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
    fn gate_evidence_from_summary_maps_fields() {
        let summary = GateSummary {
            passed: true,
            command: Some("cargo test".into()),
            summary: Some("ok".into()),
            log_path: Some("gate.log".into()),
            finished_at: chrono::Utc::now(),
            verification: Some(CheckVerification {
                outcome: CheckOutcome::Passed,
                tested_head: "a".repeat(40),
                target_head: "a".repeat(40),
                exit_code: Some(0),
            }),
        };
        let evidence = gate_evidence_from_summary(&summary);
        assert!(evidence.passed);
        assert!(!evidence.skipped);
        assert_eq!(evidence.command.as_deref(), Some("cargo test"));
        assert_eq!(evidence.log_path.as_deref(), Some("gate.log"));
        assert_eq!(evidence.finished_at, Some(summary.finished_at));
    }

    #[test]
    fn legacy_gate_boolean_without_evidence_is_not_verified() {
        let summary = GateSummary {
            passed: true,
            command: Some("cargo test".into()),
            summary: Some("ok".into()),
            log_path: None,
            finished_at: chrono::Utc::now(),
            verification: None,
        };
        let evidence = gate_evidence_from_summary(&summary);
        assert!(!evidence.passed);
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

    #[test]
    fn run_skills_merge_role_profile_and_explicit_without_duplicates() {
        let merged = merge_run_skills(
            &["implementation".into(), "testing".into()],
            &["testing".into(), "Rust".into()],
            &["rust".into(), " ".into(), "custom".into()],
        );
        assert_eq!(
            merged,
            vec!["implementation", "testing", "Rust", "custom"]
        );
    }

    #[test]
    fn terminal_session_is_one_per_run_and_keeps_evidence() {
        let run = RunRecord::new(&StartRun {
            run_id: "run_abc".into(),
            thread_id: "card-1".into(),
            card_id: "card-1".into(),
            prompt: "p".into(),
            cwd: "/tmp".into(),
            provider: "opencode".into(),
            model: Some("anthropic/claude-opus-4-5".into()),
            role: Some("builder".into()),
            agent_id: Some("builder-one".into()),
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        });
        let entry = terminal_session_entry(
            "dev",
            "card-1",
            "Ship the real app",
            &run,
            vec!["src/main.rs".into()],
        );
        assert_eq!(entry.id, "run_abc");
        assert_eq!(entry.agent.as_deref(), Some("opencode"));
        assert_eq!(entry.files_touched, vec!["src/main.rs"]);
        assert_eq!(entry.matched_card_ids, vec!["card-1"]);
        assert!(entry.summary.as_deref().unwrap_or("").contains("Ship the real app"));
        assert!(entry.prompt.as_deref().unwrap_or("").contains("Ship the real app"));
    }
}
