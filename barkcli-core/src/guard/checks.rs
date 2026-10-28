//! Individual guard checks. Every check is pure and takes an immutable diff.

use std::collections::HashSet;
use std::path::Path;

use once_cell::sync::Lazy;
use regex::Regex;

use super::deps::{collect_declared, imports_in, nearest_declared, DeclaredDeps};
use super::diff::{DiffSet, FileStatus};
use super::{CheckId, GuardFinding, Severity};
use crate::code::tests::is_test_file;
use crate::util::redact::{detect_secrets, redact_text};

pub struct CheckContext<'a> {
    pub root: &'a Path,
    pub diff: &'a DiffSet,
    pub large_files: u32,
    pub large_lines: u32,
}

pub fn run(check: CheckId, context: &CheckContext<'_>) -> Vec<GuardFinding> {
    match check {
        CheckId::Secret => check_secrets(context),
        CheckId::UndeclaredDependency | CheckId::SuspiciousDependency => {
            check_dependencies(context, check)
        }
        CheckId::LockfileDrift => check_lockfile_drift(context),
        CheckId::DangerousPattern => check_dangerous_patterns(context),
        CheckId::MissingTests => check_missing_tests(context),
        CheckId::DebugLeftover => check_debug_leftovers(context),
        CheckId::LargeDiff => check_large_diff(context),
    }
}

fn check_secrets(context: &CheckContext<'_>) -> Vec<GuardFinding> {
    let mut findings = Vec::new();
    for (file, line) in context.diff.added_lines() {
        let hits = detect_secrets(&line.text);
        // Prefer the specific pattern over the generic key/value catch-all so a
        // single line yields one finding, not two.
        let has_specific = hits.iter().any(|hit| hit.rule != "kv_assignment");
        let mut seen = HashSet::new();
        for hit in hits {
            if !seen.insert(hit.rule) {
                continue;
            }
            if hit.rule == "kv_assignment" && (has_specific || is_placeholder(&line.text)) {
                continue;
            }
            findings.push(
                GuardFinding::new(
                    CheckId::Secret,
                    Severity::Error,
                    &file.path,
                    line.new_line,
                    format!("possible secret committed: {}", hit.rule),
                )
                .with_suggestion("Remove the value, rotate the credential, and use an env var."),
            );
        }
    }
    findings
}

fn is_placeholder(text: &str) -> bool {
    let lower = text.to_lowercase();
    [
        "your_",
        "xxxx",
        "changeme",
        "change_me",
        "dummy",
        "example",
        "placeholder",
        "redacted",
        "${",
        "<",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn check_dependencies(context: &CheckContext<'_>, check: CheckId) -> Vec<GuardFinding> {
    let mut findings = Vec::new();
    let mut reported: HashSet<String> = HashSet::new();

    for file in &context.diff.files {
        if matches!(file.status, FileStatus::Deleted | FileStatus::Binary) {
            continue;
        }
        let Some(content) = context.diff.content(&file.path) else {
            continue;
        };
        let Some(language) = Language::of(&file.path) else {
            continue;
        };
        let imports = imports_in(&file.path, content);
        if imports.is_empty() {
            continue;
        }

        let declared = collect_declared(context.root, &context.root.join(&file.path));
        let declared = language.declared(&declared);
        // Without a manifest for this language there is nothing to compare
        // against; stay silent instead of flagging every import.
        if declared.is_empty() {
            continue;
        }

        for import in imports {
            if declared.contains(&import.name) || !reported.insert(import.name.clone()) {
                continue;
            }

            let nearest = nearest_declared(&import.name, declared.iter(), 2)
                .filter(|(candidate, _)| candidate.len() >= 4 && import.name.len() >= 4);

            if let Some((candidate, distance)) = nearest {
                if check == CheckId::SuspiciousDependency {
                    findings.push(
                        GuardFinding::new(
                            CheckId::SuspiciousDependency,
                            Severity::Error,
                            &file.path,
                            Some(import.line),
                            format!(
                                "import `{}` is not declared; nearest declared dependency is `{}`",
                                import.name, candidate
                            ),
                        )
                        .with_evidence(format!("edit distance {distance}"))
                        .with_suggestion(
                            "Check for typosquatting or a missing manifest entry before merging.",
                        ),
                    );
                }
            } else if check == CheckId::UndeclaredDependency {
                findings.push(
                    GuardFinding::new(
                        CheckId::UndeclaredDependency,
                        Severity::Warn,
                        &file.path,
                        Some(import.line),
                        format!(
                            "import `{}` is not declared in a {} manifest",
                            import.name,
                            language.name()
                        ),
                    )
                    .with_suggestion("Declare it in the manifest or remove the import."),
                );
            }
        }
    }
    findings
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Language {
    Rust,
    JavaScript,
    Python,
}

impl Language {
    fn of(path: &str) -> Option<Self> {
        match extension(path).as_deref() {
            Some("rs") => Some(Self::Rust),
            Some("js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs") => Some(Self::JavaScript),
            Some("py") => Some(Self::Python),
            _ => None,
        }
    }

    fn declared<'a>(&self, deps: &'a DeclaredDeps) -> &'a HashSet<String> {
        match self {
            Self::Rust => &deps.rust,
            Self::JavaScript => &deps.js,
            Self::Python => &deps.python,
        }
    }

    fn name(&self) -> &'static str {
        match self {
            Self::Rust => "Cargo",
            Self::JavaScript => "npm",
            Self::Python => "Python",
        }
    }
}

