use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use anyhow::{anyhow, Context, Result};
use serde_json::Value;

use super::event::{RunOutcome, RuntimeEvent, StartRun};
use super::provider::{
    EventSink, ProviderAdapter, ProviderCapabilities, ProviderStatus, RunHandle,
};

fn is_installed(command: &str) -> bool {
    #[cfg(windows)]
    let lookup = "where";
    #[cfg(not(windows))]
    let lookup = "which";
    Command::new(lookup)
        .arg(command)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

fn version_of(command: &str) -> Option<String> {
    let output = Command::new(command).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text.lines().next().unwrap_or(&text).to_string())
    }
}

fn json_command(command: &str, args: &[&str]) -> Option<Value> {
    let output = Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

/// Reads the real local credential state. `None` means we genuinely cannot
/// tell (command missing, older CLI, malformed output) rather than "ready".
fn auth_state(id: &str) -> Option<bool> {
    match id {
        "opencode" => {
            if let Some(value) = json_command("opencode", &["auth", "list", "--format", "json"]) {
                if let Some(authenticated) = parse_opencode_auth(&value) {
                    if authenticated {
                        return Some(true);
                    }
                }
            }
            // `auth list` can fail when the local service cannot bind a port.
            // Fall back to the credential store and environment the CLI uses.
            let home = std::env::var_os("HOME")
                .or_else(|| std::env::var_os("USERPROFILE"));
            if let Some(home) = home {
                let path = Path::new(&home)
                    .join(".local")
                    .join("share")
                    .join("opencode")
                    .join("auth.json");
                if let Ok(data) = std::fs::read(&path) {
                    if let Ok(value) = serde_json::from_slice::<Value>(&data) {
                        if value.as_object().is_some_and(|entries| !entries.is_empty()) {
                            return Some(true);
                        }
                    }
                }
            }
            let has_env = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"]
                .iter()
                .any(|key| std::env::var_os(key).is_some_and(|value| !value.is_empty()));
            Some(has_env)
        }
        "claude-code" => {
            let value = json_command("claude", &["auth", "status"])?;
            parse_claude_auth(&value)
        }
        "codex" => {
            let home = std::env::var_os("HOME")
                .or_else(|| std::env::var_os("USERPROFILE"))?;
            let path = Path::new(&home).join(".codex").join("auth.json");
            let size = std::fs::metadata(&path).ok().map(|meta| meta.len())?;
            Some(size > 2)
        }
        "human" => Some(true),
        _ => None,
    }
}

fn auth_metadata(id: &str) -> (Option<String>, Option<String>) {
    match id {
        "opencode" => (
            Some("opencode auth login".into()),
            Some("Run `opencode auth login` and choose a provider.".into()),
        ),
        "claude-code" => (
            Some("claude auth login".into()),
            Some("Run `claude auth login`, or set ANTHROPIC_API_KEY.".into()),
        ),
        "codex" => (
            Some("codex login".into()),
            Some("Run `codex login` to create ~/.codex/auth.json.".into()),
        ),
        _ => (None, None),
    }
}

fn status_for(
    id: &'static str,
    name: &'static str,
    command: &'static str,
    capabilities: ProviderCapabilities,
    detail: Option<String>,
) -> ProviderStatus {
    let available = is_installed(command);
    let (auth_command, auth_hint) = auth_metadata(id);
    ProviderStatus {
        id: id.to_string(),
        name: name.to_string(),
        available,
        version: if available { version_of(command) } else { None },
        command: command.to_string(),
        detail,
        authenticated: if available { auth_state(id) } else { None },
        auth_command,
        auth_hint,
        capabilities,
    }
}

fn opencode_models() -> Vec<String> {
    let output = match Command::new("opencode").arg("models").output() {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };
    parse_model_lines(&String::from_utf8_lossy(&output.stdout))
}

/// Parse the newline-delimited model ids a CLI prints. Blank lines, comments,
/// and duplicates are ignored; an empty result means free-form models.
fn parse_model_lines(stdout: &str) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    for line in stdout.lines() {
        let line = line.trim();
        if !line.is_empty() && !line.starts_with('#') {
            seen.insert(line.to_string());
        }
    }
    seen.into_iter().collect()
}

