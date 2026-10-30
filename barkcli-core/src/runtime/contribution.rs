//! Always-on contribution graph.
//!
//! Every run is a node. `parent_run_id` and `contributes_to` are the edges.
//! The index is rebuilt from the run files, so Git remains the source of
//! truth: delete `.board/runs` and the graph can be reconstructed from the
//! run records.
//!
//! The analysis follows the useful parts of Agora's design without copying
//! its implementation: independent evidence, neglected branches, contested
//! claims, and diversity-aware recommendations.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet, VecDeque};

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use super::event::{ContributionKind, RunRecord, RunStatus, Verification};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionNode {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub kind: ContributionKind,
    pub status: RunStatus,
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub author: String,
    pub thread_id: String,
    pub card_id: String,
    pub parents: Vec<String>,
    pub children: Vec<String>,
    pub gate_passed: bool,
    pub verified: bool,
    pub verified_by: Vec<String>,
    pub verifications: Vec<Verification>,
    pub evidence_score: f64,
    pub reuse_count: usize,
    pub files_touched: Vec<String>,
    pub started_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContributionEdge {
    pub parent: String,
    pub child: String,
    pub relation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DuplicateCandidate {
    pub left: String,
    pub right: String,
    pub shared_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recommendation {
    pub run_id: String,
    pub title: String,
    pub lane: String,
    pub score: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContributionMetrics {
    pub total_nodes: usize,
    pub edges: usize,
    pub verified_nodes: usize,
    pub verification_rate: f64,
    pub neglected_nodes: usize,
    pub contested_nodes: usize,
    pub open_hypotheses: usize,
    pub reuse_rate: f64,
    pub largest_lineage_share: f64,
    pub contributions_last_7d: usize,
    pub active_authors: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContributionAnalysis {
    pub nodes: Vec<ContributionNode>,
    pub edges: Vec<ContributionEdge>,
    pub duplicates: Vec<DuplicateCandidate>,
    pub leading: Vec<ContributionNode>,
    pub neglected: Vec<ContributionNode>,
    pub contested: Vec<ContributionNode>,
    pub open_hypotheses: Vec<ContributionNode>,
    pub recommendations: Vec<Recommendation>,
    pub metrics: ContributionMetrics,
    pub generated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default)]
pub struct ContributionIndex {
    nodes: Vec<ContributionNode>,
    edges: Vec<ContributionEdge>,
    by_id: HashMap<String, ContributionNode>,
    roots: Vec<String>,
}

impl ContributionIndex {
    pub fn from_runs(runs: &[RunRecord]) -> Self {
        let mut nodes: Vec<ContributionNode> = runs.iter().map(node_from_run).collect();
        nodes.sort_by(|a, b| a.started_at.cmp(&b.started_at));
        let by_id: HashMap<String, ContributionNode> =
            nodes.iter().map(|node| (node.id.clone(), node.clone())).collect();

        let mut children: HashMap<String, Vec<String>> = HashMap::new();
        let mut edges = Vec::new();
        for node in &nodes {
            for parent in &node.parents {
                if by_id.contains_key(parent) {
                    children
                        .entry(parent.clone())
                        .or_default()
                        .push(node.id.clone());
                    edges.push(ContributionEdge {
                        parent: parent.clone(),
                        child: node.id.clone(),
                        relation: "builds_on".into(),
                    });
                }
            }
        }
        for node in &mut nodes {
            if let Some(kids) = children.get(&node.id) {
                node.children = kids.clone();
                node.reuse_count = kids.len();
            }
            let independent = independent_verifications(node);
            node.verified = independent > 0;
            node.evidence_score = evidence_score(node, independent);
        }
        let by_id: HashMap<String, ContributionNode> =
            nodes.iter().map(|node| (node.id.clone(), node.clone())).collect();
        let roots = nodes
            .iter()
            .filter(|node| node.parents.is_empty())
            .map(|node| node.id.clone())
            .collect();
        Self {
            nodes,
            edges,
            by_id,
            roots,
        }
    }

    pub fn nodes(&self) -> &[ContributionNode] {
        &self.nodes
    }

    pub fn edges(&self) -> &[ContributionEdge] {
        &self.edges
    }

    pub fn node(&self, id: &str) -> Option<&ContributionNode> {
        self.by_id.get(id)
    }

    /// True when `ancestor` appears in `node`'s parent closure.
    pub fn is_ancestor(&self, ancestor: &str, node: &str) -> bool {
        let mut queue: VecDeque<String> = VecDeque::new();
        let mut seen: HashSet<String> = HashSet::new();
        queue.push_back(node.to_string());
        while let Some(current) = queue.pop_front() {
            if !seen.insert(current.clone()) {
                continue;
            }
            if current == ancestor {
                return true;
            }
            if let Some(node) = self.by_id.get(&current) {
                for parent in &node.parents {
                    queue.push_back(parent.clone());
                }
            }
        }
        false
    }

    /// Returns the target node plus every ancestor, oldest first.
    pub fn ancestry(&self, run_id: &str) -> Vec<ContributionNode> {
        let mut result = Vec::new();
        let mut queue: VecDeque<String> = VecDeque::new();
        let mut seen: HashSet<String> = HashSet::new();
        queue.push_back(run_id.to_string());
        while let Some(current) = queue.pop_front() {
            if !seen.insert(current.clone()) {
                continue;
            }
            if let Some(node) = self.by_id.get(&current) {
                result.push(node.clone());
                for parent in &node.parents {
                    queue.push_back(parent.clone());
                }
            }
        }
        result.sort_by(|a, b| a.started_at.cmp(&b.started_at));
        result
    }

    pub fn descendants(&self, run_id: &str) -> Vec<ContributionNode> {
        let mut result = Vec::new();
        let mut queue: VecDeque<String> = VecDeque::new();
        let mut seen: HashSet<String> = HashSet::new();
        queue.push_back(run_id.to_string());
        while let Some(current) = queue.pop_front() {
            if !seen.insert(current.clone()) {
                continue;
            }
            if let Some(node) = self.by_id.get(&current) {
                if current != run_id {
                    result.push(node.clone());
                }
                for child in &node.children {
                    queue.push_back(child.clone());
                }
            }
        }
        result.sort_by(|a, b| a.started_at.cmp(&b.started_at));
        result
    }

    pub fn duplicate_candidates(&self) -> Vec<DuplicateCandidate> {
        let mut candidates = Vec::new();
        for (index, left) in self.nodes.iter().enumerate() {
            for right in self.nodes.iter().skip(index + 1) {
                if left.kind != ContributionKind::Result
                    || right.kind != ContributionKind::Result
                    || left.files_touched.is_empty()
                    || right.files_touched.is_empty()
                {
                    continue;
                }
                let shared: Vec<String> = left
                    .files_touched
                    .iter()
                    .filter(|file| right.files_touched.contains(file))
                    .cloned()
                    .collect();
                if !shared.is_empty() {
                    candidates.push(DuplicateCandidate {
                left: left.id.clone(),
                right: right.id.clone(),
                shared_files: shared,
            });
                }
            }
        }
        candidates
    }

    pub fn analysis(&self) -> ContributionAnalysis {
        let mut leading: Vec<ContributionNode> = self
            .nodes
            .iter()
            .filter(|node| {
                matches!(node.kind, ContributionKind::Result | ContributionKind::Insight)
                    && node.gate_passed
                    && !matches!(node.status, RunStatus::Failed | RunStatus::Cancelled)
            })
            .cloned()
            .collect();
        leading.sort_by(|a, b| {
            b.evidence_score
                .partial_cmp(&a.evidence_score)
                .unwrap_or(Ordering::Equal)
                .then_with(|| b.started_at.cmp(&a.started_at))
        });
        leading.truncate(8);

        let now = Utc::now();
        let mut neglected: Vec<ContributionNode> = self
            .nodes
            .iter()
            .filter(|node| {
                node.kind != ContributionKind::Verification
                    && node.children.is_empty()
                    && node.status.is_terminal()
                    && node
                        .ended_at
                        .or(Some(node.started_at))
                        .map(|ended| now.signed_duration_since(ended) > Duration::hours(24))
                        .unwrap_or(false)
            })
            .cloned()
            .collect();
        neglected.sort_by(|a, b| {
            potential(b, now)
                .partial_cmp(&potential(a, now))
                .unwrap_or(Ordering::Equal)
        });
        neglected.truncate(8);

        let contested: Vec<ContributionNode> = self
            .nodes
            .iter()
            .filter(|node| is_contested(node))
            .cloned()
            .collect();
        let mut contested = contested;
        contested.sort_by(|a, b| {
            b.verifications
                .len()
                .cmp(&a.verifications.len())
                .then_with(|| b.evidence_score.partial_cmp(&a.evidence_score).unwrap_or(Ordering::Equal))
        });
        contested.truncate(8);

        let mut open_hypotheses: Vec<ContributionNode> = self
            .nodes
            .iter()
            .filter(|node| {
                node.kind == ContributionKind::Hypothesis
                    && node.children.is_empty()
                    && !node.verified
                    && node.status != RunStatus::Failed
            })
            .cloned()
            .collect();
        open_hypotheses.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        open_hypotheses.truncate(8);

        let metrics = self.metrics(&neglected, &contested, &open_hypotheses, now);
        let recommendations = recommendations(&leading, &neglected, &contested, &open_hypotheses, &metrics);
        let duplicates = self.duplicate_candidates();

        ContributionAnalysis {
            nodes: self.nodes.clone(),
            edges: self.edges.clone(),
            duplicates,
            leading,
            neglected,
            contested,
            open_hypotheses,
            recommendations,
            metrics,
            generated_at: Utc::now(),
        }
    }

    fn metrics(
        &self,
        neglected: &[ContributionNode],
        contested: &[ContributionNode],
        open_hypotheses: &[ContributionNode],
        now: DateTime<Utc>,
    ) -> ContributionMetrics {
        let total = self.nodes.len();
        let verified = self.nodes.iter().filter(|node| node.verified).count();
        let authors: HashSet<&str> = self.nodes.iter().map(|node| node.author.as_str()).collect();
        let largest = self
            .roots
            .iter()
            .map(|root| self.descendants(root).len() + 1)
            .max()
            .unwrap_or(0);
        ContributionMetrics {
            total_nodes: total,
            edges: self.edges.len(),
            verified_nodes: verified,
            verification_rate: ratio(verified, total),
            neglected_nodes: neglected.len(),
            contested_nodes: contested.len(),
            open_hypotheses: open_hypotheses.len(),
            reuse_rate: ratio(self.edges.len(), total),
            largest_lineage_share: ratio(largest, total),
            contributions_last_7d: self
                .nodes
                .iter()
                .filter(|node| now.signed_duration_since(node.started_at) <= Duration::days(7))
                .count(),
            active_authors: authors.len(),
        }
    }
}

fn node_from_run(run: &RunRecord) -> ContributionNode {
    let author = run.author_id();
    let verifications = run.verifications.clone();
    let independent = verifications
        .iter()
        .filter(|verification| verification.passed && verification.verifier != author)
        .count();
    ContributionNode {
        id: run.id.clone(),
        title: run
            .title
            .clone()
            .filter(|title| !title.trim().is_empty())
            .unwrap_or_else(|| run.card_id.clone()),
        summary: run.summary.clone(),
        kind: run.kind,
        status: run.status.clone(),
        provider: run.provider.clone(),
        model: run.model.clone(),
        author,
        thread_id: run.thread_id.clone(),
        card_id: run.card_id.clone(),
        parents: run.effective_parents(),
        children: Vec::new(),
        gate_passed: run.gate.as_ref().map(|gate| gate.passed).unwrap_or(false),
        verified: independent > 0,
        verified_by: run.verified_by.clone(),
        verifications,
        evidence_score: 0.0,
        reuse_count: 0,
        files_touched: run.files_touched.clone(),
        started_at: run.started_at,
        ended_at: run.ended_at,
    }
}

fn independent_verifications(node: &ContributionNode) -> usize {
    let mut verifiers: Vec<&str> = node
        .verifications
        .iter()
        .filter(|verification| verification.passed && verification.verifier != node.author)
        .map(|verification| verification.verifier.as_str())
        .collect();
    verifiers.sort_unstable();
    verifiers.dedup();
    verifiers.len()
}

fn evidence_score(node: &ContributionNode, independent: usize) -> f64 {
    (1.0 + independent as f64).ln()
        + 0.5 * node.reuse_count as f64
        + if node.gate_passed { 0.25 } else { 0.0 }
}

fn is_contested(node: &ContributionNode) -> bool {
    let passed = node.verifications.iter().any(|verification| verification.passed);
    let failed = node.verifications.iter().any(|verification| !verification.passed);
    (passed && failed) || (node.gate_passed && failed)
}

fn potential(node: &ContributionNode, now: DateTime<Utc>) -> f64 {
    let days = node
        .ended_at
        .or(Some(node.started_at))
        .map(|ended| now.signed_duration_since(ended).num_days().max(0) as f64)
        .unwrap_or(0.0);
    (1.0 + node.evidence_score) * (1.0 / (1.0 + days / 14.0))
}

fn ratio(part: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        part as f64 / total as f64
    }
}

fn recommendations(
    leading: &[ContributionNode],
    neglected: &[ContributionNode],
    contested: &[ContributionNode],
    open_hypotheses: &[ContributionNode],
    metrics: &ContributionMetrics,
) -> Vec<Recommendation> {
    let total = metrics.total_nodes.max(1) as f64;
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    let mut push = |node: &ContributionNode, lane: &str, reason: &str, bonus: f64| {
        if !seen.insert(node.id.clone()) {
            return;
        }
        let ucb = node.evidence_score
            + (2.0 * (total.ln().max(0.0)) / (node.reuse_count as f64 + 1.0)).sqrt()
            + bonus;
        out.push(Recommendation {
            run_id: node.id.clone(),
            title: node.title.clone(),
            lane: lane.to_string(),
            score: ucb,
            reason: reason.to_string(),
        });
    };

    for node in leading.iter().take(3) {
        push(
            node,
            "leading",
            "Highest evidence right now; refine it or reproduce it independently.",
            0.0,
        );
    }
    for node in neglected.iter().take(3) {
        push(
            node,
            "neglected",
            "No follow-on work yet; this branch is under-explored.",
            0.35,
        );
    }
    for node in contested.iter().take(2) {
        push(
            node,
            "contested",
            "Verifications disagree; reproduce before depending on it.",
            0.25,
        );
    }
    for node in open_hypotheses.iter().take(2) {
        push(
            node,
            "open_hypothesis",
            "A hypothesis with no independent verification yet.",
            0.15,
        );
    }
    out.truncate(8);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::event::{RunRecord, StartRun};

    fn run(id: &str, author: &str) -> RunRecord {
        let start = StartRun {
            run_id: id.into(),
            thread_id: "card".into(),
            card_id: "card".into(),
            prompt: String::new(),
            cwd: ".".into(),
            provider: "opencode".into(),
            model: None,
            role: None,
            agent_id: Some(author.into()),
            permission_mode: "auto".into(),
            provider_session_id: None,
            raw_log_path: None,
        };
        let mut run = RunRecord::new(&start);
        run.title = Some(format!("Run {id}"));
        run
    }

    #[test]
    fn self_verification_is_rejected() {
        let mut run = run("run_a", "agent-a");
        assert!(run.add_verification("agent-a", true, None).is_err());
        assert!(run.add_verification("agent-b", true, None).is_ok());
        assert_eq!(run.independent_verifications(), 1);
    }

    #[test]
    fn evidence_and_reuse_follow_the_graph() {
        let mut root = run("run_root", "agent-a");
        root.gate = Some(crate::runtime::event::GateSummary {
            passed: true,
            command: None,
            summary: None,
            log_path: None,
            finished_at: Utc::now(),
            verification: None,
        });
        let mut child = run("run_child", "agent-b");
        child.add_parent("run_root").unwrap();
        child.gate = Some(crate::runtime::event::GateSummary {
            passed: true,
            command: None,
            summary: None,
            log_path: None,
            finished_at: Utc::now(),
            verification: None,
        });
        root.add_verification("agent-b", true, None).unwrap();
        let index = ContributionIndex::from_runs(&[root, child]);
        let root = index.node("run_root").unwrap();
        assert_eq!(root.children, vec!["run_child"]);
        assert!(root.verified);
        assert!(root.evidence_score > 0.0);
        assert_eq!(index.ancestry("run_child").len(), 2);
        assert!(index.is_ancestor("run_root", "run_child"));
        assert!(!index.is_ancestor("run_child", "run_root"));
    }

    #[test]
    fn analysis_surfaces_neglected_and_open_hypotheses() {
        let mut result = run("run_result", "agent-a");
        result.gate = Some(crate::runtime::event::GateSummary {
            passed: true,
            command: None,
            summary: None,
            log_path: None,
            finished_at: Utc::now(),
            verification: None,
        });
        result.ended_at = Some(Utc::now() - Duration::days(3));
        result.status = RunStatus::Passed;
        let mut hypothesis = run("run_hyp", "agent-b");
        hypothesis.kind = ContributionKind::Hypothesis;
        hypothesis.status = RunStatus::Passed;
        hypothesis.ended_at = Some(Utc::now() - Duration::days(2));
        let index = ContributionIndex::from_runs(&[result, hypothesis]);
        let analysis = index.analysis();
        assert_eq!(analysis.leading.len(), 1);
        assert_eq!(analysis.neglected.len(), 2);
        assert_eq!(analysis.open_hypotheses.len(), 1);
        assert!(!analysis.recommendations.is_empty());
    }

    #[test]
    fn duplicate_candidates_use_files_touched() {
        let mut a = run("run_a", "agent-a");
        a.files_touched = vec!["src/lib.rs".into(), "README.md".into()];
        let mut b = run("run_b", "agent-b");
        b.files_touched = vec!["src/lib.rs".into()];
        let index = ContributionIndex::from_runs(&[a, b]);
        let duplicates = index.duplicate_candidates();
        assert_eq!(duplicates.len(), 1);
        assert_eq!(duplicates[0].shared_files, vec!["src/lib.rs"]);
    }
}
