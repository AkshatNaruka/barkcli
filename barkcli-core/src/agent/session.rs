use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Coding-agent backend that runs a session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionBackend {
    Opencode,
    ClaudeCode,
    Codex,
    Human,
}

impl SessionBackend {
    pub fn display_name(&self) -> &str {
        match self {
            SessionBackend::Opencode => "opencode",
            SessionBackend::ClaudeCode => "claude-code",
            SessionBackend::Codex => "codex",
            SessionBackend::Human => "human",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "opencode" => Some(SessionBackend::Opencode),
            "claude-code" | "claude" => Some(SessionBackend::ClaudeCode),
            "codex" => Some(SessionBackend::Codex),
            "human" => Some(SessionBackend::Human),
            _ => None,
        }
    }

    /// Detect which backends are installed on this machine.
    pub fn detect_available() -> Vec<SessionBackend> {
        let mut out = vec![SessionBackend::Human];
        for (name, backend) in [
            ("opencode", SessionBackend::Opencode),
            ("claude", SessionBackend::ClaudeCode),
            ("codex", SessionBackend::Codex),
        ] {
            if which(name) {
                out.push(backend);
            }
        }
        out
    }
}

fn which(cmd: &str) -> bool {
    std::process::Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Lifecycle of one agent session (F1: unit of agent life).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionStatus {
    Starting,
    Working,
    Idle,
    Done,
    Failed,
    Killed,
}

impl SessionStatus {
    pub fn display_name(&self) -> &str {
        match self {
            SessionStatus::Starting => "Starting",
            SessionStatus::Working => "Working",
            SessionStatus::Idle => "Idle",
            SessionStatus::Done => "Done",
            SessionStatus::Failed => "Failed",
            SessionStatus::Killed => "Killed",
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            SessionStatus::Done | SessionStatus::Failed | SessionStatus::Killed
        )
    }
}

/// One agent session: one task, one worktree, one branch, one backend process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub agent_id: String,
    pub task_id: Option<String>,
    pub backend: SessionBackend,
    pub worktree_path: Option<String>,
    pub branch: Option<String>,
    pub pid: Option<u32>,
    pub transcript_path: Option<String>,
    pub prompt_path: Option<String>,
    pub status: SessionStatus,
    pub started_at: DateTime<Utc>,
    pub last_heartbeat: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    pub notes: Vec<SessionNote>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionNote {
    pub at: DateTime<Utc>,
    pub author: String,
    pub text: String,
}

impl Session {
    pub fn new(agent_id: &str, backend: SessionBackend) -> Self {
        Self {
            id: format!("sess-{}", uuid::Uuid::new_v4()),
            agent_id: agent_id.to_string(),
            task_id: None,
            backend,
            worktree_path: None,
            branch: None,
            pid: None,
            transcript_path: None,
            prompt_path: None,
            status: SessionStatus::Starting,
            started_at: Utc::now(),
            last_heartbeat: Some(Utc::now()),
            ended_at: None,
            exit_code: None,
            notes: Vec::new(),
        }
    }

    pub fn heartbeat(&mut self) {
        self.last_heartbeat = Some(Utc::now());
        if self.status == SessionStatus::Starting {
            self.status = SessionStatus::Working;
        }
    }

    pub fn is_alive(&self, within_minutes: i64) -> bool {
        !self.status.is_terminal()
            && self
                .last_heartbeat
                .map(|t| Utc::now().signed_duration_since(t).num_minutes() < within_minutes)
                .unwrap_or(false)
    }

    pub fn add_note(&mut self, author: &str, text: &str) {
        self.notes.push(SessionNote {
            at: Utc::now(),
            author: author.to_string(),
            text: text.to_string(),
        });
    }

    pub fn finish(&mut self, status: SessionStatus, exit_code: Option<i32>) {
        self.status = status;
        self.exit_code = exit_code;
        self.ended_at = Some(Utc::now());
    }
}

/// Directory holding per-session state files: `.board/sessions/<id>.json`.
/// (The append-only JSONL log in the same dir is untouched.)
pub fn sessions_dir() -> Result<PathBuf> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let dir = board_dir.join("sessions");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir)
}

