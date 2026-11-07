use serde::{Deserialize, Serialize};

use super::capabilities::ModelCapabilitiesInfo;
use super::health::ModelAvailability;

/// Normalized identity for an executable model selection.
/// `runtime_id` is the execution harness (e.g. opencode); `provider_id` is the
/// inference/account provider namespace; `model_id` is the exact model identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ModelRef {
    pub runtime_id: String,
    pub provider_id: String,
    pub model_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
}

impl ModelRef {
    pub fn new(
        runtime_id: impl Into<String>,
        provider_id: impl Into<String>,
        model_id: impl Into<String>,
    ) -> Self {
        Self {
            runtime_id: runtime_id.into(),
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            variant: None,
        }
    }

    pub fn with_variant(mut self, variant: impl Into<String>) -> Self {
        let v = variant.into();
        self.variant = if v.trim().is_empty() { None } else { Some(v) };
        self
    }

    /// Canonical display/id form used in receipts and logs.
    pub fn canonical_id(&self) -> String {
        match &self.variant {
            Some(v) if !v.is_empty() => format!(
                "{}/{}/{}#{}",
                self.runtime_id, self.provider_id, self.model_id, v
            ),
            _ => format!("{}/{}/{}", self.runtime_id, self.provider_id, self.model_id),
        }
    }

    /// Best-effort parse from forms like `provider/model`, `runtime/provider/model`,
    /// or canonical ids with `#variant`. Defaults runtime to `opencode` when ambiguous.
    pub fn parse_loose(input: &str, default_runtime: &str) -> Self {
        let (main, variant) = match input.split_once('#') {
            Some((m, v)) if !v.trim().is_empty() => (m, Some(v.trim().to_string())),
            _ => (input, None),
        };
        let parts: Vec<&str> = main.split('/').filter(|p| !p.is_empty()).collect();
        let mut mr = match parts.as_slice() {
            [provider, model] => Self::new(default_runtime, *provider, *model),
            [runtime, provider, model, ..] => Self::new(*runtime, *provider, *model),
            [model] => Self::new(default_runtime, "unknown", *model),
            _ => Self::new(default_runtime, "unknown", main),
        };
        mr.variant = variant;
        mr
    }

    /// Legacy/provider CLI model id form (`provider/model`) used by current adapters.
    /// Preserves existing behavior where runtimes expect OpenCode-style model ids.
    pub fn legacy_model_id(&self) -> String {
        format!("{}/{}", self.provider_id, self.model_id)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogSource {
    OpenCodeServer,
    OpenCodeCli,
    OpenCodeModelsVerbose,
    ModelsDev,
    LocalCache,
    Manual,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub model: ModelRef,
    #[serde(default)]
    pub display_name: Option<String>,
    pub availability: ModelAvailability,
    #[serde(default)]
    pub capabilities: ModelCapabilitiesInfo,
    #[serde(default)]
    pub source: Option<CatalogSource>,
    #[serde(default)]
    pub confidence: Option<f32>,
    #[serde(default)]
    pub last_checked_unix_ms: Option<i64>,
    /// Human-readable reason (auth required, unsupported, rate limited, etc.).
    #[serde(default)]
    pub status_reason: Option<String>,
    /// Raw provider/model metadata for diagnostics (kept small).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl CatalogEntry {
    pub fn discovered(model: ModelRef, source: CatalogSource) -> Self {
        Self {
            model,
            display_name: None,
            availability: ModelAvailability::Discovered,
            capabilities: ModelCapabilitiesInfo::default(),
            source: Some(source),
            confidence: Some(0.3),
            last_checked_unix_ms: None,
            status_reason: None,
            metadata: None,
        }
    }

    pub fn is_eligible_for_auto(&self) -> bool {
        matches!(self.availability, ModelAvailability::Ready)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_ref_canonical_and_parse_loose() {
        let mr = ModelRef::new("opencode", "anthropic", "claude-sonnet-4").with_variant("high");
        assert_eq!(mr.canonical_id(), "opencode/anthropic/claude-sonnet-4#high");
        let parsed = ModelRef::parse_loose("anthropic/claude-sonnet-4#high", "opencode");
        assert_eq!(parsed.runtime_id, "opencode");
        assert_eq!(parsed.provider_id, "anthropic");
        assert_eq!(parsed.model_id, "claude-sonnet-4");
        assert_eq!(parsed.variant.as_deref(), Some("high"));
    }

    #[test]
    fn catalog_entry_auto_eligibility_requires_ready() {
        let mr = ModelRef::new("opencode", "openai", "gpt-4o");
        let mut e = CatalogEntry::discovered(mr, CatalogSource::OpenCodeCli);
        assert!(!e.is_eligible_for_auto());
        e.availability = ModelAvailability::Ready;
        assert!(e.is_eligible_for_auto());
    }
}
