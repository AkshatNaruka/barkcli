//! Code intelligence: symbol extraction + project index + fuzzy card→code matching.
//!
//! Local-first (no LLM): builds an inverted index of source symbols per file so
//! cards can be mapped to the code they touch. `context scan` matches card
//! titles against symbol/path tokens; `context link` pins files manually.
//!
//! Extended with:
//! - Call graph analysis (callgraph.rs)
//! - Test coverage mapping (tests.rs)
//! - Complexity metrics (metrics.rs)

pub mod callgraph;
pub mod index;
pub mod metrics;
pub mod symbols;
pub mod tests;

pub use callgraph::{CallGraph, CallGraphSummary};
pub use index::{FileSymbols, ScoredFile, SymbolIndex};
pub use metrics::{FileMetrics, ProjectMetrics};
pub use tests::{CoverageReport, TestMap};