fn parse_opencode_auth(value: &Value) -> Option<bool> {
    value
        .as_array()
        .map(|entries| !entries.is_empty())
}

fn parse_claude_auth(value: &Value) -> Option<bool> {
    value
        .get("loggedIn")
        .or_else(|| value.get("logged_in"))
        .and_then(Value::as_bool)
}

fn opencode_capabilities() -> ProviderCapabilities {
    ProviderCapabilities {
        resume: true,
        stream_json: true,
        tool_events: true,
        approvals: false,
        questions: false,
        fork: true,
        usage: false,
        skills: true,
        mcp: true,
        headless: true,
    }
}

fn claude_models() -> Vec<String> {
    // Claude Code does not expose a machine-readable model list, so this is a
    // curated set of aliases and full names the CLI accepts. Keep it short;
    // the UI still accepts free-form model ids.
    vec![
        "opus".into(),
        "sonnet".into(),
        "haiku".into(),
        "fable".into(),
        "claude-opus-4-6".into(),
        "claude-sonnet-4-6".into(),
        "claude-haiku-4-5".into(),
        "claude-opus-4-5".into(),
        "claude-sonnet-4-5".into(),
        "claude-opus-4-1".into(),
    ]
}

fn codex_models() -> Vec<String> {
    vec![
        "gpt-5".into(),
        "gpt-5-mini".into(),
        "gpt-4.1".into(),
        "gpt-4.1-mini".into(),
        "o3".into(),
        "o4-mini".into(),
        "codex-mini-latest".into(),
    ]
}

fn claude_capabilities() -> ProviderCapabilities {
    ProviderCapabilities {
        resume: true,
        stream_json: true,
        tool_events: true,
        approvals: false,
        questions: false,
        fork: true,
        usage: true,
        skills: true,
        mcp: true,
        headless: true,
    }
}

fn codex_capabilities() -> ProviderCapabilities {
    ProviderCapabilities {
        resume: true,
        stream_json: true,
        tool_events: true,
        approvals: false,
        questions: false,
        fork: false,
        usage: false,
        skills: true,
        mcp: true,
        headless: true,
    }
}

fn opencode_session_id(run_id: &str) -> String {
    // OpenCode validates session IDs and requires the `ses` prefix.
    format!("ses_bark_{}", run_id.trim_start_matches("run_"))
}

pub struct OpencodeProvider;
impl OpencodeProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for OpencodeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for OpencodeProvider {
    fn id(&self) -> &'static str {
        "opencode"
    }
    fn name(&self) -> &'static str {
        "OpenCode"
    }
    fn command(&self) -> &'static str {
        "opencode"
    }
    fn probe(&self) -> ProviderStatus {
        status_for(
            self.id(),
            self.name(),
            self.command(),
            self.capabilities(),
            Some("Run `opencode auth login` if the probe fails.".into()),
        )
    }
    fn capabilities(&self) -> ProviderCapabilities {
        opencode_capabilities()
    }
    fn models(&self) -> Vec<String> {
        opencode_models()
    }
    fn start(&self, req: StartRun, sink: EventSink) -> Result<Box<dyn RunHandle>> {
        let mut cmd = Command::new("opencode");
        cmd.arg("run").arg("--format").arg("json");
        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            cmd.arg("--model").arg(model);
        }
        if let Some(session) = req.provider_session_id.as_deref() {
            cmd.arg("--session").arg(session);
        } else {
            cmd.arg("--session").arg(opencode_session_id(&req.run_id));
        }
        if req.permission_mode == "plan" {
            // Read-only conversation. OpenCode's built-in plan agent has no
            // edit permissions, which is exactly what an Ask turn needs.
            cmd.arg("--agent").arg("plan");
        } else if req.permission_mode == "auto" || req.permission_mode == "full" {
            cmd.arg("--auto");
        }
        cmd.arg(&req.prompt);
        spawn_cli(cmd, req, sink)
    }
}