fn extension(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
}

fn check_lockfile_drift(context: &CheckContext<'_>) -> Vec<GuardFinding> {
    let changed: HashSet<&str> = context.diff.paths().collect();
    let mut findings = Vec::new();

    for file in &context.diff.files {
        let Some(candidates) = lockfiles_for(&file.path) else {
            continue;
        };
        let Some(lockfile) = find_lockfile(context.root, &file.path, candidates) else {
            continue;
        };
        if changed.contains(lockfile.as_str()) {
            continue;
        }
        findings.push(
            GuardFinding::new(
                CheckId::LockfileDrift,
                Severity::Warn,
                &file.path,
                None,
                format!("manifest changed but `{lockfile}` was not updated"),
            )
            .with_suggestion("Run the package manager and commit the refreshed lockfile."),
        );
    }
    findings
}

fn lockfiles_for(manifest: &str) -> Option<&'static [&'static str]> {
    match manifest.rsplit('/').next()? {
        "Cargo.toml" => Some(&["Cargo.lock"]),
        "package.json" => Some(&[
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
            "bun.lockb",
        ]),
        "requirements.txt" | "pyproject.toml" => Some(&["poetry.lock", "uv.lock", "requirements.txt"]),
        _ => None,
    }
}

fn find_lockfile(root: &Path, manifest: &str, candidates: &[&str]) -> Option<String> {
    let mut dir = Path::new(manifest).parent();
    loop {
        let current = dir.unwrap_or_else(|| Path::new(""));
        for candidate in candidates {
            let relative = if current.as_os_str().is_empty() {
                (*candidate).to_string()
            } else {
                format!("{}/{}", current.display(), candidate)
            };
            if root.join(&relative).is_file() {
                return Some(relative);
            }
        }
        dir = current.parent();
        if dir.is_none() {
            break;
        }
    }
    None
}

struct DangerousPattern {
    id: &'static str,
    regex: Regex,
    severity: Severity,
    message: &'static str,
}

