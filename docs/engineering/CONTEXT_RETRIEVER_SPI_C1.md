# Context Retriever SPI (C1 scaffold)

**Status:** Design/scaffold (native default; no new default network/model deps).  
**Date:** 2026-11-07  
**Related:** `barkcli-core/src/context/{mod,pack,retrieval,repo_map,rules}.rs`, A5 benchmark, C2.

## Goal
Define a stable interface for context retrieval so native lexical/rules/repo-map retrieval remains default, while CK (lexical/semantic/hybrid) and Codanna (structural/symbol graph) can be added as **opt-in providers** behind feature flags/config.

## Proposed SPI (core)
```rust
pub struct RetrievalRequest {
    pub query: String,
    pub intent_kind: Option<String>, // explain/debug/plan/review/implement
    pub budget_tokens: usize,
    pub changed_files: Vec<String>,
    pub run_id: Option<String>,
    pub project_root: PathBuf,
    pub flags: RetrievalFlags, // include_tests, include_history, semantic_opt_in, etc.
}

pub struct ContextHit {
    pub provider: String,           // native|ck|codanna
    pub path: String,
    pub symbol: Option<String>,
    pub span: Option<(usize, usize)>,
    pub kind: HitKind,              // snippet|summary|fact|symbol|doc
    pub score: f32,
    pub why: Vec<String>,           // provenance/rationale
    pub staleness: Option<String>,
    pub text: String,               // bounded
}

pub struct PackedContext {
    pub hits: Vec<ContextHit>,
    pub estimated_tokens: usize,
    pub dropped: Vec<DroppedHit>,   // budget/provenance
    pub trace: RetrievalTrace,
}

#[async_trait::async_trait]
pub trait ContextRetriever: Send + Sync {
    fn id(&self) -> &'static str;
    fn capabilities(&self) -> RetrieverCapabilities;
    async fn retrieve(&self, req: &RetrievalRequest) -> anyhow::Result<Vec<ContextHit>>;
}
```

## Fusion/ranking (native path)
- Normalize scores per provider; dedupe by `(path,span/symbol)`.
- Apply intent weights (debug: errors/tests/callers; plan: docs/contracts/owners; review: changed files/diffs).
- Budget packer drops lowest-value hits and records provenance.
- Emit redacted trace for evals/diagnostics (F1/F3).

## Config defaults
```yaml
context:
  retriever: native            # native|hybrid (opt-in)
  providers:
    ck: { enabled: false, mode: lexical }      # lexical|hybrid|semantic (semantic opt-in)
    codanna: { enabled: false }
  benchmark: local_only
```

## Integration points
- `context/pack.rs`: replace direct retrieval with `RetrieverPipeline` that always includes native and optionally merges opt-in providers.
- A5/C4 benchmarks: same fixtures, report recall@k/support coverage/p95/approx tokens/failure modes.

## Implementation note (session)
- Trait/scaffold should be added additively; avoid breaking current `assemble` behavior. Full wiring + CK/Codanna adapters are follow-up PRs with external deps gated.
