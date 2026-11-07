use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::catalog::{CatalogEntry, CatalogSource, ModelRef};
use super::health::ModelAvailability;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryOptions {
    pub runtime: String,
    /// If true, callers may run a tiny explicit verification probe in future phases.
    /// Phase 1 never performs network/model probes automatically.
    #[serde(default)]
    pub allow_explicit_probe: bool,
    /// Project directory for project-aware discovery (future). Unused in Phase 1.
    #[serde(default)]
    pub project_dir: Option<PathBuf>,
}

impl Default for DiscoveryOptions {
    fn default() -> Self {
        Self {
            runtime: "opencode".to_string(),
            allow_explicit_probe: false,
            project_dir: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiscoveryReport {
    pub runtime: String,
    pub generated_at_unix_ms: Option<i64>,
    #[serde(default)]
    pub entries: Vec<CatalogEntry>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub source: Option<CatalogSource>,
}

pub struct ModelDiscovery;

impl ModelDiscovery {
    /// Discover OpenCode models from CLI output. Does **not** probe models.
    pub fn discover_opencode(options: &DiscoveryOptions) -> Result<DiscoveryReport> {
        let now = unix_ms_now();
        let mut report = DiscoveryReport {
            runtime: options.runtime.clone(),
            generated_at_unix_ms: Some(now),
            ..Default::default()
        };

        // Prefer verbose output when available; fall back to plain model list.
        let verbose = Command::new("opencode")
            .args(["models", "--verbose"])
            .output();
        match verbose {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                report.entries = parse_opencode_models_verbose(&text, &options.runtime, now);
                if report.entries.is_empty() {
                    // Some versions may emit plain format even with --verbose.
                    report.entries = parse_opencode_model_lines(&text, &options.runtime, now);
                }
                report.source = Some(CatalogSource::OpenCodeModelsVerbose);
            }
            Ok(out) => {
                report.warnings.push(format!(
                    "opencode models --verbose unavailable (exit {}), falling back to `opencode models`",
                    out.status.code().unwrap_or(-1)
                ));
                Self::fallback_plain_models(&mut report, options, now)?;
            }
            Err(e) => {
                report.warnings.push(format!("opencode not invocable for verbose discovery: {e}"));
                Self::fallback_plain_models(&mut report, options, now)?;
            }
        }

        Ok(report)
    }

    fn fallback_plain_models(
        report: &mut DiscoveryReport,
        options: &DiscoveryOptions,
        now: i64,
    ) -> Result<()> {
        let out = Command::new("opencode")
            .arg("models")
            .output()
            .context("failed to run `opencode models`")?;
        if !out.status.success() {
            report.warnings.push(format!(
                "`opencode models` failed (exit {}): {}",
                out.status.code().unwrap_or(-1),
                String::from_utf8_lossy(&out.stderr).trim()
            ));
            report.source = Some(CatalogSource::OpenCodeCli);
            return Ok(());
        }
        let text = String::from_utf8_lossy(&out.stdout);
        report.entries = parse_opencode_model_lines(&text, &options.runtime, now);
        report.source = Some(CatalogSource::OpenCodeCli);
        Ok(())
    }

    /// Persist a lightweight cache (local, rebuildable). Callers control path.
    pub fn write_cache(report: &DiscoveryReport, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(report)?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(tmp, path)?;
        Ok(())
    }

    pub fn read_cache(path: &Path) -> Result<DiscoveryReport> {
        let data = std::fs::read(path)?;
        Ok(serde_json::from_slice(&data)?)
    }
}

fn unix_ms_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Parse plain newline-delimited ids like `provider/model`.
pub fn parse_opencode_model_lines(stdout: &str, runtime: &str, now: i64) -> Vec<CatalogEntry> {
    let mut seen = std::collections::BTreeSet::new();
    let mut entries = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if !seen.insert(line.to_string()) {
            continue;
        }
        let model = ModelRef::parse_loose(line, runtime);
        let mut entry = CatalogEntry::discovered(model, CatalogSource::OpenCodeCli);
        entry.availability = ModelAvailability::Unverified; // discovered via CLI != proven usable
        entry.last_checked_unix_ms = Some(now);
        entry.status_reason = Some("discovered from `opencode models`; not probed".into());
        entries.push(entry);
    }
    entries
}

/// Best-effort parser for `opencode models --verbose`. Format may vary by OpenCode version;
/// we accept JSON lines/arrays/objects or fall back to line parsing.
pub fn parse_opencode_models_verbose(stdout: &str, runtime: &str, now: i64) -> Vec<CatalogEntry> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    // Try whole-document JSON first.
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return entries_from_verbose_json(&value, runtime, now);
    }
    // Try JSON lines.
    let mut all = Vec::new();
    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            all.extend(entries_from_verbose_json(&value, runtime, now));
        }
    }
    all
}

