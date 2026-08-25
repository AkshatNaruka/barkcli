use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::models::{Card, Sprint};

/// Velocity tracker for sprint planning
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VelocityTracker {
    pub historical: Vec<SprintVelocity>,
    pub current_capacity: u32,
    pub agent_capacity: HashMap<String, u32>,
    pub team_size: usize,
    pub avg_velocity: f32,
    pub velocity_trend: VelocityTrend,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SprintVelocity {
    pub sprint_name: String,
    pub planned_points: u32,
    pub completed_points: u32,
    pub carry_over_points: u32,
    pub duration_days: u32,
    pub team_size: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum VelocityTrend {
    Improving,
    Stable,
    Declining,
    Unknown,
}

impl Default for VelocityTrend {
    fn default() -> Self {
        VelocityTrend::Unknown
    }
}

impl VelocityTrend {
    pub fn display_name(&self) -> &str {
        match self {
            VelocityTrend::Improving => "Improving",
            VelocityTrend::Stable => "Stable",
            VelocityTrend::Declining => "Declining",
            VelocityTrend::Unknown => "Unknown",
        }
    }
}

impl VelocityTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Calculate velocity from historical sprints
    pub fn calculate_velocity(&mut self) {
        if self.historical.is_empty() {
            self.avg_velocity = 0.0;
            self.velocity_trend = VelocityTrend::Unknown;
            return;
        }

        // Calculate average velocity
        let total_completed: u32 = self.historical.iter().map(|s| s.completed_points).sum();
        self.avg_velocity = total_completed as f32 / self.historical.len() as f32;

        // Determine trend from last 3 sprints
        if self.historical.len() >= 3 {
            let recent: Vec<f32> = self
                .historical
                .iter()
                .rev()
                .take(3)
                .map(|s| s.completed_points as f32)
                .collect();

            if recent.len() >= 2 {
                let first_half = &recent[..recent.len() / 2];
                let second_half = &recent[recent.len() / 2..];
                let first_avg = first_half.iter().sum::<f32>() / first_half.len() as f32;
                let second_avg = second_half.iter().sum::<f32>() / second_half.len() as f32;

                if second_avg > first_avg * 1.1 {
                    self.velocity_trend = VelocityTrend::Improving;
                } else if second_avg < first_avg * 0.9 {
                    self.velocity_trend = VelocityTrend::Declining;
                } else {
                    self.velocity_trend = VelocityTrend::Stable;
                }
            }
        }
    }

    /// Add sprint velocity record
    pub fn add_sprint(&mut self, velocity: SprintVelocity) {
        self.historical.push(velocity);
        self.calculate_velocity();
    }

    /// Get capacity for next sprint
    pub fn next_sprint_capacity(&self) -> u32 {
        // Use average velocity with some buffer
        let base_capacity = self.avg_velocity as u32;

        // Adjust based on trend
        match self.velocity_trend {
            VelocityTrend::Improving => (base_capacity as f32 * 1.1) as u32,
            VelocityTrend::Declining => (base_capacity as f32 * 0.9) as u32,
            _ => base_capacity,
        }
    }

    /// Check if a task fits in capacity
    pub fn can_fit(&self, task_effort: u32) -> bool {
        task_effort <= self.next_sprint_capacity()
    }

    /// Get suggested sprint scope from backlog
    pub fn suggest_sprint_scope<'a>(
        &self,
        backlog_cards: &'a [Card],
        capacity: Option<u32>,
    ) -> Vec<&'a Card> {
        let capacity = capacity.unwrap_or(self.next_sprint_capacity());
        let mut selected = Vec::new();
        let mut remaining = capacity;

        // Sort cards by priority
        let mut sorted_cards: Vec<&Card> = backlog_cards
            .iter()
            .filter(|c| c.column == "todo")
            .collect();

        sorted_cards.sort_by(|a, b| {
            let pa = priority_score(&a.priority);
            let pb = priority_score(&b.priority);
            pa.cmp(&pb)
        });

        for card in sorted_cards {
            if let Some(effort) = card.effort {
                if effort <= remaining {
                    selected.push(card);
                    remaining -= effort;
                }
            } else {
                // If no effort estimate, assume 2 points
                if remaining >= 2 {
                    selected.push(card);
                    remaining -= 2;
                }
            }
        }

        selected
    }

    /// Get velocity report
    pub fn report(&self) -> VelocityReport {
        VelocityReport {
            avg_velocity: self.avg_velocity,
            next_sprint_capacity: self.next_sprint_capacity(),
            velocity_trend: self.velocity_trend.clone(),
            historical_sprints: self.historical.len(),
            total_completed_points: self.historical.iter().map(|s| s.completed_points).sum(),
            completion_rate: self.completion_rate(),
        }
    }

    /// Calculate completion rate
    fn completion_rate(&self) -> f32 {
        if self.historical.is_empty() {
            return 0.0;
        }

        let total_planned: u32 = self.historical.iter().map(|s| s.planned_points).sum();
        let total_completed: u32 = self.historical.iter().map(|s| s.completed_points).sum();

        if total_planned == 0 {
            0.0
        } else {
            total_completed as f32 / total_planned as f32
        }
    }
}

