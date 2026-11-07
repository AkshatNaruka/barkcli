//! Orchestra 2.0: model intelligence, routing, and multi-model orchestration.
//!
//! Phase 1 foundations: normalized model identity/catalog/discovery/health.
//! This module is additive; existing runtime/provider behavior remains authoritative
//! until later phases wire dynamic selection.

pub mod assignment;
pub mod budget;
pub mod capabilities;
pub mod catalog;
pub mod discovery;
pub mod health;
pub mod policy;
pub mod router;
pub mod task;

pub use assignment::{ModelAssignment, RejectedCandidate};
pub use budget::{BudgetPolicy, ResourceCapacity};
pub use capabilities::{ModelCapabilitiesInfo, ModelRequirement};
pub use catalog::{CatalogEntry, CatalogSource, ModelRef};
pub use discovery::{DiscoveryOptions, DiscoveryReport, ModelDiscovery};
pub use health::ModelAvailability;
pub use policy::{evaluate_eligibility, EligibilityDecision, ModelPolicy, SelectionStrategy};
pub use router::{select_model, Candidate, RankedCandidate, RouterInput};
pub use task::{Difficulty, Risk, TaskAnalysis, WorkType};
