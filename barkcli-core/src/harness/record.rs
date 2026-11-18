//! Attempt records shared by the CLI runner and the web runtime.
//!
//! The web app keeps one `RunRecord` per attempt in `.board/runs/`, and every
//! history, usage and contribution-graph view reads from there. The CLI runner
//! used to keep its own story: a `RunReport` in memory plus a transcript file,
//! so a `barkcli run` was invisible to Review, offline in the usage charts and
//! absent from the contribution graph.
//!
//! This module writes the same record from the CLI path:
//!
//! * **start** — one record per attempt, with the packet id as
//!   `context_manifest_id`, the worktree, branch, base SHA and the provider
//!   that is about to run;
//! * **attempt facts** — from the worker: exit code, gate verdict, diff stats,
//!   head SHA, token/cost usage;
//! * **finish** — from the dispatcher, once the merge decision is known:
//!   `merged`, `needs_review` or `failed`.
//!
//! A retry starts a new record, matching the runtime's model ("a retry creates
//! a new run; old runs remain inspectable"). Recording is best-effort: a
//! missing or read-only `.board` must never break an autonomy run.

use std::path::Path;

use chrono::Utc;
use serde::Serialize;

use crate::agent::queue::TaskRequest;
use crate::agent::usage::UsageTotals;
use crate::runtime::event::{CheckOutcome, CheckVerification, GateSummary, RunRecord, RunStatus};
use crate::runtime::RuntimeStore;
use crate::util::style;

/// Everything known when an attempt starts.
pub struct StartInfo<'a> {
    pub task: &'a TaskRequest,
    pub branch: &'a str,
    pub worktree: &'a Path,
    pub attempt: u32,
    /// Base commit the branch was cut from (read before the agent ran).
    pub base_sha: Option<&'a str>,
    /// Backend display name, or `agent-cmd` for an injected script.
    pub provider: &'a str,
    pub model: Option<&'a str>,
    pub permission_mode: &'a str,
    pub role: Option<&'a str>,
    /// `ctx-…` packet id, so a prompt can be diffed from the run view.
    pub context_manifest_id: Option<&'a str>,
    pub prompt: &'a str,
    pub transcript: Option<&'a str>,
}

/// Attempt facts the worker knows before the dispatcher decides the outcome.
#[derive(Debug, Clone, Default)]
pub struct AttemptFacts {
    pub exit_code: Option<i32>,
    pub gate: Option<GateResultFacts>,
    pub usage: UsageTotals,
    pub diff_files: u32,
    pub diff_additions: u32,
    pub diff_deletions: u32,
    pub head_sha: Option<String>,
    pub files_touched: Vec<String>,
    pub error: Option<String>,
}

/// The gate as the record stores it (kept separate from the runner's own
/// `GateResult` so this module does not depend on `commands::run_cmd`).
#[derive(Debug, Clone, Default)]
pub struct GateResultFacts {
    pub passed: bool,
    pub command: Option<String>,
    pub summary: Option<String>,
    pub log_path: Option<String>,
    /// Head SHA the gate ran against, when it ran on a commit.
    pub tested_head: Option<String>,
}

/// A handle to one attempt's record. `None` means recording was unavailable
/// and the caller should carry on without it.
#[derive(Clone)]
pub struct AttemptRecord {
    store: RuntimeStore,
    pub run_id: String,
}

impl AttemptRecord {
    /// Create the attempt record. Returns `None` (with a warning) rather than
    /// failing the run when the board is missing or unwritable.
    pub fn start(info: &StartInfo<'_>) -> Option<Self> {
        let store = match RuntimeStore::from_project() {
            Ok(store) => store,
            Err(err) => {
                println!(
                    "{} run record skipped: {}",
                    style::warn("⚠"),
                    err
                );
                return None;
            }
        };

        let run_id = format!("run_{}", uuid::Uuid::new_v4().simple());
        let start = crate::runtime::event::StartRun {
            run_id: run_id.clone(),
            thread_id: info.task.card_id.clone(),
            card_id: info.task.card_id.clone(),
            prompt: info.prompt.to_string(),
            cwd: info.worktree.display().to_string(),
            provider: info.provider.to_string(),
            model: info.model.map(str::to_string),
            role: info.role.map(str::to_string),
            agent_id: None,
            permission_mode: info.permission_mode.to_string(),
            provider_session_id: None,
            raw_log_path: info.transcript.map(str::to_string),
        };

        let mut run = match store.create_run(&start) {
            Ok(run) => run,
            Err(err) => {
                println!("{} run record skipped: {}", style::warn("⚠"), err);
                return None;
            }
        };

        run.worktree = Some(info.worktree.display().to_string());
        run.branch = Some(info.branch.to_string());
        run.base_sha = info
            .base_sha
            .map(str::to_string)
            .or_else(|| git(info.worktree, &["rev-parse", "HEAD"]));
        run.context_manifest_id = info.context_manifest_id.map(str::to_string);
        run.author = Some(author_for(info.provider));
        run.title = Some(format!("{} (attempt {})", info.task.title, info.attempt));
        // The runner is alive for the whole attempt; the web's reconciler uses
        // this to tell "still working" from "orphaned by a restart".
        run.pid = Some(std::process::id());
        run.status = RunStatus::Running;

        match store.save_run(&run) {
            Ok(()) => Some(Self { store, run_id }),
            Err(err) => {
                println!("{} run record skipped: {}", style::warn("⚠"), err);
                None
            }
        }
    }

