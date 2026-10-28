//! `barkcli review queue` / `barkcli review next` — risk-ranked review order.
//!
//! A queue item is one card plus the best diff we can resolve for it: the
//! newest receipt's branch, then the newest agent session, then a `bark/<id>`
//! branch. If none of those exist the item is `Unknown` and sorts last; the
//! queue never invents a diff.

use std::collections::HashSet;
use std::path::Path;

use anyhow::{bail, Context, Result};
use serde::Serialize;

use crate::agent::queue::TaskQueue;
use crate::agent::{list_sessions, Session};
use crate::code::metrics::compute_metrics;
use crate::code::tests::is_test_file;
use crate::guard::branch_scope;
use crate::guard::checks::is_documentation;
use crate::guard::diff::{diff_for_scope, DiffSet};
use crate::models::board::Board;
use crate::models::card::Card;
use crate::receipt::{self, builder, Receipt};
use crate::review_risk::{self, RiskAssessment, RiskFile, RiskInput, RiskTier};
use crate::storage::board_dir::find_project_root;
use crate::storage::board_file::read_board;
use crate::util::style;

#[derive(Debug, Clone, Serialize)]
pub struct QueueItem {
    pub card_id: String,
    pub title: String,
    pub column: String,
    pub branch: Option<String>,
    pub receipt_id: Option<String>,
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
    pub risk: RiskAssessment,
}

#[derive(Debug, Default)]
struct QueueArgs {
    board: Option<String>,
    all: bool,
    json: bool,
    limit: Option<usize>,
    next: bool,
}

impl QueueArgs {
    fn parse(args: &[String]) -> Result<Self> {
        let mut parsed = Self::default();
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "queue" => {}
                "next" => parsed.next = true,
                "--board" | "-b" => {
                    index += 1;
                    parsed.board = Some(
                        args.get(index)
                            .context("--board needs a board name")?
                            .clone(),
                    );
                }
                "--all" => parsed.all = true,
                "--json" => parsed.json = true,
                "--limit" => {
                    index += 1;
                    let raw = args.get(index).context("--limit needs a number")?;
                    parsed.limit = Some(
                        raw.parse()
                            .with_context(|| format!("invalid --limit `{raw}`"))?,
                    );
                }
                other if other.starts_with('-') => bail!("unknown review queue flag `{other}`"),
                other => bail!("unexpected review queue argument `{other}`"),
            }
            index += 1;
        }
        Ok(parsed)
    }
}

pub fn run(args: &[String]) -> Result<()> {
    let parsed = QueueArgs::parse(args)?;
    let board_name = crate::cli::resolve_board(parsed.board.as_deref())?;
    let board =
        read_board(&board_name).with_context(|| format!("board `{board_name}` not found"))?;
    let root = find_project_root()?;

    let mut items = build_queue(&root, &board, &board_name, parsed.all)?;
    if let Some(limit) = parsed.limit {
        items.truncate(limit);
    }

    if parsed.next {
        let selected = pick_next(&items);
        if parsed.json {
            println!("{}", serde_json::to_string_pretty(&selected)?);
        } else {
            render_next(selected);
        }
        return Ok(());
    }

    if parsed.json {
        println!("{}", serde_json::to_string_pretty(&items)?);
    } else {
        render_queue(&items);
    }
    Ok(())
}

pub(crate) fn build_queue(
    root: &Path,
    board: &Board,
    board_name: &str,
    include_doing: bool,
) -> Result<Vec<QueueItem>> {
    let queue = load_tasks(root, board_name);
    let sessions = list_sessions().unwrap_or_default();
    let mut items = Vec::new();

    for card in board
        .cards
        .iter()
        .filter(|card| card.column == "review" || (include_doing && card.column == "doing"))
    {
        let receipts = receipt::list_receipts(root, Some(&card.id)).unwrap_or_default();
        let latest = receipts.first();
        let task_ids: HashSet<String> = queue
            .tasks
            .iter()
            .filter(|task| task.card_id == card.id)
            .map(|task| task.id.clone())
            .collect();
        let branch = resolve_branch(root, card, latest, &sessions, &task_ids);

        let mut item = QueueItem {
            card_id: card.id.clone(),
            title: card.title.clone(),
            column: card.column.clone(),
            branch: branch.clone(),
            receipt_id: latest.map(|receipt| receipt.id.clone()),
            files: 0,
            additions: 0,
            deletions: 0,
            risk: RiskAssessment {
                score: 0,
                tier: RiskTier::Unknown,
                reasons: Vec::new(),
            },
        };

        if let Some(branch) = branch {
            let scope = branch_scope(root, &branch);
            if let Ok(diff) = diff_for_scope(root, &scope) {
                let (files, additions, deletions) = diff.stats();
                item.files = files;
                item.additions = additions;
                item.deletions = deletions;
                item.risk = risk_for_diff(&diff);
            }
        }

        items.push(item);
    }

    sort_items(&mut items);
    Ok(items)
}

