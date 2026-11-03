use serde::{Deserialize, Serialize};

/// High-level phase in the autonomy execution loop.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpanPhase {
    /// Context ingestion, intent prompt, and rule packing
    Input,
    /// Agent model thinking and LLM inference
    Model,
    /// Tool execution (bash, file edit, ripgrep, MCP calls)
    Tool,
    /// Project acceptance gate (cargo test, npm test, etc.)
    Gate,
}

impl SpanPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Input => "input",
            Self::Model => "model",
            Self::Tool => "tool",
            Self::Gate => "gate",
        }
    }
}

/// An individual timed span within a run execution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TraceSpan {
    pub id: String,
    pub phase: SpanPhase,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub start_ms: u64,
    pub duration_ms: u64,
    pub status: String, // "running", "success", "failed"
}

/// Comprehensive telemetry trace for an agent run.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct RunTrace {
    pub run_id: String,
    pub spans: Vec<TraceSpan>,
    pub total_duration_ms: u64,
}

impl RunTrace {
    pub fn new(run_id: impl Into<String>) -> Self {
        Self {
            run_id: run_id.into(),
            spans: Vec::new(),
            total_duration_ms: 0,
        }
    }

    pub fn add_span(
        &mut self,
        phase: SpanPhase,
        label: impl Into<String>,
        detail: Option<String>,
        start_ms: u64,
        duration_ms: u64,
        status: impl Into<String>,
    ) {
        let span_id = format!("{}-s{}", self.run_id, self.spans.len() + 1);
        let end_ms = start_ms + duration_ms;
        if end_ms > self.total_duration_ms {
            self.total_duration_ms = end_ms;
        }
        self.spans.push(TraceSpan {
            id: span_id,
            phase,
            label: label.into(),
            detail,
            start_ms,
            duration_ms,
            status: status.into(),
        });
    }

    pub fn duration_by_phase(&self, phase: SpanPhase) -> u64 {
        self.spans
            .iter()
            .filter(|s| s.phase == phase)
            .map(|s| s.duration_ms)
            .sum()
    }

    pub fn tool_calls_count(&self) -> usize {
        self.spans.iter().filter(|s| s.phase == SpanPhase::Tool).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trace_spans_and_totals() {
        let mut trace = RunTrace::new("run_test_123");
        assert_eq!(trace.total_duration_ms, 0);

        trace.add_span(
            SpanPhase::Input,
            "Context Pack & Prompt",
            Some("12 files, 4.2k tokens".into()),
            0,
            250,
            "success",
        );

        trace.add_span(
            SpanPhase::Model,
            "Claude Code Inference",
            Some("Deep reasoning turn 1".into()),
            250,
            3500,
            "success",
        );

        trace.add_span(
            SpanPhase::Tool,
            "read_file: src/auth.rs",
            Some("Bytes: 4120".into()),
            3750,
            80,
            "success",
        );

        trace.add_span(
            SpanPhase::Gate,
            "Acceptance Gate: cargo test",
            Some("Exit code 0, 14 passed".into()),
            3830,
            1200,
            "success",
        );

        assert_eq!(trace.spans.len(), 4);
        assert_eq!(trace.total_duration_ms, 5030);
        assert_eq!(trace.tool_calls_count(), 1);
        assert_eq!(trace.duration_by_phase(SpanPhase::Input), 250);
        assert_eq!(trace.duration_by_phase(SpanPhase::Model), 3500);
        assert_eq!(trace.duration_by_phase(SpanPhase::Tool), 80);
        assert_eq!(trace.duration_by_phase(SpanPhase::Gate), 1200);

        let json = serde_json::to_string(&trace).unwrap();
        assert!(json.contains("\"run_id\":\"run_test_123\""));
        assert!(json.contains("\"phase\":\"gate\""));
        assert!(json.contains("\"duration_ms\":1200"));

        let deserialized: RunTrace = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, trace);
    }
}
