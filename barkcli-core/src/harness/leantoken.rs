//! Code-index evidence for the context packet (LeanToken adapter).
//!
//! The packet assembles *instructions*: policy, project context, rules, skills
//! and the acceptance criteria. It deliberately does not paste source code,
//! because the agent reads files itself — which is exactly where a coding
//! agent burns most of its input tokens.
//!
//! [LeanToken](https://github.com/morluto/leantoken) indexes a repository and
//! returns the ranges that matter for a task under an explicit token budget.
//! This adapter asks it one question per attempt ("which ranges does this task
//! touch?") and puts the answer in the prompt as a small, droppable section.
//!
//! Design notes:
//!
//! * **Optional and silent.** Nothing here runs unless a `leantoken` binary is
//!   found (`LEANTOKEN_BIN`, or `PATH`). A missing binary, a timeout or an
//!   uninitialised index simply means "no code section" — an attempt is never
//!   delayed into failure by a code index.
//! * **Pointers by default.** The section lists `path:start-end` ranges, not
//!   source. A stale range is then harmless (the agent opens the file), and the
//!   packet stays inside its budget. `code_index_snippets` opts into pasting
//!   the returned text for backends that never read files.
//! * **Same budget discipline as everything else.** The section has its own
//!   token budget and its own drop priority in `packet`, so it can be trimmed
//!   like any other optional layer.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Environment override, for tests and for installs outside `PATH`.
pub const ENV_BIN: &str = "LEANTOKEN_BIN";

/// Default token budget for the evidence request. Evidence is a hint, not the
/// task: it must never crowd out instructions or acceptance criteria.
pub const DEFAULT_BUDGET_TOKENS: usize = 800;

/// One ranked range from the index.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fragment {
    pub path: String,
    pub start_line: u32,
    pub end_line: u32,
    /// Why the index picked it (`text; symbol; reference`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The source text, only used when snippets are enabled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

/// What the index returned for one attempt.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Evidence {
    pub fragments: Vec<Fragment>,
    /// Ranges the index could not fit in the requested budget.
    #[serde(default)]
    pub omitted: usize,
    /// Source tokens actually returned (index's own accounting).
    #[serde(default)]
    pub source_tokens: u64,
    #[serde(default)]
    pub total_response_tokens: u64,
}

impl Evidence {
    pub fn is_empty(&self) -> bool {
        self.fragments.is_empty()
    }

    /// `8 range(s) · 312 source tokens`
    pub fn summary(&self) -> String {
        let mut s = format!("{} range(s)", self.fragments.len());
        if self.source_tokens > 0 {
            s.push_str(&format!(" · {} source tokens", self.source_tokens));
        }
        if self.omitted > 0 {
            s.push_str(&format!(" · {} omitted", self.omitted));
        }
        s
    }

    /// Render the section body. `snippets` pastes the returned text (bounded by
    /// `snippet_bytes`); otherwise only pointers are written.
    pub fn render(&self, snippets: bool, snippet_bytes: usize) -> String {
        let mut out = String::new();
        let mut spent = 0usize;
        for fragment in &self.fragments {
            out.push_str(&format!(
                "- `{}:{}-{}`",
                fragment.path, fragment.start_line, fragment.end_line
            ));
            if let Some(reason) = fragment.reason.as_deref().filter(|r| !r.trim().is_empty()) {
                out.push_str(&format!(" — {}", reason.trim()));
            }
            out.push('\n');
            if !snippets {
                continue;
            }
            let Some(content) = fragment.content.as_deref() else {
                continue;
            };
            if spent >= snippet_bytes {
                out.push_str("- (further snippets trimmed to stay inside the budget)\n");
                break;
            }
            let budget = snippet_bytes - spent;
            let text = truncate(content.trim_end(), budget);
            spent += text.len();
            out.push_str("```\n");
            out.push_str(&text);
            out.push_str("\n```\n");
        }
        out
    }
}

/// Locate a usable `leantoken` binary.
///
/// `configured` is the explicit setting from `.board/config.json`; the
/// `LEANTOKEN_BIN` environment variable wins over it (tests, temporary
/// installs). Only an executable name or path is accepted — never a command
/// line — so nothing is ever handed to a shell.
pub fn detect(configured: Option<&str>) -> Option<PathBuf> {
    if let Ok(value) = std::env::var(ENV_BIN) {
        let value = value.trim();
        if !value.is_empty() {
            return resolve(value);
        }
    }
    if let Some(value) = configured.map(str::trim).filter(|v| !v.is_empty()) {
        return resolve(value);
    }
    resolve("leantoken")
}

