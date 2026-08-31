use anyhow::{Context, Result};
use std::collections::HashMap;
use std::process::Command;

use crate::models::{Board, Card};
use crate::storage::board_file::{board_path, read_board, write_board};

/// A field-level change on one side of a merge.
#[derive(Debug, Clone)]
struct FieldChange {
    field: String,
    old_value: String,
    new_value: String,
}

/// Conflict between local and remote changes to the same field.
#[derive(Debug)]
struct CardConflict {
    card_id: String,
    local_change: FieldChange,
    remote_change: FieldChange,
}

/// Result of a 3-way merge.
struct MergeResult {
    merged_board: Board,
    added: Vec<Card>,
    removed: Vec<String>,
    auto_merged: Vec<(String, Vec<FieldChange>)>,
    conflicts: Vec<CardConflict>,
}

/// Merge a board from a git branch into the current working tree using 3-way merge.
///
/// Usage: `barkcli merge <branch> [--board <name>]`
pub fn run(args: &[String]) -> Result<()> {
    let branch = args
        .first()
        .ok_or_else(|| anyhow::anyhow!("usage: barkcli merge <branch> [--board <name>]"))?;

    let board_name = args
        .iter()
        .position(|s| s == "--board" || s == "-b")
        .and_then(|i| args.get(i + 1))
        .cloned()
        .unwrap_or_else(|| {
            crate::commands::boards::resolve_board(None).unwrap_or_else(|_| "tasks".into())
        });

    // Read current (local) board
    let local_board = read_board(&board_name)
        .context(format!("board '{}' not found locally", board_name))?;

    // Find merge base
    let base_sha = find_merge_base(branch)
        .context("failed to find merge base — is this a git repo with shared history?")?;

    // Read base board from common ancestor
    let base_board = read_board_from_ref(&base_sha, &board_name).context(format!(
        "board '{}' not found at merge base {}",
        board_name, base_sha
    ))?;

    // Read remote board from git branch
    let remote_board = read_board_from_branch(branch, &board_name)
        .context(format!("failed to read '{}' from branch '{}'", board_name, branch))?;

    // Find board file path for display
    let bp = board_path(&board_name)?;
    let board_file = bp
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("*.board");

    // 3-way merge
    let result = merge_boards_3way(&base_board, &local_board, &remote_board)?;

    if result.conflicts.is_empty()
        && result.added.is_empty()
        && result.removed.is_empty()
        && result.auto_merged.is_empty()
    {
        println!(
            "✓ Board '{}' is already up to date with '{}'",
            board_name, branch
        );
        return Ok(());
    }

    // Report results
    if !result.added.is_empty() {
        println!(
            "✓ {} card(s) added from '{}':",
            result.added.len(),
            branch
        );
        for card in &result.added {
            println!("  + {} ({})", card.title, card.id);
        }
    }

    if !result.removed.is_empty() {
        println!(
            "✓ {} card(s) removed (deleted in '{}'):",
            result.removed.len(),
            branch
        );
        for id in &result.removed {
            println!("  - {}", id);
        }
    }

    if !result.auto_merged.is_empty() {
        println!(
            "✓ {} card(s) auto-merged (non-conflicting field changes):",
            result.auto_merged.len()
        );
        for (id, changes) in &result.auto_merged {
            println!("  ~ {}:", id);
            for change in changes {
                println!(
                    "    {}: {} → {}",
                    change.field, change.old_value, change.new_value
                );
            }
        }
    }

    if !result.conflicts.is_empty() {
        println!(
            "\n⚠ {} conflict(s) require manual resolution:",
            result.conflicts.len()
        );
        for conflict in &result.conflicts {
            println!("\n  Card: {}", conflict.card_id);
            println!(
                "    LOCAL:  {}: {} → {}",
                conflict.local_change.field,
                conflict.local_change.old_value,
                conflict.local_change.new_value
            );
            println!(
                "    REMOTE: {}: {} → {}",
                conflict.remote_change.field,
                conflict.remote_change.old_value,
                conflict.remote_change.new_value
            );
        }

        println!(
            "\nResolve conflicts manually, or use:"
        );
        println!(
            "  barkcli merge {} --resolve-local   # Keep local changes",
            branch
        );
        println!(
            "  barkcli merge {} --resolve-remote  # Keep remote changes",
            branch
        );
        println!(
            "  barkcli merge {} --resolve-both    # Keep both (append)",
            branch
        );
        return Ok(());
    }

    // Apply merged board
    write_board(&board_name, &result.merged_board)?;
    println!(
        "\n✓ Merged '{}' into '{}' ({})",
        branch, board_name, board_file
    );
    Ok(())
}

