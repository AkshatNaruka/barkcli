//! `barkcli receipt` — verifiable merge receipts.

use std::path::Path;
use std::process::Command;
use std::time::Instant;

use anyhow::{bail, Context, Result};
use chrono::Utc;
use serde::Serialize;

use crate::guard::diff::{diff_for_scope, DiffScope};
use crate::guard::{self, GuardOptions};
use crate::receipt::builder::{self, ReceiptInput};
use crate::receipt::{
    self, find_receipt, list_receipts, save_receipt, AgentEvidence, GateEvidence, ReceiptSummary,
    WorkspaceEvidence,
};
use crate::storage::board_dir::find_project_root;
use crate::storage::board_file::read_board;
use crate::storage::config_store::read_config;
use crate::util::redact::redact_text;

pub fn run_receipt(args: &[String]) -> Result<()> {
    match args.first().map(String::as_str) {
        Some("list") | Some("ls") => run_list(&args[1..]),
        Some("show") => run_show(&args[1..]),
        Some("create") => run_create(&args[1..]),
        Some("verify") => run_verify(&args[1..]),
        Some("help") | Some("--help") | Some("-h") | None => {
            print_help();
            Ok(())
        }
        Some(other) => bail!("unknown receipt subcommand `{other}`"),
    }
}

fn print_help() {
    println!("Usage: barkcli receipt <command>");
    println!();
    println!("  list [--card <id>] [--json]                 List receipts, newest first");
    println!("  show <id|card> [--json]                     Show a receipt (Markdown by default)");
    println!("  create --card <id> [--branch <b>] [--run <id>] [--json]");
    println!("  verify <id|card> [--rerun-gate] [--json]    Recompute the hash and check the branch");
}

fn run_list(args: &[String]) -> Result<()> {
    let mut card = None;
    let mut json = false;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--json" => json = true,
            "--card" => {
                index += 1;
                card = Some(args.get(index).context("--card needs a card id")?.clone());
            }
            other => bail!("unknown receipt list flag `{other}`"),
        }
        index += 1;
    }

    let root = find_project_root()?;
    let receipts = list_receipts(&root, card.as_deref())?;
    let summaries: Vec<ReceiptSummary> = receipts.iter().map(ReceiptSummary::from).collect();

    if json {
        println!("{}", serde_json::to_string_pretty(&summaries)?);
    } else {
        print!("{}", render_list(&summaries));
    }
    Ok(())
}

fn render_list(summaries: &[ReceiptSummary]) -> String {
    if summaries.is_empty() {
        return "no receipts yet — run a merge with `barkcli run`, or `barkcli receipt create --card <id>`\n"
            .to_string();
    }
    let mut out = format!(
        "{:<20} {:<10} {:<7} {:<6} {:<6} {}\n",
        "ID", "CARD", "CONF", "GATE", "FILES", "CREATED"
    );
    for summary in summaries {
        out.push_str(&format!(
            "{:<20} {:<10} {:<7} {:<6} {:<6} {}\n",
            summary.id,
            summary.card_id,
            summary.confidence.as_str(),
            if summary.gate_passed { "pass" } else { "—" },
            summary.files,
            summary.created_at.format("%Y-%m-%d %H:%M")
        ));
    }
    out
}

fn run_show(args: &[String]) -> Result<()> {
    let mut selector = None;
    let mut json = false;
    for arg in args {
        match arg.as_str() {
            "--json" => json = true,
            "--md" => {}
            other if other.starts_with('-') => bail!("unknown receipt show flag `{other}`"),
            other => selector = Some(other.to_string()),
        }
    }
    let selector = selector.context("receipt show needs an id or card id")?;
    let root = find_project_root()?;
    let receipt = find_receipt(&root, &selector)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&receipt)?);
    } else {
        print!("{}", receipt::to_markdown(&receipt));
    }
    Ok(())
}