fn resolve(value: &str) -> Option<PathBuf> {
    let path = PathBuf::from(value);
    if path.components().count() > 1 {
        return path.is_file().then_some(path);
    }
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        let candidate = dir.join(value);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Ask the index which ranges this task touches.
///
/// Runs `index` first: the CLI refuses to answer against an uninitialised
/// repository, and the index is incremental, so warm repositories pay almost
/// nothing. Both calls share one timeout.
pub fn evidence(
    bin: &Path,
    root: &Path,
    task: &str,
    budget_tokens: usize,
    timeout: Duration,
) -> Result<Evidence> {
    let deadline = Instant::now() + timeout;

    // Build the index. Failure is not fatal: an existing index may still
    // answer, and `context` reports an unready index properly itself. Its
    // output is discarded, so a large index report can never fill a pipe.
    let _ = run(bin, root, &["index"], None, remaining(deadline), false);

    let budget = budget_tokens.max(1).to_string();
    let output = run(
        bin,
        root,
        &[
            "--json",
            "context",
            "--task",
            task,
            "--budget",
            budget.as_str(),
        ],
        None,
        remaining(deadline),
        true,
    )?;

    parse_context_json(&output)
}

/// Parse the CLI's `--json context` output.
///
/// The shape is documented in LeanToken's usage guide; unknown fields are
/// ignored so a newer release cannot break an attempt.
pub fn parse_context_json(raw: &str) -> Result<Evidence> {
    let value: serde_json::Value = serde_json::from_str(raw.trim())
        .with_context(|| format!("leantoken returned non-JSON: {}", first_line(raw)))?;

    if let Some(error) = value.get("error").and_then(|e| e.as_str()) {
        anyhow::bail!(
            "leantoken: {} ({})",
            error,
            value
                .get("category")
                .and_then(|c| c.as_str())
                .unwrap_or("unknown")
        );
    }

    let RawContext {
        fragments,
        omission_summary,
        meta,
    } = serde_json::from_value(value).context("unexpected leantoken payload")?;

    let omitted = omission_summary
        .values()
        .filter_map(|value| value.as_u64())
        .sum::<u64>() as usize;

    Ok(Evidence {
        fragments: fragments
            .into_iter()
            .filter(|f| !f.path.trim().is_empty() && f.end_line >= f.start_line)
            .map(|f| Fragment {
                path: f.path,
                start_line: f.start_line.max(1),
                end_line: f.end_line,
                reason: f.reason,
                content: f.content,
            })
            .collect(),
        omitted,
        source_tokens: meta.as_ref().map(|m| m.source_tokens).unwrap_or(0),
        total_response_tokens: meta
            .as_ref()
            .map(|m| m.total_response_tokens)
            .unwrap_or(0),
    })
}

#[derive(Debug, Deserialize)]
struct RawContext {
    #[serde(default)]
    fragments: Vec<RawFragment>,
    #[serde(default)]
    omission_summary: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    meta: Option<RawMeta>,
}

#[derive(Debug, Deserialize)]
struct RawFragment {
    path: String,
    #[serde(default = "one")]
    start_line: u32,
    #[serde(default = "one")]
    end_line: u32,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawMeta {
    #[serde(default)]
    source_tokens: u64,
    #[serde(default)]
    total_response_tokens: u64,
}

fn one() -> u32 {
    1
}

fn remaining(deadline: Instant) -> Duration {
    deadline.saturating_duration_since(Instant::now())
}

/// Run the binary, killing it at the deadline, and return stdout.
///
/// With `capture` false the child's output is discarded, so a chatty command
/// cannot fill a pipe and deadlock the harness.
fn run(
    bin: &Path,
    root: &Path,
    args: &[&str],
    stdin_body: Option<&str>,
    timeout: Duration,
    capture: bool,
) -> Result<String> {
    if timeout.is_zero() {
        anyhow::bail!("leantoken timed out");
    }
    let mut child = Command::new(bin)
        .arg("--root")
        .arg(root)
        .args(args)
        .current_dir(root)
        .stdin(if stdin_body.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(if capture { Stdio::piped() } else { Stdio::null() })
        .stderr(if capture { Stdio::piped() } else { Stdio::null() })
        .spawn()
        .with_context(|| format!("failed to run {}", bin.display()))?;

    if let (Some(body), Some(mut stdin)) = (stdin_body, child.stdin.take()) {
        use std::io::Write;
        let bytes = body.as_bytes().to_vec();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&bytes);
        });
    }

    let started = Instant::now();
    let deadline = started + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !capture {
                    return Ok(String::new());
                }
                let out = child.wait_with_output().map(|o| o.stdout).unwrap_or_default();
                let stdout = String::from_utf8_lossy(&out).into_owned();
                if !status.success() && stdout.trim().is_empty() {
                    anyhow::bail!(
                        "leantoken {} exited {:?}",
                        args.first().unwrap_or(&"?"),
                        status.code()
                    );
                }
                return Ok(stdout);
            }
            Ok(None) => {}
            Err(err) => return Err(err.into()),
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            anyhow::bail!("leantoken timed out");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn first_line(text: &str) -> String {
    text.lines().next().unwrap_or("").trim().chars().take(160).collect()
}

