//! Harness internals shared by the CLI runner and the web runtime.
//!
//! `packet` assembles the per-attempt prompt (instruction layers, skills,
//! budget, manifest). Later phases add `checkpoint`, `lifecycle` (hooks) and
//! `permissions` here so both front-ends drive one attempt lifecycle.

pub mod checkpoint;
pub mod lifecycle;
pub mod packet;
pub mod permissions;
pub mod record;
pub mod verify;
