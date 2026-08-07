//! Code intelligence: symbol extraction + project index + fuzzy card→code matching.
//!
//! Local-first (no LLM): builds an inverted index of source symbols per file so
//! cards can be mapped to the code they touch. `context scan` matches card
//! titles against symbol/path tokens; `context link` pins files manually.

pub mod index;
pub mod symbols;

pub use index::{FileSymbols, ScoredFile, SymbolIndex};