    /// Merge in what the worker learned. Never fatal.
    pub fn facts(&self, facts: &AttemptFacts) {
        let Ok(mut run) = self.store.load_run(&self.run_id) else {
            return;
        };
        run.exit_code = facts.exit_code;
        run.usage = crate::runtime::event::RunUsage {
            input_tokens: facts.usage.input_tokens,
            output_tokens: facts.usage.output_tokens,
            cached_input_tokens: (facts.usage.cached_input_tokens > 0)
                .then_some(facts.usage.cached_input_tokens),
            cost_usd: (facts.usage.cost_usd > 0.0).then_some(facts.usage.cost_usd),
        };
        run.diff_stats = crate::runtime::event::RunDiffStats {
            files: facts.diff_files,
            additions: facts.diff_additions,
            deletions: facts.diff_deletions,
        };
        run.head_sha = facts.head_sha.clone();
        run.files_touched = facts.files_touched.clone();
        if facts.error.is_some() {
            run.error = facts.error.clone();
        }
        if let Some(gate) = &facts.gate {
            let head = facts
                .head_sha
                .clone()
                .or_else(|| gate.tested_head.clone())
                .unwrap_or_default();
            run.gate = Some(GateSummary {
                passed: gate.passed,
                command: gate.command.clone(),
                summary: gate.summary.clone(),
                log_path: gate.log_path.clone(),
                finished_at: Utc::now(),
                verification: Some(CheckVerification {
                    outcome: if gate.passed {
                        CheckOutcome::Passed
                    } else {
                        CheckOutcome::Failed
                    },
                    tested_head: head.clone(),
                    target_head: head,
                    exit_code: facts.exit_code.or(Some(if gate.passed { 0 } else { 1 })),
                }),
            });
        }
        let _ = self.store.save_run(&run);
    }

    /// Terminal status from the dispatcher, once the merge decision is known.
    pub fn finish(&self, status: RunStatus, summary: Option<String>, error: Option<String>) {
        let Ok(mut run) = self.store.load_run(&self.run_id) else {
            return;
        };
        run.status = status;
        run.ended_at = Some(Utc::now());
        if summary.is_some() {
            run.summary = summary;
        }
        if error.is_some() {
            run.error = error;
        }
        let _ = self.store.save_run(&run);
    }

    /// Record an independent verification. `verifier` must differ from the
    /// author, which `RunRecord::add_verification` enforces.
    pub fn verify(&self, verifier: &str, passed: bool, note: Option<String>) {
        if let Err(err) = self.store.verify_run(&self.run_id, verifier, passed, note) {
            println!("{} verification not recorded: {}", style::warn("⚠"), err);
        }
    }
}

fn author_for(provider: &str) -> String {
    format!("runner:{}", provider)
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Diff stats for `base..HEAD` inside a worktree.
pub fn diff_stats(worktree: &Path, base: &str) -> (u32, u32, u32, Vec<String>) {
    let Some(raw) = git(worktree, &["diff", "--numstat", base, "HEAD"]) else {
        return (0, 0, 0, Vec::new());
    };
    let mut files = 0u32;
    let mut additions = 0u32;
    let mut deletions = 0u32;
    let mut paths = Vec::new();
    for line in raw.lines() {
        let mut cols = line.split('\t');
        let (Some(add), Some(del), Some(path)) = (cols.next(), cols.next(), cols.next()) else {
            continue;
        };
        files += 1;
        additions += add.trim().parse::<u32>().unwrap_or(0);
        deletions += del.trim().parse::<u32>().unwrap_or(0);
        paths.push(path.trim().to_string());
    }
    if paths.is_empty() {
        if let Some(names) = git(worktree, &["diff", "--name-only", base, "HEAD"]) {
            paths = names.lines().map(|l| l.trim().to_string()).collect();
            files = paths.len() as u32;
        }
    }
    (files, additions, deletions, paths)
}

// ── cost reporting (H11) ──

/// Cost per merged change for one provider, aggregated from run records.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BackendCost {
    pub provider: String,
    pub runs: u32,
    pub merged: u32,
    pub cost_usd: f64,
    /// `None` when the backend reported no cost at all.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usd_per_merged_change: Option<f64>,
}

