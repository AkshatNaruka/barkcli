//! Read-only local-agent chat.
//!
//! A chat turn is deliberately *not* a worktree run. It runs the selected
//! provider CLI in plan/read-only mode against the project root, streams the
//! response into the thread, and persists the provider session so the next
//! turn can resume the same conversation.
//!
//! Build work still goes through [`super::RunService`], where isolation, the
//! gate, and the merge train apply.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::event::StartRun;
use crate::repo;
use crate::storage::board_dir::find_board_dir;
use crate::threads::{self, ThreadEventKind};

/// The permission mode used for chat. Providers map `plan` to their read-only
/// or plan mode; they must never edit the project during a chat turn.
pub const CHAT_PERMISSION_MODE: &str = "plan";

const MAX_HISTORY_MESSAGES: usize = 16;
const MAX_HISTORY_CHARS: usize = 32_000;
const MAX_FILE_CHARS: usize = 24_000;
const MAX_ATTACHED_FILE_CHARS: usize = 72_000;
const SESSION_FILE: &str = "chat_sessions.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChatSession {
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub session_id: String,
}

impl ChatSession {
    pub fn matches(&self, provider: &str) -> bool {
        !self.session_id.trim().is_empty() && self.provider == provider
    }
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub card_id: String,
    pub text: String,
    pub provider: String,
    pub model: Option<String>,
    pub files: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct PreparedChat {
    pub turn_id: String,
    pub start: StartRun,
    pub session: ChatSession,
    pub card_id: String,
}

/// Build the provider prompt and start record for one read-only chat turn.
pub fn prepare_chat(request: &ChatRequest) -> Result<PreparedChat> {
    let root = repo::project_root()?;
    prepare_chat_at(&root, request, read_session(&request.card_id).ok().flatten())
}

fn prepare_chat_at(
    root: &Path,
    request: &ChatRequest,
    session: Option<ChatSession>,
) -> Result<PreparedChat> {
    let session = session.filter(|session| session.matches(&request.provider));
    let model = request
        .model
        .clone()
        .filter(|model| !model.trim().is_empty())
        .or_else(|| session.as_ref().and_then(|s| s.model.clone()));
    let provider_session_id = session.as_ref().map(|s| s.session_id.clone());
    let mut files = request.files.clone();
    for mention in extract_file_mentions(&request.text) {
        if !files.iter().any(|file| file == &mention) {
            files.push(mention);
        }
    }
    let prompt = build_prompt(root, request, &files)?;
    let turn_id = format!("chat_{}", uuid::Uuid::new_v4().simple());
    let start = StartRun {
        run_id: turn_id.clone(),
        thread_id: request.card_id.clone(),
        card_id: request.card_id.clone(),
        prompt,
        cwd: root.display().to_string(),
        provider: request.provider.clone(),
        model: model.clone(),
        role: Some("assistant".to_string()),
        agent_id: None,
        permission_mode: CHAT_PERMISSION_MODE.to_string(),
        provider_session_id,
        raw_log_path: None,
    };
    Ok(PreparedChat {
        turn_id,
        start,
        session: ChatSession {
            provider: request.provider.clone(),
            model,
            session_id: String::new(),
        },
        card_id: request.card_id.clone(),
    })
}

/// Pull `@path` tokens out of a message so quick-open can hand a concrete file
/// to the read-only chat. Only repo-relative paths are considered.
fn extract_file_mentions(text: &str) -> Vec<String> {
    let mut files = Vec::new();
    for token in text.split_whitespace() {
        let Some(raw) = token.strip_prefix('@') else {
            continue;
        };
        let raw = raw.trim_matches(|c: char| {
            matches!(c, ',' | ';' | ':' | ')' | ']' | '}' | '"' | '\'' | '`')
        });
        if raw.is_empty() || raw.starts_with('@') {
            continue;
        }
        if raw.ends_with('.') {
            continue;
        }
        if !raw.contains('/') && !raw.contains('.') {
            continue;
        }
        if let Ok(normalized) = repo::normalize_relative(raw) {
            if normalized != "." && !files.contains(&normalized) {
                files.push(normalized);
            }
        }
    }
    files
}

fn build_prompt(root: &Path, request: &ChatRequest, files: &[String]) -> Result<String> {
    let mut prompt = String::new();
    prompt.push_str(&format!(
        "You are Bark, a read-only coding assistant working in the project at `{}`.\n\n",
        root.display()
    ));
    prompt.push_str(
        "Answer the user's question directly. Use the repository tools to inspect code and cite concrete files.\n\
         Never edit files, create commits, run destructive commands, or merge. If the user asks for a code change, \
         explain the change and tell them to switch to Build mode, where Bark gives the work an isolated worktree and \
         a test gate.\n\n",
    );

    let history = history_prompt(&request.card_id, &request.text);
    if !history.is_empty() {
        prompt.push_str("## Conversation so far\n\n");
        prompt.push_str(&history);
        prompt.push_str("\n\n");
    }

    let attachments = attachments_prompt(root, files)?;
    if !attachments.is_empty() {
        prompt.push_str("## Attached files\n\n");
        prompt.push_str(&attachments);
        prompt.push_str("\n\n");
    }

    prompt.push_str("## Current request\n\n");
    prompt.push_str(request.text.trim());
    prompt.push('\n');
    Ok(prompt)
}

/// Compact the thread into a prompt without replaying tool noise. The current
/// user message is omitted so the provider sees it exactly once, under the
/// current-request heading.
fn history_prompt(card_id: &str, current_text: &str) -> String {
    let mut events = threads::read_events(card_id).unwrap_or_default();
    let current = current_text.trim();
    if events
        .last()
        .map(|event| event.kind == ThreadEventKind::User && event.text.trim() == current)
        .unwrap_or(false)
    {
        events.pop();
    }
    events.retain(|event| {
        matches!(
            event.kind,
            ThreadEventKind::User | ThreadEventKind::Assistant
        ) && !event.text.trim().is_empty()
    });
    if events.len() > MAX_HISTORY_MESSAGES {
        events = events.split_off(events.len() - MAX_HISTORY_MESSAGES);
    }
    let mut rendered = String::new();
    for event in events {
        let role = if event.kind == ThreadEventKind::User {
            "User"
        } else {
            "Bark"
        };
        let text = event.text.trim();
        let line = format!("{role}: {text}\n\n");
        if rendered.len() + line.len() > MAX_HISTORY_CHARS {
            break;
        }
        rendered.push_str(&line);
    }
    rendered.trim().to_string()
}

fn attachments_prompt(root: &Path, files: &[String]) -> Result<String> {
    let mut rendered = String::new();
    let mut budget = MAX_ATTACHED_FILE_CHARS;
    for relative in files {
        if budget == 0 {
            break;
        }
        let normalized = match repo::normalize_relative(relative) {
            Ok(path) if path != "." => path,
            _ => continue,
        };
        let file = match repo::read_file(root, &normalized, MAX_FILE_CHARS.min(budget)) {
            Ok(file) if !file.binary => file,
            _ => continue,
        };
        let body: String = file.content.chars().take(budget).collect();
        budget = budget.saturating_sub(body.len());
        rendered.push_str(&format!("### `{}`\n\n```text\n{}\n```\n\n", file.path, body));
    }
    Ok(rendered.trim().to_string())
}

pub fn session_path(board_dir: &Path) -> PathBuf {
    board_dir.join(SESSION_FILE)
}

pub fn read_session_at(board_dir: &Path, card_id: &str) -> Result<Option<ChatSession>> {
    let path = session_path(board_dir);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let sessions: HashMap<String, ChatSession> = serde_json::from_str(&content).unwrap_or_default();
    Ok(sessions.get(card_id).cloned())
}

pub fn write_session_at(board_dir: &Path, card_id: &str, session: &ChatSession) -> Result<()> {
    let path = session_path(board_dir);
    let mut sessions: HashMap<String, ChatSession> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    } else {
        HashMap::new()
    };
    sessions.insert(card_id.to_string(), session.clone());
    let content = serde_json::to_string_pretty(&sessions)?;
    std::fs::write(&path, content)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

fn read_session(card_id: &str) -> Result<Option<ChatSession>> {
    let board_dir = find_board_dir()?;
    read_session_at(&board_dir, card_id)
}

pub fn write_session(card_id: &str, session: &ChatSession) -> Result<()> {
    let board_dir = find_board_dir()?;
    write_session_at(&board_dir, card_id, session)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_round_trips_and_is_scoped_by_card() {
        let dir = std::env::temp_dir().join(format!("bark-chat-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let session = ChatSession {
            provider: "opencode".into(),
            model: Some("anthropic/claude-opus-4-5".into()),
            session_id: "ses_123".into(),
        };
        write_session_at(&dir, "card-a", &session).unwrap();
        assert_eq!(read_session_at(&dir, "card-a").unwrap(), Some(session.clone()));
        assert_eq!(read_session_at(&dir, "card-b").unwrap(), None);
        assert!(session.matches("opencode"));
        assert!(!session.matches("claude-code"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prompt_includes_read_only_contract_and_current_request() {
        let dir = std::env::temp_dir().join(format!("bark-chat-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let request = ChatRequest {
            card_id: "card-a".into(),
            text: "Where is the auth middleware?".into(),
            provider: "opencode".into(),
            model: None,
            files: vec![],
        };
        let prompt = build_prompt(&dir, &request, &[]).unwrap();
        assert!(prompt.contains("read-only coding assistant"));
        assert!(prompt.contains("Never edit files"));
        assert!(prompt.contains("Where is the auth middleware?"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn attachment_paths_cannot_escape_the_project() {
        let dir = std::env::temp_dir().join(format!("bark-chat-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(attachments_prompt(&dir, &["../secret".into()]).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_mentions_are_extracted_and_sanitized() {
        let mentions = extract_file_mentions(
            "Look at @web/src/App.tsx, @src/lib.rs and @../secret plus @plainword.",
        );
        assert_eq!(mentions, vec!["web/src/App.tsx", "src/lib.rs"]);
    }
}