fn run_create(args: &[String]) -> Result<()> {
    let mut card_id = None;
    let mut branch = None;
    let mut run_id = None;
    let mut json = false;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--json" => json = true,
            "--card" => {
                index += 1;
                card_id = Some(args.get(index).context("--card needs a card id")?.clone());
            }
            "--branch" => {
                index += 1;
                branch = Some(args.get(index).context("--branch needs a branch name")?.clone());
            }
            "--run" => {
                index += 1;
                run_id = Some(args.get(index).context("--run needs a run id")?.clone());
            }
            other => bail!("unknown receipt create flag `{other}`"),
        }
        index += 1;
    }

    let card_id = card_id.context("receipt create needs --card <id>")?;
    let root = find_project_root()?;
    let board_name = crate::cli::resolve_board(None)?;
    let board = read_board(&board_name)?;
    let card = board
        .find_card(&card_id)
        .with_context(|| format!("card `{card_id}` not found on board `{board_name}`"))?;

    let branch = match branch {
        Some(branch) => branch,
        None => current_branch(&root)?,
    };
    let scope = branch_scope(&root, &branch);
    let diff = diff_for_scope(&root, &scope)?;

    let config = read_config(&root.join(".board")).unwrap_or_default();
    let guard_report = if config.guard.enabled {
        let options = GuardOptions::from_settings(scope.clone(), &config.guard);
        Some(guard::scan_diff(&root, &diff, &options))
    } else {
        None
    };

    let (base, head) = split_range(&scope);
    let review = builder::review_evidence(&card_id, diff.files.len() as u32);
    let input = ReceiptInput {
        card_id: card.id.clone(),
        card_title: card.title.clone(),
        card_description: card.description.clone(),
        task_id: None,
        run_id,
        thread_id: None,
        agent: AgentEvidence {
            provider: config
                .runtime
                .default_provider
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            ..AgentEvidence::default()
        },
        workspace: WorkspaceEvidence {
            branch: Some(branch.clone()),
            base_sha: git_opt(&root, &["rev-parse", &base]),
            head_sha: git_opt(&root, &["rev-parse", &head]),
            worktree: None,
        },
        diff: builder::diff_evidence(&diff),
        gate: None,
        guard: guard_report,
        review,
        created_at: None,
    };

    let receipt = builder::build(input);
    let saved = save_receipt(&root, receipt)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&saved)?);
    } else {
        println!(
            "receipt {} → .board/receipts/{}.json (+ .md)",
            saved.id, saved.id
        );
        println!(
            "{} · {} · {} file(s) · gate not run",
            saved.card_id,
            saved.confidence.level.as_str(),
            saved.diff.files
        );
    }
    Ok(())
}

#[derive(Debug, Serialize)]
struct VerifyOutput {
    valid: bool,
    hash_ok: bool,
    branch_moved: Option<bool>,
    gate: Option<GateEvidence>,
}

fn run_verify(args: &[String]) -> Result<()> {
    let mut selector = None;
    let mut rerun_gate = false;
    let mut json = false;
    for arg in args {
        match arg.as_str() {
            "--json" => json = true,
            "--rerun-gate" => rerun_gate = true,
            other if other.starts_with('-') => bail!("unknown receipt verify flag `{other}`"),
            other => selector = Some(other.to_string()),
        }
    }
    let selector = selector.context("receipt verify needs an id or card id")?;
    let root = find_project_root()?;
    let receipt = find_receipt(&root, &selector)?;

    let hash_ok = receipt.hash_ok();
    let branch_moved = branch_moved(&root, &receipt);
    let gate = if rerun_gate {
        Some(rerun_gate_command(&root, &receipt.gate)?)
    } else {
        None
    };
    let gate_ok = gate
        .as_ref()
        .map(|gate| gate.passed || gate.skipped)
        .unwrap_or(true);
    let valid = hash_ok && branch_moved != Some(true) && gate_ok;

    let output = VerifyOutput {
        valid,
        hash_ok,
        branch_moved,
        gate,
    };
    if json {
        println!("{}", serde_json::to_string_pretty(&output)?);
    } else {
        println!("receipt {}", receipt.id);
        println!("hash:   {}", if hash_ok { "ok" } else { "MISMATCH" });
        println!(
            "branch: {}",
            match branch_moved {
                Some(true) => "moved since the receipt was written",
                Some(false) => "unchanged",
                None => "not checked (no recorded branch head)",
            }
        );
        if let Some(gate) = &output.gate {
            println!(
                "gate:   {} (rerun)",
                if gate.passed { "passed" } else { "failed" }
            );
        }
        println!("valid:  {}", if valid { "yes" } else { "NO" });
    }

    if !valid {
        bail!("receipt verification failed");
    }
    Ok(())
}

fn branch_moved(root: &Path, receipt: &receipt::Receipt) -> Option<bool> {
    let branch = receipt.workspace.branch.as_deref()?;
    let recorded = receipt.workspace.head_sha.as_deref()?;
    let current = git_opt(root, &["rev-parse", branch])?;
    Some(current != recorded)
}

fn rerun_gate_command(root: &Path, gate: &GateEvidence) -> Result<GateEvidence> {
    let Some(command) = &gate.command else {
        return Ok(GateEvidence {
            skipped: true,
            ..gate.clone()
        });
    };

    let started = Instant::now();
    let output = Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(root)
        .output()
        .with_context(|| format!("failed to run `{command}`"))?;
    let duration_ms = started.elapsed().as_millis() as u64;

    Ok(GateEvidence {
        command: Some(command.clone()),
        passed: output.status.success(),
        skipped: false,
        duration_ms: Some(duration_ms),
        log_path: gate.log_path.clone(),
        tail: Some(tail_of(&output.stdout, &output.stderr)),
        finished_at: Some(Utc::now()),
    })
}