static DANGEROUS: Lazy<Vec<DangerousPattern>> = Lazy::new(|| {
    vec![
        DangerousPattern {
            id: "shell_true",
            regex: Regex::new(r"(?i)\bshell\s*=\s*True\b").unwrap(),
            severity: Severity::Error,
            message: "shell=True enables command injection",
        },
        DangerousPattern {
            id: "os_system",
            regex: Regex::new(r"\bos\.system\s*\(").unwrap(),
            severity: Severity::Error,
            message: "os.system runs through a shell",
        },
        DangerousPattern {
            id: "no_verify",
            regex: Regex::new(r"--no-verify\b").unwrap(),
            severity: Severity::Error,
            message: "hook bypass flag committed",
        },
        DangerousPattern {
            id: "tls_verification_disabled",
            regex: Regex::new(r"(?i)rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true")
                .unwrap(),
            severity: Severity::Error,
            message: "TLS verification is disabled",
        },
        DangerousPattern {
            id: "curl_pipe_shell",
            regex: Regex::new(r"(?i)\bcurl\b[^|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b").unwrap(),
            severity: Severity::Error,
            message: "piping a download into a shell",
        },
        DangerousPattern {
            id: "eval",
            regex: Regex::new(r"\beval\s*\(").unwrap(),
            severity: Severity::Warn,
            message: "eval executes untrusted input",
        },
        DangerousPattern {
            id: "inner_html",
            regex: Regex::new(r"dangerouslySetInnerHTML|\.innerHTML\s*=").unwrap(),
            severity: Severity::Warn,
            message: "raw HTML sink can introduce XSS",
        },
        DangerousPattern {
            id: "world_writable",
            regex: Regex::new(r"\bchmod\s+777\b").unwrap(),
            severity: Severity::Warn,
            message: "world-writable permissions",
        },
    ]
});

fn check_dangerous_patterns(context: &CheckContext<'_>) -> Vec<GuardFinding> {
    let mut findings = Vec::new();
    for (file, line) in context.diff.added_lines() {
        for pattern in DANGEROUS.iter() {
            if pattern.regex.is_match(&line.text) {
                findings.push(
                    GuardFinding::new(
                        CheckId::DangerousPattern,
                        pattern.severity,
                        &file.path,
                        line.new_line,
                        format!("{} ({})", pattern.message, pattern.id),
                    )
                    .with_evidence(truncate(&redact_text(line.text.trim()), 160)),
                );
            }
        }
    }
    findings
}

fn check_debug_leftovers(context: &CheckContext<'_>) -> Vec<GuardFinding> {
    let mut findings = Vec::new();
    for (file, line) in context.diff.added_lines() {
        let trimmed = line.text.trim();
        if trimmed.is_empty() {
            continue;
        }
        let in_test = is_test_file(&file.path);

        let (severity, marker) = if trimmed.contains("dbg!(") {
            (Severity::Warn, "dbg!")
        } else if trimmed.contains("debugger") {
            (Severity::Warn, "debugger")
        } else if trimmed.contains("binding.pry") {
            (Severity::Warn, "binding.pry")
        } else if !in_test && trimmed.contains("console.log(") {
            (Severity::Info, "console.log")
        } else {
            continue;
        };

        findings.push(
            GuardFinding::new(
                CheckId::DebugLeftover,
                severity,
                &file.path,
                line.new_line,
                format!("debug leftover: {marker}"),
            )
            .with_evidence(truncate(&redact_text(trimmed), 160))
            .with_suggestion("Remove it or move it behind a debug flag."),
        );
    }
    findings
}

fn check_missing_tests(context: &CheckContext<'_>) -> Vec<GuardFinding> {
    let mut production_path: Option<&str> = None;
    let mut tests_changed = false;

    for file in &context.diff.files {
        if is_test_file(&file.path) {
            tests_changed = true;
            continue;
        }
        if is_code_file(&file.path) {
            production_path.get_or_insert(&file.path);
        }
        if file
            .added
            .iter()
            .any(|line| line.text.contains("#[test]") || line.text.contains("#[cfg(test)]"))
        {
            tests_changed = true;
        }
    }

    match (production_path, tests_changed) {
        (Some(path), false) => vec![
            GuardFinding::new(
                CheckId::MissingTests,
                Severity::Warn,
                path,
                None,
                "production code changed without a matching test change",
            )
            .with_suggestion("Add or update a test that exercises the changed behavior."),
        ],
        _ => Vec::new(),
    }
}

