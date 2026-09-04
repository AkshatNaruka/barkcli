//! Autopilot engine: agent-driven autonomous loop with human gates.
//!
//! The human decides WHAT (intent + plan approval + merge). Everything between
//! is driven by a coding agent through MCP (`autopilot_status`, `packet_claim`,
//! …) reusing the existing primitives: intake → plan → dispatch → review.
//!
//! State is persisted per board at `.board/orchestration/<board>_autopilot.json`
//! so loops survive restarts. `evaluate()` is read-only and powers both the
//! `autopilot_status` MCP tool and the web Autopilot panel.

use std::collections::HashMap;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::commands::plan::{self, PlanOutput};
use crate::models::card::LinkType;
use crate::storage::board_dir::find_board_dir;
use crate::storage::board_file::read_board;

/// Human-visible loop phases. The two `Awaiting*` phases are the only places
/// that require a human; everything else is agent-executable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutopilotPhase {
    /// Nothing to do — queue drained, no proposals, nothing in review.
    Idle,
    /// Todo cards without acceptance criteria exist — propose (or run) a plan.
    NeedsPlan { card_id: String },
    /// A plan proposal exists and waits for human approve/edit/reject.
    AwaitingPlanApproval { card_id: String },
    /// Work is dispatched/claimed — agents are executing.
    InProgress { active: usize, pending: usize },
    /// Review passed — waits for human merge to main.
    AwaitingMerge { card_ids: Vec<String> },
}

impl AutopilotPhase {
    pub fn display_name(&self) -> String {
        match self {
            AutopilotPhase::Idle => "Idle".into(),
            AutopilotPhase::NeedsPlan { card_id } => format!("Needs plan ({})", card_id),
            AutopilotPhase::AwaitingPlanApproval { card_id } => {
                format!("Awaiting plan approval ({})", card_id)
            }
            AutopilotPhase::InProgress { active, pending } => {
                format!("In progress ({} active, {} pending)", active, pending)
            }
            AutopilotPhase::AwaitingMerge { card_ids } => {
                format!("Awaiting merge ({} cards)", card_ids.len())
            }
        }
    }

    /// True only for the two human gates.
    pub fn needs_human(&self) -> bool {
        matches!(
            self,
            AutopilotPhase::AwaitingPlanApproval { .. } | AutopilotPhase::AwaitingMerge { .. }
        )
    }
}

