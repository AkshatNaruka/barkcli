use std::fmt;

use serde::{Deserialize, Serialize};

/// Management agent roles
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgentRole {
    ScrumMaster,
    ProductOwner,
    TechLead,
    ProjectManager,
}

impl AgentRole {
    /// System prompt for this role
    pub fn system_prompt(&self) -> &str {
        match self {
            AgentRole::ScrumMaster => {
                "You are a Scrum Master managing a software development team. \
                 Your responsibilities include:\n\
                 - Sprint planning and backlog grooming\n\
                 - Daily standup summaries\n\
                 - Identifying and removing impediments\n\
                 - Tracking velocity and team capacity\n\
                 - Facilitating retrospectives\n\
                 - Ensuring team follows agile practices\n\
                 You focus on process, team health, and delivering value incrementally."
            }
            AgentRole::ProductOwner => {
                "You are a Product Owner responsible for maximizing product value. \
                 Your responsibilities include:\n\
                 - Defining and prioritizing the product backlog\n\
                 - Writing clear user stories with acceptance criteria\n\
                 - Making scope decisions based on business value\n\
                 - Stakeholder communication\n\
                 - Validating delivered features against requirements\n\
                 - Releasing planning\n\
                 You focus on user needs, business value, and product vision."
            }
            AgentRole::TechLead => {
                "You are a Tech Lead responsible for technical excellence. \
                 Your responsibilities include:\n\
                 - Architecture decisions and technical design\n\
                 - Code review and quality standards\n\
                 - Technical debt management\n\
                 - Performance and security assessment\n\
                 - Development best practices\n\
                 - Mentoring and knowledge sharing\n\
                 You focus on code quality, maintainability, and technical sustainability."
            }
            AgentRole::ProjectManager => {
                "You are a Project Manager responsible for delivery execution. \
                 Your responsibilities include:\n\
                 - Timeline management and milestone tracking\n\
                 - Resource allocation and capacity planning\n\
                 - Risk identification and mitigation\n\
                 - Cross-team coordination\n\
                 - Progress reporting and status updates\n\
                 - Dependency management\n\
                 You focus on schedule, budget, and successful delivery."
            }
        }
    }

    /// Capabilities this role provides
    pub fn capabilities(&self) -> Vec<Capability> {
        match self {
            AgentRole::ScrumMaster => vec![
                Capability::SprintPlanning,
                Capability::BacklogGrooming,
                Capability::StandupSummary,
                Capability::VelocityTracking,
                Capability::ImpedimentRemoval,
                Capability::Retrospective,
            ],
            AgentRole::ProductOwner => vec![
                Capability::BacklogPrioritization,
                Capability::UserStoryCreation,
                Capability::AcceptanceCriteria,
                Capability::ScopeManagement,
                Capability::ReleasePlanning,
                Capability::StakeholderCommunication,
            ],
            AgentRole::TechLead => vec![
                Capability::CodeReview,
                Capability::ArchitectureAssessment,
                Capability::TechnicalDebtTracking,
                Capability::PerformanceAnalysis,
                Capability::SecurityAssessment,
                Capability::BestPractices,
            ],
            AgentRole::ProjectManager => vec![
                Capability::TimelineManagement,
                Capability::ResourceAllocation,
                Capability::RiskAssessment,
                Capability::DependencyTracking,
                Capability::ProgressReporting,
                Capability::MilestoneTracking,
            ],
        }
    }

    /// Check if this role can perform a specific action
    pub fn can_do(&self, action: &Capability) -> bool {
        self.capabilities().contains(action)
    }

    /// Parse role from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "scrum-master" | "scrum" | "sm" => Some(AgentRole::ScrumMaster),
            "product-owner" | "product" | "po" => Some(AgentRole::ProductOwner),
            "tech-lead" | "tech" | "tl" => Some(AgentRole::TechLead),
            "project-manager" | "pm" => Some(AgentRole::ProjectManager),
            _ => None,
        }
    }

    /// Get display name
    pub fn display_name(&self) -> &str {
        match self {
            AgentRole::ScrumMaster => "Scrum Master",
            AgentRole::ProductOwner => "Product Owner",
            AgentRole::TechLead => "Tech Lead",
            AgentRole::ProjectManager => "Project Manager",
        }
    }
}

