//! Contribution-graph commands: analyze, contribute, link, verify, ancestry.
//!
//! The graph is always on. These commands make the graph usable from the
//! terminal without requiring a board card or the web UI.

use anyhow::{bail, Context, Result};
use chrono::Utc;

use super::fleet::{flag_value, resolve_board_arg};
use crate::runtime::event::{ContributionKind, RunRecord, RunStatus, StartRun};
use crate::runtime::{ContributionIndex, RunService, RuntimeStore};
use crate::util::style;

/// `barkcli analyze [--json]` — the Agora-style discovery snapshot.
pub fn run_analyze(args: &[String]) -> Result<()> {
    let _board = resolve_board_arg(args)?;
    let store = RuntimeStore::from_project()?;
    let analysis = store.contribution_index()?.analysis();
    if args.iter().any(|arg| arg == "--json") {
        println!("{}", serde_json::to_string_pretty(&analysis)?);
        return Ok(());
    }

    println!(
        "{} {} nodes · {} edges · {} verified ({:.0}%) · {} neglected · {} contested",
        style::accent("Contributions:"),
        analysis.metrics.total_nodes,
        analysis.metrics.edges,
        analysis.metrics.verified_nodes,
        analysis.metrics.verification_rate * 100.0,
        analysis.metrics.neglected_nodes,
        analysis.metrics.contested_nodes,
    );
    println!(
        "  largest lineage {:.0}% · reuse {:.0}% · last 7d {} · authors {}",
        analysis.metrics.largest_lineage_share * 100.0,
        analysis.metrics.reuse_rate * 100.0,
        analysis.metrics.contributions_last_7d,
        analysis.metrics.active_authors,
    );

    print_nodes("Leading", &analysis.leading);
    print_nodes("Neglected", &analysis.neglected);
    print_nodes("Contested", &analysis.contested);
    print_nodes("Open hypotheses", &analysis.open_hypotheses);

    if !analysis.duplicates.is_empty() {
        println!("\n{}", style::warn("Potential duplicates:"));
        for duplicate in &analysis.duplicates {
            println!(
                "  {} ↔ {} · {}",
                style::strong(&duplicate.left),
                duplicate.right,
                duplicate.shared_files.join(", ")
            );
        }
    }

    if analysis.recommendations.is_empty() {
        println!("\n{} no recommendations yet — run an agent or publish a contribution.", style::muted("Next:"));
    } else {
        println!("\n{}", style::accent("Next experiments:"));
        for recommendation in &analysis.recommendations {
            println!(
                "  {} [{}] {} — {}",
                style::strong(&recommendation.run_id),
                recommendation.lane,
                recommendation.title,
                style::muted(&recommendation.reason)
            );
        }
    }
    Ok(())
}

fn print_nodes(label: &str, nodes: &[crate::runtime::ContributionNode]) {
    if nodes.is_empty() {
        return;
    }
    println!("\n{}", style::accent(&format!("{label}:")));
    for node in nodes {
        let verified = if node.verified {
            style::ok("verified")
        } else {
            style::warn("unverified")
        };
        println!(
            "  {} {} · {} · evidence {:.2} · children {} · {}",
            style::strong(&node.id),
            verified,
            node.title,
            node.evidence_score,
            node.children.len(),
            style::muted(node.kind.as_str()),
        );
    }
}

/// `barkcli contribute --title ... [--kind insight] [--parent RUN] [--text ...]`
pub fn run_contribute(args: &[String]) -> Result<()> {
    let title = flag_value(args, "--title")
        .or_else(|| flag_value(args, "-t"))
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli contribute --title <text> [--kind insight] [--parent RUN]"))?;
    let text = flag_value(args, "--text").unwrap_or_default();
    let kind = ContributionKind::parse(
        &flag_value(args, "--kind").unwrap_or_else(|| "insight".into()),
    );
    let parent = flag_value(args, "--parent");
    let author = flag_value(args, "--author")
        .or_else(|| std::env::var("USER").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "human".into());
    let files: Vec<String> = flag_value(args, "--files")
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let store = RuntimeStore::from_project()?;
    let project_root = crate::storage::board_dir::find_project_root()?;
    let run_id = format!("run_{}", uuid::Uuid::new_v4().simple());
    let thread_id = format!("contribution_{}", &run_id[4..12]);
    let start = StartRun {
        run_id: run_id.clone(),
        thread_id: thread_id.clone(),
        card_id: thread_id.clone(),
        prompt: text.clone(),
        cwd: project_root.to_string_lossy().to_string(),
        provider: "manual".into(),
        model: None,
        role: Some("researcher".into()),
        agent_id: Some(author.clone()),
        permission_mode: "manual".into(),
        provider_session_id: None,
        raw_log_path: None,
    };
    let mut run = store.create_run(&start)?;
    run.title = Some(title.clone());
    run.kind = kind;
    run.status = RunStatus::Passed;
    run.ended_at = Some(Utc::now());
    run.author = Some(author.clone());
    run.files_touched = files;
    run.summary = Some(text.clone()).filter(|value| !value.trim().is_empty());
    run.gate = Some(crate::runtime::event::GateSummary {
        passed: true,
        command: None,
        summary: Some("Manual contribution (no gate)".into()),
        log_path: None,
        finished_at: Utc::now(),
    });
    if let Some(parent) = parent.as_deref() {
        run.add_parent(parent)?;
    }
    store.save_run(&run)?;
    println!(
        "{} {} · {} · {}",
        style::ok("Contribution:"),
        run.id,
        kind.as_str(),
        style::muted(&title),
    );
    Ok(())
}

