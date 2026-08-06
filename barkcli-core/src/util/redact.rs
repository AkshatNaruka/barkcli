use once_cell::sync::Lazy;
use regex::Regex;

/// Redaction of secrets before anything is written to `.board/` — regex
/// secret layers emitting a bare token. Best-effort by design: never a
/// substitute for not storing secrets.

const TOKEN: &str = "[REDACTED]";

static RULES: Lazy<Vec<(Regex, String)>> = Lazy::new(|| {
    let patterns: &[(&str, &str)] = &[
        // OpenAI / Anthropic / generic sk-… keys
        (r"(?i)\bsk-(?:proj-)?[a-z0-9_\-]{20,}", TOKEN),
        // GitHub personal access tokens
        (r"\bghp_[a-zA-Z0-9]{20,}\b", TOKEN),
        (r"\bgithub_pat_[a-zA-Z0-9_]{14,}\b", TOKEN),
        // AWS access key id
        (r"\bAKIA[0-9A-Z]{16}\b", TOKEN),
        // Bearer tokens (JWT-ish + opaque)
        (r"(?i)\bbearer\s+[a-z0-9._~+/=-]{20,}", TOKEN),
        // Postgres / MySQL / Redis / MongoDB — redact credentials, keep scheme
        (
            r#"(?i)\b((?:postgres(?:ql)?|mysql|mariadb|redis|rediss|mongodb(?:\+srv)?)://)[^@\s]+@"#,
            &format!("$1{}@", TOKEN),
        ),
        // Key-value assignments: keep the label, redact the value
        (
            r#"(?i)(\b(?:password|passwd|pwd|token|api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?key)\b\s*[=:]\s*['"]?)[^\s,;'"]+"#,
            &format!("$1{}", TOKEN),
        ),
        // Authorization headers
        (r"(?i)\bauthorization\s*[:=]\s*[a-z0-9._~+/=-]{20,}", TOKEN),
    ];
    patterns
        .iter()
        .filter_map(|(p, r)| Regex::new(p).ok().map(|re| (re, r.to_string())))
        .collect()
});

/// Redact all known secret shapes in `s`. Non-matching content is untouched.
pub fn redact_text(s: &str) -> String {
    let mut out = s.to_string();
    for (rule, replacement) in RULES.iter() {
        out = rule.replace_all(&out, replacement.as_str()).into_owned();
    }
    out
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
}
