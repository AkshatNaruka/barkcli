use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use super::symbols::{extract_symbols, tokens_of};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSymbols {
    pub path: String,
    pub symbols: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredFile {
    pub path: String,
    pub score: u32,
    pub matched_symbols: Vec<String>,
}

/// Project-wide symbol index. Rebuilt on demand — cheap enough (regex pass
/// over source files) for interactive use.
#[derive(Debug, Clone, Default)]
pub struct SymbolIndex {
    pub files: Vec<FileSymbols>,
    by_path: HashMap<String, usize>,
}

pub const SOURCE_EXTS: &[&str] = &[
    "rs", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rb", "php", "java", "kt", "c", "h",
    "cpp", "hpp", "cs", "swift", "zig", "lua",
];

const SKIP_DIRS: &[&str] = &[
    ".git", ".board", "target", "node_modules", "dist", "build", ".next", "vendor", ".venv",
    "venv", "__pycache__", ".claude", ".opencode", ".vscode", "coverage", ".gradle", ".idea",
];

/// Simple .gitignore-style matcher (supports `*`, `**/`, leading/trailing `/`).
fn ignored_by_gitignore(path: &Path, ignores: &[String]) -> bool {
    let rel = path.to_string_lossy();
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    for pat in ignores {
        let p = pat.trim();
        if p.is_empty() || p.starts_with('#') {
            continue;
        }
        if p.starts_with('!') {
            continue;
        }
        let negated = p.starts_with('!');
        let _ = negated;
        let mut m = false;
        let trimmed = p.trim_start_matches('/');
        let core = trimmed.trim_end_matches('/');
        if core == name || core == rel || rel.ends_with(&format!("/{}", core)) {
            m = true;
        } else if let Some(stripped) = core.strip_prefix("**/") {
            if rel.ends_with(&format!("/{}", stripped)) || rel == stripped {
                m = true;
            }
        } else if core.contains('*') {
            let re = glob_to_regex(core);
            if let Ok(re) = re {
                if re.is_match(&rel) || re.is_match(&name) {
                    m = true;
                }
            }
        }
        if m {
            return true;
        }
    }
    false
}

fn glob_to_regex(glob: &str) -> Result<regex::Regex> {
    let mut re = String::from("^");
    for c in glob.chars() {
        match c {
            '*' => re.push_str(".*"),
            '?' => re.push('.'),
            '.' => re.push_str("\\."),
            '/' => re.push('/'),
            other => {
                if "\\^$+{}[]()|".contains(other) {
                    re.push('\\');
                }
                re.push(other);
            }
        }
    }
    re.push('$');
    regex::Regex::new(&re).context("glob regex")
}

fn load_gitignores(root: &Path) -> Vec<String> {
    let mut ignores = Vec::new();
    let mut dirs = vec![root.to_path_buf()];
    while let Some(dir) = dirs.pop() {
        let gi = dir.join(".gitignore");
        if let Ok(content) = std::fs::read_to_string(&gi) {
            for line in content.lines() {
                let l = line.trim();
                if !l.is_empty() && !l.starts_with('#') {
                    ignores.push(l.to_string());
                }
            }
        }
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                if e.path().is_dir() {
                    dirs.push(e.path());
                }
            }
        }
    }
    ignores
}