pub fn session_path(session_id: &str) -> Result<PathBuf> {
    Ok(sessions_dir()?.join(format!("{}.json", session_id)))
}

pub fn save_session(session: &Session) -> Result<()> {
    let path = session_path(&session.id)?;
    crate::util::lock::with_lock(&path, || {
        let json = serde_json::to_string_pretty(session)?;
        let tmp = path.with_extension(format!(
            "{}.tmp",
            path.extension().and_then(|e| e.to_str()).unwrap_or("json")
        ));
        std::fs::write(&tmp, &json).context("Failed to write tmp session")?;
        std::fs::rename(&tmp, &path).context("Failed to rename session")?;
        Ok(())
    })
}

pub fn load_session(session_id: &str) -> Result<Session> {
    let path = session_path(session_id)?;
    let json = std::fs::read_to_string(&path).context("Failed to read session")?;
    let session = serde_json::from_str(&json)?;
    Ok(session)
}

pub fn list_sessions() -> Result<Vec<Session>> {
    let dir = sessions_dir()?;
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).context("Failed to read sessions dir")?;
    for entry in entries.flatten() {
        let path: PathBuf = entry.path();
        let is_state_file = path.extension().and_then(|e| e.to_str()) == Some("json")
            && path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("sess-"))
                .unwrap_or(false);
        if !is_state_file {
            continue;
        }
        if let Ok(json) = std::fs::read_to_string(&path) {
            if let Ok(session) = serde_json::from_str::<Session>(&json) {
                out.push(session);
            }
        }
    }
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(out)
}

/// Resolve a full session id from an exact id or unambiguous prefix.
/// Sessions are displayed truncated (`sess-9e0e1742`), so CLI/MCP callers
/// routinely pass short ids.
pub fn resolve_session_id(partial: &str) -> Result<String> {
    let dir = sessions_dir()?;
    let mut candidates = Vec::new();
    let entries = std::fs::read_dir(&dir).context("Failed to read sessions dir")?;
    for entry in entries.flatten() {
        let path = entry.path();
        // Only state files — transcripts (*.log) and prompts (*.prompt.md) share stems.
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Some(name) = path.file_stem().and_then(|n| n.to_str()).map(|s| s.to_string()) {
            if name == partial || name.starts_with(partial) {
                candidates.push(name);
            }
        }
    }
    match candidates.len() {
        0 => anyhow::bail!("session '{}' not found", partial),
        1 => Ok(candidates.remove(0)),
        _ => anyhow::bail!(
            "session '{}' is ambiguous: {}",
            partial,
            candidates.join(", ")
        ),
    }
}

pub fn remove_session(session_id: &str) -> Result<()> {
    let path = session_path(session_id)?;
    if path.exists() {
        std::fs::remove_file(&path).context("Failed to remove session")?;
    }
    Ok(())
}

/// Read the tail of a session transcript (last N lines).
pub fn transcript_tail(session: &Session, lines: usize) -> Vec<String> {
    let Some(ref tpath) = session.transcript_path else {
        return Vec::new();
    };
    let content = std::fs::read_to_string(Path::new(tpath)).unwrap_or_default();
    let all: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    if all.len() <= lines {
        all
    } else {
        all[all.len() - lines..].to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_lifecycle() {
        let mut s = Session::new("agent-1", SessionBackend::Opencode);
        assert_eq!(s.status, SessionStatus::Starting);
        assert!(s.is_alive(5));

        s.heartbeat();
        assert_eq!(s.status, SessionStatus::Working);

        s.add_note("agent-1", "started work");
        assert_eq!(s.notes.len(), 1);

        s.finish(SessionStatus::Done, Some(0));
        assert!(s.status.is_terminal());
        assert!(!s.is_alive(5));
    }

    #[test]
    fn test_backend_parse() {
        assert_eq!(
            SessionBackend::parse("opencode"),
            Some(SessionBackend::Opencode)
        );
        assert_eq!(
            SessionBackend::parse("claude"),
            Some(SessionBackend::ClaudeCode)
        );
        assert_eq!(SessionBackend::parse("bogus"), None);
    }
}
