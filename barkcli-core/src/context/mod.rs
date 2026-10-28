//! Context packs, manifests, repository maps, and the per-thread ledger.
//!
//! The public entry point is [`ContextEngine`]. It compiles a bounded prompt
//! with a reusable stable prefix and a task-specific suffix, then stores the
//! result so the workbench can explain exactly what the agent saw.

pub mod ledger;
pub mod manifest;
pub mod pack;
pub mod repo_map;

pub use ledger::{ContextLedger, ContextStore, LedgerEntry};
pub use manifest::{
    hash_text, ContextExclusion, ContextManifest, ManifestFile, ManifestSection, ManifestSkill,
};
pub use pack::{
    AttachedSkill, CompileRequest, ContextEngine, ContextPack, ContextReuse, ContextSection,
    ContextSettings,
};
pub use repo_map::{is_allowed, RepoMap};