pub struct ClaudeProvider;
impl ClaudeProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ClaudeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for ClaudeProvider {
    fn id(&self) -> &'static str {
        "claude-code"
    }
    fn name(&self) -> &'static str {
        "Claude Code"
    }
    fn command(&self) -> &'static str {
        "claude"
    }
    fn probe(&self) -> ProviderStatus {
        status_for(
            self.id(),
            self.name(),
            self.command(),
            self.capabilities(),
            Some("Run `claude` once to authenticate if the probe fails.".into()),
        )
    }
    fn capabilities(&self) -> ProviderCapabilities {
        claude_capabilities()
    }
    fn models(&self) -> Vec<String> {
        claude_models()
    }
    fn start(&self, req: StartRun, sink: EventSink) -> Result<Box<dyn RunHandle>> {
        let mut cmd = Command::new("claude");
        cmd.arg("--print")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .arg("--include-partial-messages");
        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            cmd.arg("--model").arg(model);
        }
        if let Some(session) = req.provider_session_id.as_deref() {
            cmd.arg("--resume").arg(session);
        } else {
            cmd.arg("--session-id").arg(uuid::Uuid::new_v4().to_string());
        }
        let mode = match req.permission_mode.as_str() {
            "full" => "bypassPermissions",
            "plan" => "plan",
            "manual" | "supervised" => "manual",
            _ => "acceptEdits",
        };
        cmd.arg("--permission-mode").arg(mode);
        cmd.arg(&req.prompt);
        spawn_cli(cmd, req, sink)
    }
}

pub struct CodexProvider;
impl CodexProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CodexProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for CodexProvider {
    fn id(&self) -> &'static str {
        "codex"
    }
    fn name(&self) -> &'static str {
        "Codex"
    }
    fn command(&self) -> &'static str {
        "codex"
    }
    fn probe(&self) -> ProviderStatus {
        status_for(
            self.id(),
            self.name(),
            self.command(),
            self.capabilities(),
            Some("Codex support is probe-first; the installed CLI's flags are authoritative.".into()),
        )
    }
    fn capabilities(&self) -> ProviderCapabilities {
        codex_capabilities()
    }
    fn models(&self) -> Vec<String> {
        codex_models()
    }
    fn start(&self, req: StartRun, sink: EventSink) -> Result<Box<dyn RunHandle>> {
        let mut cmd = Command::new("codex");
        cmd.arg("exec").arg("--json");
        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            cmd.arg("--model").arg(model);
        }
        // `codex exec` is read-only by default. Build runs need explicit
        // workspace-write access; chat/plan turns stay read-only.
        if req.permission_mode == "auto" || req.permission_mode == "full" {
            cmd.arg("--sandbox").arg("workspace-write");
        } else {
            cmd.arg("--sandbox").arg("read-only");
        }
        cmd.arg(&req.prompt);
        spawn_cli(cmd, req, sink)
    }
}

pub struct HumanProvider;
impl HumanProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for HumanProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for HumanProvider {
    fn id(&self) -> &'static str {
        "human"
    }
    fn name(&self) -> &'static str {
        "Human"
    }
    fn command(&self) -> &'static str {
        "human"
    }
    fn probe(&self) -> ProviderStatus {
        ProviderStatus {
            id: self.id().to_string(),
            name: self.name().to_string(),
            available: true,
            version: None,
            command: self.command().to_string(),
            detail: Some("Manual handoff: Bark writes the prompt and waits for a human.".into()),
            authenticated: Some(true),
            auth_command: None,
            auth_hint: None,
            capabilities: self.capabilities(),
        }
    }
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            resume: false,
            stream_json: false,
            tool_events: false,
            approvals: false,
            questions: false,
            fork: false,
            usage: false,
            skills: false,
            mcp: false,
            headless: false,
        }
    }
    fn start(&self, _req: StartRun, _sink: EventSink) -> Result<Box<dyn RunHandle>> {
        Err(anyhow!(
            "the human backend does not stream; use the prompt-file handoff path"
        ))
    }
}

struct CliHandle {
    run_id: String,
    pid: u32,
    interrupted: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<Result<RunOutcome>>>,
}