/// `barkcli link-run <child> <parent>` — append a contribution edge.
pub fn run_link(args: &[String]) -> Result<()> {
    if args.len() < 2 {
        bail!("usage: barkcli link-run <child-run> <parent-run>");
    }
    let store = RuntimeStore::from_project()?;
    let run = store.link_run(&args[0], &args[1])?;
    println!(
        "{} {} builds on {}",
        style::ok("Linked:"),
        run.id,
        run.effective_parents().join(", ")
    );
    Ok(())
}

/// `barkcli verify-run <run> [--verifier NAME] [--note ...]`
pub fn run_verify(args: &[String]) -> Result<()> {
    let run_id = args
        .first()
        .filter(|arg| !arg.starts_with('-'))
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli verify-run <run> [--verifier NAME]"))?;
    let board = resolve_board_arg(args)?;
    let verifier = flag_value(args, "--verifier")
        .or_else(|| std::env::var("USER").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "human".into());
    let service = RunService::from_project(&board)
        .with_context(|| "could not open the runtime for this project")?;
    let run = service.verify(run_id, &verifier, flag_value(args, "--note"))?;
    let passed = run
        .verifications
        .last()
        .map(|verification| verification.passed)
        .unwrap_or(false);
    println!(
        "{} {} → {} ({} independent verification(s))",
        if passed {
            style::ok("Verified:")
        } else {
            style::err("Verification failed:")
        },
        run.id,
        verifier,
        run.independent_verifications()
    );
    Ok(())
}

/// `barkcli ancestry <run>` — root-first contribution lineage.
pub fn run_ancestry(args: &[String]) -> Result<()> {
    let run_id = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli ancestry <run>"))?;
    let store = RuntimeStore::from_project()?;
    let index: ContributionIndex = store.contribution_index()?;
    let lineage = index.ancestry(run_id);
    if lineage.is_empty() {
        bail!("run '{run_id}' was not found");
    }
    for (depth, node) in lineage.iter().enumerate() {
        println!(
            "{} {} {}",
            "  ".repeat(depth),
            style::strong(&node.id),
            node.title,
        );
    }
    let descendants = index.descendants(run_id);
    if !descendants.is_empty() {
        println!("\n{}", style::accent("Descendants:"));
        for node in descendants {
            println!("  {} {}", node.id, node.title);
        }
    }
    Ok(())
}

/// Build a manual contribution record for tests and adapters.
pub fn manual_contribution(
    store: &RuntimeStore,
    title: &str,
    kind: ContributionKind,
    author: &str,
    parent: Option<&str>,
    files: Vec<String>,
    text: Option<&str>,
) -> Result<RunRecord> {
    let run_id = format!("run_{}", uuid::Uuid::new_v4().simple());
    let start = StartRun {
        run_id,
        thread_id: "manual".into(),
        card_id: "manual".into(),
        prompt: String::new(),
        cwd: std::env::current_dir()?.to_string_lossy().to_string(),
        provider: "manual".into(),
        model: None,
        role: Some("researcher".into()),
        agent_id: Some(author.into()),
        permission_mode: "manual".into(),
        provider_session_id: None,
        raw_log_path: None,
    };
    let mut run = store.create_run(&start)?;
    run.title = Some(title.into());
    run.kind = kind;
    run.status = RunStatus::Passed;
    run.ended_at = Some(Utc::now());
    run.author = Some(author.into());
    run.files_touched = files;
    run.summary = text
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string);
    if let Some(parent) = parent {
        run.add_parent(parent)?;
    }
    store.save_run(&run)?;
    Ok(run)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_contributions_preserve_kind_text_and_parent() {
        let dir = std::env::temp_dir().join(format!(
            "bark_contribute_{}",
            uuid::Uuid::new_v4().simple()
        ));
        let store = RuntimeStore::new(&dir);
        let root = manual_contribution(
            &store,
            "Root insight",
            ContributionKind::Insight,
            "agent-a",
            None,
            vec![],
            Some("A root observation"),
        )
        .unwrap();
        let child = manual_contribution(
            &store,
            "Child hypothesis",
            ContributionKind::Hypothesis,
            "agent-b",
            Some(&root.id),
            vec!["src/lib.rs".into()],
            Some("A follow-up"),
        )
        .unwrap();
        assert_eq!(child.kind, ContributionKind::Hypothesis);
        assert_eq!(child.summary.as_deref(), Some("A follow-up"));
        assert_eq!(child.effective_parents(), vec![root.id.clone()]);
        assert_eq!(child.files_touched, vec!["src/lib.rs"]);
        let index = store.contribution_index().unwrap();
        assert_eq!(index.ancestry(&child.id).len(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
