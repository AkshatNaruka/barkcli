use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::models::milestone::{Milestone, RoadmapProgress};
use crate::storage::board_dir::find_board_dir;

const MILESTONES_DIR: &str = "milestones";

/// `.board/milestones/<board>.json` — one JSON array of milestones per board.
pub fn milestones_path(board_name: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    let dir = board_dir.join(MILESTONES_DIR);
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.json", board_name)))
}

pub fn read_milestones(board_name: &str) -> Result<Vec<Milestone>> {
    let path = milestones_path(board_name)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).context("failed to read milestones")?;
    let milestones: Vec<Milestone> = serde_json::from_str(&content).unwrap_or_default();
    Ok(milestones)
}

pub fn write_milestones(board_name: &str, milestones: &[Milestone]) -> Result<()> {
    let path = milestones_path(board_name)?;
    crate::util::lock::with_lock(&path, || {
        let json = serde_json::to_string_pretty(milestones).context("failed to serialize milestones")?;
        let tmp = path.with_extension(format!(
            "{}.tmp",
            path.extension().and_then(|e| e.to_str()).unwrap_or("json")
        ));
        std::fs::write(&tmp, json).context("failed to write tmp milestones")?;
        std::fs::rename(&tmp, &path).context("failed to rename milestones")?;
        Ok(())
    })
}

/// Add a milestone or update an existing one (matched by ID).
pub fn upsert_milestone(board_name: &str, mut milestone: Milestone) -> Result<()> {
    // Gaps fallback: if no id, generate one from title slug + uuid suffix.
    if milestone.id.trim().is_empty() {
        let slug = crate::util::slug::to_slug(&milestone.title);
        let prefix = if slug.is_empty() { "milestone".to_string() } else { slug };
        milestone.id = format!("{}-{}", prefix, &uuid::Uuid::new_v4().simple().to_string()[..8]);
    }
    milestone.touch();
    let mut milestones = read_milestones(board_name)?;
    match milestones.iter_mut().find(|m| m.id == milestone.id) {
        Some(existing) => *existing = milestone,
        None => milestones.push(milestone),
    }
    milestones.sort_by_key(|m| m.sort_order);
    write_milestones(board_name, &milestones)
}

/// Remove a milestone by ID.
pub fn remove_milestone(board_name: &str, milestone_id: &str) -> Result<bool> {
    let mut milestones = read_milestones(board_name)?;
    let before = milestones.len();
    milestones.retain(|m| m.id != milestone_id);
    let removed = milestones.len() != before;
    if removed {
        write_milestones(board_name, &milestones)?;
    }
    Ok(removed)
}

/// Get a milestone by ID.
pub fn get_milestone(board_name: &str, milestone_id: &str) -> Result<Option<Milestone>> {
    let milestones = read_milestones(board_name)?;
    Ok(milestones.into_iter().find(|m| m.id == milestone_id))
}

/// Assign (or unassign) a card to a milestone.
pub fn assign_card(board_name: &str, milestone_id: &str, card_id: &str, assign: bool) -> Result<bool> {
    let mut milestones = read_milestones(board_name)?;
    let Some(m) = milestones.iter_mut().find(|m| m.id == milestone_id) else {
        return Ok(false);
    };
    let changed = if assign {
        m.add_card(card_id)
    } else {
        m.remove_card(card_id)
    };
    if changed {
        write_milestones(board_name, &milestones)?;
    }
    Ok(changed)
}

/// Roadmap with per-milestone progress against the current board.
pub fn roadmap(board_name: &str) -> Result<Vec<RoadmapProgress>> {
    let milestones = read_milestones(board_name)?;
    let board = crate::storage::board_file::read_board(board_name)?;
    let mut rows: Vec<RoadmapProgress> = milestones
        .into_iter()
        .map(|m| {
            let percent = m.progress(&board);
            let total = m.card_ids.len();
            let done = m
                .card_ids
                .iter()
                .filter(|cid| board.find_card(cid).map(|c| c.column == "done").unwrap_or(false))
                .count();
            let overdue = m.is_overdue();
            RoadmapProgress {
                milestone: m.clone(),
                total_cards: total,
                done_cards: done,
                percent_done: percent,
                overdue,
                spec_count: m.spec_ids.len(),
                sprint_count: m.sprint_names.len(),
            }
        })
        .collect();
    rows.sort_by_key(|r| r.milestone.sort_order);
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::milestone::MilestoneStatus;

    #[test]
    fn milestone_crud_roundtrip_tmp_board() {
        // We do not depend on a real .board dir; test serialization only.
        let mut m = Milestone::new("m1", "Alpha");
        m.status = MilestoneStatus::Active;
        m.add_card("card-1");
        let json = serde_json::to_string(&m).unwrap();
        let back: Milestone = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "m1");
        assert_eq!(back.card_ids.len(), 1);
    }
}