impl RunHandle for CliHandle {
    fn run_id(&self) -> &str {
        &self.run_id
    }
    fn pid(&self) -> Option<u32> {
        Some(self.pid)
    }
    fn send(&self, _input: &str) -> Result<()> {
        Ok(())
    }
    fn steer(&self, _text: &str) -> Result<()> {
        Ok(())
    }
    fn interrupt(&self) -> Result<()> {
        self.interrupted.store(true, Ordering::SeqCst);
        let _ = crate::agent::backend::kill_pid(self.pid);
        Ok(())
    }
    fn wait(mut self: Box<Self>) -> Result<RunOutcome> {
        match self.join.take() {
            Some(join) => join
                .join()
                .map_err(|_| anyhow!("provider thread panicked"))?,
            None => Err(anyhow!("provider already waited")),
        }
    }
}

fn spawn_cli(mut cmd: Command, req: StartRun, sink: EventSink) -> Result<Box<dyn RunHandle>> {
    cmd.current_dir(&req.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .with_context(|| format!("failed to start {}. Is it installed and authenticated?", req.provider))?;
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let raw_log = RawLog::new(req.raw_log_path.as_deref())?;
    let interrupted = Arc::new(AtomicBool::new(false));
    let interrupted_for_thread = interrupted.clone();
    let run_id = req.run_id.clone();
    let sink_for_wait = sink.clone();

    if let Some(stdout) = stdout {
        let sink = sink.clone();
        let raw_log = raw_log.clone();
        thread::Builder::new()
            .name(format!("{run_id}-stdout"))
            .spawn(move || read_stream(stdout, sink, raw_log, false))
            .ok();
    }
    if let Some(stderr) = stderr {
        let sink = sink.clone();
        let raw_log = raw_log.clone();
        thread::Builder::new()
            .name(format!("{run_id}-stderr"))
            .spawn(move || read_stream(stderr, sink, raw_log, true))
            .ok();
    }

    let join = thread::Builder::new()
        .name(format!("{run_id}-wait"))
        .spawn(move || -> Result<RunOutcome> {
            let status = child.wait().context("failed to wait for provider")?;
            let exit_code = status.code().unwrap_or(1);
            let was_interrupted = interrupted_for_thread.load(Ordering::SeqCst);
            if was_interrupted || exit_code == 130 {
                sink_for_wait(RuntimeEvent::Interrupted);
                return Ok(RunOutcome {
                    run_id,
                    exit_code: 130,
                    session_id: None,
                    interrupted: true,
                });
            }
            if exit_code == 0 {
                sink_for_wait(RuntimeEvent::Completed {
                    exit_code,
                    session_id: None,
                });
            } else {
                sink_for_wait(RuntimeEvent::Failed {
                    message: format!("provider exited with code {exit_code}"),
                    exit_code: Some(exit_code),
                });
            }
            Ok(RunOutcome {
                run_id,
                exit_code,
                session_id: None,
                interrupted: false,
            })
        })
        .map_err(|e| anyhow!("failed to spawn provider waiter: {e}"))?;

    Ok(Box::new(CliHandle {
        run_id: req.run_id,
        pid,
        interrupted,
        join: Some(join),
    }))
}

#[derive(Clone)]
struct RawLog(Option<Arc<Mutex<File>>>);

impl RawLog {
    fn new(path: Option<&str>) -> Result<Self> {
        let Some(path) = path else {
            return Ok(Self(None));
        };
        let path = Path::new(path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .with_context(|| format!("failed to open raw provider log {}", path.display()))?;
        Ok(Self(Some(Arc::new(Mutex::new(file)))))
    }

    fn write_line(&self, line: &str) {
        if let Some(file) = &self.0 {
            if let Ok(mut file) = file.lock() {
                let _ = writeln!(file, "{line}");
            }
        }
    }
}

fn read_stream<R: std::io::Read>(
    reader: R,
    sink: EventSink,
    raw_log: RawLog,
    is_stderr: bool,
) {
    let reader = BufReader::new(reader);
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        raw_log.write_line(trimmed);
        if is_stderr {
            sink(RuntimeEvent::Log {
                level: "stderr".into(),
                message: trimmed.to_string(),
            });
            continue;
        }
        for event in normalize_line(trimmed) {
            sink(event);
        }
    }
}

/// Provider JSON protocols differ. Normalize the common shapes and preserve
/// unknown lines as logs rather than dropping evidence.
pub fn normalize_line(line: &str) -> Vec<RuntimeEvent> {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return vec![RuntimeEvent::Log {
            level: "stdout".into(),
            message: line.to_string(),
        }];
    };
    let mut events = Vec::new();
    normalize_value(&value, &mut events);
    if events.is_empty() {
        events.push(RuntimeEvent::Log {
            level: "stdout".into(),
            message: line.to_string(),
        });
    }
    events
}