fn load_tasks(root: &Path, board_name: &str) -> TaskQueue {
    let path = root
        .join(".board")
        .join("tasks")
        .join(format!("{board_name}.json"));
    TaskQueue::load(&path).unwrap_or_default()
}

fn resolve_branch(
    root: &Path,
    card: &Card,
    receipt: Option<&Receipt>,
    sessions: &[Session],
    task_ids: &HashSet<String>,
) -> Option<String> {
    if let Some(branch) = receipt.and_then(|receipt| receipt.workspace.branch.clone()) {
        return Some(branch);
    }

    let mut matching: Vec<&Session> = sessions
        .iter()
        .filter(|session| session.branch.is_some())
        .filter(|session| {
            session
                .task_id
                .as_ref()
                .map(|task| task_ids.contains(task))
                .unwrap_or(false)
        })
        .collect();
    matching.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    if let Some(branch) = matching.first().and_then(|session| session.branch.clone()) {
        return Some(branch);
    }

    for candidate in [format!("bark/{}", card.id), card.id.clone()] {
        if branch_exists(root, &candidate) {
            return Some(candidate);
        }
    }
    None
}

fn branch_exists(root: &Path, branch: &str) -> bool {
    std::process::Command::new("git")
        .arg("-C")
        .arg(root)
        .args([
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{branch}^{{commit}}"),
        ])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn risk_for_diff(diff: &DiffSet) -> RiskAssessment {
    let evidence = builder::diff_evidence(diff);
    let production_changed = diff
        .files
        .iter()
        .any(|file| !is_test_file(&file.path) && !is_documentation(&file.path));
    let files = diff
        .files
        .iter()
        .map(|file| RiskFile {
            path: file.path.clone(),
            additions: file.additions,
            deletions: file.deletions,
            cyclomatic: diff
                .content(&file.path)
                .map(|content| compute_metrics(&file.path, content).complexity.cyclomatic)
                .unwrap_or(0),
            touches_public_api: file.added.iter().any(|line| is_public_api_line(&line.text)),
        })
        .collect();

    review_risk::assess(&RiskInput {
        files,
        production_changed,
        tests_changed: evidence.tests_changed,
    })
}

fn is_public_api_line(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with("pub fn ")
        || trimmed.starts_with("pub async fn ")
        || trimmed.starts_with("pub struct ")
        || trimmed.starts_with("pub enum ")
        || trimmed.starts_with("pub trait ")
        || trimmed.starts_with("export ")
}

fn sort_items(items: &mut [QueueItem]) {
    items.sort_by(|a, b| {
        b.risk
            .tier
            .rank()
            .cmp(&a.risk.tier.rank())
            .then_with(|| b.risk.score.cmp(&a.risk.score))
            .then_with(|| a.card_id.cmp(&b.card_id))
    });
}

fn pick_next(items: &[QueueItem]) -> Option<&QueueItem> {
    items
        .iter()
        .find(|item| item.risk.tier != RiskTier::Skim && item.risk.tier != RiskTier::Unknown)
        .or_else(|| {
            items
                .iter()
                .find(|item| item.risk.tier != RiskTier::Unknown)
        })
        .or_else(|| items.first())
}

fn render_queue(items: &[QueueItem]) {
    if items.is_empty() {
        println!("{} no cards in review", style::muted("review queue:"));
        println!("  move one with `barkcli move <id> review`, or pass --all to include doing");
        return;
    }

    let must = items
        .iter()
        .filter(|item| item.risk.tier == RiskTier::Must)
        .count();
    let should = items
        .iter()
        .filter(|item| item.risk.tier == RiskTier::Should)
        .count();
    let skim = items
        .iter()
        .filter(|item| item.risk.tier == RiskTier::Skim)
        .count();
    let unknown = items
        .iter()
        .filter(|item| item.risk.tier == RiskTier::Unknown)
        .count();
    println!(
        "{} {} card(s) — {} must, {} should, {} skim, {} unknown",
        style::accent("review queue:"),
        items.len(),
        style::err(&must.to_string()),
        style::warn(&should.to_string()),
        style::muted(&skim.to_string()),
        style::muted(&unknown.to_string()),
    );
    println!();

    for item in items {
        let tier = match item.risk.tier {
            RiskTier::Must => style::err("MUST"),
            RiskTier::Should => style::warn("SHOULD"),
            RiskTier::Skim => style::muted("SKIM"),
            RiskTier::Unknown => style::muted("UNKNOWN"),
        };
        let branch = item.branch.as_deref().unwrap_or("—");
        println!(
            "{:<8} {:>3}  {:<22} {:<34} {:<20} {}",
            tier,
            item.risk.score,
            truncate(&item.card_id, 22),
            truncate(&item.title, 34),
            truncate(branch, 20),
            format!("{}f +{} -{}", item.files, item.additions, item.deletions),
        );
        if let Some(reason) = item.risk.reasons.first() {
            println!(
                "         └─ {} (+{}) {}",
                reason.signal, reason.points, reason.detail
            );
        }
    }
}

fn render_next(item: Option<&QueueItem>) {
    let Some(item) = item else {
        println!("{} no cards to review", style::muted("review next:"));
        return;
    };

    println!(
        "{} {} — {}",
        style::accent("review next:"),
        style::strong(&item.card_id),
        item.title
    );
    println!("  risk: {} ({})", item.risk.tier.as_str(), item.risk.score);
    if let Some(branch) = &item.branch {
        println!("  branch: {branch}");
    }
    if let Some(receipt_id) = &item.receipt_id {
        println!("  receipt: {receipt_id}");
    }
    println!(
        "  diff: {} files, +{} -{}",
        item.files, item.additions, item.deletions
    );
    if item.risk.reasons.is_empty() {
        println!("  why: no risk signals — skim it");
    } else {
        println!("  why:");
        for reason in &item.risk.reasons {
            println!(
                "    {:<14} +{:<2} {}",
                reason.signal, reason.points, reason.detail
            );
        }
    }
    if item.risk.tier == RiskTier::Skim {
        println!("  note: nothing high-risk is waiting; this is the lowest-risk item");
    }
    println!("  review:");
    println!("    barkcli receipt show {}", item.card_id);
    println!("    barkcli review {}", item.card_id);
    if let Some(branch) = &item.branch {
        println!("    git diff {branch}");
    }
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::review_risk::{RiskAssessment, RiskReason, RiskTier};

    fn item(id: &str, tier: RiskTier, score: u32) -> QueueItem {
        QueueItem {
            card_id: id.into(),
            title: format!("Card {id}"),
            column: "review".into(),
            branch: Some(format!("feat/{id}")),
            receipt_id: None,
            files: 1,
            additions: 1,
            deletions: 0,
            risk: RiskAssessment {
                score,
                tier,
                reasons: vec![RiskReason {
                    signal: "security".into(),
                    points: score,
                    detail: "test".into(),
                }],
            },
        }
    }

    #[test]
    fn queue_sorts_must_before_skim() {
        let mut items = vec![
            item("skim", RiskTier::Skim, 10),
            item("must", RiskTier::Must, 80),
            item("should", RiskTier::Should, 50),
            item("unknown", RiskTier::Unknown, 0),
        ];
        sort_items(&mut items);
        let order: Vec<&str> = items.iter().map(|item| item.card_id.as_str()).collect();
        assert_eq!(order, vec!["must", "should", "skim", "unknown"]);
    }

    #[test]
    fn queue_marks_unknown_without_branch() {
        let mut unknown = item("no-branch", RiskTier::Unknown, 0);
        unknown.branch = None;
        assert_eq!(unknown.risk.tier, RiskTier::Unknown);
        assert!(unknown.branch.is_none());
    }

    #[test]
    fn next_skips_skim_when_possible() {
        let items = vec![
            item("skim", RiskTier::Skim, 10),
            item("should", RiskTier::Should, 50),
        ];
        assert_eq!(
            pick_next(&items).map(|item| item.card_id.as_str()),
            Some("should")
        );
    }

    #[test]
    fn next_falls_back_to_skim_then_unknown() {
        let skim_only = vec![item("skim", RiskTier::Skim, 10)];
        assert_eq!(
            pick_next(&skim_only).map(|item| item.card_id.as_str()),
            Some("skim")
        );
        let unknown_only = vec![item("unknown", RiskTier::Unknown, 0)];
        assert_eq!(
            pick_next(&unknown_only).map(|item| item.card_id.as_str()),
            Some("unknown")
        );
    }

    #[test]
    fn empty_queue_has_no_next() {
        assert!(pick_next(&[]).is_none());
    }

    #[test]
    fn public_api_lines_are_detected() {
        assert!(is_public_api_line("pub fn login() {"));
        assert!(is_public_api_line("    pub struct User;"));
        assert!(is_public_api_line("export function login() {"));
        assert!(!is_public_api_line("fn private() {"));
        assert!(!is_public_api_line("const x = 1;"));
    }

    #[test]
    fn parses_queue_flags() {
        let args = vec![
            "queue".to_string(),
            "--all".to_string(),
            "--limit".to_string(),
            "5".to_string(),
            "--json".to_string(),
        ];
        let parsed = QueueArgs::parse(&args).unwrap();
        assert!(parsed.all);
        assert!(parsed.json);
        assert_eq!(parsed.limit, Some(5));
        assert!(!parsed.next);
    }
}