/// 3-way merge: compare local and remote against a common base.
fn merge_boards_3way(base: &Board, local: &Board, remote: &Board) -> Result<MergeResult> {
    let mut merged = local.clone();
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut auto_merged = Vec::new();
    let mut conflicts = Vec::new();

    // Index all card versions by ID
    let base_cards: HashMap<&str, &Card> = base.cards.iter().map(|c| (c.id.as_str(), c)).collect();
    let local_cards: HashMap<&str, &Card> = local.cards.iter().map(|c| (c.id.as_str(), c)).collect();
    let remote_cards: HashMap<&str, &Card> = remote.cards.iter().map(|c| (c.id.as_str(), c)).collect();

    // Process all cards that exist in any version
    let mut all_ids: Vec<&str> = Vec::new();
    all_ids.extend(base_cards.keys());
    all_ids.extend(local_cards.keys());
    all_ids.extend(remote_cards.keys());
    all_ids.sort();
    all_ids.dedup();

    for id in all_ids {
        let in_base = base_cards.get(id);
        let in_local = local_cards.get(id);
        let in_remote = remote_cards.get(id);

        match (in_base, in_local, in_remote) {
            // Card exists in all three — check for conflicts
            (Some(base_card), Some(local_card), Some(remote_card)) => {
                let local_diffs = diff_cards(base_card, local_card);
                let remote_diffs = diff_cards(base_card, remote_card);

                // Find fields changed on both sides
                let local_fields: HashMap<&str, &FieldChange> =
                    local_diffs.iter().map(|c| (c.field.as_str(), c)).collect();
                let remote_fields: HashMap<&str, &FieldChange> =
                    remote_diffs.iter().map(|c| (c.field.as_str(), c)).collect();

                let mut field_conflicts = Vec::new();
                let mut field_auto_merges = Vec::new();

                // Check for conflicts: same field changed on both sides
                for (field, local_change) in &local_fields {
                    if let Some(remote_change) = remote_fields.get(field) {
                        // Both changed the same field
                        if local_change.new_value != remote_change.new_value {
                            // Different values → conflict
                            field_conflicts.push(CardConflict {
                                card_id: id.to_string(),
                                local_change: (*local_change).clone(),
                                remote_change: (*remote_change).clone(),
                            });
                        }
                        // Same value → no conflict, no need to merge
                    } else {
                        // Only local changed this field → already in local, nothing to do
                    }
                }

                for (field, remote_change) in &remote_fields {
                    if !local_fields.contains_key(field) {
                        // Only remote changed this field → auto-apply
                        field_auto_merges.push((*remote_change).clone());
                    }
                }

                // Apply auto-merges
                if !field_auto_merges.is_empty() {
                    if let Some(card) = merged.cards.iter_mut().find(|c| c.id == *id) {
                        apply_changes(card, &field_auto_merges);
                        auto_merged.push((id.to_string(), field_auto_merges));
                    }
                }

                // Report conflicts
                conflicts.extend(field_conflicts);
            }

            // Card only in remote (new) — add it
            (None, None, Some(remote_card)) => {
                let card = (*remote_card).clone();
                added.push(card.clone());
                merged.cards.push(card);
            }

            // Card in base and local, but deleted in remote — remove it
            (Some(_), Some(_), None) => {
                removed.push(id.to_string());
            }

            // Card in base and remote, but deleted in local — keep deleted
            (Some(_), None, Some(_)) => {
                // Local deleted it, remote kept it — conflict? For now, respect local deletion
            }

            // Card only in local (added locally) — keep it
            (None, Some(_), None) => {
                // Already in merged board
            }

            // Card only in local and remote, not in base — shouldn't happen in normal merge
            (None, Some(_), Some(_)) => {
                // Both added the same card — already in merged board from local
            }

            _ => {}
        }
    }

    // Remove cards that were deleted in remote
    merged
        .cards
        .retain(|c| remote_cards.contains_key(c.id.as_str()) || !base_cards.contains_key(c.id.as_str()));

    Ok(MergeResult {
        merged_board: merged,
        added,
        removed,
        auto_merged,
        conflicts,
    })
}

