//! Import and manifest extraction for the dependency checks.
//!
//! Deliberately dependency-free: `Cargo.toml` is line-scanned rather than
//! parsed with a TOML crate, because the check only needs the declared names.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use regex::Regex;

static JS_IMPORT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]"#).unwrap()
});
static PY_IMPORT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^\s*(?:from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import|import\s+([A-Za-z_][A-Za-z0-9_.]*))")
        .unwrap()
});
static QUOTED: Lazy<Regex> = Lazy::new(|| Regex::new(r#"['"]([^'"]+)['"]"#).unwrap());

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeclaredDeps {
    pub rust: HashSet<String>,
    pub js: HashSet<String>,
    pub python: HashSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportRef {
    pub name: String,
    pub line: u32,
}

const RUST_ROOTS: &[&str] = &["crate", "self", "super", "std", "core", "alloc"];
const JS_BUILTINS: &[&str] = &[
    "fs", "path", "http", "https", "crypto", "os", "util", "url", "stream", "events",
    "child_process", "assert", "zlib", "buffer", "process", "timers", "net", "tls", "dns",
    "querystring", "readline", "worker_threads", "perf_hooks", "v8", "vm", "module",
];
const PY_STDLIB: &[&str] = &[
    "os", "sys", "json", "re", "pathlib", "typing", "datetime", "math", "subprocess",
    "collections", "itertools", "functools", "dataclasses", "unittest", "logging",
    "argparse", "asyncio", "time", "random", "shutil", "tempfile", "uuid", "hashlib",
    "base64", "io", "csv", "sqlite3", "threading", "multiprocessing", "socket", "ssl",
    "urllib", "http", "email", "html", "xml", "unittest", "__future__", "contextlib",
    "copy", "enum", "glob", "inspect", "operator", "pickle", "platform", "pprint",
    "queue", "signal", "stat", "string", "struct", "traceback", "types", "warnings",
    "weakref", "zipfile", "zlib",
];

/// Declared dependency names from the repo root and the nearest ancestor
/// manifests of `file` (bounded to 4 levels).
pub fn collect_declared(root: &Path, file: &Path) -> DeclaredDeps {
    let mut deps = DeclaredDeps::default();
    let mut dir = file.parent().map(Path::to_path_buf);
    let mut levels = 0;

    while let Some(current) = dir {
        collect_from_dir(&current, &mut deps);
        if current == root || levels >= 3 {
            break;
        }
        dir = current.parent().map(Path::to_path_buf);
        levels += 1;
    }
    collect_from_dir(root, &mut deps);
    deps
}

fn collect_from_dir(dir: &Path, deps: &mut DeclaredDeps) {
    if let Ok(content) = std::fs::read_to_string(dir.join("Cargo.toml")) {
        deps.rust.extend(cargo_deps(&content));
    }
    if let Ok(content) = std::fs::read_to_string(dir.join("package.json")) {
        deps.js.extend(js_deps(&content));
    }
    if let Ok(content) = std::fs::read_to_string(dir.join("requirements.txt")) {
        deps.python.extend(requirements_deps(&content));
    }
    if let Ok(content) = std::fs::read_to_string(dir.join("pyproject.toml")) {
        deps.python.extend(pyproject_deps(&content));
    }
}

/// Extract imports from a file's full content. Relative and stdlib imports are
/// filtered out.
pub fn imports_in(path: &str, content: &str) -> Vec<ImportRef> {
    let mut imports = match extension(path).as_deref() {
        Some("rs") => rust_imports(content),
        Some("js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs") => js_imports(content),
        Some("py") => python_imports(content),
        _ => Vec::new(),
    };
    imports.sort_by_key(|import| import.line);
    imports.dedup_by(|a, b| a.name == b.name);
    imports
}

fn extension(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
}

fn rust_imports(content: &str) -> Vec<ImportRef> {
    let mut out = Vec::new();
    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        let candidate = if let Some(rest) = trimmed.strip_prefix("use ") {
            rest
        } else if let Some(rest) = trimmed.strip_prefix("extern crate ") {
            rest
        } else {
            continue;
        };
        let root = candidate
            .split(|c: char| c == ':' || c == ';' || c == '{' || c == ' ' || c == ',')
            .next()
            .unwrap_or("")
            .trim();
        if root.is_empty() || RUST_ROOTS.contains(&root) {
            continue;
        }
        out.push(ImportRef {
            name: root.to_string(),
            line: (index + 1) as u32,
        });
    }
    out
}

fn js_imports(content: &str) -> Vec<ImportRef> {
    let mut out = Vec::new();
    for captures in JS_IMPORT.captures_iter(content) {
        let Some(spec) = captures.get(1).map(|m| m.as_str()) else {
            continue;
        };
        if spec.starts_with('.') || spec.starts_with('/') || spec.starts_with("node:") {
            continue;
        }
        let root = if spec.starts_with('@') {
            spec.split('/').take(2).collect::<Vec<_>>().join("/")
        } else {
            spec.split('/').next().unwrap_or(spec).to_string()
        };
        if root.is_empty() || JS_BUILTINS.contains(&root.as_str()) {
            continue;
        }
        let line = content[..captures.get(0).unwrap().start()]
            .bytes()
            .filter(|b| *b == b'\n')
            .count() as u32
            + 1;
        out.push(ImportRef { name: root, line });
    }
    out
}

fn python_imports(content: &str) -> Vec<ImportRef> {
    let mut out = Vec::new();
    for captures in PY_IMPORT.captures_iter(content) {
        let spec = captures
            .get(1)
            .or_else(|| captures.get(2))
            .map(|m| m.as_str())
            .unwrap_or("");
        let root = spec.split('.').next().unwrap_or(spec);
        if root.is_empty() || PY_STDLIB.contains(&root) {
            continue;
        }
        let line = content[..captures.get(0).unwrap().start()]
            .bytes()
            .filter(|b| *b == b'\n')
            .count() as u32
            + 1;
        out.push(ImportRef {
            name: root.to_string(),
            line,
        });
    }
    out
}

fn cargo_deps(content: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    let mut in_deps = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            let section = trimmed.trim_matches(|c| c == '[' || c == ']');
            in_deps = section == "dependencies"
                || section == "dev-dependencies"
                || section == "build-dependencies"
                || section == "workspace.dependencies"
                || section.ends_with(".dependencies");
            continue;
        }
        if !in_deps || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((name, _)) = trimmed.split_once('=') {
            let name = name.trim().trim_matches('"');
            if !name.is_empty() {
                out.insert(name.to_string());
            }
        }
    }
    out
}

