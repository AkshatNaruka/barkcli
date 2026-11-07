use serde::{Deserialize, Serialize};

use super::capabilities::ModelRequirement;
use super::catalog::CatalogEntry;
use super::health::ModelAvailability;

/// User-facing routing strategy. Phase 3 implements full scoring; Phase 2 uses
/// these values for eligibility/policy metadata and pin behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SelectionStrategy {
    #[default]
    AutoBalanced,
    BestQuality,
    FreeOnly,
    Cheapest,
    Fastest,
    LocalOnly,
    Custom,
}

/// Dynamic model selection policy attached to an agent role/profile.
/// Backward compatible: absent fields use defaults.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelPolicy {
    #[serde(default)]
    pub strategy: SelectionStrategy,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allowed_runtimes: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allowed_providers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allowed_models: Vec<String>,
    #[serde(default)]
    pub require: ModelRequirement,
    #[serde(default = "default_true")]
    pub allow_free_models: bool,
    #[serde(default = "default_true")]
    pub allow_local_models: bool,
    #[serde(default)]
    pub allow_paid_models: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned_model: Option<String>,
    /// 0.0-1.0 confidence floor; Phase 3 uses it with historical quality data.
    #[serde(default)]
    pub min_quality_confidence: Option<f32>,
}

fn default_true() -> bool {
    true
}

impl Default for ModelPolicy {
    fn default() -> Self {
        Self {
            strategy: SelectionStrategy::AutoBalanced,
            allowed_runtimes: Vec::new(),
            allowed_providers: Vec::new(),
            allowed_models: Vec::new(),
            require: ModelRequirement::default(),
            allow_free_models: true,
            allow_local_models: true,
            allow_paid_models: false,
            pinned_model: None,
            min_quality_confidence: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EligibilityDecision {
    pub eligible: bool,
    pub reason: String,
}

impl EligibilityDecision {
    pub fn ok(reason: impl Into<String>) -> Self {
        Self {
            eligible: true,
            reason: reason.into(),
        }
    }
    pub fn reject(reason: impl Into<String>) -> Self {
        Self {
            eligible: false,
            reason: reason.into(),
        }
    }
}

/// Phase 2 eligibility filter (hard constraints before scoring).
/// `is_free`/`is_local`/`is_paid` are caller-provided classifications (pricing/endpoint metadata).
pub fn evaluate_eligibility(
    policy: &ModelPolicy,
    entry: &CatalogEntry,
    is_free: bool,
    is_local: bool,
    is_paid: bool,
) -> EligibilityDecision {
    if entry.availability.blocks_execution() || !entry.availability.is_auto_eligible() {
        return EligibilityDecision::reject(format!(
            "model availability is {:?}: {}",
            entry.availability,
            entry.status_reason.as_deref().unwrap_or("not ready")
        ));
    }
    if !policy.allowed_runtimes.is_empty()
        && !policy
            .allowed_runtimes
            .iter()
            .any(|r| r == &entry.model.runtime_id)
    {
        return EligibilityDecision::reject(format!(
            "runtime '{}' not allowed by policy",
            entry.model.runtime_id
        ));
    }
    if !policy.allowed_providers.is_empty()
        && !policy
            .allowed_providers
            .iter()
            .any(|p| p == &entry.model.provider_id)
    {
        return EligibilityDecision::reject(format!(
            "provider '{}' not allowed by policy",
            entry.model.provider_id
        ));
    }
    if !policy.allowed_models.is_empty() {
        let legacy = entry.model.legacy_model_id();
        let canon = entry.model.canonical_id();
        if !policy
            .allowed_models
            .iter()
            .any(|m| m == &legacy || m == &canon || m == &entry.model.model_id)
        {
            return EligibilityDecision::reject("model not in allowed_models");
        }
    }
    if is_paid && !policy.allow_paid_models {
        return EligibilityDecision::reject("paid model blocked by policy");
    }
    if is_free && !policy.allow_free_models {
        return EligibilityDecision::reject("free model blocked by policy");
    }
    if is_local && !policy.allow_local_models {
        return EligibilityDecision::reject("local model blocked by policy");
    }
    if policy.strategy == SelectionStrategy::FreeOnly && !is_free {
        return EligibilityDecision::reject("Free Only policy requires a free model");
    }
    if policy.strategy == SelectionStrategy::LocalOnly && !is_local {
        return EligibilityDecision::reject("Local Only policy requires a local model");
    }
    if !entry.capabilities.satisfies(&policy.require) {
        return EligibilityDecision::reject("model capabilities do not satisfy requirements");
    }
    EligibilityDecision::ok("eligible")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestra::capabilities::ModelCapabilitiesInfo;
    use crate::orchestra::catalog::{CatalogSource, ModelRef};
    use crate::orchestra::health::ModelAvailability;

    fn ready_entry(tool_calling: bool) -> CatalogEntry {
        let mut e = CatalogEntry::discovered(
            ModelRef::new("opencode", "openai", "gpt-4o"),
            CatalogSource::Manual,
        );
        e.availability = ModelAvailability::Ready;
        e.capabilities = ModelCapabilitiesInfo {
            tool_calling: Some(tool_calling),
            ..Default::default()
        };
        e
    }

    #[test]
    fn free_only_rejects_paid_candidate() {
        let policy = ModelPolicy {
            strategy: SelectionStrategy::FreeOnly,
            allow_paid_models: false,
            ..Default::default()
        };
        let d = evaluate_eligibility(&policy, &ready_entry(true), false, false, true);
        assert!(!d.eligible);
        assert!(d.reason.contains("Free Only") || d.reason.contains("paid"));
    }

    #[test]
    fn capability_requirement_rejects_unknown_tool_calling() {
        let policy = ModelPolicy {
            require: ModelRequirement {
                tool_calling: true,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut e = ready_entry(false);
        e.capabilities.tool_calling = None;
        let d = evaluate_eligibility(&policy, &e, true, false, false);
        assert!(!d.eligible);
    }

    #[test]
    fn ready_tool_capable_model_can_be_eligible() {
        let d = evaluate_eligibility(&ModelPolicy::default(), &ready_entry(true), true, false, false);
        assert!(d.eligible);
    }
}
