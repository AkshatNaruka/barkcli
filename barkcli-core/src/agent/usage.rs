//! Token and cost telemetry parsed from coding-agent transcripts.
//!
//! The runner deliberately keeps the agent's *self-report* out of the
//! completion decision, but it still needs to know what an attempt cost.
//! Claude Code's `stream-json` result event carries `usage` and
//! `total_cost_usd`; Codex's `turn.completed` event carries `usage`. OpenCode
//! prints plain text, so the runner reports "usage unavailable" rather than
//! inventing numbers.
//!
//! Parsing is intentionally lenient: an unknown or changed event shape yields
//! `None` instead of failing the attempt.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::recipe::Stream;

/// Everything the harness knows about what an attempt spent.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct UsageTotals {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    /// Cache reads plus cache writes, when the backend reports them.
    #[serde(default)]
    pub cached_input_tokens: u64,
    #[serde(default)]
    pub cost_usd: f64,
}

impl UsageTotals {
    pub fn is_empty(&self) -> bool {
        self.input_tokens == 0
            && self.output_tokens == 0
            && self.cached_input_tokens == 0
            && self.cost_usd == 0.0
    }

    /// Sum token counts and keep the larger cost.
    ///
    /// `total_cost_usd` is cumulative for the process lifetime, so summing it
    /// across events would double-count. Token counts are also cumulative in
    /// practice, but a mid-stream retry can emit two results whose tokens are
    /// counted separately (anthropics/claude-code#101951) — summing keeps that
    /// visible instead of hiding it.
    pub fn add(&mut self, other: &UsageTotals) {
        self.input_tokens = self.input_tokens.saturating_add(other.input_tokens);
        self.output_tokens = self.output_tokens.saturating_add(other.output_tokens);
        self.cached_input_tokens = self
            .cached_input_tokens
            .saturating_add(other.cached_input_tokens);
        if other.cost_usd > self.cost_usd {
            self.cost_usd = other.cost_usd;
        }
    }

    /// Roll one attempt's totals into a run-level total.
    ///
    /// Unlike [`add`](Self::add), the cost is **summed**: each attempt is its
    /// own process, so `total_cost_usd` restarts at zero and the run total is
    /// the sum of what every attempt spent. Using `add` here would report the
    /// most expensive attempt as if it were the whole run.
    pub fn merge(&mut self, other: &UsageTotals) {
        self.input_tokens = self.input_tokens.saturating_add(other.input_tokens);
        self.output_tokens = self.output_tokens.saturating_add(other.output_tokens);
        self.cached_input_tokens = self
            .cached_input_tokens
            .saturating_add(other.cached_input_tokens);
        self.cost_usd += other.cost_usd;
    }

    /// One-line human summary, e.g. `18.4k in / 2.1k out · 96.0k cached · $0.0412`.
    pub fn summary(&self) -> String {
        if self.is_empty() {
            return "usage unavailable".into();
        }
        let mut parts = vec![format!(
            "{} in / {} out",
            compact(self.input_tokens),
            compact(self.output_tokens)
        )];
        if self.cached_input_tokens > 0 {
            parts.push(format!("{} cached", compact(self.cached_input_tokens)));
        }
        if self.cost_usd > 0.0 {
            parts.push(format!("${:.4}", self.cost_usd));
        }
        parts.join(" · ")
    }
}

fn compact(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}k", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

/// Parse one transcript line into a usage delta, if it carries any.
pub fn usage_event(kind: Stream, line: &str) -> Option<UsageTotals> {
    let trimmed = line.trim();
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return None;
    }
    let json: Value = serde_json::from_str(trimmed).ok()?;
    let ty = json.get("type").and_then(Value::as_str).unwrap_or("");
    match kind {
        Stream::ClaudeJsonl => claude_usage(&json, ty),
        Stream::CodexJsonl => codex_usage(&json, ty),
        // A plain backend prints text — but a wrapper script around `claude`
        // or `codex` still emits their JSONL. Detect it instead of dropping
        // the spend on the floor.
        Stream::Plain => claude_usage(&json, ty).or_else(|| codex_usage(&json, ty)),
    }
}

