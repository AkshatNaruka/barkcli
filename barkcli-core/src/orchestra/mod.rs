//! Orchestra 2.0: model intelligence, routing, and multi-model orchestration.
//!
//! Phase 1 foundations: normalized model identity/catalog/discovery/health.
//! This module is additive; existing runtime/provider behavior remains authoritative
//! until later phases wire dynamic selection.

pub mod capabilities;
pub mod catalog;
pub mod discovery;
pub mod health;
pub mod policy;

pub use capabilities::{ModelCapabilitiesInfo, ModelRequirement};
pub use catalog::{CatalogEntry, CatalogSource, ModelRef};
pub use discovery::{DiscoveryOptions, DiscoveryReport, ModelDiscovery};
pub use health::ModelAvailability;
pub use policy::{EligibilityDecision, ModelPolicy, SelectionStrategy, evaluate_eligibility};