fn normalize_value(value: &Value, events: &mut Vec<RuntimeEvent>) {
    let kind = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_lowercase();

    if let Some(session_id) = session_id_of(value) {
        let subtype = value
            .get("subtype")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_lowercase();
        if kind.contains("init")
            || kind.contains("session")
            || kind.contains("thread.started")
            || kind == "system"
            || kind == "result"
            || kind == "step_start"
            || subtype == "init"
        {
            events.push(RuntimeEvent::Session { id: session_id });
        }
    }

    if let Some(usage) = value.get("usage").and_then(parse_usage) {
        events.push(usage);
    }
    if let Some(usage) = opencode_usage(value) {
        events.push(usage);
    }

    match kind.as_str() {
        "assistant" | "message" => {
            if let Some(message) = value.get("message") {
                normalize_message(message, events);
            } else {
                normalize_generic(value, events);
            }
        }
        "result" => {
            if let Some(result) = value.get("result").and_then(Value::as_str) {
                if !result.trim().is_empty() {
                    events.push(RuntimeEvent::Assistant {
                        text: result.to_string(),
                        partial: false,
                    });
                }
            }
            if value.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
                events.push(RuntimeEvent::Failed {
                    message: value
                        .get("result")
                        .and_then(Value::as_str)
                        .unwrap_or("provider reported an error")
                        .to_string(),
                    exit_code: None,
                });
            }
        }
        "text" | "content_block_delta" => {
            if let Some(text) = value
                .get("text")
                .or_else(|| value.get("delta"))
                .or_else(|| value.pointer("/part/text"))
                .and_then(Value::as_str)
            {
                events.push(RuntimeEvent::Assistant {
                    text: text.to_string(),
                    partial: true,
                });
            }
        }
        "tool_use" | "tool_call" => {
            if let Some(event) = parse_tool(value) {
                events.push(event);
            }
        }
        "error" => {
            let message = value
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| value.get("error").and_then(Value::as_str))
                .or_else(|| value.pointer("/error/message").and_then(Value::as_str))
                .unwrap_or("provider error")
                .to_string();
            events.push(RuntimeEvent::Failed {
                message,
                exit_code: None,
            });
        }
        "stream_event" => {
            if let Some(event) = value.get("event") {
                normalize_value(event, events);
            }
        }
        _ => normalize_generic(value, events),
    }
}

fn normalize_message(message: &Value, events: &mut Vec<RuntimeEvent>) {
    if let Some(text) = message.as_str() {
        if !text.trim().is_empty() {
            events.push(RuntimeEvent::Assistant {
                text: text.to_string(),
                partial: false,
            });
        }
        return;
    }
    if let Some(content) = message.get("content") {
        if let Some(text) = content.as_str() {
            if !text.trim().is_empty() {
                events.push(RuntimeEvent::Assistant {
                    text: text.to_string(),
                    partial: false,
                });
            }
        } else if let Some(blocks) = content.as_array() {
            for block in blocks {
                let block_type = block
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                match block_type {
                    "text" => {
                        if let Some(text) = block.get("text").and_then(Value::as_str) {
                            if !text.trim().is_empty() {
                                events.push(RuntimeEvent::Assistant {
                                    text: text.to_string(),
                                    partial: false,
                                });
                            }
                        }
                    }
                    "tool_use" | "tool_call" => {
                        if let Some(event) = parse_tool(block) {
                            events.push(event);
                        }
                    }
                    _ => normalize_generic(block, events),
                }
            }
        }
    } else {
        normalize_generic(message, events);
    }
}

