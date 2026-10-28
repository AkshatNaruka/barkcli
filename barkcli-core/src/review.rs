//! Persistent review state for a run or card.
//!
//! Review state is deliberately local and content-light: viewed files, line
//! comments, and resolution status. The diff itself stays in git, so review
//! state can be replayed against a new head as long as the file still exists.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;

pub const REVIEW_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
    pub body: String,
    pub author: String,
    #[serde(default)]
    pub resolved: bool,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFile {
    pub path: String,
    pub viewed: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewState {
    pub version: u32,
    pub id: String,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub files: BTreeMap<String, ReviewFile>,
    #[serde(default)]
    pub comments: Vec<ReviewComment>,
}

impl ReviewState {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            version: REVIEW_VERSION,
            id: id.into(),
            updated_at: Utc::now(),
            files: BTreeMap::new(),
            comments: Vec::new(),
        }
    }

    pub fn mark_viewed(&mut self, path: &str, viewed: bool) {
        self.files.insert(
            path.to_string(),
            ReviewFile {
                path: path.to_string(),
                viewed,
                updated_at: Utc::now(),
            },
        );
        self.updated_at = Utc::now();
    }

    pub fn add_comment(
        &mut self,
        path: &str,
        line: Option<u32>,
        side: Option<String>,
        body: &str,
        author: &str,
        run_id: Option<String>,
    ) -> Result<ReviewComment> {
        let body = body.trim();
        if body.is_empty() {
            return Err(anyhow!("review comment cannot be empty"));
        }
        let now = Utc::now();
        let comment = ReviewComment {
            id: format!("rc_{}", uuid::Uuid::new_v4().simple()),
            path: path.to_string(),
            line,
            side,
            body: body.to_string(),
            author: author.to_string(),
            resolved: false,
            created_at: now,
            run_id,
        };
        self.comments.push(comment.clone());
        self.updated_at = now;
        Ok(comment)
    }

    pub fn resolve_comment(&mut self, comment_id: &str, resolved: bool) -> Result<ReviewComment> {
        let comment = self
            .comments
            .iter_mut()
            .find(|comment| comment.id == comment_id)
            .ok_or_else(|| anyhow!("review comment '{}' not found", comment_id))?;
        comment.resolved = resolved;
        self.updated_at = Utc::now();
        Ok(comment.clone())
    }

    pub fn delete_comment(&mut self, comment_id: &str) -> Result<()> {
        let before = self.comments.len();
        self.comments.retain(|comment| comment.id != comment_id);
        if self.comments.len() == before {
            return Err(anyhow!("review comment '{}' not found", comment_id));
        }
        self.updated_at = Utc::now();
        Ok(())
    }

    pub fn open_comments(&self) -> Vec<&ReviewComment> {
        self.comments
            .iter()
            .filter(|comment| !comment.resolved)
            .collect()
    }

    /// Stable text used by request-changes and ask-agent prompts.
    pub fn prompt_digest(&self) -> String {
        let mut out = String::new();
        for comment in self.open_comments() {
            let location = match comment.line {
                Some(line) => format!("{}:{}", comment.path, line),
                None => comment.path.clone(),
            };
            out.push_str(&format!("- {location}: {}", comment.body));
            out.push('\n');
        }
        out
    }
}

#[derive(Debug, Clone)]
pub struct ReviewStore {
    dir: PathBuf,
}

impl ReviewStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn from_project() -> Result<Self> {
        Ok(Self::new(find_board_dir()?.join("reviews")))
    }

    pub fn board_dir(&self) -> &Path {
        self.dir.parent().unwrap_or(&self.dir)
    }

    pub fn load(&self, id: &str) -> Result<ReviewState> {
        let path = self.path_for(id)?;
        if !path.exists() {
            return Ok(ReviewState::new(id));
        }
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read review {}", path.display()))?;
        let mut state: ReviewState = serde_json::from_str(&content)
            .with_context(|| format!("failed to parse review {}", path.display()))?;
        if state.id.is_empty() {
            state.id = id.to_string();
        }
        Ok(state)
    }

    pub fn save(&self, state: &ReviewState) -> Result<()> {
        let path = self.path_for(&state.id)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec_pretty(state)?;
        let tmp = path.with_extension("json.tmp");
        {
            let mut file = fs::File::create(&tmp)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }
        fs::rename(&tmp, &path)?;
        Ok(())
    }

    fn path_for(&self, id: &str) -> Result<PathBuf> {
        let slug = crate::util::slug::to_slug(id);
        if slug.is_empty() {
            return Err(anyhow!("review id is required"));
        }
        Ok(self.dir.join(format!("{slug}.json")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn review_roundtrips_with_comments_and_viewed_files() {
        let dir = std::env::temp_dir().join(format!(
            "bark_review_{}",
            uuid::Uuid::new_v4().simple()
        ));
        let store = ReviewStore::new(&dir);
        let mut state = store.load("run-1").unwrap();
        state.mark_viewed("src/lib.rs", true);
        let comment = state
            .add_comment(
                "src/lib.rs",
                Some(12),
                Some("new".into()),
                "Handle the empty case",
                "you",
                Some("run-1".into()),
            )
            .unwrap();
        store.save(&state).unwrap();

        let loaded = store.load("run-1").unwrap();
        assert!(loaded.files["src/lib.rs"].viewed);
        assert_eq!(loaded.comments.len(), 1);
        assert!(loaded.prompt_digest().contains("src/lib.rs:12"));
        assert_eq!(loaded.comments[0].id, comment.id);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn resolving_and_deleting_comments_is_persistent() {
        let dir = std::env::temp_dir().join(format!(
            "bark_review_{}",
            uuid::Uuid::new_v4().simple()
        ));
        let store = ReviewStore::new(&dir);
        let mut state = ReviewState::new("card");
        let first = state
            .add_comment("a.rs", None, None, "first", "you", None)
            .unwrap();
        state
            .add_comment("b.rs", None, None, "second", "you", None)
            .unwrap();
        store.save(&state).unwrap();

        let mut loaded = store.load("card").unwrap();
        assert_eq!(loaded.open_comments().len(), 2);
        loaded.resolve_comment(&first.id, true).unwrap();
        store.save(&loaded).unwrap();
        let mut loaded = store.load("card").unwrap();
        assert_eq!(loaded.open_comments().len(), 1);
        loaded.delete_comment(&first.id).unwrap();
        store.save(&loaded).unwrap();
        assert_eq!(store.load("card").unwrap().comments.len(), 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn blank_comments_are_rejected() {
        let mut state = ReviewState::new("run");
        assert!(state
            .add_comment("a.rs", None, None, "   ", "you", None)
            .is_err());
    }
}