fn tail_of(stdout: &[u8], stderr: &[u8]) -> String {
    let mut text = String::from_utf8_lossy(stdout).to_string();
    let stderr = String::from_utf8_lossy(stderr);
    if !text.is_empty() && !stderr.is_empty() {
        text.push('\n');
    }
    text.push_str(&stderr);
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(15);
    redact_text(&lines[start..].join("\n"))
}

fn branch_scope(root: &Path, branch: &str) -> DiffScope {
    for candidate in ["main", "master", "trunk"] {
        if candidate == branch {
            continue;
        }
        if let Some(base) = git_opt(root, &["merge-base", candidate, branch]) {
            return DiffScope::Range(format!("{base}..{branch}"));
        }
    }
    DiffScope::Range(format!("{branch}~1..{branch}"))
}

fn split_range(scope: &DiffScope) -> (String, String) {
    match scope {
        DiffScope::Range(range) => {
            let (base, head) = range
                .split_once("...")
                .or_else(|| range.split_once(".."))
                .unwrap_or((range.as_str(), "HEAD"));
            (base.to_string(), head.to_string())
        }
        DiffScope::Worktree => ("HEAD".into(), "WORKTREE".into()),
        DiffScope::Staged => ("HEAD".into(), "INDEX".into()),
    }
}

fn current_branch(root: &Path) -> Result<String> {
    let branch = git(root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if branch == "HEAD" {
        bail!("detached HEAD — pass --branch <name>");
    }
    Ok(branch)
}

fn git(root: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .context("failed to run git")?;
    if !output.status.success() {
        bail!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn git_opt(root: &Path, args: &[&str]) -> Option<String> {
    git(root, args).ok().filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::receipt::{ConfidenceLevel, ReceiptSummary};
    use chrono::Utc;

    #[test]
    fn renders_empty_list_hint() {
        assert!(render_list(&[]).contains("no receipts yet"));
    }

    #[test]
    fn renders_summary_table() {
        let summaries = vec![ReceiptSummary {
            id: "rcpt_abc".into(),
            card_id: "c-1".into(),
            created_at: Utc::now(),
            confidence: ConfidenceLevel::High,
            gate_passed: true,
            files: 3,
            additions: 10,
            deletions: 2,
            guard_errors: 0,
            guard_warnings: 0,
        }];
        let table = render_list(&summaries);
        assert!(table.contains("rcpt_abc"));
        assert!(table.contains("high"));
        assert!(table.contains('3'));
    }

    #[test]
    fn tail_keeps_last_15_lines_and_redacts() {
        let mut stdout = String::new();
        for index in 0..20 {
            stdout.push_str(&format!("line {index}\n"));
        }
        stdout.push_str(&format!("token sk-{}\n", "a".repeat(30)));
        let tail = tail_of(stdout.as_bytes(), b"");
        assert!(!tail.contains("line 4"));
        assert!(tail.contains("line 19"));
        assert!(!tail.contains("sk-aaaa"));
        assert!(tail.contains("[REDACTED]"));
    }

    #[test]
    fn split_range_handles_double_and_triple_dots() {
        assert_eq!(
            split_range(&DiffScope::Range("a..b".into())),
            ("a".into(), "b".into())
        );
        assert_eq!(
            split_range(&DiffScope::Range("a...b".into())),
            ("a".into(), "b".into())
        );
        assert_eq!(split_range(&DiffScope::Worktree), ("HEAD".into(), "WORKTREE".into()));
    }

    #[test]
    fn diff_evidence_marks_test_files() {
        use crate::guard::diff::{ChangedFile, DiffLine, DiffSet, FileStatus};
        use std::collections::HashMap;

        let file = |path: &str| ChangedFile {
            path: path.into(),
            old_path: None,
            status: FileStatus::Modified,
            additions: 1,
            deletions: 0,
            added: Vec::new(),
            removed: Vec::new(),
        };
        let diff = DiffSet {
            base: "a".into(),
            head: "b".into(),
            files: vec![file("src/lib.rs"), file("src/lib_test.rs")],
            contents: HashMap::new(),
        };
        let evidence = builder::diff_evidence(&diff);
        assert_eq!(evidence.files, 2);
        assert_eq!(evidence.test_files, vec!["src/lib_test.rs"]);
        assert!(evidence.tests_changed);

        let mut inline = file("src/lib.rs");
        inline.added = vec![DiffLine {
            old_line: None,
            new_line: Some(1),
            text: "#[cfg(test)]".into(),
        }];
        let inline_diff = DiffSet {
            base: "a".into(),
            head: "b".into(),
            files: vec![inline],
            contents: HashMap::new(),
        };
        let inline_evidence = builder::diff_evidence(&inline_diff);
        assert!(inline_evidence.test_files.is_empty());
        assert!(inline_evidence.tests_changed);
    }

    #[test]
    fn review_evidence_defaults_without_store() {
        let evidence = builder::review_evidence("c-does-not-exist", 3);
        assert_eq!(evidence.total_files, 3);
        assert_eq!(evidence.open_comments, 0);
    }
}
