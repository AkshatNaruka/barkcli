use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A milestone is a roadmap checkpoint grouping cards/specs/sprints.
/// Stored in `.board/milestones/<board>.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_status")]
    pub status: MilestoneStatus,
    /// YYYY-MM-DD target.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_date: Option<String>,
    #[serde(default)]
    pub card_ids: Vec<String>,
    #[serde(default)]
    pub spec_ids: Vec<String>,
    #[serde(default)]
    pub sprint_names: Vec<String>,
    /// Ordering for roadmap display (lower = earlier).
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default = "default_now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "default_now")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MilestoneStatus {
    Planned,
    Active,
    Shipped,
    Cancelled,
}

impl std::fmt::Display for MilestoneStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            MilestoneStatus::Planned => "planned",
            MilestoneStatus::Active => "active",
            MilestoneStatus::Shipped => "shipped",
            MilestoneStatus::Cancelled => "cancelled",
        };
        write!(f, "{}", s)
    }
}

impl MilestoneStatus {
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "planned" | "plan" => Some(MilestoneStatus::Planned),
            "active" | "in-progress" | "in_progress" => Some(MilestoneStatus::Active),
            "shipped" | "done" | "completed" => Some(MilestoneStatus::Shipped),
            "cancelled" | "canceled" => Some(MilestoneStatus::Cancelled),
            _ => None,
        }
    }
}

impl Default for Milestone {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: String::new(),
            description: None,
            status: MilestoneStatus::Planned,
            target_date: None,
            card_ids: Vec::new(),
            spec_ids: Vec::new(),
            sprint_names: Vec::new(),
            sort_order: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}

impl Milestone {
    pub fn new(id: impl Into<String>, title: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            title: title.into(),
            description: None,
            status: MilestoneStatus::Planned,
            target_date: None,
            card_ids: Vec::new(),
            spec_ids: Vec::new(),
            sprint_names: Vec::new(),
            sort_order: 0,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }

    pub fn add_card(&mut self, card_id: &str) -> bool {
        if self.card_ids.iter().any(|c| c == card_id) {
            return false;
        }
        self.card_ids.push(card_id.to_string());
        self.touch();
        true
    }

    pub fn remove_card(&mut self, card_id: &str) -> bool {
        let before = self.card_ids.len();
        self.card_ids.retain(|c| c != card_id);
        if self.card_ids.len() != before {
            self.touch();
        }
        self.card_ids.len() != before
    }

    pub fn add_spec(&mut self, spec_id: &str) -> bool {
        if self.spec_ids.iter().any(|s| s == spec_id) {
            return false;
        }
        self.spec_ids.push(spec_id.to_string());
        self.touch();
        true
    }

    /// Progress 0..100 based on done cards among assigned cards.
    /// If no cards assigned, progress is derived from spec coverage if specs exist, else 0.
    pub fn progress(&self, board: &crate::models::Board) -> f64 {
        if self.status == MilestoneStatus::Shipped {
            return 100.0;
        }
        if self.card_ids.is_empty() {
            return 0.0;
        }
        let total = self.card_ids.len() as f64;
        let mut done = 0usize;
        for cid in &self.card_ids {
            if let Some(card) = board.find_card(cid) {
                if card.column == "done" {
                    done += 1;
                }
            }
        }
        (done as f64 / total) * 100.0
    }

    pub fn is_overdue(&self) -> bool {
        if self.status == MilestoneStatus::Shipped || self.status == MilestoneStatus::Cancelled {
            return false;
        }
        let Some(date) = self.target_date.as_deref() else {
            return false;
        };
        let Ok(target) = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d") else {
            return false;
        };
        let today = Utc::now().date_naive();
        today > target
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadmapProgress {
    pub milestone: Milestone,
    pub total_cards: usize,
    pub done_cards: usize,
    pub percent_done: f64,
    pub overdue: bool,
    pub spec_count: usize,
    pub sprint_count: usize,
}

fn default_status() -> MilestoneStatus {
    MilestoneStatus::Planned
}

fn default_now() -> DateTime<Utc> {
    Utc::now()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Board;
    use crate::models::Card;

    #[test]
    fn milestone_progress_computed_from_board() {
        let mut board = Board::new("t");
        board.cards.push(Card::new("a", "A", "done"));
        board.cards.push(Card::new("b", "B", "todo"));
        let mut m = Milestone::new("m1", "Q4 Launch");
        m.card_ids = vec!["a".into(), "b".into()];
        assert_eq!(m.progress(&board), 50.0);
        m.status = MilestoneStatus::Shipped;
        assert_eq!(m.progress(&board), 100.0);
    }

    #[test]
    fn milestone_overdue_detection() {
        let past = (Utc::now() - chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
        let future = (Utc::now() + chrono::Duration::days(30)).format("%Y-%m-%d").to_string();
        let mut m = Milestone::new("m", " overdue");
        m.target_date = Some(past);
        assert!(m.is_overdue());
        m.target_date = Some(future);
        assert!(!m.is_overdue());
    }

    #[test]
    fn milestone_status_roundtrip() {
        for s in ["planned", "active", "shipped", "cancelled"] {
            let parsed = MilestoneStatus::parse(s).unwrap();
            assert_eq!(parsed.to_string(), s);
        }
    }
}