/// A serializable plan proposal awaiting approval.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanProposal {
    pub card_id: String,
    pub card_title: String,
    pub proposed_at: DateTime<Utc>,
    pub proposed_by: String,
    pub requirements: Vec<ProposalRequirement>,
    pub children: Vec<ProposalChild>,
    pub estimated_total_effort: u32,
    pub risk_level: String,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalRequirement {
    pub title: String,
    pub acceptance_criteria: Vec<String>,
    pub effort: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalChild {
    pub title: String,
    pub description: String,
    pub priority: String,
    pub effort: u32,
    pub labels: Vec<String>,
    pub acceptance_criteria: Vec<String>,
}

impl PlanProposal {
    fn from_plan(
        card_id: &str,
        card_title: &str,
        proposed_by: &str,
        plan: &PlanOutput,
    ) -> Self {
        Self {
            card_id: card_id.to_string(),
            card_title: card_title.to_string(),
            proposed_at: Utc::now(),
            proposed_by: proposed_by.to_string(),
            requirements: plan
                .requirements
                .iter()
                .map(|r| ProposalRequirement {
                    title: r.title.clone(),
                    acceptance_criteria: r.acceptance_criteria.clone(),
                    effort: r.effort,
                })
                .collect(),
            children: plan
                .child_cards
                .iter()
                .map(|c| ProposalChild {
                    title: c.title.clone(),
                    description: c.description.clone(),
                    priority: c.priority.clone(),
                    effort: c.effort,
                    labels: c.labels.clone(),
                    acceptance_criteria: c.acceptance_criteria.clone(),
                })
                .collect(),
            estimated_total_effort: plan.estimated_total_effort,
            risk_level: plan.risk_level.clone(),
            rationale: plan.rationale.clone(),
        }
    }
}

/// Persisted autopilot state per board.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AutopilotState {
    pub board_name: String,
    pub proposals: HashMap<String, PlanProposal>,
    pub approved: Vec<String>,
    pub rejected: Vec<String>,
    pub merged: Vec<String>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl AutopilotState {
    fn path(board: &str) -> Result<std::path::PathBuf> {
        Ok(find_board_dir()?
            .join("orchestration")
            .join(format!("{}_autopilot.json", board)))
    }

    pub fn load(board: &str) -> Self {
        Self::path(board)
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(Self {
                board_name: board.to_string(),
                ..Default::default()
            })
    }

    pub fn save(&mut self) -> Result<()> {
        let p = Self::path(&self.board_name.clone())?;
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent)?;
        }
        self.updated_at = Some(Utc::now());
        std::fs::write(p, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }

    /// Build (or rebuild) a proposal for a card using the offline heuristic
    /// when no LLM is configured — same output as `barkcli plan --dry-run`.
    pub fn propose(
        &mut self,
        board_name: &str,
        card_id: &str,
        proposed_by: &str,
    ) -> Result<PlanProposal> {
        let board = read_board(board_name)
            .with_context(|| format!("board '{}' not found", board_name))?;
        let card = board
            .cards
            .iter()
            .find(|c| c.id == card_id)
            .with_context(|| format!("card '{}' not found", card_id))?;
        // Heuristic proposal (offline-safe). An LLM-backed proposer can
        // replace this call site later without changing the gate contract.
        let plan = plan::heuristic_plan(&card.title, &card.description);
        let proposal = PlanProposal::from_plan(card_id, &card.title, proposed_by, &plan);
        self.board_name = board_name.to_string();
        self.proposals
            .insert(card_id.to_string(), proposal.clone());
        self.save()?;
        Ok(proposal)
    }

    /// Approve a proposal: applies checklist + child cards + queue tasks
    /// through the exact same code path as `barkcli plan --tasks`.
    /// Idempotent — re-approval skips existing children.
    pub fn approve(
        &mut self,
        board_name: &str,
        card_id: &str,
        create_tasks: bool,
    ) -> Result<Vec<String>> {
        let proposal = self
            .proposals
            .get(card_id)
            .with_context(|| format!("no proposal for '{}' — propose first", card_id))?
            .clone();
        let board = read_board(board_name)
            .with_context(|| format!("board '{}' not found", board_name))?;
        let plan = PlanOutput {
            requirements: proposal
                .requirements
                .iter()
                .map(|r| crate::commands::plan::PlanRequirement {
                    title: r.title.clone(),
                    description: String::new(),
                    acceptance_criteria: r.acceptance_criteria.clone(),
                    effort: r.effort,
                    area: "fullstack".into(),
                })
                .collect(),
            child_cards: proposal
                .children
                .iter()
                .map(|c| crate::commands::plan::PlanChildCard {
                    title: c.title.clone(),
                    description: c.description.clone(),
                    priority: c.priority.clone(),
                    effort: c.effort,
                    labels: c.labels.clone(),
                    acceptance_criteria: c.acceptance_criteria.clone(),
                })
                .collect(),
            estimated_total_effort: proposal.estimated_total_effort,
            risk_level: proposal.risk_level.clone(),
            rationale: proposal.rationale.clone(),
        };
        let child_ids = plan::apply_plan(board_name, &board, card_id, &plan, create_tasks)?;
        self.proposals.remove(card_id);
        if !self.approved.contains(&card_id.to_string()) {
            self.approved.push(card_id.to_string());
        }
        self.board_name = board_name.to_string();
        self.save()?;
        Ok(child_ids)
    }

    pub fn reject(&mut self, board_name: &str, card_id: &str, _reason: &str) -> Result<()> {
        self.proposals.remove(card_id);
        if !self.rejected.contains(&card_id.to_string()) {
            self.rejected.push(card_id.to_string());
        }
        self.board_name = board_name.to_string();
        self.save()
    }

    pub fn mark_merged(&mut self, board_name: &str, card_ids: &[String]) -> Result<()> {
        for id in card_ids {
            if !self.merged.contains(id) {
                self.merged.push(id.clone());
            }
        }
        self.board_name = board_name.to_string();
        self.save()
    }
}

/// Read-only loop evaluation: what phase are we in, does a human need to act,
/// and what should the agent do next. Powers `autopilot_status` + web panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutopilotStatus {
    pub board: String,
    pub phase: AutopilotPhase,
    pub phase_label: String,
    pub needs_human: bool,
    pub human_prompt: Option<String>,
    pub agent_action: Option<String>,
    pub counts: StatusCounts,
    /// The pending proposal when in AwaitingPlanApproval (for gate UIs).
    pub proposal: Option<PlanProposal>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatusCounts {
    pub todo_unplanned: usize,
    pub pending_proposals: usize,
    pub queue_pending: usize,
    pub queue_active: usize,
    pub in_review: usize,
    pub blocked: usize,
}

