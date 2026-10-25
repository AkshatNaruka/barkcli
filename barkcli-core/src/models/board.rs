use serde::{Deserialize, Serialize};

use crate::models::card::Card;
use crate::models::column::Column;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub columns: Vec<Column>,
    #[serde(default)]
    pub cards: Vec<Card>,
}

impl Board {
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            description: None,
            columns: vec![
                Column::new("todo", "Todo"),
                Column::new("doing", "Doing"),
                Column::new("review", "Review"),
                Column::new("done", "Done"),
            ],
            cards: Vec::new(),
        }
    }

    /// Find card by id
    pub fn find_card(&self, id: &str) -> Option<&Card> {
        self.cards.iter().find(|c| c.id == id)
    }

    /// Find card mutably by id
    pub fn find_card_mut(&mut self, id: &str) -> Option<&mut Card> {
        self.cards.iter_mut().find(|c| c.id == id)
    }

    /// Return cards belonging to a given column
    pub fn cards_in_column(&self, column: &str) -> Vec<&Card> {
        self.cards.iter().filter(|c| c.column == column).collect()
    }

    /// Return cards matching a priority level
    pub fn cards_by_priority(&self, priority: &str) -> Vec<&Card> {
        self.cards.iter().filter(|c| c.priority == priority).collect()
    }

    /// Return cards in todo that are not blocked by uncompleted prerequisites
    pub fn unblocked_ready_cards(&self) -> Vec<&Card> {
        self.cards
            .iter()
            .filter(|c| c.column == "todo")
            .filter(|c| {
                !c.links.iter().any(|l| {
                    l.ty == crate::models::card::LinkType::BlockedBy
                        && self
                            .find_card(&l.target)
                            .map(|target| target.column != "done")
                            .unwrap_or(false)
                }) && c.blocked_by.as_deref().map(|b| b.is_empty()).unwrap_or(true)
            })
            .collect()
    }

    /// Calculate completion percentage (0.0 to 100.0)
    pub fn completion_rate(&self) -> f32 {
        if self.cards.is_empty() {
            return 100.0;
        }
        let done = self.cards.iter().filter(|c| c.column == "done").count();
        (done as f32 / self.cards.len() as f32) * 100.0
    }

    /// Calculate total estimated effort across all cards
    pub fn total_effort(&self) -> u32 {
        self.cards.iter().filter_map(|c| c.effort).sum()
    }

    /// Calculate completed effort (done cards only)
    pub fn completed_effort(&self) -> u32 {
        self.cards
            .iter()
            .filter(|c| c.column == "done")
            .filter_map(|c| c.effort)
            .sum()
    }

    /// Check for Work In Progress (WIP) limit violations across columns
    pub fn validate_wip_limits(&self) -> Vec<String> {
        let mut violations = Vec::new();
        for col in &self.columns {
            if let Some(limit) = col.wip_limit {
                let count = self.cards.iter().filter(|c| c.column == col.id).count();
                if count > limit {
                    violations.push(format!(
                        "Column '{}' exceeds WIP limit: {}/{} cards",
                        col.name, count, limit
                    ));
                }
            }
        }
        violations
    }

    /// Detect cycles in card dependency links (e.g. BlockedBy dependencies)
    pub fn detect_dependency_cycles(&self) -> Vec<Vec<String>> {
        use std::collections::{HashMap, HashSet};
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
        for card in &self.cards {
            let mut neighbors = Vec::new();
            if let Some(ref b) = card.blocked_by {
                if !b.is_empty() {
                    neighbors.push(b.as_str());
                }
            }
            for link in &card.links {
                if link.ty == crate::models::card::LinkType::BlockedBy {
                    neighbors.push(link.target.as_str());
                }
            }
            adj.insert(&card.id, neighbors);
        }

        let mut cycles = Vec::new();
        let mut visited = HashSet::new();
        let mut stack = Vec::new();
        let mut on_stack = HashSet::new();

        fn dfs<'a>(
            node: &'a str,
            adj: &HashMap<&'a str, Vec<&'a str>>,
            visited: &mut HashSet<&'a str>,
            stack: &mut Vec<&'a str>,
            on_stack: &mut HashSet<&'a str>,
            cycles: &mut Vec<Vec<String>>,
        ) {
            visited.insert(node);
            stack.push(node);
            on_stack.insert(node);

            if let Some(neighbors) = adj.get(node) {
                for &neighbor in neighbors {
                    if !visited.contains(neighbor) {
                        dfs(neighbor, adj, visited, stack, on_stack, cycles);
                    } else if on_stack.contains(neighbor) {
                        if let Some(pos) = stack.iter().position(|&x| x == neighbor) {
                            let mut cycle: Vec<String> =
                                stack[pos..].iter().map(|&s| s.to_string()).collect();
                            cycle.push(neighbor.to_string());
                            cycles.push(cycle);
                        }
                    }
                }
            }

            stack.pop();
            on_stack.remove(node);
        }

        for &node in adj.keys() {
            if !visited.contains(node) {
                dfs(
                    node,
                    &adj,
                    &mut visited,
                    &mut stack,
                    &mut on_stack,
                    &mut cycles,
                );
            }
        }

        cycles
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::card::{Card, CardLink, LinkType};

    #[test]
    fn test_detect_dependency_cycles() {
        let mut board = Board::new("Test");
        let mut c1 = Card::new("c1", "Task 1", "todo");
        let mut c2 = Card::new("c2", "Task 2", "todo");
        c1.links.push(CardLink {
            target: "c2".into(),
            ty: LinkType::BlockedBy,
        });
        c2.links.push(CardLink {
            target: "c1".into(),
            ty: LinkType::BlockedBy,
        });
        board.cards.push(c1);
        board.cards.push(c2);

        let cycles = board.detect_dependency_cycles();
        assert_eq!(cycles.len(), 1);
        assert!(cycles[0].contains(&"c1".to_string()));
        assert!(cycles[0].contains(&"c2".to_string()));
    }

    #[test]
    fn test_validate_wip_limits() {
        let mut board = Board::new("Test");
        board.columns[1].wip_limit = Some(1); // doing limit = 1
        let mut c1 = Card::new("c1", "Task 1", "doing");
        let mut c2 = Card::new("c2", "Task 2", "doing");
        board.cards.push(c1);
        board.cards.push(c2);

        let violations = board.validate_wip_limits();
        assert_eq!(violations.len(), 1);
        assert!(violations[0].contains("Doing"));
    }
}