fn entries_from_verbose_json(value: &serde_json::Value, runtime: &str, now: i64) -> Vec<CatalogEntry> {
    match value {
        serde_json::Value::Array(items) => items
            .iter()
            .flat_map(|v| entries_from_verbose_json(v, runtime, now))
            .collect(),
        serde_json::Value::Object(map) => {
            // Common shapes: {id/name/provider/model,...} or nested providers/models.
            if let Some(models) = map.get("models").and_then(|v| v.as_array()) {
                let provider = map
                    .get("id")
                    .or_else(|| map.get("provider"))
                    .or_else(|| map.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                return models
                    .iter()
                    .flat_map(|m| {
                        model_obj_to_entry(m, runtime, Some(provider), CatalogSource::OpenCodeModelsVerbose, now)
                    })
                    .collect();
            }
            if let Some(providers) = map.get("providers").and_then(|v| v.as_array()) {
                return providers
                    .iter()
                    .flat_map(|v| entries_from_verbose_json(v, runtime, now))
                    .collect();
            }
            model_obj_to_entry(value, runtime, None, CatalogSource::OpenCodeModelsVerbose, now)
        }
        serde_json::Value::String(s) => {
            let model = ModelRef::parse_loose(s, runtime);
            let mut e = CatalogEntry::discovered(model, CatalogSource::OpenCodeModelsVerbose);
            e.availability = ModelAvailability::Unverified;
            e.last_checked_unix_ms = Some(now);
            vec![e]
        }
        _ => Vec::new(),
    }
}

fn model_obj_to_entry(
    value: &serde_json::Value,
    runtime: &str,
    provider_hint: Option<&str>,
    source: CatalogSource,
    now: i64,
) -> Vec<CatalogEntry> {
    let Some(map) = value.as_object() else {
        return Vec::new();
    };
    let raw_id = map
        .get("id")
        .or_else(|| map.get("modelID"))
        .or_else(|| map.get("model_id"))
        .or_else(|| map.get("name"))
        .and_then(|v| v.as_str());
    let Some(raw_id) = raw_id else {
        return Vec::new();
    };
    let mut model = if raw_id.contains('/') {
        ModelRef::parse_loose(raw_id, runtime)
    } else {
        let provider = map
            .get("providerID")
            .or_else(|| map.get("provider_id"))
            .or_else(|| map.get("provider"))
            .and_then(|v| v.as_str())
            .or(provider_hint)
            .unwrap_or("unknown");
        ModelRef::new(runtime, provider, raw_id)
    };
    if let Some(v) = map.get("variant").and_then(|v| v.as_str()) {
        model = model.with_variant(v);
    }
    let mut entry = CatalogEntry::discovered(model, source);
    entry.display_name = map.get("displayName").or_else(|| map.get("display_name")).or_else(|| map.get("name")).and_then(|v| v.as_str()).map(str::to_string);
    entry.availability = ModelAvailability::Unverified;
    entry.last_checked_unix_ms = Some(now);
    entry.status_reason = Some("discovered from OpenCode verbose metadata; not probed".into());
    entry.metadata = Some(value.clone());
    // Map known capability hints conservatively.
    if let Some(tc) = map.get("tool_call").or_else(|| map.get("toolCalling")).or_else(|| map.get("tool_calling")) {
        entry.capabilities.tool_calling = tc.as_bool();
    }
    if let Some(ctx) = map.get("context").or_else(|| map.get("context_length")).or_else(|| map.get("limit")).and_then(|v| v.get("context").or(Some(v))).and_then(|v| v.as_u64()) {
        entry.capabilities.context_tokens = Some(ctx);
    }
    vec![entry]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_plain_model_lines_dedupes_and_marks_unverified() {
        let out = "openai/gpt-4o\n\n#comment\nopenai/gpt-4o\nanthropic/claude-sonnet\n";
        let entries = parse_opencode_model_lines(out, "opencode", 123);
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|e| e.availability == ModelAvailability::Unverified));
        assert!(entries.iter().all(|e| e.source == Some(CatalogSource::OpenCodeCli)));
        // First-seen order preserved.
        assert_eq!(entries[0].model.model_id, "gpt-4o");
        assert_eq!(entries[1].model.provider_id, "anthropic");
    }

    #[test]
    fn parse_verbose_json_array() {
        let json = r#"[{"id":"openai/gpt-4o","tool_calling":true,"context":128000},{"id":"ollama/llama3"}]"#;
        let entries = parse_opencode_models_verbose(json, "opencode", 1);
        assert_eq!(entries.len(), 2);
        let gpt = entries.iter().find(|e| e.model.model_id == "gpt-4o").unwrap();
        assert_eq!(gpt.capabilities.tool_calling, Some(true));
        assert_eq!(gpt.capabilities.context_tokens, Some(128000));
    }

    #[test]
    fn no_auto_probe_default() {
        let opts = DiscoveryOptions::default();
        assert!(!opts.allow_explicit_probe);
    }

    #[test]
    fn cache_roundtrip() {
        let dir = std::env::temp_dir().join(format!("bark-orch-disc-{}", uuid::Uuid::new_v4()));
        let path = dir.join("catalog.json");
        let report = DiscoveryReport {
            runtime: "opencode".into(),
            generated_at_unix_ms: Some(1),
            entries: parse_opencode_model_lines("openai/gpt-4o\n", "opencode", 1),
            warnings: vec![],
            source: Some(CatalogSource::OpenCodeCli),
        };
        ModelDiscovery::write_cache(&report, &path).unwrap();
        let loaded = ModelDiscovery::read_cache(&path).unwrap();
        assert_eq!(loaded.entries.len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