fn claude_usage(json: &Value, ty: &str) -> Option<UsageTotals> {
    if ty != "result" {
        return None;
    }
    let mut totals = UsageTotals::default();
    if let Some(usage) = json.get("usage") {
        totals.input_tokens = usage
            .get("input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        totals.output_tokens = usage
            .get("output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let read = usage
            .get("cache_read_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let written = usage
            .get("cache_creation_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        totals.cached_input_tokens = read.saturating_add(written);
    }
    totals.cost_usd = json
        .get("total_cost_usd")
        .and_then(Value::as_f64)
        .or_else(|| model_usage_cost(json))
        .unwrap_or(0.0);
    if totals.is_empty() {
        None
    } else {
        Some(totals)
    }
}

/// Fall back to the per-model breakdown when `total_cost_usd` is absent.
fn model_usage_cost(json: &Value) -> Option<f64> {
    let models = json.get("modelUsage")?.as_object()?;
    let mut cost = 0.0;
    for entry in models.values() {
        if let Some(value) = entry.get("costUSD").and_then(Value::as_f64) {
            cost += value;
        }
    }
    if cost > 0.0 {
        Some(cost)
    } else {
        None
    }
}

fn codex_usage(json: &Value, ty: &str) -> Option<UsageTotals> {
    if ty != "turn.completed" {
        return None;
    }
    let usage = json.get("usage")?;
    let mut totals = UsageTotals {
        input_tokens: usage
            .get("input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: usage
            .get("output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cached_input_tokens: usage
            .get("cached_input_tokens")
            .or_else(|| usage.get("cache_read_input_tokens"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cost_usd: 0.0,
    };
    totals.cost_usd = json
        .get("total_cost_usd")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    if totals.is_empty() {
        None
    } else {
        Some(totals)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_result_carries_tokens_and_cost() {
        let line = r#"{"type":"result","subtype":"success","is_error":false,"result":"done",
            "usage":{"input_tokens":18,"output_tokens":2435,
            "cache_read_input_tokens":69460,"cache_creation_input_tokens":13560},
            "total_cost_usd":0.0412}"#;
        let totals = usage_event(Stream::ClaudeJsonl, line).unwrap();
        assert_eq!(totals.input_tokens, 18);
        assert_eq!(totals.output_tokens, 2435);
        assert_eq!(totals.cached_input_tokens, 83020);
        assert!((totals.cost_usd - 0.0412).abs() < f64::EPSILON);
    }

    #[test]
    fn claude_falls_back_to_model_usage_cost() {
        let line = r#"{"type":"result","usage":{"input_tokens":1,"output_tokens":2},
            "modelUsage":{"claude-sonnet-4-6":{"costUSD":0.25},"claude-haiku-4-5":{"costUSD":0.05}}}"#;
        let totals = usage_event(Stream::ClaudeJsonl, line).unwrap();
        assert!((totals.cost_usd - 0.3).abs() < 1e-9);
    }

    #[test]
    fn merge_sums_cost_across_attempts() {
        let mut total = UsageTotals {
            input_tokens: 10,
            output_tokens: 2,
            cached_input_tokens: 0,
            cost_usd: 0.25,
        };
        let second = UsageTotals {
            input_tokens: 5,
            output_tokens: 1,
            cached_input_tokens: 7,
            cost_usd: 0.10,
        };
        total.merge(&second);
        assert_eq!(total.input_tokens, 15);
        assert_eq!(total.output_tokens, 3);
        assert_eq!(total.cached_input_tokens, 7);
        assert!((total.cost_usd - 0.35).abs() < 1e-9);

        // `add` stays max-within-a-process, which is what the stream parser needs
        let mut per_attempt = UsageTotals {
            cost_usd: 0.25,
            ..UsageTotals::default()
        };
        per_attempt.add(&UsageTotals {
            cost_usd: 0.10,
            ..UsageTotals::default()
        });
        assert!((per_attempt.cost_usd - 0.25).abs() < 1e-9);
    }

    #[test]
    fn codex_turn_completed_carries_tokens() {
        let line = r#"{"type":"turn.completed","usage":{"input_tokens":812,"cached_input_tokens":640,"output_tokens":96}}"#;
        let totals = usage_event(Stream::CodexJsonl, line).unwrap();
        assert_eq!(totals.input_tokens, 812);
        assert_eq!(totals.cached_input_tokens, 640);
        assert_eq!(totals.output_tokens, 96);
    }

    #[test]
    fn other_events_and_plain_streams_yield_nothing() {
        assert!(usage_event(
            Stream::ClaudeJsonl,
            r#"{"type":"system","subtype":"init"}"#
        )
        .is_none());
        assert!(usage_event(
            Stream::CodexJsonl,
            r#"{"type":"turn.started"}"#
        )
        .is_none());
        // Plain streams ignore non-usage text…
        assert!(usage_event(Stream::Plain, "agent said hello").is_none());
        // …but a wrapper around a real backend still reports its spend.
        assert_eq!(
            usage_event(
                Stream::Plain,
                r#"{"type":"result","usage":{"input_tokens":9}}"#
            )
            .unwrap()
            .input_tokens,
            9
        );
        assert!(usage_event(Stream::ClaudeJsonl, "not json").is_none());
    }

    #[test]
    fn accumulation_sums_tokens_but_keeps_peak_cost() {
        let mut total = UsageTotals::default();
        total.add(&UsageTotals {
            input_tokens: 10,
            output_tokens: 5,
            cached_input_tokens: 100,
            cost_usd: 0.02,
        });
        total.add(&UsageTotals {
            input_tokens: 1,
            output_tokens: 1,
            cached_input_tokens: 0,
            cost_usd: 0.03,
        });
        assert_eq!(total.input_tokens, 11);
        assert_eq!(total.output_tokens, 6);
        assert_eq!(total.cached_input_tokens, 100);
        assert!((total.cost_usd - 0.03).abs() < 1e-9);
    }

    #[test]
    fn summary_compacts_large_counts() {
        let totals = UsageTotals {
            input_tokens: 18_400,
            output_tokens: 2_100,
            cached_input_tokens: 96_000,
            cost_usd: 0.0412,
        };
        assert_eq!(totals.summary(), "18.4k in / 2.1k out · 96.0k cached · $0.0412");
        assert_eq!(UsageTotals::default().summary(), "usage unavailable");
    }
}