/// Diff two cards field by field, showing what changed from `old` to `new`.
fn diff_cards(old: &Card, new: &Card) -> Vec<FieldChange> {
    let mut changes = Vec::new();

    // String fields
    macro_rules! diff_str {
        ($field:ident, $name:expr) => {
            if old.$field != new.$field {
                changes.push(FieldChange {
                    field: $name.to_string(),
                    old_value: old.$field.clone(),
                    new_value: new.$field.clone(),
                });
            }
        };
    }

    // Option<String> fields
    macro_rules! diff_opt {
        ($field:ident, $name:expr) => {
            if old.$field != new.$field {
                changes.push(FieldChange {
                    field: $name.to_string(),
                    old_value: old.$field.clone().unwrap_or_default(),
                    new_value: new.$field.clone().unwrap_or_default(),
                });
            }
        };
    }

    diff_str!(title, "title");
    diff_str!(column, "column");
    diff_str!(priority, "priority");

    diff_opt!(description, "description");
    diff_opt!(assignee, "assignee");
    diff_opt!(due_date, "due_date");
    diff_opt!(remind_at, "remind_at");
    diff_opt!(area, "area");

    if old.effort != new.effort {
        changes.push(FieldChange {
            field: "effort".to_string(),
            old_value: old.effort.map(|e| e.to_string()).unwrap_or_default(),
            new_value: new.effort.map(|e| e.to_string()).unwrap_or_default(),
        });
    }

    if old.pinned != new.pinned {
        changes.push(FieldChange {
            field: "pinned".to_string(),
            old_value: old.pinned.to_string(),
            new_value: new.pinned.to_string(),
        });
    }

    if old.labels != new.labels {
        changes.push(FieldChange {
            field: "labels".to_string(),
            old_value: old.labels.join(", "),
            new_value: new.labels.join(", "),
        });
    }

    if old.links != new.links {
        changes.push(FieldChange {
            field: "links".to_string(),
            old_value: format!("{:?}", old.links),
            new_value: format!("{:?}", new.links),
        });
    }

    if old.acceptance_criteria != new.acceptance_criteria {
        changes.push(FieldChange {
            field: "acceptance_criteria".to_string(),
            old_value: old.acceptance_criteria.join(", "),
            new_value: new.acceptance_criteria.join(", "),
        });
    }

    changes
}

/// Apply a list of field changes to a card.
fn apply_changes(card: &mut Card, changes: &[FieldChange]) {
    for change in changes {
        match change.field.as_str() {
            "title" => card.title = change.new_value.clone(),
            "description" => {
                card.description = if change.new_value.is_empty() {
                    None
                } else {
                    Some(change.new_value.clone())
                }
            }
            "column" => card.column = change.new_value.clone(),
            "priority" => card.priority = change.new_value.clone(),
            "assignee" => {
                card.assignee = if change.new_value.is_empty() {
                    None
                } else {
                    Some(change.new_value.clone())
                }
            }
            "due_date" => {
                card.due_date = if change.new_value.is_empty() {
                    None
                } else {
                    Some(change.new_value.clone())
                }
            }
            "remind_at" => {
                card.remind_at = if change.new_value.is_empty() {
                    None
                } else {
                    Some(change.new_value.clone())
                }
            }
            "effort" => {
                card.effort = change.new_value.parse().ok();
            }
            "area" => {
                card.area = if change.new_value.is_empty() {
                    None
                } else {
                    Some(change.new_value.clone())
                }
            }
            "pinned" => {
                card.pinned = change.new_value == "true";
            }
            _ => {}
        }
    }
    card.touch();
}

/// Find the merge base (common ancestor) between HEAD and a branch.
fn find_merge_base(branch: &str) -> Result<String> {
    let output = Command::new("git")
        .args(["merge-base", "HEAD", branch])
        .output()
        .context("failed to run git merge-base")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("git merge-base failed: {}", stderr.trim());
    }

    let sha = String::from_utf8(output.stdout)
        .context("failed to parse git merge-base output")?
        .trim()
        .to_string();

    Ok(sha)
}

