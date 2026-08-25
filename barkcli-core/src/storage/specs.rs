use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::models::spec::{Spec, SpecCoverage};
use crate::storage::board_dir::find_board_dir;

const SPECS_DIR: &str = "specs";

/// `.board/specs/<board>.json` — one JSON array of specs per board.
pub fn specs_path(board_name: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    let dir = board_dir.join(SPECS_DIR);
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.json", board_name)))
}

pub fn read_specs(board_name: &str) -> Result<Vec<Spec>> {
    let path = specs_path(board_name)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).context("failed to read specs")?;
    let specs: Vec<Spec> = serde_json::from_str(&content).unwrap_or_default();
    Ok(specs)
}

pub fn write_specs(board_name: &str, specs: &[Spec]) -> Result<()> {
    let path = specs_path(board_name)?;
    let json = serde_json::to_string_pretty(specs).context("failed to serialize specs")?;
    std::fs::write(&path, json).context("failed to write specs")?;
    Ok(())
}

/// Add a spec or update an existing one (matched by ID).
pub fn upsert_spec(board_name: &str, spec: Spec) -> Result<()> {
    let mut specs = read_specs(board_name)?;
    match specs.iter_mut().find(|s| s.id == spec.id) {
        Some(existing) => *existing = spec,
        None => specs.push(spec),
    }
    write_specs(board_name, &specs)
}

/// Remove a spec by ID.
pub fn remove_spec(board_name: &str, spec_id: &str) -> Result<bool> {
    let mut specs = read_specs(board_name)?;
    let before = specs.len();
    specs.retain(|s| s.id != spec_id);
    let removed = specs.len() != before;
    if removed {
        write_specs(board_name, &specs)?;
    }
    Ok(removed)
}

/// Get a spec by ID.
pub fn get_spec(board_name: &str, spec_id: &str) -> Result<Option<Spec>> {
    let specs = read_specs(board_name)?;
    Ok(specs.into_iter().find(|s| s.id == spec_id))
}

/// Calculate overall coverage for all specs on a board.
pub fn calculate_coverage(board_name: &str) -> Result<SpecCoverage> {
    let specs = read_specs(board_name)?;
    let mut total_reqs = 0;
    let mut implemented = 0;
    let mut verified = 0;
    let mut stale = 0;

    for spec in &specs {
        let cov = spec.coverage();
        total_reqs += cov.total_requirements;
        implemented += cov.implemented;
        verified += cov.verified;
        stale += cov.stale;
    }

    let coverage_percent = if total_reqs == 0 {
        100.0
    } else {
        (implemented as f64 / total_reqs as f64) * 100.0
    };

    Ok(SpecCoverage {
        total_requirements: total_reqs,
        implemented,
        verified,
        stale,
        coverage_percent,
    })
}

/// Mark requirements as stale if their linked code files have been modified.
pub fn mark_stale_requirements(
    board_name: &str,
    modified_files: &[String],
) -> Result<Vec<(String, String, String)>> {
    // Returns Vec<(spec_id, req_id, reason)>
    let mut specs = read_specs(board_name)?;
    let mut stale_updates = Vec::new();

    for spec in &mut specs {
        for req in &mut spec.requirements {
            let was_stale = req.stale;
            let linked_and_modified: Vec<&str> = req
                .linked_code
                .iter()
                .filter(|path| modified_files.contains(path))
                .map(|s| s.as_str())
                .collect();

            if !linked_and_modified.is_empty() {
                let reason = format!(
                    "Modified files: {}",
                    linked_and_modified.join(", ")
                );
                req.mark_stale(&reason);
                if !was_stale {
                    stale_updates.push((spec.id.clone(), req.id.clone(), reason));
                }
            }
        }
    }

    write_specs(board_name, &specs)?;
    Ok(stale_updates)
}

/// Clear stale status for requirements linked to specific files.
pub fn clear_stale_for_files(board_name: &str, files: &[String]) -> Result<usize> {
    let mut specs = read_specs(board_name)?;
    let mut cleared = 0;

    for spec in &mut specs {
        for req in &mut spec.requirements {
            if req.stale {
                let all_files_linked = req
                    .linked_code
                    .iter()
                    .any(|path| files.contains(path));
                if all_files_linked {
                    req.clear_stale();
                    cleared += 1;
                }
            }
        }
    }

    write_specs(board_name, &specs)?;
    Ok(cleared)
}
