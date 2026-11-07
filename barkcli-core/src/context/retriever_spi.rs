//! Stable context-retriever SPI (C1 scaffold).
//!
//! Native lexical/rules/repo-map retrieval remains the default implementation.
//! Optional providers (CK, Codanna) can implement this trait behind config/feature
//! gates. **Do not add default network/model downloads.**

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Intent hint used for retrieval weighting/routing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum IntentKind {
    #[default]
    General,
    Explain,
    Debug,
    Plan,
    Review,
    Implement,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RetrievalFlags {
    #[serde(default)]
    pub include_tests: bool,
    #[serde(default)]
    pub include_history: bool,
    /// Semantic/hybrid providers must remain opt-in.
    #[serde(default)]
    pub semantic_opt_in: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievalRequest {
    pub query: String,
    #[serde(default)]
    pub intent: IntentKind,
    #[serde(default = "default_budget")]
    pub budget_tokens: usize,
    #[serde(default)]
    pub changed_files: Vec<String>,
    #[serde(default)]
    pub run_id: Option<String>,
    pub project_root: PathBuf,
    #[serde(default)]
    pub flags: RetrievalFlags,
}

fn default_budget() -> usize {
    8_000
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HitKind {
    Snippet,
    Summary,
    Fact,
    Symbol,
    Doc,
    Test,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextHit {
    pub provider: String,
    pub path: String,
    #[serde(default)]
    pub symbol: Option<String>,
    #[serde(default)]
    pub span: Option<(usize, usize)>,
    pub kind: HitKind,
    pub score: f32,
    #[serde(default)]
    pub why: Vec<String>,
    #[serde(default)]
    pub staleness: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DroppedHit {
    pub provider: String,
    pub path: String,
    pub reason: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RetrievalTrace {
    #[serde(default)]
    pub providers: Vec<String>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackedRetrieval {
    #[serde(default)]
    pub hits: Vec<ContextHit>,
    pub estimated_tokens: usize,
    #[serde(default)]
    pub dropped: Vec<DroppedHit>,
    #[serde(default)]
    pub trace: RetrievalTrace,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RetrieverCapabilities {
    pub lexical: bool,
    pub semantic: bool,
    pub symbol_graph: bool,
    /// Providers that may download models or call network must report true.
    pub requires_network_or_model_download: bool,
}

/// Synchronous SPI scaffold; async adapter can be added when a provider needs it.
/// Implementations must respect budget and avoid unbounded reads.
pub trait ContextRetriever: Send + Sync {
    fn id(&self) -> &'static str;
    fn capabilities(&self) -> RetrieverCapabilities;
    fn retrieve(&self, req: &RetrievalRequest) -> anyhow::Result<Vec<ContextHit>>;
}

/// Native placeholder capability descriptor (actual retrieval lives in `pack`/native pipeline).
pub struct NativeRetrieverDescriptor;

impl NativeRetrieverDescriptor {
    pub fn capabilities() -> RetrieverCapabilities {
        RetrieverCapabilities {
            lexical: true,
            semantic: false,
            symbol_graph: false,
            requires_network_or_model_download: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_descriptor_has_no_network_model_requirement() {
        let caps = NativeRetrieverDescriptor::capabilities();
        assert!(caps.lexical);
        assert!(!caps.requires_network_or_model_download);
    }
}
