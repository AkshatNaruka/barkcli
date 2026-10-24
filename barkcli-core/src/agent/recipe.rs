//! Per-backend launch recipes and stream parsing for the autonomy runner.
//!
//! Each coding-agent CLI has its own headless invocation shape and, for the
//! ones that stream JSON, its own completion event. The runner needs ONE
//! contract: given a backend, launch it with a prompt, watch only valid
//! transcript lines for a terminal verdict, and otherwise rely on exit code
//! + acceptance gates.
//!
//! Recipes verified against vendor docs (Oct 2026):
//! - Claude Code: `claude -p "<prompt>" --output-format stream-json --verbose`
//!   — final line is a `result` event ({"subtype":"success","is_error":false,..}).
//!   Unattended writes need `--permission-mode acceptEdits` (+ allowed tools).
//! - Codex: `codex exec --json "..."` — JSONL: thread.started, turn.*,
//!   item.*, `turn.completed` / `turn.failed` / `error`. Writing files needs
//!   `--sandbox workspace-write`; exec refuses non-git dirs without
//!   `--skip-git-repo-check`.
//! - OpenCode: `opencode run "<prompt>" --auto` — plain text output; verdict
//!   comes from exit code + gates (its `--format json` event shape is left
//!   unparsed in this revision on purpose).

use std::process::Command;

use super::session::SessionBackend;

/// Terminal verdict parsed from the transcript stream. `None` = keep watching.
#[derive(Debug, Clone, PartialEq)]
pub enum AgentVerdict {
    /// A completion event concluded successfully (carries the summary text).
    Ok(String),
    /// A failure/cancel event.
    Failed(String),
}

/// How the backend streams output (drives verdict parsing; the watcher
/// always tees every byte to the transcript file regardless).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Stream {
    /// Claude Code JSONL — `{"type":"result",...}` last.
    ClaudeJsonl,
    /// Codex JSONL — `{"type":"turn.completed"|"turn.failed",...}`.
    CodexJsonl,
    /// Plain text (OpenCode default; verdict comes from exit code).
    Plain,
}

pub struct Recipe {
    pub backend: SessionBackend,
    pub stream: Stream,
}

impl Recipe {
    pub fn for_backend(backend: SessionBackend) -> Self {
        let stream = match backend {
            SessionBackend::ClaudeCode => Stream::ClaudeJsonl,
            SessionBackend::Codex => Stream::CodexJsonl,
            _ => Stream::Plain,
        };
        Self { backend, stream }
    }

    /// Build the headless command. `cwd` is the caller's job (`current_dir`).
    pub fn command(&self, prompt: &str) -> Command {
        let mut cmd = match self.backend {
            SessionBackend::Opencode => {
                let mut c = Command::new("opencode");
                c.arg("run").arg(prompt).arg("--auto");
                c
            }
            SessionBackend::ClaudeCode => {
                let mut c = Command::new("claude");
                c.arg("-p")
                    .arg(prompt)
                    .arg("--output-format")
                    .arg("stream-json")
                    .arg("--verbose")
                    .arg("--permission-mode")
                    .arg("acceptEdits")
                    .arg("--allowedTools")
                    .arg("Read,Edit,Bash");
                c
            }
            SessionBackend::Codex => {
                let mut c = Command::new("codex");
                c.arg("exec")
                    .arg("--json")
                    .arg("--sandbox")
                    .arg("workspace-write")
                    .arg("--skip-git-repo-check")
                    .arg(prompt);
                c
            }
            _ => Command::new("true"),
        };
        // Agents must not block on stdin (some CLIs interpret piped stdin).
        cmd.stdin(std::process::Stdio::null());
        cmd
    }

