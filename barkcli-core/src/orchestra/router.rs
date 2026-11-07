use serde::{Deserialize, Serialize};

use super::assignment::{ModelAssignment, RejectedCandidate};
use super::budget::BudgetPolicy;
use super::capabilities::ModelRequirement;
use super::catalog::CatalogEntry;
use super::policy::{evaluate_eligibility, EligibilityDecision, ModelPolicy, SelectionStrategy};
use super::task::{Risk, TaskAnalysis};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub entry: CatalogEntry,
    #[serde(default)]
    pub is_free: bool,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default)]
    pub is_paid: bool,
    #[serde(default)]
    pub estimated_cost_usd: Option<f64>,
    /// 0..1, higher is faster/lower latency. Unknown => None.
    #[serde(default)]
    pub latency_score: Option<f32>,
    /// Historical verified quality prior for this task class. Unknown => None.
    #[serde(default)]
    pub quality_prior: Option<f32>,
    /// Historical compatibility prior. Unknown => None.
    #[serde(default)]
    pub history_prior: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterInput {
    pub task_id: String,
    pub role_id: String,
    pub analysis: TaskAnalysis,
    pub policy: ModelPolicy,
    #[serde(default)]
    pub budget: BudgetPolicy,
    #[serde(default)]
    pub policy_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedCandidate {
    pub candidate: Candidate,
    pub score: f32,
    pub reasons: Vec<String>,
}

pub fn select_model(input: &RouterInput, candidates: Vec<Candidate>) -> Result<ModelAssignment, String> {
    let mut rejected = Vec::new();
    let mut ranked: Vec<RankedCandidate> = Vec::new();

    let mut effective_policy = input.policy.clone();
    // Task-driven hard requirements.
    if input.analysis.requires_tool_calling {
        effective_policy.require.tool_calling = true;
    }
    if matches!(input.analysis.risk, Risk::SecurityCritical | Risk::High) {
        effective_policy.min_quality_confidence = effective_policy.min_quality_confidence.or(Some(0.5));
    }

    // Pin takes priority if present and eligible/safe enough for Phase 3.
    if let Some(pin) = effective_policy.pinned_model.clone() {
        if let Some(c) = candidates.iter().find(|c| {
            c.entry.model.legacy_model_id() == pin
                || c.entry.model.canonical_id() == pin
                || c.entry.model.model_id == pin
        }) {
            let decision = check_candidate(input, &effective_policy, c);
            if decision.eligible {
                return Ok(ModelAssignment {
                    model: c.entry.model.clone(),
                    task_id: input.task_id.clone(),
                    role_id: input.role_id.clone(),
                    policy_id: input.policy_id.clone(),
                    selection_reason: format!("pinned model selected: {}", decision.reason),
                    score: Some(1.0),
                    rejected,
                });
            }
            return Err(format!("pinned model '{}' is not eligible: {}", pin, decision.reason));
        }
        return Err(format!("pinned model '{}' not found in candidates", pin));
    }

    for c in candidates {
        let decision = check_candidate(input, &effective_policy, &c);
        if !decision.eligible {
            rejected.push(RejectedCandidate {
                model: c.entry.model.clone(),
                reason: decision.reason,
            });
            continue;
        }
        let (score, reasons) = score_candidate(input, &effective_policy, &c);
        ranked.push(RankedCandidate {
            candidate: c,
            score,
            reasons,
        });
    }

    ranked.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let Some(best) = ranked.first() else {
        return Err("no eligible model candidates for this task/policy".into());
    };
    Ok(ModelAssignment {
        model: best.candidate.entry.model.clone(),
        task_id: input.task_id.clone(),
        role_id: input.role_id.clone(),
        policy_id: input.policy_id.clone(),
        selection_reason: format!(
            "score {:.3} via {:?}; {}",
            best.score,
            effective_policy.strategy,
            best.reasons.join("; ")
        ),
        score: Some(best.score),
        rejected,
    })
}

fn check_candidate(input: &RouterInput, policy: &ModelPolicy, c: &Candidate) -> EligibilityDecision {
    let base = evaluate_eligibility(policy, &c.entry, c.is_free, c.is_local, c.is_paid);
    if !base.eligible {
        return base;
    }
    if c.is_paid {
        let est = c.estimated_cost_usd.unwrap_or(0.0);
        if let Err(reason) = input.budget.can_use_paid(est) {
            return EligibilityDecision::reject(reason);
        }
        if input.budget.require_approval_for_paid {
            // Phase 3 default: do not auto-select paid when approval required; caller can override policy.
            return EligibilityDecision::reject("paid model requires explicit approval/budget override");
        }
    }
    // High-risk/security tasks: prefer conservative behavior (still eligible if ready, but scored; exploration bounded later).
    EligibilityDecision::ok(base.reason)
}

fn score_candidate(input: &RouterInput, policy: &ModelPolicy, c: &Candidate) -> (f32, Vec<String>) {
    let q = clamp01(c.quality_prior.unwrap_or(0.5));
    let r = reliability_score(&c.entry, &policy.require);
    let cost = cost_score(policy, c);
    let l = clamp01(c.latency_score.unwrap_or(0.5));
    let h = clamp01(c.history_prior.unwrap_or(0.5));
    let (wq, wr, wc, wl, wh) = weights(policy.strategy, &input.analysis);
    let mut s = wq * q + wr * r + wc * cost + wl * l + wh * h;
    let mut reasons = vec![
        format!("Q={q:.2}"),
        format!("R={r:.2}"),
        format!("C={cost:.2}"),
        format!("L={l:.2}"),
        format!("H={h:.2}"),
    ];
    if matches!(input.analysis.risk, Risk::SecurityCritical) && c.quality_prior.is_none() {
        s *= 0.95; // conservative when no verified history for sensitive work
        reasons.push("security-sensitive with unknown quality prior".into());
    }
    (clamp01(s), reasons)
}

fn weights(strategy: SelectionStrategy, analysis: &TaskAnalysis) -> (f32, f32, f32, f32, f32) {
    match strategy {
        SelectionStrategy::BestQuality => (0.60, 0.18, 0.07, 0.05, 0.10),
        SelectionStrategy::Cheapest | SelectionStrategy::FreeOnly => (0.30, 0.20, 0.30, 0.10, 0.10),
        SelectionStrategy::Fastest => (0.25, 0.15, 0.10, 0.40, 0.10),
        SelectionStrategy::LocalOnly => (0.35, 0.20, 0.20, 0.10, 0.15),
        SelectionStrategy::Custom | SelectionStrategy::AutoBalanced => {
            if matches!(analysis.work_type, super::task::WorkType::Documentation) {
                (0.25, 0.15, 0.35, 0.15, 0.10)
            } else {
                (0.45, 0.20, 0.15, 0.10, 0.10)
            }
        }
    }
}

fn reliability_score(entry: &CatalogEntry, req: &ModelRequirement) -> f32 {
    let mut s: f32 = 0.5;
    if entry.capabilities.tool_calling == Some(true) {
        s += 0.25;
    } else if req.tool_calling {
        s -= 0.25;
    }
    if entry.capabilities.structured_output == Some(true) {
        s += 0.1;
    }
    if entry.availability.is_auto_eligible() {
        s += 0.15;
    }
    clamp01(s)
}

fn cost_score(policy: &ModelPolicy, c: &Candidate) -> f32 {
    if c.is_free {
        return 1.0;
    }
    if c.is_local && policy.allow_local_models {
        return 0.9;
    }
    match c.estimated_cost_usd {
        Some(x) if x <= 0.0 => 1.0,
        Some(x) if x < 0.01 => 0.8,
        Some(x) if x < 0.10 => 0.55,
        Some(_) => 0.25,
        None => 0.5,
    }
}

fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestra::catalog::{CatalogSource, ModelRef};
    use crate::orchestra::health::ModelAvailability;

    fn candidate(id: &str, free: bool, paid: bool, tool: bool, quality: Option<f32>) -> Candidate {
        let mut e = CatalogEntry::discovered(ModelRef::parse_loose(id, "opencode"), CatalogSource::Manual);
        e.availability = ModelAvailability::Ready;
        e.capabilities.tool_calling = Some(tool);
        Candidate {
            entry: e,
            is_free: free,
            is_local: false,
            is_paid: paid,
            estimated_cost_usd: if paid { Some(0.05) } else { Some(0.0) },
            latency_score: None,
            quality_prior: quality,
            history_prior: None,
        }
    }

    fn input(strategy: SelectionStrategy) -> RouterInput {
        RouterInput {
            task_id: "t1".into(),
            role_id: "builder".into(),
            analysis: TaskAnalysis::classify("Implement feature", None, None),
            policy: ModelPolicy { strategy, ..Default::default() },
            budget: BudgetPolicy::default(),
            policy_id: None,
        }
    }

    #[test]
    fn free_only_never_selects_paid() {
        let inp = input(SelectionStrategy::FreeOnly);
        let res = select_model(&inp, vec![
            candidate("openai/gpt-paid", false, true, true, Some(0.9)),
            candidate("openai/gpt-free", true, false, true, Some(0.6)),
        ]).unwrap();
        assert_eq!(res.model.legacy_model_id(), "openai/gpt-free");
    }

    #[test]
    fn hard_capability_constraints_beat_score() {
        let mut inp = input(SelectionStrategy::BestQuality);
        inp.policy.require.tool_calling = true;
        let res = select_model(&inp, vec![
            candidate("a/no-tools", true, false, false, Some(0.99)),
            candidate("b/tools", true, false, true, Some(0.4)),
        ]).unwrap();
        assert_eq!(res.model.legacy_model_id(), "b/tools");
        assert!(res.rejected.iter().any(|r| r.reason.contains("capabilities") || r.reason.contains("tool")));
    }

    #[test]
    fn pinned_model_selected_when_eligible() {
        let mut inp = input(SelectionStrategy::AutoBalanced);
        inp.policy.pinned_model = Some("openai/pinned".into());
        let res = select_model(&inp, vec![candidate("openai/pinned", true, false, true, None)]).unwrap();
        assert!(res.selection_reason.contains("pinned"));
    }

    #[test]
    fn explainable_selection_has_reason_and_score() {
        let res = select_model(&input(SelectionStrategy::AutoBalanced), vec![candidate("openai/m", true, false, true, None)]).unwrap();
        assert!(res.selection_reason.contains("score"));
        assert!(res.score.is_some());
    }
}
