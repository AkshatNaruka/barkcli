use once_cell::sync::Lazy;
use regex::Regex;

/// Lightweight symbol extractor. Regex-based (no tree-sitter dep) — accurate
/// enough to map cards to code; perfect parse trees are a v2 upgrade path.
pub fn extract_symbols(path: &str, content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let patterns = patterns_for(path);
    for re in patterns {
        for cap in re.captures_iter(content) {
            if let Some(name) = cap.get(1) {
                let s = name.as_str().to_string();
                if !out.contains(&s) {
                    out.push(s);
                }
            }
        }
    }
    out
}

static RUST: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?fn\s+([a-zA-Z_]\w*)",
        r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|mod|type|union)\s+([a-zA-Z_]\w*)",
        r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const|static)\s+([a-zA-Z_]\w*)",
        r"(?m)^\s*impl(?:<[^>]*>)?\s+[a-zA-Z_:<>]+(?:\s+for\s+([a-zA-Z_]\w*))?",
        r"(?m)^\s*#\[(?:test|tokio::test|cfg\([^)]*\))\]\s*$",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static TS_JS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?m)^\s*(?:export\s+)?(?:async\s+)?function(?:\s*\*)?\s+([a-zA-Z_$]\w*)",
        r"(?m)^\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$]\w*)",
        r"(?m)^\s*(?:export\s+)?interface\s+([a-zA-Z_$]\w*)",
        r"(?m)^\s*(?:export\s+)?type\s+([a-zA-Z_$]\w*)\s*=",
        r"(?m)^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*=>",
        r"(?m)^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$]\w*)\s*=\s*[a-zA-Z_$]\w*\s*\([^)]*\)\s*\{",
        r"(?m)^\s*export\s+(?:default\s+)?(?:function|class)\s+([a-zA-Z_$]\w*)",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static PYTHON: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?m)^\s*(?:async\s+)?def\s+([a-zA-Z_]\w*)",
        r"(?m)^\s*class\s+([a-zA-Z_]\w*)",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static GO: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?m)^\s*func\s+(?:\([^)]*\)\s*)?([a-zA-Z_]\w*)",
        r"(?m)^\s*type\s+([a-zA-Z_]\w*)\s+(?:struct|interface)",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

static OTHER: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"(?m)^\s*(?:public|private|protected|internal|static)?\s*(?:function|def|sub)\s+([a-zA-Z_$]\w*)",
        r"(?m)^\s*(?:public|private|protected|internal)?\s*(?:class|struct|enum|interface|trait|record)\s+([a-zA-Z_$]\w*)",
        r"(?m)^\s*def\s+([a-zA-Z_]\w*)",
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

fn patterns_for(path: &str) -> Vec<&'static Regex> {
    let lower = path.to_lowercase();
    if lower.ends_with(".rs") {
        RUST.iter().collect()
    } else if lower.ends_with(".ts") || lower.ends_with(".tsx") || lower.ends_with(".js") || lower.ends_with(".jsx") || lower.ends_with(".mjs") || lower.ends_with(".cjs") {
        TS_JS.iter().collect()
    } else if lower.ends_with(".py") {
        PYTHON.iter().collect()
    } else if lower.ends_with(".go") {
        GO.iter().collect()
    } else if lower.ends_with(".rb") || lower.ends_with(".php") || lower.ends_with(".java") || lower.ends_with(".kt") || lower.ends_with(".c") || lower.ends_with(".h") || lower.ends_with(".cpp") || lower.ends_with(".hpp") || lower.ends_with(".cs") || lower.ends_with(".swift") {
        OTHER.iter().collect()
    } else {
        Vec::new()
    }
}

/// Tokenize an identifier into lowercase tokens, splitting on
/// snake_case/kebab-case/camelCase boundaries: `JWTLogin` → [jwt, login].
pub fn tokens_of(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    for part in s.split(|c: char| !c.is_alphanumeric()) {
        if part.is_empty() {
            continue;
        }
        for tok in camel_tokens(part) {
            let t = tok.to_lowercase();
            if !t.is_empty() && !out.contains(&t) {
                out.push(t);
            }
        }
    }
    out
}

/// Split a camelCase/PascalCase/acronym identifier: `JWTLogin` → [JWT, Login],
/// `refreshToken` → [refresh, Token], `API2Client` → [API2, Client].
fn camel_tokens(s: &str) -> Vec<String> {
    let chars: Vec<char> = s.chars().collect();
    let mut toks = Vec::new();
    let mut start = 0usize;
    for i in 1..chars.len() {
        let prev = chars[i - 1];
        let cur = chars[i];
        let is_boundary = if cur.is_uppercase() && prev.is_lowercase() {
            true // ...xY
        } else if cur.is_uppercase()
            && prev.is_uppercase()
            && i + 1 < chars.len()
            && chars[i + 1].is_lowercase()
        {
            true // ...XYz
        } else if !cur.is_alphabetic() && prev.is_alphabetic() {
            true // ...x2
        } else {
            false
        };
        if is_boundary {
            toks.push(chars[start..i].iter().collect());
            start = i;
        }
    }
    toks.push(chars[start..].iter().collect());
    toks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rust_symbols() {
        let src = "pub fn login() {}\nstruct JwtStore {}\nimpl JwtStore {\n  fn verify(&self) {}\n}\nconst MAX: u32 = 3;\n";
        let syms = extract_symbols("src/auth.rs", src);
        assert!(syms.contains(&"login".to_string()));
        assert!(syms.contains(&"JwtStore".to_string()));
        assert!(syms.contains(&"verify".to_string()));
        assert!(syms.contains(&"MAX".to_string()));
    }

    #[test]
    fn ts_symbols() {
        let src = "export function refreshToken() {}\nexport class ApiClient {}\ninterface Resp {}\nconst fetchData = async (id: string) => {};\n";
        let syms = extract_symbols("src/api.ts", src);
        assert!(syms.contains(&"refreshToken".to_string()));
        assert!(syms.contains(&"ApiClient".to_string()));
        assert!(syms.contains(&"Resp".to_string()));
        assert!(syms.contains(&"fetchData".to_string()));
    }

    #[test]
    fn python_symbols() {
        let src = "def parse_yaml(f):\n    pass\n\nasync def run():\n    pass\n\nclass Board:\n    pass\n";
        let syms = extract_symbols("lib/board.py", src);
        assert!(syms.contains(&"parse_yaml".to_string()));
        assert!(syms.contains(&"run".to_string()));
        assert!(syms.contains(&"Board".to_string()));
    }

    #[test]
    fn go_symbols() {
        let src = "func main() {}\nfunc (b *Board) Save() {}\ntype Card struct {}\ntype Store interface {}\n";
        let syms = extract_symbols("cmd/main.go", src);
        assert!(syms.contains(&"main".to_string()));
        assert!(syms.contains(&"Save".to_string()));
        assert!(syms.contains(&"Card".to_string()));
        assert!(syms.contains(&"Store".to_string()));
    }

    #[test]
    fn tokens_snake_camel_kebab() {
        assert_eq!(tokens_of("refresh_token"), vec!["refresh", "token"]);
        assert_eq!(tokens_of("refreshToken"), vec!["refresh", "token"]);
        assert_eq!(tokens_of("JWTLogin"), vec!["jwt", "login"]);
        assert_eq!(tokens_of("card-crud"), vec!["card", "crud"]);
        assert_eq!(tokens_of("JWT"), vec!["jwt"]);
    }
}