fn truncate(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let mut cut = limit;
    while cut > 0 && !text.is_char_boundary(cut) {
        cut -= 1;
    }
    format!("{}…", &text[..cut])
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAYLOAD: &str = r#"{
      "effective_response_profile": "balanced",
      "workflow": "implementation",
      "fragments": [
        {"path":"src/shutdown.rs","start_line":4,"end_line":9,
         "content":"pub fn cancel() {}\n","reason":"text; symbol"},
        {"path":"src/executor.rs","start_line":137,"end_line":147,
         "content":"struct Executor;\n","reason":"symbol"}
      ],
      "receipt": {"fragment_hashes": ["a", "b"]},
      "omission_summary": {"budget_or_result_limit": 286},
      "provenance": {"branch": "master"},
      "warnings": ["286 omitted"],
      "meta": {"source_tokens": 764, "protocol_tokens": 114,
               "total_response_tokens": 1499, "token_count_exact": true}
    }"#;

    #[test]
    fn parses_the_documented_payload() {
        let evidence = parse_context_json(PAYLOAD).unwrap();
        assert_eq!(evidence.fragments.len(), 2);
        assert_eq!(evidence.fragments[0].path, "src/shutdown.rs");
        assert_eq!(evidence.fragments[0].start_line, 4);
        assert_eq!(evidence.fragments[0].end_line, 9);
        assert_eq!(evidence.fragments[0].reason.as_deref(), Some("text; symbol"));
        assert_eq!(evidence.omitted, 286);
        assert_eq!(evidence.source_tokens, 764);
        assert_eq!(evidence.total_response_tokens, 1499);
    }

    #[test]
    fn pointers_by_default_and_snippets_on_request() {
        let evidence = parse_context_json(PAYLOAD).unwrap();

        let pointers = evidence.render(false, 0);
        assert!(pointers.contains("- `src/shutdown.rs:4-9` — text; symbol"));
        assert!(!pointers.contains("pub fn cancel"));

        let snippets = evidence.render(true, 4096);
        assert!(snippets.contains("```"));
        assert!(snippets.contains("pub fn cancel"));
    }

    #[test]
    fn snippet_budget_is_enforced() {
        let evidence = parse_context_json(PAYLOAD).unwrap();
        let rendered = evidence.render(true, 8);
        assert!(rendered.contains("trimmed"));
        assert!(rendered.len() < 200, "snippets must stay bounded: {rendered}");
    }

    #[test]
    fn unready_index_and_malformed_output_are_errors_not_panics() {
        let unready = r#"{"category":"index_not_ready","error":"repository index is not ready"}"#;
        let err = parse_context_json(unready).unwrap_err().to_string();
        assert!(err.contains("index_not_ready"));

        assert!(parse_context_json("not json").is_err());
        assert!(parse_context_json("").is_err());
    }

    #[test]
    fn empty_payload_is_valid_and_empty() {
        let evidence = parse_context_json(r#"{"fragments": [], "meta": {}}"#).unwrap();
        assert!(evidence.is_empty());
        assert_eq!(evidence.summary(), "0 range(s)");
    }

    #[test]
    fn fragments_with_a_bad_range_are_dropped() {
        let payload = r#"{"fragments":[
            {"path":"a.rs","start_line":9,"end_line":2},
            {"path":"  ","start_line":1,"end_line":3},
            {"path":"b.rs","start_line":2,"end_line":3}
        ]}"#;
        let evidence = parse_context_json(payload).unwrap();
        assert_eq!(evidence.fragments.len(), 1);
        assert_eq!(evidence.fragments[0].path, "b.rs");
    }

    #[test]
    fn detect_prefers_the_env_override_and_never_reports_a_missing_binary() {
        let dir = std::env::temp_dir().join(format!("bark-lt-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("leantoken");
        std::fs::write(&fake, "#!/bin/sh\nexit 0\n").unwrap();

        // Explicit path
        assert_eq!(detect(Some(fake.to_string_lossy().as_ref())), Some(fake.clone()));

        // Env wins over config
        std::env::set_var(ENV_BIN, fake.to_string_lossy().as_ref());
        assert_eq!(
            detect(Some("/nonexistent/leantoken")),
            Some(fake.clone())
        );
        std::env::remove_var(ENV_BIN);

        // Missing binary is `None`, never a panic or a bogus path
        assert_eq!(detect(Some("/nonexistent/leantoken")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn evidence_runs_a_real_binary_and_stops_on_timeout() {
        let dir = std::env::temp_dir().join(format!("bark-lt-run-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        // A stub that answers `context` and ignores `index`.
        let bin = dir.join("leantoken");
        std::fs::write(
            &bin,
            r#"#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "context" ]; then
    echo '{"fragments":[{"path":"src/a.rs","start_line":1,"end_line":2}],"meta":{"source_tokens":12}}'
    exit 0
  fi
done
exit 0
"#,
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&bin).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&bin, perms).unwrap();
        }

        let found = evidence(&bin, &dir, "fix cancellation", 400, Duration::from_secs(10))
            .unwrap();
        assert_eq!(found.fragments.len(), 1);
        assert_eq!(found.source_tokens, 12);

        // A hanging binary must not stall the attempt.
        let slow = dir.join("slow");
        std::fs::write(&slow, "#!/bin/sh\nsleep 10\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&slow).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&slow, perms).unwrap();
        }
        let started = Instant::now();
        assert!(evidence(
            &slow,
            &dir,
            "task",
            100,
            Duration::from_millis(300)
        )
        .is_err());
        assert!(started.elapsed() < Duration::from_secs(5));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