pub fn evaluate(board_name: &str) -> Result<AutopilotStatus> {
    let board =
        read_board(board_name).with_context(|| format!("board '{}' not found", board_name))?;
    let state = AutopilotState::load(board_name);

    // Queue first: unplanned detection needs queued card ids (below).
    // (Queue depth best-effort — missing file means empty.)
    let queue = find_board_dir()
        .ok()
        .and_then(|d| {
            crate::agent::queue::TaskQueue::load(
                &d.join("tasks").join(format!("{}.json", board_name)),
            )
            .ok()
        })
        .unwrap_or_default();

    let in_review: Vec<String> = board
        .cards
        .iter()
        .filter(|c| c.column.as_str() == "review")
        .map(|c| c.id.clone())
        .collect();

    let blocked = board
        .cards
        .iter()
        .filter(|c| {
            c.blocked_by.is_some()
                || c.links.iter().any(|l| l.ty == LinkType::BlockedBy)
        })
        .count();

    let (queue_pending, queue_active) = {
        use crate::agent::queue::TaskStatus;
        (
            queue.tasks.iter().filter(|t| t.status == TaskStatus::Pending).count(),
            queue.tasks
                .iter()
                .filter(|t| {
                    t.status == TaskStatus::Assigned || t.status == TaskStatus::InProgress
                })
                .count(),
        )
    };

    // Unplanned = todo cards with no decomposition yet: no child links and
    // no queue tasks. (Intake cards carry a generic AC checklist, so an
    // empty-checklist test would miss them.)
    let queued_cards: std::collections::HashSet<&str> = queue
        .tasks
        .iter()
        .map(|t| t.card_id.as_str())
        .collect();
    let mut unplanned_ids: Vec<String> = board
        .cards
        .iter()
        .filter(|c| {
            c.column.as_str() == "todo"
                && !c.links.iter().any(|l| l.ty == LinkType::Child)
                && !queued_cards.contains(c.id.as_str())
        })
        .map(|c| c.id.clone())
        .collect();
    unplanned_ids.sort();
    let first_unplanned = unplanned_ids.first().cloned();
    let todo_unplanned = unplanned_ids.len();

    let pending_proposals = state.proposals.len();

    let counts = StatusCounts {
        todo_unplanned,
        pending_proposals,
        queue_pending,
        queue_active,
        in_review: in_review.len(),
        blocked,
    };

    // Priority: human gates first, then agent work, then idle.
    let (phase, needs_human, human_prompt, agent_action) = if !state.proposals.is_empty() {
        let first = state.proposals.keys().next().cloned().unwrap_or_default();
        (
            AutopilotPhase::AwaitingPlanApproval { card_id: first.clone() },
            true,
            Some(format!(
                "Plan proposed for '{}' ({} child cards) — approve, edit, or reject.",
                first,
                state.proposals.get(&first).map(|p| p.children.len()).unwrap_or(0)
            )),
            Some("Wait for human plan approval; do not apply the plan yourself.".into()),
        )
    } else if !in_review.is_empty() {
        (
            AutopilotPhase::AwaitingMerge { card_ids: in_review.clone() },
            true,
            Some(format!(
                "{} card(s) in review ({}) — run review, then merge or request changes.",
                in_review.len(),
                in_review.join(", ")
            )),
            Some("Run `review --all` and report verdicts; wait for human merge.".into()),
        )
    } else if let Some(card_id) = first_unplanned {
        (
            AutopilotPhase::NeedsPlan { card_id: card_id.clone() },
            false,
            None,
            Some(format!(
                "Propose a plan for '{}' via autopilot_propose (creates an approval gate).",
                card_id
            )),
        )
    } else if queue_active > 0 || queue_pending > 0 {
        (
            AutopilotPhase::InProgress { active: queue_active, pending: queue_pending },
            false,
            None,
            Some("Claim the top packet via packet_claim, work it, complete it, repeat.".into()),
        )
    } else {
        (
            AutopilotPhase::Idle,
            false,
            None,
            Some("Queue drained. Submit new intent to start the next loop.".into()),
        )
    };

    Ok(AutopilotStatus {
        board: board_name.to_string(),
        phase_label: phase.display_name(),
        proposal: match &phase {
            AutopilotPhase::AwaitingPlanApproval { card_id } => {
                state.proposals.get(card_id).cloned()
            }
            _ => None,
        },
        phase,
        needs_human,
        human_prompt,
        agent_action,
        counts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phase_labels_and_gates() {
        let gate = AutopilotPhase::AwaitingPlanApproval { card_id: "x".into() };
        assert!(gate.needs_human());
        assert!(gate.display_name().contains("Awaiting plan approval"));
        let idle = AutopilotPhase::Idle;
        assert!(!idle.needs_human());
        assert_eq!(idle.display_name(), "Idle");
        let merge = AutopilotPhase::AwaitingMerge { card_ids: vec!["a".into()] };
        assert!(merge.needs_human());
        let work = AutopilotPhase::InProgress { active: 1, pending: 2 };
        assert!(!work.needs_human());
        assert!(work.display_name().contains("1 active"));
    }

    #[test]
    fn proposal_round_trip_serializes() {
        let p = PlanProposal {
            card_id: "c".into(),
            card_title: "T".into(),
            proposed_at: Utc::now(),
            proposed_by: "agent".into(),
            requirements: vec![],
            children: vec![ProposalChild {
                title: "kid".into(),
                description: "d".into(),
                priority: "high".into(),
                effort: 2,
                labels: vec![],
                acceptance_criteria: vec!["done".into()],
            }],
            estimated_total_effort: 2,
            risk_level: "low".into(),
            rationale: "test".into(),
        };
        let s = serde_json::to_string(&p).unwrap();
        let back: PlanProposal = serde_json::from_str(&s).unwrap();
        assert_eq!(back.children.len(), 1);
        assert_eq!(back.children[0].title, "kid");
    }
}