fn js_deps(content: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else {
        return out;
    };
    for key in [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
    ] {
        if let Some(object) = value.get(key).and_then(|value| value.as_object()) {
            out.extend(object.keys().cloned());
        }
    }
    out
}

fn requirements_deps(content: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    for line in content.lines() {
        let trimmed = line.split('#').next().unwrap_or("").trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            continue;
        }
        let name = trimmed
            .split(|c: char| {
                c == '[' || c == '<' || c == '>' || c == '=' || c == '!' || c == '~'
                    || c == ';' || c == ' ' || c == '\t'
            })
            .next()
            .unwrap_or("")
            .trim();
        if !name.is_empty() {
            out.insert(name.to_string());
        }
    }
    out
}

fn pyproject_deps(content: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    let mut section = String::new();
    let mut in_array = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            section = trimmed.trim_matches(|c| c == '[' || c == ']').to_string();
            in_array = false;
            continue;
        }
        if section == "tool.poetry.dependencies"
            || section.starts_with("tool.poetry.group.")
                && section.ends_with(".dependencies")
        {
            if let Some((name, _)) = trimmed.split_once('=') {
                let name = name.trim().trim_matches('"');
                if !name.is_empty() && name != "python" {
                    out.insert(name.to_string());
                }
            }
            continue;
        }
        if section == "project" {
            if trimmed.starts_with("dependencies") && trimmed.contains('[') {
                in_array = true;
            }
            if in_array {
                for capture in QUOTED.captures_iter(trimmed) {
                    if let Some(spec) = capture.get(1) {
                        if let Some(name) = requirement_name(spec.as_str()) {
                            out.insert(name);
                        }
                    }
                }
                if trimmed.contains(']') {
                    in_array = false;
                }
            }
        }
    }
    out
}

fn requirement_name(spec: &str) -> Option<String> {
    let name = spec
        .split(|c: char| {
            c == '[' || c == '<' || c == '>' || c == '=' || c == '!' || c == '~'
                || c == ';' || c == ' ' || c == '\t'
        })
        .next()?
        .trim();
    (!name.is_empty()).then(|| name.to_string())
}

/// Standard two-row Levenshtein distance.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0usize; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        curr[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            curr[j + 1] = (prev[j + 1] + 1)
                .min(curr[j] + 1)
                .min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