/// Read a board from a git ref (commit SHA, branch, tag, etc.).
fn read_board_from_ref(ref_name: &str, board_name: &str) -> Result<Board> {
    let board_file = format!("{}.board", board_name);
    let ref_path = format!("{}:{}", ref_name, board_file);

    let output = Command::new("git")
        .args(["show", &ref_path])
        .output()
        .context("failed to run git show")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!(
            "git show {}:{} failed: {}",
            ref_name,
            board_file,
            stderr.trim()
        );
    }

    let content = String::from_utf8(output.stdout)
        .context("failed to parse git show output as UTF-8")?;

    let board: Board =
        serde_yaml::from_str(&content).context("failed to parse board YAML from git")?;

    Ok(board)
}

/// Read a board from a branch.
fn read_board_from_branch(branch: &str, board_name: &str) -> Result<Board> {
    read_board_from_ref(branch, board_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_cards_no_changes() {
        let card = Card::new("test", "Test Card", "todo");
        let diffs = diff_cards(&card, &card);
        assert!(diffs.is_empty());
    }

    #[test]
    fn test_diff_cards_column_change() {
        let base = Card::new("test", "Test Card", "todo");
        let mut new = base.clone();
        new.column = "doing".to_string();

        let diffs = diff_cards(&base, &new);
        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].field, "column");
        assert_eq!(diffs[0].new_value, "doing");
    }

    #[test]
    fn test_diff_cards_multiple_changes() {
        let base = Card::new("test", "Test Card", "todo");
        let mut new = base.clone();
        new.column = "doing".to_string();
        new.priority = "high".to_string();

        let diffs = diff_cards(&base, &new);
        assert_eq!(diffs.len(), 2);
    }

    #[test]
    fn test_apply_changes() {
        let mut card = Card::new("test", "Test Card", "todo");
        let changes = vec![
            FieldChange {
                field: "column".to_string(),
                old_value: "todo".to_string(),
                new_value: "doing".to_string(),
            },
            FieldChange {
                field: "priority".to_string(),
                old_value: "medium".to_string(),
                new_value: "high".to_string(),
            },
        ];
        apply_changes(&mut card, &changes);
        assert_eq!(card.column, "doing");
        assert_eq!(card.priority, "high");
        assert_eq!(card.version, 2); // touch() was called
    }

    #[test]
    fn test_merge_no_conflicts() {
        let mut base = Board::new("test");
        base.cards.push(Card::new("card1", "Card 1", "todo"));

        // Local: no changes
        let local = base.clone();

        // Remote: moved card1 to doing
        let mut remote = base.clone();
        remote.cards[0].column = "doing".to_string();

        let result = merge_boards_3way(&base, &local, &remote).unwrap();
        assert!(result.conflicts.is_empty());
        assert_eq!(result.auto_merged.len(), 1);
        // After auto-merge, the merged card should have the remote's column
        let merged_card = result.merged_board.cards.iter().find(|c| c.id == "card1").unwrap();
        assert_eq!(merged_card.column, "doing");
    }

    #[test]
    fn test_merge_with_conflict() {
        let mut base = Board::new("test");
        base.cards.push(Card::new("card1", "Card 1", "todo"));

        // Local: moved to doing
        let mut local = base.clone();
        local.cards[0].column = "doing".to_string();

        // Remote: moved to review
        let mut remote = base.clone();
        remote.cards[0].column = "review".to_string();

        let result = merge_boards_3way(&base, &local, &remote).unwrap();
        assert_eq!(result.conflicts.len(), 1);
        assert_eq!(result.conflicts[0].card_id, "card1");
    }

    #[test]
    fn test_merge_new_card_from_remote() {
        let base = Board::new("test");
        let local = base.clone();

        let mut remote = base.clone();
        remote
            .cards
            .push(Card::new("new-card", "New Card", "todo"));

        let result = merge_boards_3way(&base, &local, &remote).unwrap();
        assert!(result.conflicts.is_empty());
        assert_eq!(result.added.len(), 1);
        assert_eq!(result.added[0].id, "new-card");
    }
}