fn is_code_file(path: &str) -> bool {
    matches!(
        extension(path).as_deref(),
        Some(
            "rs" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "py" | "go" | "java" | "kt"
                | "swift" | "c" | "cc" | "cpp" | "h" | "hpp" | "rb" | "php" | "cs" | "scala"
                | "ex" | "exs"
        )
    )
}

fn check_large_diff(context: &CheckContext<'_>) -> Vec<GuardFinding> {
    let (files, additions, deletions) = context.diff.stats();
    let mut findings = Vec::new();

    if files > context.large_files {
        findings.push(
            GuardFinding::new(
                CheckId::LargeDiff,
                Severity::Warn,
                "(diff)",
                None,
                format!("diff touches {files} files (threshold {})", context.large_files),
            )
            .with_suggestion("Split the change or flag it for a slower review."),
        );
    }
    let lines = additions + deletions;
    if lines > context.large_lines {
        findings.push(
            GuardFinding::new(
                CheckId::LargeDiff,
                Severity::Warn,
                "(diff)",
                None,
                format!("diff changes {lines} lines (threshold {})", context.large_lines),
            )
            .with_suggestion("Split the change or flag it for a slower review."),
        );
    }
    findings
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max).collect();
    out.push_str("...");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::guard::diff::{ChangedFile, DiffLine};
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;

    fn file(path: &str, added: &[&str]) -> ChangedFile {
        ChangedFile {
            path: path.to_string(),
            old_path: None,
            status: FileStatus::Modified,
            additions: added.len() as u32,
            deletions: 0,
            added: added
                .iter()
                .enumerate()
                .map(|(index, text)| DiffLine {
                    old_line: None,
                    new_line: Some(index as u32 + 1),
                    text: (*text).to_string(),
                })
                .collect(),
            removed: Vec::new(),
        }
    }

    fn diff(files: Vec<ChangedFile>) -> DiffSet {
        DiffSet {
            base: "HEAD".into(),
            head: "WORKTREE".into(),
            files,
            contents: HashMap::new(),
        }
    }

    fn diff_with(path: &str, added: &[&str]) -> DiffSet {
        diff(vec![file(path, added)])
    }

    fn context<'a>(root: &'a Path, diff: &'a DiffSet) -> CheckContext<'a> {
        CheckContext {
            root,
            diff,
            large_files: 40,
            large_lines: 800,
        }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bark_guard_checks_{}_{}",
            name,
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn detects_high_confidence_secret() {
        let key = format!("const KEY: &str = \"sk-{}\";", "a".repeat(30));
        let diff = diff_with("src/config.rs", &[&key]);
        let findings = check_secrets(&context(Path::new("."), &diff));
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, Severity::Error);
        assert!(findings[0].evidence.is_none());
    }

    #[test]
    fn ignores_placeholder_assignments() {
        let diff = diff_with("src/config.rs", &["password = \"<your-password>\""]);
        assert!(check_secrets(&context(Path::new("."), &diff)).is_empty());
    }

    #[test]
    fn flags_dangerous_patterns_by_severity() {
        let diff = diff_with(
            "app.py",
            &[
                "subprocess.run(cmd, shell=True)",
                "eval(user_input)",
                "chmod 777 /tmp/x",
            ],
        );
        let findings = check_dangerous_patterns(&context(Path::new("."), &diff));
        assert!(findings
            .iter()
            .any(|f| f.severity == Severity::Error && f.message.contains("shell=True")));
        assert!(findings
            .iter()
            .any(|f| f.severity == Severity::Warn && f.message.contains("eval")));
        assert!(findings
            .iter()
            .any(|f| f.severity == Severity::Warn && f.message.contains("world_writable")));
    }

    #[test]
    fn debug_leftovers_skip_test_files_for_console_log() {
        let mut set = diff(vec![
            file("web/src/a.ts", &["console.log(x)", "dbg!(x)"]),
            file("web/src/a.test.ts", &["console.log(y)"]),
        ]);
        set.contents.insert("web/src/a.ts".into(), String::new());
        let findings = check_debug_leftovers(&context(Path::new("."), &set));
        assert_eq!(findings.len(), 2);
        assert!(findings
            .iter()
            .any(|f| f.message.contains("console.log") && f.severity == Severity::Info));
        assert!(findings.iter().any(|f| f.message.contains("dbg!")));
    }

    #[test]
    fn flags_production_change_without_tests() {
        let set = diff_with("src/lib.rs", &["pub fn changed() {}"]);
        let findings = check_missing_tests(&context(Path::new("."), &set));
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].check, CheckId::MissingTests);
    }

    #[test]
    fn accepts_production_change_with_test_change() {
        let set = diff(vec![
            file("src/lib.rs", &["pub fn changed() {}"]),
            file("src/lib_test.rs", &["#[test]", "fn works() {}"]),
        ]);
        assert!(check_missing_tests(&context(Path::new("."), &set)).is_empty());
    }

    #[test]
    fn detects_undeclared_rust_import() {
        let dir = temp_dir("undeclared");
        fs::write(dir.join("Cargo.toml"), "[dependencies]\nserde = \"1\"\n").unwrap();
        let mut set = diff_with("src/lib.rs", &["use notreal::Thing;"]);
        set.contents.insert(
            "src/lib.rs".into(),
            "use serde::Serialize;\nuse notreal::Thing;\n".into(),
        );
        let findings = check_dependencies(
            &context(&dir, &set),
            CheckId::UndeclaredDependency,
        );
        assert_eq!(findings.len(), 1);
        assert!(findings[0].message.contains("notreal"));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn detects_lookalike_dependency() {
        let dir = temp_dir("lookalike");
        fs::write(dir.join("requirements.txt"), "requests>=2\n").unwrap();
        let mut set = diff_with("app.py", &["import reqeusts"]);
        set.contents
            .insert("app.py".into(), "import reqeusts\n".into());
        let findings = check_dependencies(
            &context(&dir, &set),
            CheckId::SuspiciousDependency,
        );
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, Severity::Error);
        assert!(findings[0].message.contains("requests"));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn dependency_checks_silent_without_manifest() {
        let dir = temp_dir("nomanifest");
        let mut set = diff_with("app.py", &["import requests"]);
        set.contents.insert("app.py".into(), "import requests\n".into());
        assert!(check_dependencies(&context(&dir, &set), CheckId::UndeclaredDependency).is_empty());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn flags_lockfile_drift_when_lockfile_exists() {
        let dir = temp_dir("lockfile");
        fs::write(dir.join("Cargo.lock"), "# lock\n").unwrap();
        let set = diff_with("Cargo.toml", &["serde = \"1\""]);
        let findings = check_lockfile_drift(&context(&dir, &set));
        assert_eq!(findings.len(), 1);
        assert!(findings[0].message.contains("Cargo.lock"));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn ignores_lockfile_drift_when_lockfile_changed() {
        let dir = temp_dir("lockfile_changed");
        fs::write(dir.join("Cargo.lock"), "# lock\n").unwrap();
        let set = diff(vec![
            file("Cargo.toml", &["serde = \"1\""]),
            file("Cargo.lock", &["version = 4"]),
        ]);
        assert!(check_lockfile_drift(&context(&dir, &set)).is_empty());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn flags_large_diffs_by_files_and_lines() {
        let files: Vec<ChangedFile> = (0..41)
            .map(|index| file(&format!("src/f{index}.rs"), &[]))
            .collect();
        let set = diff(files);
        let context = context(Path::new("."), &set);
        let findings = check_large_diff(&context);
        assert_eq!(findings.len(), 1);
        assert!(findings[0].message.contains("41 files"));
    }
}