fn normalize_generic(value: &Value, events: &mut Vec<RuntimeEvent>) {
    if let Some(text) = value
        .get("text")
        .or_else(|| value.get("delta"))
        .or_else(|| value.get("content"))
        .and_then(Value::as_str)
    {
        if !text.trim().is_empty() {
            let partial = value.get("delta").is_some()
                || value
                    .get("type")
                    .and_then(Value::as_str)
                    .map(|t| t.contains("delta"))
                    .unwrap_or(false);
            events.push(RuntimeEvent::Assistant {
                text: text.to_string(),
                partial,
            });
        }
    }
    if let Some(tool) = parse_tool(value) {
        events.push(tool);
    }
}

fn parse_tool(value: &Value) -> Option<RuntimeEvent> {
    let part = value.get("part");
    let name = value
        .get("name")
        .or_else(|| value.get("tool"))
        .or_else(|| value.get("tool_name"))
        .or_else(|| part.and_then(|part| part.get("tool")))
        .or_else(|| part.and_then(|part| part.get("name")))
        .and_then(Value::as_str)?;
    let input = value
        .get("input")
        .or_else(|| value.get("arguments"))
        .or_else(|| part.and_then(|part| part.pointer("/state/input")))
        .cloned()
        .unwrap_or(Value::Null);
    let output = value
        .get("output")
        .or_else(|| value.get("result"))
        .or_else(|| part.and_then(|part| part.pointer("/state/output")))
        .cloned();
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .or_else(|| part.and_then(|part| part.pointer("/state/status")).and_then(Value::as_str))
        .unwrap_or("completed");
    Some(RuntimeEvent::ToolCall {
        name: name.to_string(),
        input,
        output,
        status: status.to_string(),
    })
}

