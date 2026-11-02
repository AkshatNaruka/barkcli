//! Static safety and script auditor for agent skills.
//!
//! Analyzes markdown content before importing to detect executable shell scripts,
//! outbound network calls, credential access, or potentially dangerous commands.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafetyReport {
    pub is_clean: bool,
    pub has_scripts: bool,
    pub script_languages: Vec<String>,
    pub warnings: Vec<String>,
    pub network_calls: Vec<String>,
    pub secrets_accessed: Vec<String>,
}

/// Scan a skill markdown document for scripts, network calls, and sensitive patterns.
pub fn scan_skill_content(content: &str) -> SafetyReport {
    let mut script_languages = Vec::new();
    let mut warnings = Vec::new();
    let mut network_calls = Vec::new();
    let mut secrets_accessed = Vec::new();

    let mut in_code_block = false;
    let mut current_lang = String::new();

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("```") {
            if in_code_block {
                in_code_block = false;
                current_lang.clear();
            } else {
                in_code_block = true;
                let lang = trimmed.trim_start_matches('`').trim().to_lowercase();
                if !lang.is_empty() {
                    current_lang = lang.clone();
                    if matches!(
                        lang.as_str(),
                        "sh" | "bash" | "zsh" | "shell" | "python" | "py" | "powershell" | "ps1" | "rb" | "ruby" | "js" | "javascript"
                    ) && !script_languages.contains(&lang)
                    {
                        script_languages.push(lang);
                    }
                }
            }
            continue;
        }

        // Dangerous or privileged commands
        if trimmed.contains("rm -rf") {
            warnings.push("Contains destructive filesystem command: `rm -rf`".to_string());
        }
        if trimmed.contains("sudo ") {
            warnings.push("Requests elevated system privileges via `sudo`".to_string());
        }
        if trimmed.contains(":(){ :|:& };:") {
            warnings.push("Contains fork bomb pattern".to_string());
        }

        // Network calls
        for net_pattern in &["curl ", "wget ", "fetch(", "axios.", "Invoke-WebRequest"] {
            if line.contains(net_pattern) {
                let call = net_pattern.trim().to_string();
                if !network_calls.contains(&call) {
                    network_calls.push(call);
                }
            }
        }

        // Environment secrets
        for secret in &["API_KEY", "SECRET_KEY", "ACCESS_TOKEN", "PRIVATE_KEY", "GITHUB_TOKEN", "AWS_SECRET"] {
            if line.contains(secret) {
                let s = secret.to_string();
                if !secrets_accessed.contains(&s) {
                    secrets_accessed.push(s);
                }
            }
        }
    }

    let has_scripts = !script_languages.is_empty();
    if has_scripts {
        warnings.push(format!(
            "Contains executable script blocks ({})",
            script_languages.join(", ")
        ));
    }
    if !network_calls.is_empty() {
        warnings.push(format!(
            "Contains outbound network calls ({})",
            network_calls.join(", ")
        ));
    }
    if !secrets_accessed.is_empty() {
        warnings.push(format!(
            "References sensitive credential identifiers ({})",
            secrets_accessed.join(", ")
        ));
    }

    let is_clean = warnings.is_empty();

    SafetyReport {
        is_clean,
        has_scripts,
        script_languages,
        warnings,
        network_calls,
        secrets_accessed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_markdown_passes() {
        let doc = "# My Skill\n\nFollow these instructions to format markdown neatly.\n- Use headings\n- Be concise\n";
        let report = scan_skill_content(doc);
        assert!(report.is_clean);
        assert!(!report.has_scripts);
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn detects_bash_scripts_and_network_calls() {
        let doc = r#"
# Deploy Skill
```bash
curl -X POST https://api.example.com/deploy \
  -H "Authorization: Bearer $GITHUB_TOKEN"
rm -rf /tmp/build
```
"#;
        let report = scan_skill_content(doc);
        assert!(!report.is_clean);
        assert!(report.has_scripts);
        assert!(report.script_languages.contains(&"bash".to_string()));
        assert!(report.network_calls.contains(&"curl".to_string()));
        assert!(report.secrets_accessed.contains(&"GITHUB_TOKEN".to_string()));
        assert!(report.warnings.iter().any(|w| w.contains("rm -rf")));
    }
}
