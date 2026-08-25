use anyhow::{anyhow, Result};
use comfy_table::{Attribute, Cell};

use crate::models::spec::{Requirement, RequirementStatus, Spec, SpecStatus};
use crate::storage::board_file::{list_board_files, read_board};
use crate::storage::specs::{
    calculate_coverage, get_spec, mark_stale_requirements, read_specs, remove_spec, upsert_spec,
};
use crate::util::{display, slug, style};

/// List all specs for the current board.
pub fn list(board_name: Option<&str>) -> Result<()> {
    let boards = list_board_files()?;
    if boards.is_empty() {
        println!("{}", style::muted("No boards found."));
        return Ok(());
    }

    let board_name = board_name.unwrap_or(&boards[0]);
    let specs = read_specs(board_name)?;

    if specs.is_empty() {
        println!(
            "{}",
            style::muted(&format!("No specs found in board '{}'.", board_name))
        );
        return Ok(());
    }

    let mut t = display::table();
    t.set_header(
        ["ID", "Title", "Status", "Reqs", "Coverage"]
            .iter()
            .map(|h| Cell::new(style::accent(h)).add_attributes(vec![Attribute::Bold]))
            .collect::<Vec<_>>(),
    );

    for spec in &specs {
        let cov = spec.coverage();
        let status_str = match spec.status {
            SpecStatus::Draft => style::muted("draft"),
            SpecStatus::InProgress => style::warn("in-progress"),
            SpecStatus::Implemented => style::ok("implemented"),
            SpecStatus::Verified => style::ok("verified"),
            SpecStatus::Deprecated => style::muted("deprecated"),
        };
        let coverage_str = format!("{:.0}%", cov.coverage_percent);
        let coverage_cell = if cov.coverage_percent >= 80.0 {
            style::ok(&coverage_str)
        } else if cov.coverage_percent >= 50.0 {
            style::warn(&coverage_str)
        } else {
            style::err(&coverage_str)
        };

        t.add_row(vec![
            Cell::new(style::accent(&spec.id)),
            Cell::new(&spec.title),
            Cell::new(status_str),
            Cell::new(style::strong(&cov.total_requirements.to_string())),
            Cell::new(coverage_cell),
        ]);
    }

    println!("{t}");
    Ok(())
}

/// Show full details of a spec.
pub fn show(board_name: Option<&str>, spec_id: &str) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let spec = get_spec(board_name, spec_id)?
        .ok_or_else(|| anyhow!("Spec '{}' not found", spec_id))?;

    println!("{}", style::accent(&format!("Spec: {}", spec.id)));
    println!("Title: {}", spec.title);
    if let Some(desc) = &spec.description {
        println!("Description: {}", desc);
    }
    println!("Status: {}", spec.status);
    println!("Priority: {}", spec.priority);
    println!("Created: {}", spec.created_at.format("%Y-%m-%d %H:%M"));
    println!("Updated: {}", spec.updated_at.format("%Y-%m-%d %H:%M"));

    if !spec.tags.is_empty() {
        println!("Tags: {}", spec.tags.join(", "));
    }

    let cov = spec.coverage();
    println!();
    println!(
        "Coverage: {:.0}% ({}/{} implemented, {} stale)",
        cov.coverage_percent, cov.implemented, cov.total_requirements, cov.stale
    );

    if !spec.requirements.is_empty() {
        println!();
        println!("Requirements:");
        for req in &spec.requirements {
            let status_icon = match req.status {
                RequirementStatus::Pending => style::muted("○"),
                RequirementStatus::InProgress => style::warn("◐"),
                RequirementStatus::Implemented => style::ok("●"),
                RequirementStatus::Verified => style::ok("✓"),
                RequirementStatus::Failed => style::err("✗"),
            };
            let stale_marker = if req.stale {
                style::err(" [STALE]")
            } else {
                String::new()
            };
            println!(
                "  {} {} - {}{}",
                status_icon, req.id, req.title, stale_marker
            );
            if !req.linked_code.is_empty() {
                println!("    Code: {}", req.linked_code.join(", "));
            }
            if !req.linked_tests.is_empty() {
                println!("    Tests: {}", req.linked_tests.join(", "));
            }
            if !req.linked_tasks.is_empty() {
                println!("    Tasks: {}", req.linked_tasks.join(", "));
            }
            if let Some(reason) = &req.stale_reason {
                println!("    Stale reason: {}", reason);
            }
        }
    }

    Ok(())
}

/// Create a new spec.
pub fn create(
    board_name: Option<&str>,
    title: &str,
    description: Option<&str>,
    priority: Option<&str>,
) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let id = slug::to_slug(title);
    let mut spec = Spec::new(&id, title);
    if let Some(desc) = description {
        spec.description = Some(desc.into());
    }
    if let Some(p) = priority {
        spec.priority = p.into();
    }

    upsert_spec(board_name, spec)?;
    println!("{} Created spec '{}'", style::ok("✓"), id);
    Ok(())
}

/// Update a spec's status or properties.
pub fn update(
    board_name: Option<&str>,
    spec_id: &str,
    status: Option<&str>,
    priority: Option<&str>,
    description: Option<&str>,
) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let mut spec = get_spec(board_name, spec_id)?
        .ok_or_else(|| anyhow!("Spec '{}' not found", spec_id))?;

    if let Some(s) = status {
        spec.status = SpecStatus::parse(s)
            .ok_or_else(|| anyhow!("Invalid status: {}", s))?;
    }
    if let Some(p) = priority {
        spec.priority = p.into();
    }
    if let Some(d) = description {
        spec.description = Some(d.into());
    }

    upsert_spec(board_name, spec)?;
    println!("{} Updated spec '{}'", style::ok("✓"), spec_id);
    Ok(())
}

