use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Card {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub column: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    #[serde(default)]
    pub checklist: Vec<ChecklistItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remind_at: Option<String>,
    #[serde(default)]
    pub comments: Vec<Comment>,
    /// Legacy single blocked-by reference (kept for backwards compat).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<String>,
    #[serde(default)]
    pub attachments: Vec<String>,
    /// Work item links: parent/child/related/blocked-by.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<CardLink>,
    /// Acceptance criteria (done conditions for the work item).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub acceptance_criteria: Vec<String>,
    /// Story points / effort estimate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<u32>,
    /// Area path (e.g. "frontend").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub area: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default = "default_now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "default_now")]
    pub updated_at: DateTime<Utc>,
}

impl Card {
    pub fn new(id: impl Into<String>, title: impl Into<String>, column: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            title: title.into(),
            description: None,
            column: column.into(),
            priority: "medium".into(),
            labels: Vec::new(),
            assignee: None,
            checklist: Vec::new(),
            due_date: None,
            remind_at: None,
            comments: Vec::new(),
            blocked_by: None,
            attachments: Vec::new(),
            links: Vec::new(),
            acceptance_criteria: Vec::new(),
            effort: None,
            area: None,
            pinned: false,
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a link, rejecting self-links and exact duplicates.
    pub fn add_link(&mut self, ty: LinkType, target: &str) -> bool {
        if target == self.id {
            return false;
        }
        if self.links.iter().any(|l| l.ty == ty && l.target == target) {
            return false;
        }
        self.links.push(CardLink { ty, target: target.into() });
        true
    }

    pub fn remove_link(&mut self, ty: LinkType, target: &str) -> bool {
        let before = self.links.len();
        self.links.retain(|l| !(l.ty == ty && l.target == target));
        self.links.len() != before
    }
}

/// Link type between cards — parent/child/related/blocked-by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LinkType {
    Parent,
    Child,
    Related,
    BlockedBy,
}

impl std::fmt::Display for LinkType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            LinkType::Parent => "parent",
            LinkType::Child => "child",
            LinkType::Related => "related",
            LinkType::BlockedBy => "blocked-by",
        };
        write!(f, "{}", s)
    }
}

impl LinkType {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "parent" => Some(LinkType::Parent),
            "child" => Some(LinkType::Child),
            "related" | "relates" | "relates-to" => Some(LinkType::Related),
            "blocked-by" | "blocked_by" | "block" => Some(LinkType::BlockedBy),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardLink {
    pub ty: LinkType,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub text: String,
    #[serde(default)]
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub author: String,
    pub text: String,
    pub at: DateTime<Utc>,
}

fn default_priority() -> String {
    "medium".into()
}

fn default_now() -> DateTime<Utc> {
    Utc::now()
}