/// OpenCode 2 reports usage on `step_finish.part.tokens`.
fn opencode_usage(value: &Value) -> Option<RuntimeEvent> {
    let part = value.get("part")?;
    let tokens = part.get("tokens")?;
    Some(RuntimeEvent::Usage {
        input_tokens: tokens
            .get("input")
            .or_else(|| tokens.get("input_tokens"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: tokens
            .get("output")
            .or_else(|| tokens.get("output_tokens"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cached_input_tokens: tokens
            .pointer("/cache/read")
            .and_then(Value::as_u64),
        cost_usd: part.get("cost").and_then(Value::as_f64),
    })
}

fn parse_usage(value: &Value) -> Option<RuntimeEvent> {
    let input = value
        .get("input_tokens")
        .or_else(|| value.get("prompt_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let output = value
        .get("output_tokens")
        .or_else(|| value.get("completion_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cached = value
        .get("cache_read_input_tokens")
        .or_else(|| value.get("cached_input_tokens"))
        .and_then(Value::as_u64);
    let cost = value
        .get("total_cost_usd")
        .or_else(|| value.get("cost_usd"))
        .and_then(Value::as_f64);
    if input == 0 && output == 0 && cached.is_none() && cost.is_none() {
        return None;
    }
    Some(RuntimeEvent::Usage {
        input_tokens: input,
        output_tokens: output,
        cached_input_tokens: cached,
        cost_usd: cost,
    })
}

fn session_id_of(value: &Value) -> Option<String> {
    let direct = value
        .get("session_id")
        .or_else(|| value.get("sessionId"))
        .or_else(|| value.get("sessionID"))
        .and_then(Value::as_str);
    let nested = value
        .pointer("/properties/sessionID")
        .or_else(|| value.pointer("/properties/session_id"))
        .or_else(|| value.pointer("/properties/sessionId"))
        .or_else(|| value.pointer("/session/id"))
        .and_then(Value::as_str);
    direct
        .or(nested)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opencode_session_ids_are_valid() {
        let id = opencode_session_id("run_abc123");
        assert_eq!(id, "ses_bark_abc123");
        assert!(id.starts_with("ses"));
    }

    #[test]
    fn normalizes_claude_assistant_text() {
        let events = normalize_line(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}"#,
        );
        assert!(matches!(
            events.first(),
            Some(RuntimeEvent::Assistant { text, .. }) if text == "hello"
        ));
    }

    #[test]
    fn normalizes_tool_use() {
        let events = normalize_line(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}"#,
        );
        assert!(matches!(
            events.first(),
            Some(RuntimeEvent::ToolCall { name, .. }) if name == "Bash"
        ));
    }

    #[test]
    fn normalizes_opencode_text_tool_and_usage() {
        let text = normalize_line(
            r#"{"type":"text","sessionID":"ses_1","part":{"text":"hello from opencode"}}"#,
        );
        assert!(text.iter().any(|event| matches!(
            event,
            RuntimeEvent::Assistant { text, partial: true } if text == "hello from opencode"
        )));
        let session = normalize_line(r#"{"type":"step_start","sessionID":"ses_1","part":{}}"#);
        assert!(session
            .iter()
            .any(|event| matches!(event, RuntimeEvent::Session { id } if id == "ses_1")));

        let tool = normalize_line(
            r#"{"type":"tool_use","sessionID":"ses_1","part":{"tool":"read","state":{"status":"completed","input":{"path":"src"},"output":"ok"}}}"#,
        );
        assert!(tool.iter().any(|event| matches!(
            event,
            RuntimeEvent::ToolCall { name, status, .. } if name == "read" && status == "completed"
        )));

        let usage = normalize_line(
            r#"{"type":"step_finish","part":{"tokens":{"input":10,"output":4,"cache":{"read":2}},"cost":0.01}}"#,
        );
        assert!(usage.iter().any(|event| matches!(
            event,
            RuntimeEvent::Usage { input_tokens: 10, output_tokens: 4, cached_input_tokens: Some(2), .. }
        )));
    }

    #[test]
    fn normalizes_nested_provider_error() {
        let events = normalize_line(
            r#"{"type":"error","error":{"message":"invalid x-api-key"}}"#,
        );
        assert!(matches!(
            events.first(),
            Some(RuntimeEvent::Failed { message, .. }) if message == "invalid x-api-key"
        ));
    }

    #[test]
    fn unknown_line_is_preserved_as_log() {
        let events = normalize_line("not json");
        assert!(matches!(events.first(), Some(RuntimeEvent::Log { .. })));
    }

    #[test]
    fn normalizes_usage() {
        let events = normalize_line(r#"{"type":"result","usage":{"input_tokens":3,"output_tokens":4}}"#);
        assert!(events.iter().any(|e| matches!(e, RuntimeEvent::Usage { input_tokens: 3, output_tokens: 4, .. })));
    }

    #[test]
    fn extracts_provider_session_ids() {
        let events = normalize_line(
            r#"{"type":"system","subtype":"init","session_id":"sess-123","tools":[]}"#,
        );
        assert!(events
            .iter()
            .any(|event| matches!(event, RuntimeEvent::Session { id } if id == "sess-123")));
        let events = normalize_line(
            r#"{"type":"session.created","properties":{"sessionID":"ses_opencode"}}"#,
        );
        assert!(events
            .iter()
            .any(|event| matches!(event, RuntimeEvent::Session { id } if id == "ses_opencode")));
    }

    #[test]
    fn model_lines_are_trimmed_deduped_and_sorted() {
        let models = parse_model_lines("openai/gpt-5\n\n anthropic/claude-opus-4-5 \nopenai/gpt-5\n# comment\n");
        assert_eq!(
            models,
            vec!["anthropic/claude-opus-4-5", "openai/gpt-5"]
        );
    }

    #[test]
    fn model_lines_empty_means_free_form() {
        assert!(parse_model_lines("").is_empty());
        assert!(parse_model_lines("\n# only comments\n").is_empty());
    }

    #[test]
    fn auth_parsers_do_not_invent_credentials() {
        assert_eq!(parse_opencode_auth(&serde_json::json!([])), Some(false));
        assert_eq!(
            parse_opencode_auth(&serde_json::json!([{"provider": "anthropic"}])),
            Some(true)
        );
        assert_eq!(parse_opencode_auth(&serde_json::json!({})), None);

        assert_eq!(parse_claude_auth(&serde_json::json!({"loggedIn": true})), Some(true));
        assert_eq!(
            parse_claude_auth(&serde_json::json!({"loggedIn": false})),
            Some(false)
        );
        assert_eq!(parse_claude_auth(&serde_json::json!({"status": "ok"})), None);
    }
}