/// Aggregate the project's run records by provider.
///
/// "Cost per merged change" is the metric the plan tracks, and it only means
/// something across runs — so it is computed from `.board/runs/`, the same
/// store the web app shows.
pub fn cost_by_backend() -> Vec<BackendCost> {
    let Ok(store) = RuntimeStore::from_project() else {
        return Vec::new();
    };
    let Ok(runs) = store.list_runs(None) else {
        return Vec::new();
    };
    aggregate_costs(&runs)
}

fn aggregate_costs(runs: &[RunRecord]) -> Vec<BackendCost> {
    let mut out: Vec<BackendCost> = Vec::new();
    for run in runs {
        // Only attempts that actually did work count: queued/starting records
        // have no outcome to price.
        if !matches!(
            run.status,
            RunStatus::Merged | RunStatus::Passed | RunStatus::NotVerified | RunStatus::Failed
        ) {
            continue;
        }
        let entry = match out.iter_mut().find(|c| c.provider == run.provider) {
            Some(entry) => entry,
            None => {
                out.push(BackendCost {
                    provider: run.provider.clone(),
                    runs: 0,
                    merged: 0,
                    cost_usd: 0.0,
                    usd_per_merged_change: None,
                });
                out.last_mut().expect("just pushed")
            }
        };
        entry.runs += 1;
        if run.status == RunStatus::Merged {
            entry.merged += 1;
        }
        entry.cost_usd += run.usage.cost_usd.unwrap_or(0.0);
    }
    for entry in &mut out {
        if entry.cost_usd > 0.0 && entry.merged > 0 {
            entry.usd_per_merged_change = Some(entry.cost_usd / entry.merged as f64);
        }
    }
    out.sort_by(|a, b| a.provider.cmp(&b.provider));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::event::RunUsage;

    fn run(id: &str, provider: &str, status: RunStatus, cost: Option<f64>) -> RunRecord {
        let mut run = RunRecord::new(&crate::runtime::event::StartRun {
            run_id: id.into(),
            thread_id: "card-1".into(),
            card_id: "card-1".into(),
            prompt: "p".into(),
            cwd: "/tmp".into(),
            provider: provider.into(),
            model: None,
            role: None,
            agent_id: None,
            permission_mode: "acceptEdits".into(),
            provider_session_id: None,
            raw_log_path: None,
        });
        run.status = status;
        run.usage = RunUsage {
            input_tokens: 10,
            output_tokens: 5,
            cached_input_tokens: None,
            cost_usd: cost,
        };
        run
    }

    #[test]
    fn cost_per_merged_change_groups_by_provider() {
        let runs = vec![
            run("a", "claude", RunStatus::Merged, Some(0.10)),
            run("b", "claude", RunStatus::Merged, Some(0.20)),
            run("c", "claude", RunStatus::Failed, Some(0.30)),
            run("d", "codex", RunStatus::Merged, None),
            run("e", "codex", RunStatus::Queued, Some(9.0)),
        ];
        let costs = aggregate_costs(&runs);

        let claude = costs.iter().find(|c| c.provider == "claude").unwrap();
        assert_eq!(claude.runs, 3);
        assert_eq!(claude.merged, 2);
        assert!((claude.cost_usd - 0.60).abs() < 1e-9);
        assert!((claude.usd_per_merged_change.unwrap() - 0.30).abs() < 1e-9);

        // codex reported no cost: no invented number
        let codex = costs.iter().find(|c| c.provider == "codex").unwrap();
        assert_eq!(codex.runs, 1, "queued runs are not priced");
        assert!(codex.usd_per_merged_change.is_none());
    }

    #[test]
    fn diff_stats_read_a_real_worktree() {
        let dir = std::env::temp_dir().join(format!("bark-record-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let git = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .args(args)
                .current_dir(&dir)
                .output()
                .unwrap();
            assert!(out.status.success(), "git {:?}: {}", args, String::from_utf8_lossy(&out.stderr));
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "h@b.test"]);
        git(&["config", "user.name", "harness"]);
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-q", "-m", "base"]);
        let base = git(&["rev-parse", "HEAD"]);
        std::fs::write(dir.join("a.txt"), "one\ntwo\nthree\n").unwrap();
        std::fs::write(dir.join("b.txt"), "new\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-q", "-m", "work"]);

        let (files, adds, dels, paths) = diff_stats(&dir, &base);

        assert_eq!(files, 2);
        assert_eq!(adds, 3);
        assert_eq!(dels, 0);
        assert!(paths.contains(&"a.txt".to_string()));
        assert!(paths.contains(&"b.txt".to_string()));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