impl fmt::Display for AgentRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

/// Capabilities that an agent role can provide
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Capability {
    // Scrum Master
    SprintPlanning,
    BacklogGrooming,
    StandupSummary,
    VelocityTracking,
    ImpedimentRemoval,
    Retrospective,

    // Product Owner
    BacklogPrioritization,
    UserStoryCreation,
    AcceptanceCriteria,
    ScopeManagement,
    ReleasePlanning,
    StakeholderCommunication,

    // Tech Lead
    CodeReview,
    ArchitectureAssessment,
    TechnicalDebtTracking,
    PerformanceAnalysis,
    SecurityAssessment,
    BestPractices,

    // Project Manager
    TimelineManagement,
    ResourceAllocation,
    RiskAssessment,
    DependencyTracking,
    ProgressReporting,
    MilestoneTracking,
}

impl Capability {
    /// Get display name
    pub fn display_name(&self) -> &str {
        match self {
            Capability::SprintPlanning => "Sprint Planning",
            Capability::BacklogGrooming => "Backlog Grooming",
            Capability::StandupSummary => "Standup Summary",
            Capability::VelocityTracking => "Velocity Tracking",
            Capability::ImpedimentRemoval => "Impediment Removal",
            Capability::Retrospective => "Retrospective",
            Capability::BacklogPrioritization => "Backlog Prioritization",
            Capability::UserStoryCreation => "User Story Creation",
            Capability::AcceptanceCriteria => "Acceptance Criteria",
            Capability::ScopeManagement => "Scope Management",
            Capability::ReleasePlanning => "Release Planning",
            Capability::StakeholderCommunication => "Stakeholder Communication",
            Capability::CodeReview => "Code Review",
            Capability::ArchitectureAssessment => "Architecture Assessment",
            Capability::TechnicalDebtTracking => "Technical Debt Tracking",
            Capability::PerformanceAnalysis => "Performance Analysis",
            Capability::SecurityAssessment => "Security Assessment",
            Capability::BestPractices => "Best Practices",
            Capability::TimelineManagement => "Timeline Management",
            Capability::ResourceAllocation => "Resource Allocation",
            Capability::RiskAssessment => "Risk Assessment",
            Capability::DependencyTracking => "Dependency Tracking",
            Capability::ProgressReporting => "Progress Reporting",
            Capability::MilestoneTracking => "Milestone Tracking",
        }
    }
}

impl fmt::Display for Capability {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_role_from_str() {
        assert_eq!(AgentRole::from_str("scrum-master"), Some(AgentRole::ScrumMaster));
        assert_eq!(AgentRole::from_str("sm"), Some(AgentRole::ScrumMaster));
        assert_eq!(AgentRole::from_str("product-owner"), Some(AgentRole::ProductOwner));
        assert_eq!(AgentRole::from_str("po"), Some(AgentRole::ProductOwner));
        assert_eq!(AgentRole::from_str("tech-lead"), Some(AgentRole::TechLead));
        assert_eq!(AgentRole::from_str("tl"), Some(AgentRole::TechLead));
        assert_eq!(AgentRole::from_str("project-manager"), Some(AgentRole::ProjectManager));
        assert_eq!(AgentRole::from_str("pm"), Some(AgentRole::ProjectManager));
        assert_eq!(AgentRole::from_str("invalid"), None);
    }

    #[test]
    fn test_role_capabilities() {
        let sm = AgentRole::ScrumMaster;
        assert!(sm.can_do(&Capability::SprintPlanning));
        assert!(sm.can_do(&Capability::StandupSummary));
        assert!(!sm.can_do(&Capability::CodeReview));

        let tl = AgentRole::TechLead;
        assert!(tl.can_do(&Capability::CodeReview));
        assert!(!tl.can_do(&Capability::SprintPlanning));
    }

    #[test]
    fn test_role_system_prompt() {
        let sm = AgentRole::ScrumMaster;
        let prompt = sm.system_prompt();
        assert!(prompt.contains("Scrum Master"));
        assert!(prompt.contains("Sprint planning"));
    }
}
