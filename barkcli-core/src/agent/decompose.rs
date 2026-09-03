use serde::{Deserialize, Serialize};

use crate::models::Card;

use super::roles::AgentRole;

/// Task decomposition plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPlan {
    pub parent_card: String,
    pub child_cards: Vec<CardSpec>,
    pub dependencies: Vec<(String, String)>,
    pub estimated_effort: u32,
    pub risk_assessment: RiskLevel,
    pub decomposition_strategy: DecompositionStrategy,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardSpec {
    pub title: String,
    pub description: String,
    pub priority: String,
    pub labels: Vec<String>,
    pub effort: Option<u32>,
    pub acceptance_criteria: Vec<String>,
    pub dependencies: Vec<String>,
    pub area: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

impl RiskLevel {
    pub fn display_name(&self) -> &str {
        match self {
            RiskLevel::Low => "Low",
            RiskLevel::Medium => "Medium",
            RiskLevel::High => "High",
            RiskLevel::Critical => "Critical",
        }
    }

    pub fn from_score(score: f32) -> Self {
        if score < 0.3 {
            RiskLevel::Low
        } else if score < 0.6 {
            RiskLevel::Medium
        } else if score < 0.8 {
            RiskLevel::High
        } else {
            RiskLevel::Critical
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DecompositionStrategy {
    /// Break by technical components
    Technical,
    /// Break by user stories
    UserStory,
    /// Break by workflow steps
    Workflow,
    /// Break by layers (frontend, backend, db)
    Layered,
    /// Break by testability
    TestDriven,
}

impl DecompositionStrategy {
    pub fn display_name(&self) -> &str {
        match self {
            DecompositionStrategy::Technical => "Technical Components",
            DecompositionStrategy::UserStory => "User Stories",
            DecompositionStrategy::Workflow => "Workflow Steps",
            DecompositionStrategy::Layered => "Architecture Layers",
            DecompositionStrategy::TestDriven => "Test-Driven",
        }
    }
}

/// Decompose a card into subtasks based on role and context
pub fn decompose_task(
    card: &Card,
    role: &AgentRole,
    context: Option<&CardDecompositionContext>,
) -> TaskPlan {
    match role {
        AgentRole::ScrumMaster => decompose_as_scrum_master(card, context),
        AgentRole::ProductOwner => decompose_as_product_owner(card, context),
        AgentRole::TechLead => decompose_as_tech_lead(card, context),
        AgentRole::ProjectManager => decompose_as_project_manager(card, context),
    }
}

/// Context for task decomposition
#[derive(Debug, Clone, Default)]
pub struct CardDecompositionContext {
    pub related_cards: Vec<Card>,
    pub code_files: Vec<String>,
    pub complexity_score: Option<f32>,
    pub test_coverage: Option<f32>,
    pub velocity: Option<u32>,
}

fn decompose_as_scrum_master(
    card: &Card,
    context: Option<&CardDecompositionContext>,
) -> TaskPlan {
    let mut child_cards = Vec::new();
    let strategy = DecompositionStrategy::UserStory;

    // Scrum Master focuses on deliverable user stories
    if !card.acceptance_criteria.is_empty() {
        // Break down by acceptance criteria
        for (i, ac) in card.acceptance_criteria.iter().enumerate() {
            child_cards.push(CardSpec {
                title: format!("{} - AC{}", card.title, i + 1),
                description: ac.clone(),
                priority: card.priority.clone(),
                labels: card.labels.clone(),
                effort: Some(1),
                acceptance_criteria: vec![ac.clone()],
                dependencies: Vec::new(),
                area: card.area.clone(),
            });
        }
    } else {
        // Create standard subtasks
        child_cards.push(CardSpec {
            title: format!("{} - Implementation", card.title),
            description: format!("Implement the core functionality for: {}", card.title),
            priority: card.priority.clone(),
            labels: vec!["implementation".to_string()],
            effort: Some(2),
            acceptance_criteria: vec!["Feature works as described".to_string()],
            dependencies: Vec::new(),
            area: card.area.clone(),
        });

        child_cards.push(CardSpec {
            title: format!("{} - Testing", card.title),
            description: format!("Write tests for: {}", card.title),
            priority: card.priority.clone(),
            labels: vec!["testing".to_string()],
            effort: Some(1),
            acceptance_criteria: vec!["Tests pass and cover main scenarios".to_string()],
            dependencies: vec![format!("{} - Implementation", card.title)],
            area: card.area.clone(),
        });

        child_cards.push(CardSpec {
            title: format!("{} - Documentation", card.title),
            description: format!("Document: {}", card.title),
            priority: "low".to_string(),
            labels: vec!["documentation".to_string()],
            effort: Some(1),
            acceptance_criteria: vec!["Documentation is clear and complete".to_string()],
            dependencies: vec![format!("{} - Implementation", card.title)],
            area: card.area.clone(),
        });
    }

    let estimated_effort = child_cards.iter().filter_map(|c| c.effort).sum();
    let risk = calculate_risk(card, context);

    TaskPlan {
        parent_card: card.id.clone(),
        child_cards,
        dependencies: Vec::new(),
        estimated_effort,
        risk_assessment: risk,
        decomposition_strategy: strategy,
        rationale: "Decomposed into user story focused subtasks".to_string(),
    }
}

fn decompose_as_product_owner(
    card: &Card,
    context: Option<&CardDecompositionContext>,
) -> TaskPlan {
    let mut child_cards = Vec::new();
    let strategy = DecompositionStrategy::UserStory;

    // Product Owner focuses on value delivery
    child_cards.push(CardSpec {
        title: format!("{} - MVP", card.title),
        description: format!("Minimum viable implementation of: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["mvp".to_string(), "high-value".to_string()],
        effort: Some(3),
        acceptance_criteria: vec![
            "Core functionality works".to_string(),
            "User can complete main workflow".to_string(),
        ],
        dependencies: Vec::new(),
        area: card.area.clone(),
    });

    child_cards.push(CardSpec {
        title: format!("{} - Polish", card.title),
        description: format!("Polish and refinement for: {}", card.title),
        priority: "medium".to_string(),
        labels: vec!["polish".to_string()],
        effort: Some(2),
        acceptance_criteria: vec!["UX is smooth and intuitive".to_string()],
        dependencies: vec![format!("{} - MVP", card.title)],
        area: card.area.clone(),
    });

    let estimated_effort = child_cards.iter().filter_map(|c| c.effort).sum();
    let risk = calculate_risk(card, context);

    TaskPlan {
        parent_card: card.id.clone(),
        child_cards,
        dependencies: Vec::new(),
        estimated_effort,
        risk_assessment: risk,
        decomposition_strategy: strategy,
        rationale: "Decomposed by business value and MVP approach".to_string(),
    }
}

fn decompose_as_tech_lead(
    card: &Card,
    context: Option<&CardDecompositionContext>,
) -> TaskPlan {
    let mut child_cards = Vec::new();
    let strategy = DecompositionStrategy::Technical;

    // Tech Lead focuses on technical decomposition
    child_cards.push(CardSpec {
        title: format!("{} - Design", card.title),
        description: format!("Technical design and architecture for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["design".to_string(), "architecture".to_string()],
        effort: Some(1),
        acceptance_criteria: vec!["Design is reviewed and approved".to_string()],
        dependencies: Vec::new(),
        area: card.area.clone(),
    });

    child_cards.push(CardSpec {
        title: format!("{} - Backend", card.title),
        description: format!("Backend implementation for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["backend".to_string()],
        effort: Some(3),
        acceptance_criteria: vec!["API works correctly".to_string()],
        dependencies: vec![format!("{} - Design", card.title)],
        area: Some("backend".to_string()),
    });

    child_cards.push(CardSpec {
        title: format!("{} - Frontend", card.title),
        description: format!("Frontend implementation for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["frontend".to_string()],
        effort: Some(3),
        acceptance_criteria: vec!["UI matches design".to_string()],
        dependencies: vec![format!("{} - Design", card.title)],
        area: Some("frontend".to_string()),
    });

    child_cards.push(CardSpec {
        title: format!("{} - Tests", card.title),
        description: format!("Test suite for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["testing".to_string()],
        effort: Some(2),
        acceptance_criteria: vec!["Test coverage > 80%".to_string()],
        dependencies: vec![
            format!("{} - Backend", card.title),
            format!("{} - Frontend", card.title),
        ],
        area: card.area.clone(),
    });

    let estimated_effort = child_cards.iter().filter_map(|c| c.effort).sum();
    let risk = calculate_risk(card, context);

    TaskPlan {
        parent_card: card.id.clone(),
        child_cards,
        dependencies: Vec::new(),
        estimated_effort,
        risk_assessment: risk,
        decomposition_strategy: strategy,
        rationale: "Decomposed by technical components and layers".to_string(),
    }
}

fn decompose_as_project_manager(
    card: &Card,
    context: Option<&CardDecompositionContext>,
) -> TaskPlan {
    let mut child_cards = Vec::new();
    let strategy = DecompositionStrategy::Workflow;

    // Project Manager focuses on workflow and coordination
    child_cards.push(CardSpec {
        title: format!("{} - Analysis", card.title),
        description: format!("Requirements analysis for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["analysis".to_string()],
        effort: Some(1),
        acceptance_criteria: vec!["Requirements are clear and complete".to_string()],
        dependencies: Vec::new(),
        area: card.area.clone(),
    });

    child_cards.push(CardSpec {
        title: format!("{} - Development", card.title),
        description: format!("Development work for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["development".to_string()],
        effort: Some(5),
        acceptance_criteria: vec!["Feature is implemented".to_string()],
        dependencies: vec![format!("{} - Analysis", card.title)],
        area: card.area.clone(),
    });

    child_cards.push(CardSpec {
        title: format!("{} - Review", card.title),
        description: format!("Code review and QA for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["review".to_string(), "qa".to_string()],
        effort: Some(2),
        acceptance_criteria: vec!["Code is reviewed and approved".to_string()],
        dependencies: vec![format!("{} - Development", card.title)],
        area: card.area.clone(),
    });

    child_cards.push(CardSpec {
        title: format!("{} - Deployment", card.title),
        description: format!("Deployment and verification for: {}", card.title),
        priority: card.priority.clone(),
        labels: vec!["deployment".to_string()],
        effort: Some(1),
        acceptance_criteria: vec!["Feature is deployed and verified".to_string()],
        dependencies: vec![format!("{} - Review", card.title)],
        area: card.area.clone(),
    });

    let estimated_effort = child_cards.iter().filter_map(|c| c.effort).sum();
    let risk = calculate_risk(card, context);

    TaskPlan {
        parent_card: card.id.clone(),
        child_cards,
        dependencies: Vec::new(),
        estimated_effort,
        risk_assessment: risk,
        decomposition_strategy: strategy,
        rationale: "Decomposed by workflow stages for delivery coordination".to_string(),
    }
}

fn calculate_risk(card: &Card, context: Option<&CardDecompositionContext>) -> RiskLevel {
    let mut risk_score = 0.0;

    // Base risk from priority
    risk_score += match card.priority.as_str() {
        "critical" => 0.4,
        "high" => 0.3,
        "medium" => 0.2,
        "low" => 0.1,
        _ => 0.2,
    };

    // Risk from complexity if available
    if let Some(ctx) = context {
        if let Some(complexity) = ctx.complexity_score {
            risk_score += complexity * 0.3;
        }

        // Risk from low test coverage
        if let Some(coverage) = ctx.test_coverage {
            if coverage < 0.5 {
                risk_score += 0.2;
            }
        }
    }

    // Risk from effort estimate
    if let Some(effort) = card.effort {
        if effort > 8 {
            risk_score += 0.2;
        } else if effort > 5 {
            risk_score += 0.1;
        }
    }

    // Risk from missing acceptance criteria
    if card.acceptance_criteria.is_empty() {
        risk_score += 0.1;
    }

    RiskLevel::from_score(risk_score)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Card;

    fn test_card() -> Card {
        Card {
            id: "test-card".to_string(),
            title: "Test Feature".to_string(),
            description: Some("A test feature".to_string()),
            column: "todo".to_string(),
            priority: "high".to_string(),
            labels: vec!["feature".to_string()],
            assignee: None,
            checklist: vec![],
            due_date: None,
            remind_at: None,
            comments: vec![],
            blocked_by: None,
            attachments: vec![],
            links: vec![],
            acceptance_criteria: vec!["Works correctly".to_string()],
            effort: Some(5),
            area: None,
            spec_id: None,
            pinned: false,
            version: 1,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn test_scrum_master_decomposition() {
        let card = test_card();
        let plan = decompose_task(&card, &AgentRole::ScrumMaster, None);

        assert_eq!(plan.parent_card, "test-card");
        assert!(!plan.child_cards.is_empty());
        assert!(plan.estimated_effort > 0);
    }

    #[test]
    fn test_tech_lead_decomposition() {
        let card = test_card();
        let plan = decompose_task(&card, &AgentRole::TechLead, None);

        assert_eq!(plan.decomposition_strategy, DecompositionStrategy::Technical);
        assert!(plan.child_cards.len() >= 3); // Design, Backend, Frontend, Tests
    }

    #[test]
    fn test_risk_assessment() {
        let mut card = test_card();
        card.priority = "critical".to_string();
        card.effort = Some(10);

        let plan = decompose_task(&card, &AgentRole::ProjectManager, None);
        assert!(plan.risk_assessment == RiskLevel::High || plan.risk_assessment == RiskLevel::Critical);
    }
}