/// Add a requirement to a spec.
pub fn add_requirement(
    board_name: Option<&str>,
    spec_id: &str,
    title: &str,
) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let mut spec = get_spec(board_name, spec_id)?
        .ok_or_else(|| anyhow!("Spec '{}' not found", spec_id))?;

    let req_id = format!("req-{}", slug::to_slug(title));
    let req = Requirement::new(&req_id, title);

    if !spec.add_requirement(req) {
        return Err(anyhow!("Requirement '{}' already exists", req_id));
    }

    upsert_spec(board_name, spec)?;
    println!(
        "{} Added requirement '{}' to spec '{}'",
        style::ok("✓"),
        req_id,
        spec_id
    );
    Ok(())
}

/// Link a code file to a requirement.
pub fn link_code(
    board_name: Option<&str>,
    spec_id: &str,
    req_id: &str,
    path: &str,
) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let mut spec = get_spec(board_name, spec_id)?
        .ok_or_else(|| anyhow!("Spec '{}' not found", spec_id))?;

    let req = spec
        .get_requirement_mut(req_id)
        .ok_or_else(|| anyhow!("Requirement '{}' not found in spec '{}'", req_id, spec_id))?;

    if !req.link_code(path) {
        return Err(anyhow!("File '{}' already linked", path));
    }

    upsert_spec(board_name, spec)?;
    println!(
        "{} Linked '{}' to requirement '{}'",
        style::ok("✓"),
        path,
        req_id
    );
    Ok(())
}

/// Link a task to a requirement.
pub fn link_task(
    board_name: Option<&str>,
    spec_id: &str,
    req_id: &str,
    task_id: &str,
) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let mut spec = get_spec(board_name, spec_id)?
        .ok_or_else(|| anyhow!("Spec '{}' not found", spec_id))?;

    let req = spec
        .get_requirement_mut(req_id)
        .ok_or_else(|| anyhow!("Requirement '{}' not found in spec '{}'", req_id, spec_id))?;

    if !req.link_task(task_id) {
        return Err(anyhow!("Task '{}' already linked", task_id));
    }

    upsert_spec(board_name, spec)?;
    println!(
        "{} Linked task '{}' to requirement '{}'",
        style::ok("✓"),
        task_id,
        req_id
    );
    Ok(())
}

/// Show traceability for a spec.
pub fn trace(board_name: Option<&str>, spec_id: &str) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let spec = get_spec(board_name, spec_id)?
        .ok_or_else(|| anyhow!("Spec '{}' not found", spec_id))?;

    println!(
        "{} {}",
        style::accent("Spec:"),
        spec.title
    );
    println!();

    for req in &spec.requirements {
        let status_icon = match req.status {
            RequirementStatus::Pending => style::muted("○"),
            RequirementStatus::InProgress => style::warn("◐"),
            RequirementStatus::Implemented => style::ok("●"),
            RequirementStatus::Verified => style::ok("✓"),
            RequirementStatus::Failed => style::err("✗"),
        };

        println!(
            "{} {} - {}",
            status_icon,
            style::accent(&req.id),
            req.title
        );

        if !req.linked_code.is_empty() {
            println!("  {} Code: {}", style::muted("→"), req.linked_code.join(", "));
        }
        if !req.linked_tests.is_empty() {
            println!(
                "  {} Tests: {}",
                style::muted("→"),
                req.linked_tests.join(", ")
            );
        }
        if !req.linked_tasks.is_empty() {
            println!(
                "  {} Tasks: {}",
                style::muted("→"),
                req.linked_tasks.join(", ")
            );
        }
        if req.stale {
            println!("  {} {}", style::err("⚠ STALE"), req.stale_reason.as_deref().unwrap_or(""));
        }
        println!();
    }

    Ok(())
}

/// Show coverage for all specs.
pub fn coverage(board_name: Option<&str>) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let cov = calculate_coverage(board_name)?;

    println!("Board: {}", style::accent(board_name));
    println!(
        "Total requirements: {}",
        style::strong(&cov.total_requirements.to_string())
    );
    println!(
        "Implemented: {}",
        style::ok(&cov.implemented.to_string())
    );
    println!("Verified: {}", style::ok(&cov.verified.to_string()));
    println!("Stale: {}", style::err(&cov.stale.to_string()));
    println!(
        "Coverage: {:.0}%",
        cov.coverage_percent
    );

    Ok(())
}

/// Delete a spec.
pub fn delete(board_name: Option<&str>, spec_id: &str) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let removed = remove_spec(board_name, spec_id)?;
    if removed {
        println!("{} Deleted spec '{}'", style::ok("✓"), spec_id);
    } else {
        println!(
            "{}",
            style::err(&format!("Spec '{}' not found", spec_id))
        );
    }
    Ok(())
}

/// Scan for stale requirements based on modified files.
pub fn scan_stale(board_name: Option<&str>, modified_files: &[String]) -> Result<()> {
    let boards = list_board_files()?;
    let board_name = board_name.unwrap_or(&boards[0]);

    let stale_updates = mark_stale_requirements(board_name, modified_files)?;

    if stale_updates.is_empty() {
        println!("{}", style::muted("No stale requirements detected."));
    } else {
        println!(
            "{}",
            style::warn(&format!(
                "Found {} stale requirement(s):",
                stale_updates.len()
            ))
        );
        for (spec_id, req_id, reason) in &stale_updates {
            println!(
                "  {} spec '{}' requirement '{}': {}",
                style::err("⚠"),
                spec_id,
                req_id,
                reason
            );
        }
    }

    Ok(())
}
