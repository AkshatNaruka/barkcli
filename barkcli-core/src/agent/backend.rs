use std::fs::OpenOptions;
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{Context, Result};

use super::session::SessionBackend;

/// A coding-agent runtime that can be spawned detached into a worktree.
///
/// Mirrors the single-shot invocations in `barkcli-cli/src/listener.rs`
/// (`opencode --prompt`, `claude --print`) but runs detached with all
/// output captured to a transcript file.
pub trait Backend {
    fn backend(&self) -> SessionBackend;
    fn detect(&self) -> bool;
    /// Build the command (without stdio/cwd) for the given prompt.
    fn command(&self, prompt: &str) -> Command;
    /// Spawn detached in `cwd`, capturing stdout+stderr to `transcript`.
    /// Returns the child pid.
    fn spawn(&self, prompt: &str, cwd: &Path, transcript: &Path) -> Result<u32> {
        if let Some(parent) = transcript.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(transcript)
            .context("Failed to open transcript file")?;
        let err_file = file.try_clone().context("Failed to clone transcript handle")?;
        let mut child = self
            .command(prompt)
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::from(file))
            .stderr(Stdio::from(err_file))
            .spawn()
            .context(format!("Failed to spawn {}", self.backend().display_name()))?;
        let pid = child.id();
        // Detach: forget the handle so we don't wait on it. Liveness is
        // tracked via pid + heartbeats + transcript mtime.
        std::mem::forget(child);
        Ok(pid)
    }
}

pub struct OpencodeBackend;
pub struct ClaudeCodeBackend;
pub struct CodexBackend;
pub struct HumanBackend;

impl Backend for OpencodeBackend {
    fn backend(&self) -> SessionBackend {
        SessionBackend::Opencode
    }
    fn detect(&self) -> bool {
        which("opencode")
    }
    fn command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new("opencode");
        cmd.arg("--prompt").arg(prompt);
        cmd
    }
}

impl Backend for ClaudeCodeBackend {
    fn backend(&self) -> SessionBackend {
        SessionBackend::ClaudeCode
    }
    fn detect(&self) -> bool {
        which("claude")
    }
    fn command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new("claude");
        cmd.arg("--print").arg(prompt);
        cmd
    }
}

impl Backend for CodexBackend {
    fn backend(&self) -> SessionBackend {
        SessionBackend::Codex
    }
    fn detect(&self) -> bool {
        which("codex")
    }
    fn command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new("codex");
        cmd.arg("exec").arg(prompt);
        cmd
    }
}

impl Backend for HumanBackend {
    fn backend(&self) -> SessionBackend {
        SessionBackend::Human
    }
    fn detect(&self) -> bool {
        true
    }
    fn command(&self, _prompt: &str) -> Command {
        // Humans don't spawn processes; the prompt file is the handoff.
        // Return a no-op that exits immediately so spawn() stays total.
        let mut cmd = Command::new("true");
        cmd.arg("");
        cmd
    }
}

/// Resolve a backend by name, falling back to human (prompt file).
pub fn backend_for(name: &str) -> Box<dyn Backend> {
    match SessionBackend::parse(name) {
        Some(SessionBackend::Opencode) => Box::new(OpencodeBackend),
        Some(SessionBackend::ClaudeCode) => Box::new(ClaudeCodeBackend),
        Some(SessionBackend::Codex) => Box::new(CodexBackend),
        _ => Box::new(HumanBackend),
    }
}

/// Pick the best installed backend: opencode → claude → codex → human.
pub fn auto_backend() -> Box<dyn Backend> {
    for backend in [&OpencodeBackend as &dyn Backend, &ClaudeCodeBackend, &CodexBackend] {
        if backend.detect() {
            return backend_for(backend.backend().display_name());
        }
    }
    Box::new(HumanBackend)
}

/// True if a pid is still running (unix `kill -0`; always true elsewhere
/// so we never reap a live process by mistake on unsupported platforms).
pub fn pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // SAFETY: kill with sig 0 performs no action, only error checking.
        unsafe { libc_kill(pid) }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        true
    }
}

#[cfg(unix)]
fn libc_kill(pid: u32) -> bool {
    // Minimal FFI to avoid a libc dependency.
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    unsafe { kill(pid as i32, 0) == 0 }
}

/// Send SIGTERM (unix) to a spawned backend process.
pub fn kill_pid(pid: u32) -> Result<()> {
    #[cfg(unix)]
    {
        let out = Command::new("kill")
            .arg(pid.to_string())
            .output()
            .context("Failed to run kill")?;
        if !out.status.success() {
            anyhow::bail!("kill {} failed", pid);
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        anyhow::bail!("process kill not supported on this platform (pid {})", pid)
    }
}

fn which(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backend_for_fallback() {
        let b = backend_for("bogus-backend");
        assert_eq!(b.backend(), SessionBackend::Human);
        assert!(b.detect());
    }

    #[test]
    fn test_auto_backend_total() {
        // Always returns something usable.
        let b = auto_backend();
        let _ = b.backend().display_name();
    }

    #[test]
    fn test_opencode_command_shape() {
        let b = OpencodeBackend;
        let cmd = b.command("hello");
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args[0], "--prompt");
        assert_eq!(args[1], "hello");
    }
}