impl SymbolIndex {
    pub fn build(root: &Path) -> Self {
        let ignores = load_gitignores(root);
        let mut index = SymbolIndex::default();
        let walker = WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                if e.depth() == 0 {
                    return true;
                }
                if e.file_type().is_dir() {
                    let name = e.file_name().to_string_lossy();
                    return !SKIP_DIRS.contains(&name.as_ref());
                }
                true
            });

        for entry in walker.flatten() {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if ignored_by_gitignore(path, &ignores) {
                continue;
            }
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if name.starts_with('.') {
                continue;
            }
            let Some(ext) = path.extension().and_then(|e| e.to_str()) else { continue };
            if !SOURCE_EXTS.contains(&ext) {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(path) else { continue };
            if content.len() > 2_000_000 {
                continue;
            }
            let rel = path.strip_prefix(root).unwrap_or(path).to_string_lossy().to_string();
            let symbols = extract_symbols(&rel, &content);
            index.by_path.insert(rel.clone(), index.files.len());
            index.files.push(FileSymbols { path: rel, symbols });
        }
        index
    }

    pub fn get(&self, path: &str) -> Option<&FileSymbols> {
        self.by_path.get(path).map(|i| &self.files[*i])
    }

    /// Fuzzy-match a card title against file paths + symbols.
    /// Scores by token overlap; returns files with score >= min_score.
    pub fn match_title(&self, title: &str, min_score: u32, top: usize) -> Vec<ScoredFile> {
        let title_tokens = tokens_of(title);
        if title_tokens.is_empty() {
            return Vec::new();
        }
        let mut scored: Vec<ScoredFile> = self
            .files
            .iter()
            .map(|f| {
                let mut score = 0u32;
                let mut matched = Vec::new();
                let path_tokens = tokens_of(&f.path);
                for t in &title_tokens {
                    if path_tokens.contains(t) {
                        score += 2;
                    }
                }
                for sym in &f.symbols {
                    let sym_tokens = tokens_of(sym);
                    if sym_tokens.iter().any(|st| title_tokens.contains(st)) {
                        score += 1;
                        matched.push(sym.clone());
                    }
                }
                ScoredFile { path: f.path.clone(), score, matched_symbols: matched }
            })
            .filter(|s| s.score >= min_score)
            .collect();
        scored.sort_by(|a, b| b.score.cmp(&a.score).then(a.path.cmp(&b.path)));
        scored.truncate(top);
        scored
    }

    /// Search symbols + paths for a query string (for `barkcli code <q>`).
    pub fn search(&self, query: &str, top: usize) -> Vec<ScoredFile> {
        let q_tokens = tokens_of(query);
        if q_tokens.is_empty() {
            return Vec::new();
        }
        let mut scored: Vec<ScoredFile> = self
            .files
            .iter()
            .map(|f| {
                let mut score = 0u32;
                let mut matched = Vec::new();
                let path_tokens = tokens_of(&f.path);
                if path_tokens.iter().any(|t| q_tokens.contains(t)) {
                    score += 2;
                }
                for sym in &f.symbols {
                    let st = tokens_of(sym);
                    if st.iter().any(|t| q_tokens.contains(t)) {
                        score += 1;
                        matched.push(sym.clone());
                    }
                }
                ScoredFile { path: f.path.clone(), score, matched_symbols: matched }
            })
            .filter(|s| s.score >= 1)
            .collect();
        scored.sort_by(|a, b| b.score.cmp(&a.score).then(a.path.cmp(&b.path)));
        scored.truncate(top);
        scored
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn tmp_tree() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("bark_core_idx_{}_{}", std::process::id(), n));
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(
            dir.join("src/auth.rs"),
            "pub fn login() {}\npub fn logout() {}\nstruct Token {}\n",
        )
        .unwrap();
        fs::write(dir.join("src/api.ts"), "export function fetchBoard() {}\nclass ApiClient {}\n").unwrap();
        fs::write(dir.join("README.md"), "no symbols here").unwrap();
        fs::write(dir.join("src/ignored.rs"), "pub fn nope() {}\n").unwrap();
        fs::write(dir.join(".gitignore"), "ignored.rs\n").unwrap();
        dir
    }

    #[test]
    fn builds_index_and_skips_ignored() {
        let root = tmp_tree();
        let idx = SymbolIndex::build(&root);
        let paths: Vec<&str> = idx.files.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"src/auth.rs"));
        assert!(paths.contains(&"src/api.ts"));
        assert!(!paths.contains(&"src/ignored.rs"));
        assert!(!paths.contains(&"README.md"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn matches_title_to_files() {
        let root = tmp_tree();
        let idx = SymbolIndex::build(&root);
        let hits = idx.match_title("JWT login flow", 1, 5);
        assert!(!hits.is_empty());
        assert_eq!(hits[0].path, "src/auth.rs");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn searches_symbols() {
        let root = tmp_tree();
        let idx = SymbolIndex::build(&root);
        let hits = idx.search("fetchBoard", 5);
        assert!(!hits.is_empty());
        assert_eq!(hits[0].path, "src/api.ts");
        assert!(hits[0].matched_symbols.contains(&"fetchBoard".to_string()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn no_symbols_no_match() {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("bark_core_idx_{}_{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("blob.txt"), "random text").unwrap();
        let idx = SymbolIndex::build(&dir);
        assert!(idx.match_title("random text", 1, 5).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
