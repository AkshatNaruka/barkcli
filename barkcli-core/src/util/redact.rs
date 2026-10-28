use once_cell::sync::Lazy;
use regex::Regex;

/// Redaction of secrets before anything is written to `.board/` — regex
/// secret layers emitting a bare token. Best-effort by design: never a
/// substitute for not storing secrets.

const TOKEN: &str = "[REDACTED]";

/// One named secret pattern. Guard reuses the same rules for detection, so
/// redaction and scanning can never drift apart.
#[derive(Debug, Clone)]
pub struct SecretRule {
    pub id: &'static str,
    pub regex: Regex,
    pub replacement: String,
}

static RULES: Lazy<Vec<SecretRule>> = Lazy::new(|| {
    let patterns: &[(&str, &str, &str)] = &[
        // OpenAI / Anthropic / generic sk-… keys
        ("openai_key", r"(?i)\bsk-(?:proj-)?[a-z0-9_\-]{20,}", TOKEN),
        // GitHub personal access tokens
        ("github_token", r"\bghp_[a-zA-Z0-9]{20,}\b", TOKEN),
        ("github_pat", r"\bgithub_pat_[a-zA-Z0-9_]{14,}\b", TOKEN),
        // AWS access key id
        ("aws_access_key", r"\bAKIA[0-9A-Z]{16}\b", TOKEN),
        // Bearer tokens (JWT-ish + opaque)
        ("bearer_token", r"(?i)\bbearer\s+[a-z0-9._~+/=-]{20,}", TOKEN),
        // Postgres / MySQL / Redis / MongoDB — redact credentials, keep scheme
        (
            "db_url_credentials",
            r#"(?i)\b((?:postgres(?:ql)?|mysql|mariadb|redis|rediss|mongodb(?:\+srv)?)://)[^@\s]+@"#,
            "$1[REDACTED]@",
        ),
        // Key-value assignments: keep the label, redact the value
        (
            "kv_assignment",
            r#"(?i)(\b(?:password|passwd|pwd|token|api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?key)\b\s*[=:]\s*['"]?)[^\s,;'"]+"#,
            "$1[REDACTED]",
        ),
        // Authorization headers
        (
            "authorization_header",
            r"(?i)\bauthorization\s*[:=]\s*[a-z0-9._~+/=-]{20,}",
            TOKEN,
        ),
    ];
    patterns
        .iter()
        .filter_map(|(id, pattern, replacement)| {
            Regex::new(pattern)
                .ok()
                .map(|regex| SecretRule {
                    id,
                    regex,
                    replacement: replacement.to_string(),
                })
        })
        .collect()
});

/// All named secret rules, in application order.
pub fn secret_rules() -> &'static [SecretRule] {
    RULES.as_slice()
}

/// Redact all known secret shapes in `s`. Non-matching content is untouched.
pub fn redact_text(s: &str) -> String {
    let mut out = s.to_string();
    for rule in RULES.iter() {
        out = rule
            .regex
            .replace_all(&out, rule.replacement.as_str())
            .into_owned();
    }
    out
}

/// A detected secret span. The matched text is intentionally not retained —
/// callers must never persist or print it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecretHit {
    pub rule: &'static str,
    pub start: usize,
    pub len: usize,
}

/// Find secret spans in `text` without exposing the matched value.
pub fn detect_secrets(text: &str) -> Vec<SecretHit> {
    let mut hits = Vec::new();
    for rule in RULES.iter() {
        for m in rule.regex.find_iter(text) {
            hits.push(SecretHit {
                rule: rule.id,
                start: m.start(),
                len: m.end() - m.start(),
            });
        }
    }
    hits.sort_by_key(|hit| (hit.start, hit.len));
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_openai_key() {
        assert_eq!(
            redact_text("use sk-abcdefghijklmnopqrstuvwxyz123456"),
            "use [REDACTED]"
        );
    }

    #[test]
    fn redacts_github_tokens() {
        assert_eq!(redact_text("ghp_1234567890abcdefghijklmnopqrstuvwxyz"), "[REDACTED]");
        assert_eq!(redact_text("github_pat_11abcdefghijklmnop"), "[REDACTED]");
    }
    #[test]
    fn redacts_aws_key() {
        assert_eq!(redact_text("AKIAIOSFODNN7EXAMPLE"), "[REDACTED]");
    }

    #[test]
    fn redacts_bearer_token() {
        assert_eq!(redact_text("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"), "[REDACTED]");
    }

    #[test]
    fn redacts_database_url_credentials() {
        assert_eq!(
            redact_text("postgres://app:supersecret@db.internal:5432/staging"),
            "postgres://[REDACTED]@db.internal:5432/staging"
        );
        assert_eq!(
            redact_text("redis://:hunter2@cache.internal:6379"),
            "redis://[REDACTED]@cache.internal:6379"
        );
    }

    #[test]
    fn redacts_kv_assignments() {
        assert_eq!(redact_text("export API_KEY=abc123def456"), "export API_KEY=[REDACTED]");
        assert_eq!(redact_text("password: hunter2"), "password: [REDACTED]");
        assert_eq!(redact_text("DATABASE_URL=postgres://app:secret@db:5432/x"), "DATABASE_URL=postgres://[REDACTED]@db:5432/x");
    }

    #[test]
    fn leaves_plain_text_alone() {
        assert_eq!(redact_text("commit fix auth bug"), "commit fix auth bug");
    }

    #[test]
    fn detect_secrets_reports_rule_ids() {
        let hits = detect_secrets("key sk-abcdefghijklmnopqrstuvwxyz123456");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].rule, "openai_key");
    }

    #[test]
    fn detect_secrets_finds_multiple_rules() {
        let hits = detect_secrets(
            "AKIAIOSFODNN7EXAMPLE and ghp_1234567890abcdefghijklmnopqrstuvwxyz",
        );
        let ids: Vec<_> = hits.iter().map(|hit| hit.rule).collect();
        assert!(ids.contains(&"aws_access_key"));
        assert!(ids.contains(&"github_token"));
    }

    #[test]
    fn plain_text_has_no_hits() {
        assert!(detect_secrets("no secrets here").is_empty());
    }
}
