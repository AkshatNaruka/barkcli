use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A specification that links requirements to code and tests.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spec {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_spec_status")]
    pub status: SpecStatus,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default)]
    pub requirements: Vec<Requirement>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "default_now")]
    pub updated_at: DateTime<Utc>,
}

/// Status of a specification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SpecStatus {
    Draft,
    InProgress,
    Implemented,
    Verified,
    Deprecated,
}

impl std::fmt::Display for SpecStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            SpecStatus::Draft => "draft",
            SpecStatus::InProgress => "in-progress",
            SpecStatus::Implemented => "implemented",
            SpecStatus::Verified => "verified",
            SpecStatus::Deprecated => "deprecated",
        };
        write!(f, "{}", s)
    }
}

impl SpecStatus {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "draft" => Some(SpecStatus::Draft),
            "in-progress" | "in_progress" => Some(SpecStatus::InProgress),
            "implemented" => Some(SpecStatus::Implemented),
            "verified" => Some(SpecStatus::Verified),
            "deprecated" => Some(SpecStatus::Deprecated),
            _ => None,
        }
    }
}

/// A single requirement within a spec.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Requirement {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_req_status")]
    pub status: RequirementStatus,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
    #[serde(default)]
    pub linked_code: Vec<String>,
    #[serde(default)]
    pub linked_tests: Vec<String>,
    #[serde(default)]
    pub linked_tasks: Vec<String>,
    #[serde(default)]
    pub stale: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stale_reason: Option<String>,
    #[serde(default = "default_now")]
    pub updated_at: DateTime<Utc>,
}

/// Status of a requirement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RequirementStatus {
    Pending,
    InProgress,
    Implemented,
    Verified,
    Failed,
}

impl std::fmt::Display for RequirementStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            RequirementStatus::Pending => "pending",
            RequirementStatus::InProgress => "in-progress",
            RequirementStatus::Implemented => "implemented",
            RequirementStatus::Verified => "verified",
            RequirementStatus::Failed => "failed",
        };
        write!(f, "{}", s)
    }
}

impl RequirementStatus {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(RequirementStatus::Pending),
            "in-progress" | "in_progress" => Some(RequirementStatus::InProgress),
            "implemented" => Some(RequirementStatus::Implemented),
            "verified" => Some(RequirementStatus::Verified),
            "failed" => Some(RequirementStatus::Failed),
            _ => None,
        }
    }
}

/// Trace result showing the full chain from spec to code.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceResult {
    pub spec_id: String,
    pub spec_title: String,
    pub requirements: Vec<RequirementTrace>,
}

/// Trace for a single requirement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementTrace {
    pub requirement_id: String,
    pub requirement_title: String,
    pub status: RequirementStatus,
    pub linked_code: Vec<CodeLink>,
    pub linked_tests: Vec<String>,
    pub linked_tasks: Vec<String>,
    pub stale: bool,
    pub stale_reason: Option<String>,
}

/// A code file linked to a requirement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeLink {
    pub path: String,
    pub last_modified: Option<DateTime<Utc>>,
    pub is_stale: bool,
}

/// Coverage info for a spec.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecCoverage {
    pub total_requirements: usize,
    pub implemented: usize,
    pub verified: usize,
    pub stale: usize,
    pub coverage_percent: f64,
}

impl Default for Spec {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: String::new(),
            description: None,
            status: SpecStatus::Draft,
            priority: "medium".to_string(),
            requirements: Vec::new(),
            tags: Vec::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}

impl Spec {
    pub fn new(id: impl Into<String>, title: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            title: title.into(),
            description: None,
            status: SpecStatus::Draft,
            priority: "medium".into(),
            requirements: Vec::new(),
            tags: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a requirement to the spec.
    pub fn add_requirement(&mut self, req: Requirement) -> bool {
        if self.requirements.iter().any(|r| r.id == req.id) {
            return false;
        }
        self.requirements.push(req);
        self.updated_at = Utc::now();
        true
    }

    /// Remove a requirement by ID.
    pub fn remove_requirement(&mut self, req_id: &str) -> bool {
        let before = self.requirements.len();
        self.requirements.retain(|r| r.id != req_id);
        self.requirements.len() != before
    }

    /// Get a requirement by ID.
    pub fn get_requirement(&self, req_id: &str) -> Option<&Requirement> {
        self.requirements.iter().find(|r| r.id == req_id)
    }

    /// Get a mutable requirement by ID.
    pub fn get_requirement_mut(&mut self, req_id: &str) -> Option<&mut Requirement> {
        self.requirements.iter_mut().find(|r| r.id == req_id)
    }

    /// Calculate coverage for this spec.
    pub fn coverage(&self) -> SpecCoverage {
        let total = self.requirements.len();
        if total == 0 {
            return SpecCoverage {
                total_requirements: 0,
                implemented: 0,
                verified: 0,
                stale: 0,
                coverage_percent: 100.0,
            };
        }
        let implemented = self
            .requirements
            .iter()
            .filter(|r| r.status == RequirementStatus::Implemented || r.status == RequirementStatus::Verified)
            .count();
        let verified = self
            .requirements
            .iter()
            .filter(|r| r.status == RequirementStatus::Verified)
            .count();
        let stale = self.requirements.iter().filter(|r| r.stale).count();
        SpecCoverage {
            total_requirements: total,
            implemented,
            verified,
            stale,
            coverage_percent: (implemented as f64 / total as f64) * 100.0,
        }
    }
}

impl Requirement {
    pub fn new(id: impl Into<String>, title: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            description: None,
            status: RequirementStatus::Pending,
            acceptance_criteria: Vec::new(),
            linked_code: Vec::new(),
            linked_tests: Vec::new(),
            linked_tasks: Vec::new(),
            stale: false,
            stale_reason: None,
            updated_at: Utc::now(),
        }
    }

    /// Link a code file to this requirement.
    pub fn link_code(&mut self, path: &str) -> bool {
        if self.linked_code.iter().any(|p| p == path) {
            return false;
        }
        self.linked_code.push(path.into());
        true
    }

    /// Unlink a code file from this requirement.
    pub fn unlink_code(&mut self, path: &str) -> bool {
        let before = self.linked_code.len();
        self.linked_code.retain(|p| p != path);
        self.linked_code.len() != before
    }

    /// Link a test file to this requirement.
    pub fn link_test(&mut self, path: &str) -> bool {
        if self.linked_tests.iter().any(|p| p == path) {
            return false;
        }
        self.linked_tests.push(path.into());
        true
    }

    /// Link a task to this requirement.
    pub fn link_task(&mut self, task_id: &str) -> bool {
        if self.linked_tasks.iter().any(|t| t == task_id) {
            return false;
        }
        self.linked_tasks.push(task_id.into());
        true
    }

    /// Mark this requirement as stale.
    pub fn mark_stale(&mut self, reason: &str) {
        self.stale = true;
        self.stale_reason = Some(reason.into());
    }

    /// Clear stale status.
    pub fn clear_stale(&mut self) {
        self.stale = false;
        self.stale_reason = None;
    }
}

fn default_spec_status() -> SpecStatus {
    SpecStatus::Draft
}

fn default_req_status() -> RequirementStatus {
    RequirementStatus::Pending
}

fn default_priority() -> String {
    "medium".into()
}

fn default_now() -> DateTime<Utc> {
    Utc::now()
}