    /// Parse one transcript line for a terminal verdict.
    pub fn stream_event(&self, line: &str) -> Option<AgentVerdict> {
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with('{') {
            return None;
        }
        let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            return None;
        };
        let ty = json.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match self.stream {
            Stream::ClaudeJsonl => {
                if ty != "result" {
                    return None;
                }
                let is_error = json
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let summary = json
                    .get("result")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .chars()
                    .take(300)
                    .collect::<String>();
                Some(if is_error {
                    AgentVerdict::Failed(summary)
                } else {
                    AgentVerdict::Ok(summary)
                })
            }
            Stream::CodexJsonl => match ty {
                "turn.completed" => Some(AgentVerdict::Ok("codex turn completed".into())),
                "turn.failed" | "error" => {
                    let msg = json
                        .get("message")
                        .and_then(|v| v.as_str())
                        .or_else(|| json.get("error").and_then(|v| v.as_str()))
                        .unwrap_or("codex turn failed");
                    Some(AgentVerdict::Failed(msg.chars().take(300).collect()))
                }
                _ => None,
            },
            Stream::Plain => None,
        }
    }
}

/// Claude-style run prompts are getting long; single-arg still safe till
/// ARG_MAX, but enforce a cap and route giant prompts to a file already
/// written by the runner.
pub(crate) const MAX_PROMPT_ARG_BYTES: usize = 120_000;

/// Validate a prompt is safe to hand as a single CLI argument.
pub fn prompt_arg_ok(prompt: &str) -> bool {
    prompt.len() <= MAX_PROMPT_ARG_BYTES
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_result_event_yields_verdict() {
        let r = Recipe::for_backend(SessionBackend::ClaudeCode);
        assert_eq!(r.stream, Stream::ClaudeJsonl);
        assert_eq!(r.stream_event(r#"{"type":"system","subtype":"init"}"#), None);
        let ok = r
            .stream_event(
                r#"{"type":"result","subtype":"success","is_error":false,"result":"did it"}"#,
            )
            .unwrap();
        assert_eq!(ok, AgentVerdict::Ok("did it".to_string()));
        let err = r
            .stream_event(
                r#"{"type":"result","subtype":"error_during_execution","is_error":true,"result":"boom"}"#,
            )
            .unwrap();
        assert_eq!(err, AgentVerdict::Failed("boom".to_string()));
    }

    #[test]
    fn codex_turn_events_yield_verdicts() {
        let r = Recipe::for_backend(SessionBackend::Codex);
        assert_eq!(r.stream, Stream::CodexJsonl);
        assert_eq!(
            r.stream_event(r#"{"type":"turn.started"}"#),
            None
        );
        assert_eq!(
            r.stream_event(r#"{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"done"}}"#),
            None
        );
        assert_eq!(
            r.stream_event(r#"{"type":"turn.completed","usage":{"input_tokens":10}}"#),
            Some(AgentVerdict::Ok("codex turn completed".into()))
        );
        assert_eq!(
            r.stream_event(r#"{"type":"turn.failed","message":"model hit a wall"}"#),
            Some(AgentVerdict::Failed("model hit a wall".into()))
        );
        assert_eq!(
            r.stream_event(r#"{"type":"error","message":"quota exceeded"}"#),
            Some(AgentVerdict::Failed("quota exceeded".into()))
        );
    }

    #[test]
    fn plain_stream_never_parses_verdicts() {
        let r = Recipe::for_backend(SessionBackend::Opencode);
        assert_eq!(r.stream, Stream::Plain);
        assert_eq!(r.stream_event(r#"{"type":"result","is_error":false}"#), None);
    }

    #[test]
    fn commands_carry_headless_flags() {
        let claude = Recipe::for_backend(SessionBackend::ClaudeCode).command("hi");
        let words = format!("{:?}", claude);
        assert!(words.contains("stream-json"), "{words}");

        let codex = Recipe::for_backend(SessionBackend::Codex).command("hi");
        assert!(format!("{:?}", codex).contains("workspace-write"));

        let opencode = Recipe::for_backend(SessionBackend::Opencode).command("hi");
        assert!(format!("{:?}", opencode).contains("opencode"));
    }

    #[test]
    fn prompt_arg_cap() {
        assert!(prompt_arg_ok("normal"));
        let big = "x".repeat(MAX_PROMPT_ARG_BYTES + 1);
        assert!(!prompt_arg_ok(&big));
    }
}