fn priority_score(priority: &str) -> u8 {
    match priority {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 4,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VelocityReport {
    pub avg_velocity: f32,
    pub next_sprint_capacity: u32,
    pub velocity_trend: VelocityTrend,
    pub historical_sprints: usize,
    pub total_completed_points: u32,
    pub completion_rate: f32,
}

/// Calculate velocity from sprint and history data
pub fn calculate_velocity_from_data(
    sprints: &[Sprint],
    cards: &[Card],
) -> VelocityTracker {
    let mut tracker = VelocityTracker::new();

    // For each sprint, calculate completed points
    for sprint in sprints {
        let sprint_cards: Vec<&Card> = cards
            .iter()
            .filter(|c| {
                c.labels
                    .iter()
                    .any(|l| l == &format!("sprint:{}", sprint.name))
                    && c.column == "done"
            })
            .collect();

        let completed_points: u32 = sprint_cards.iter().filter_map(|c| c.effort).sum();

        let planned_cards: Vec<&Card> = cards
            .iter()
            .filter(|c| {
                c.labels
                    .iter()
                    .any(|l| l == &format!("sprint:{}", sprint.name))
            })
            .collect();

        let planned_points: u32 = planned_cards.iter().filter_map(|c| c.effort).sum();

        tracker.add_sprint(SprintVelocity {
            sprint_name: sprint.name.clone(),
            planned_points,
            completed_points,
            carry_over_points: planned_points.saturating_sub(completed_points),
            duration_days: 14, // Default sprint length
            team_size: 1,
        });
    }

    tracker
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_velocity_calculation() {
        let mut tracker = VelocityTracker::new();
        tracker.add_sprint(SprintVelocity {
            sprint_name: "Sprint 1".to_string(),
            planned_points: 20,
            completed_points: 18,
            carry_over_points: 2,
            duration_days: 14,
            team_size: 3,
        });
        tracker.add_sprint(SprintVelocity {
            sprint_name: "Sprint 2".to_string(),
            planned_points: 22,
            completed_points: 20,
            carry_over_points: 2,
            duration_days: 14,
            team_size: 3,
        });

        assert!((tracker.avg_velocity - 19.0).abs() < 0.01);
        assert_eq!(tracker.next_sprint_capacity(), 19);
    }

    #[test]
    fn test_sprint_scope_suggestion() {
        let mut tracker = VelocityTracker::new();
        tracker.add_sprint(SprintVelocity {
            sprint_name: "Sprint 1".to_string(),
            planned_points: 10,
            completed_points: 10,
            carry_over_points: 0,
            duration_days: 14,
            team_size: 1,
        });

        let cards = vec![
            Card {
                id: "card-1".to_string(),
                title: "Task 1".to_string(),
                column: "todo".to_string(),
                priority: "high".to_string(),
                effort: Some(3),
                ..Default::default()
            },
            Card {
                id: "card-2".to_string(),
                title: "Task 2".to_string(),
                column: "todo".to_string(),
                priority: "medium".to_string(),
                effort: Some(5),
                ..Default::default()
            },
            Card {
                id: "card-3".to_string(),
                title: "Task 3".to_string(),
                column: "todo".to_string(),
                priority: "low".to_string(),
                effort: Some(8),
                ..Default::default()
            },
        ];

        let scope = tracker.suggest_sprint_scope(&cards, None);
        assert!(!scope.is_empty());
        // Should fit within capacity
        let total_effort: u32 = scope.iter().filter_map(|c| c.effort).sum();
        assert!(total_effort <= tracker.next_sprint_capacity());
    }
}