/// Nearest declared name within `max_distance`, if any.
pub fn nearest_declared<'a>(
    name: &str,
    declared: impl Iterator<Item = &'a String>,
    max_distance: usize,
) -> Option<(String, usize)> {
    declared
        .map(|candidate| (candidate.clone(), levenshtein(name, candidate)))
        .filter(|(_, distance)| *distance <= max_distance)
        .min_by_key(|(_, distance)| *distance)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bark_guard_deps_{}_{}",
            name,
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extracts_rust_imports_and_ignores_stdlib() {
        let imports = imports_in(
            "src/lib.rs",
            "use serde::Serialize;\nuse std::collections::HashMap;\nuse crate::models::Card;\nextern crate regex;\n",
        );
        let names: Vec<_> = imports.iter().map(|import| import.name.as_str()).collect();
        assert_eq!(names, vec!["serde", "regex"]);
    }

    #[test]
    fn extracts_scoped_js_packages() {
        let imports = imports_in(
            "web/src/a.ts",
            "import x from \"@scope/pkg/sub\";\nimport fs from \"node:fs\";\nimport y from \"./local\";\nconst z = require(\"lodash/fp\");\n",
        );
        let names: Vec<_> = imports.iter().map(|import| import.name.as_str()).collect();
        assert_eq!(names, vec!["@scope/pkg", "lodash"]);
    }

    #[test]
    fn extracts_python_imports() {
        let imports = imports_in(
            "app.py",
            "import os\nimport requests\nfrom flask import Flask\nfrom . import local\n",
        );
        let names: Vec<_> = imports.iter().map(|import| import.name.as_str()).collect();
        assert_eq!(names, vec!["requests", "flask"]);
    }

    #[test]
    fn reads_cargo_dependency_sections() {
        let deps = cargo_deps(
            "[package]\nname = \"x\"\n\n[dependencies]\nserde = \"1\"\n\n[dev-dependencies]\ntempfile = \"3\"\n\n[target.'cfg(unix)'.dependencies]\nlibc = \"0.2\"\n",
        );
        assert!(deps.contains("serde"));
        assert!(deps.contains("tempfile"));
        assert!(deps.contains("libc"));
        assert!(!deps.contains("name"));
    }

    #[test]
    fn reads_package_json_dependency_groups() {
        let deps = js_deps(
            r#"{"dependencies":{"react":"18"},"devDependencies":{"vite":"5"},"peerDependencies":{"react-dom":"18"}}"#,
        );
        assert!(deps.contains("react"));
        assert!(deps.contains("vite"));
        assert!(deps.contains("react-dom"));
    }

    #[test]
    fn reads_requirements_and_pyproject() {
        let req = requirements_deps("requests>=2\nflask[async]==3\n# comment\n");
        assert!(req.contains("requests"));
        assert!(req.contains("flask"));

        let py = pyproject_deps(
            "[project]\ndependencies = [\n  \"httpx>=0.27\",\n  \"pydantic\",\n]\n\n[tool.poetry.dependencies]\npython = \"^3.11\"\nrich = \"^13\"\n",
        );
        assert!(py.contains("httpx"));
        assert!(py.contains("pydantic"));
        assert!(py.contains("rich"));
        assert!(!py.contains("python"));
    }

    #[test]
    fn collect_declared_merges_root_and_nearest() {
        let dir = temp_dir("collect");
        fs::write(dir.join("Cargo.toml"), "[dependencies]\nserde = \"1\"\n").unwrap();
        let nested = dir.join("crates/app");
        fs::create_dir_all(&nested).unwrap();
        fs::write(
            nested.join("Cargo.toml"),
            "[dependencies]\nbarkcli-core = { path = \"..\" }\n",
        )
        .unwrap();
        let deps = collect_declared(&dir, &nested.join("src/lib.rs"));
        assert!(deps.rust.contains("serde"));
        assert!(deps.rust.contains("barkcli-core"));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn levenshtein_basics() {
        assert_eq!(levenshtein("", "abc"), 3);
        assert_eq!(levenshtein("abc", ""), 3);
        assert_eq!(levenshtein("abc", "abc"), 0);
        assert_eq!(levenshtein("serde", "serdu"), 1);
    }

    #[test]
    fn nearest_declared_finds_typos() {
        let declared = vec!["requests".to_string(), "flask".to_string()];
        let found = nearest_declared("reqeusts", declared.iter(), 2);
        assert_eq!(found, Some(("requests".to_string(), 2)));
    }
}
