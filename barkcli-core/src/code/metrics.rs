use std::path::Path;

use serde::{Deserialize, Serialize};

/// File-level complexity metrics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileMetrics {
    pub path: String,
    pub lines: usize,
    pub blank_lines: usize,
    pub comment_lines: usize,
    pub code_lines: usize,
    pub functions: usize,
    pub classes: usize,
    pub complexity: ComplexityMetrics,
    pub risk_score: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ComplexityMetrics {
    pub cyclomatic: usize,
    pub cognitive: usize,
    pub max_nesting: usize,
    pub max_function_length: usize,
    pub avg_function_length: f32,
    pub large_functions: Vec<FunctionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionInfo {
    pub name: String,
    pub start_line: usize,
    pub end_line: usize,
    pub length: usize,
    pub complexity: usize,
}

/// Compute metrics for a source file
pub fn compute_metrics(path: &str, content: &str) -> FileMetrics {
    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();
    let blank_lines = lines.iter().filter(|l| l.trim().is_empty()).count();
    let comment_lines = count_comment_lines(content);
    let code_lines = total_lines - blank_lines - comment_lines;

    let functions = extract_functions(content);
    let classes = count_classes(content);

    let complexity = compute_complexity(content, &functions);
    let risk_score = compute_risk_score(code_lines, &complexity, classes);

    FileMetrics {
        path: path.to_string(),
        lines: total_lines,
        blank_lines,
        comment_lines,
        code_lines,
        functions: functions.len(),
        classes,
        complexity,
        risk_score,
    }
}

fn count_comment_lines(content: &str) -> usize {
    let mut count = 0;
    let mut in_block_comment = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if in_block_comment {
            count += 1;
            if trimmed.contains("*/") {
                in_block_comment = false;
            }
        } else if trimmed.starts_with("//") || trimmed.starts_with("#") || trimmed.starts_with("--") {
            count += 1;
        } else if trimmed.starts_with("/*") {
            count += 1;
            if !trimmed.contains("*/") {
                in_block_comment = true;
            }
        }
    }

    count
}

fn extract_functions(content: &str) -> Vec<(String, usize, usize)> {
    let mut functions = Vec::new();
    let mut current_fn: Option<(String, usize)> = None;
    let mut brace_depth = 0;
    let mut in_function = false;

    for (i, line) in content.lines().enumerate() {
        let trimmed = line.trim();

        // Simple heuristic for function start
        if (trimmed.starts_with("fn ")
            || trimmed.starts_with("function ")
            || trimmed.starts_with("async fn ")
            || trimmed.starts_with("pub fn ")
            || trimmed.starts_with("def ")
            || trimmed.starts_with("func "))
            && !trimmed.ends_with(';')
        {
            let name = extract_function_name(trimmed);
            if !name.is_empty() {
                current_fn = Some((name, i + 1));
                in_function = true;
                brace_depth = 0;
            }
        }

        if in_function {
            brace_depth += line.matches('{').count();
            brace_depth -= line.matches('}').count();

            if brace_depth == 0 && line.contains('}') {
                if let Some((name, start)) = current_fn.take() {
                    functions.push((name, start, i + 1));
                    in_function = false;
                }
            }
        }
    }

    functions
}

fn extract_function_name(line: &str) -> String {
    let line = line.trim();

    // Rust: fn name( or pub fn name(
    if let Some(pos) = line.find("fn ") {
        let after_fn = &line[pos + 3..];
        if let Some(end) = after_fn.find('(') {
            return after_fn[..end].trim().to_string();
        }
    }

    // JavaScript/TypeScript: function name( or async function name(
    if let Some(pos) = line.find("function ") {
        let after = &line[pos + 9..];
        if let Some(end) = after.find('(') {
            return after[..end].trim().to_string();
        }
    }

    // Python: def name(
    if let Some(pos) = line.find("def ") {
        let after = &line[pos + 4..];
        if let Some(end) = after.find('(') {
            return after[..end].trim().to_string();
        }
    }

    // Go: func name( or func (receiver) name(
    if let Some(pos) = line.find("func ") {
        let after = &line[pos + 5..];
        if let Some(paren_start) = after.find('(') {
            // Check if this is a method (has receiver)
            if let Some(paren_end) = after[paren_start..].find(')') {
                let after_receiver = &after[paren_start + paren_end + 1..];
                if let Some(end) = after_receiver.find('(') {
                    return after_receiver[..end].trim().to_string();
                }
            }
        } else if let Some(end) = after.find('(') {
            return after[..end].trim().to_string();
        }
    }

    String::new()
}

fn count_classes(content: &str) -> usize {
    let mut count = 0;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("class ")
            || trimmed.starts_with("struct ")
            || trimmed.starts_with("enum ")
            || trimmed.starts_with("trait ")
            || trimmed.starts_with("interface ")
        {
            count += 1;
        }
    }
    count
}

fn compute_complexity(content: &str, functions: &[(String, usize, usize)]) -> ComplexityMetrics {
    let lines: Vec<&str> = content.lines().collect();
    let mut cyclomatic = 1; // Base complexity
    let mut cognitive = 0;
    let mut max_nesting = 0;
    let mut current_nesting = 0;
    let mut function_complexities = Vec::new();

    for line in &lines {
        let trimmed = line.trim();

        // Count decision points for cyclomatic complexity
        if trimmed.starts_with("if ")
            || trimmed.starts_with("else if ")
            || trimmed.starts_with("elif ")
            || trimmed.contains("&& ")
            || trimmed.contains("|| ")
            || trimmed.starts_with("match ")
            || trimmed.starts_with("case ")
            || trimmed.starts_with("for ")
            || trimmed.starts_with("while ")
            || trimmed.starts_with("loop ")
            || trimmed.starts_with("?")
        {
            cyclomatic += 1;
        }

        // Count nesting for cognitive complexity
        let open_braces = line.matches('{').count();
        let close_braces = line.matches('}').count();

        if open_braces > 0 {
            current_nesting += open_braces;
            max_nesting = max_nesting.max(current_nesting);
        }

        // Cognitive complexity: nesting adds to complexity
        if trimmed.starts_with("if ")
            || trimmed.starts_with("else if ")
            || trimmed.starts_with("elif ")
            || trimmed.starts_with("for ")
            || trimmed.starts_with("while ")
            || trimmed.starts_with("loop ")
            || trimmed.starts_with("match ")
            || trimmed.starts_with("case ")
        {
            cognitive += current_nesting;
        }

        if close_braces > 0 {
            current_nesting = current_nesting.saturating_sub(close_braces);
        }
    }

    // Compute per-function complexity
    for (name, start, end) in functions {
        if *start > 0 && *end <= lines.len() {
            let fn_lines = &lines[*start - 1..*end];
            let fn_content: String = fn_lines.join("\n");
            let fn_complexity = count_decision_points(&fn_content);
            let fn_length = end - start;

            function_complexities.push(FunctionInfo {
                name: name.clone(),
                start_line: *start,
                end_line: *end,
                length: fn_length,
                complexity: fn_complexity,
            });
        }
    }

    // Sort by complexity and get max
    function_complexities.sort_by(|a, b| b.complexity.cmp(&a.complexity));
    let max_function_length = function_complexities
        .iter()
        .map(|f| f.length)
        .max()
        .unwrap_or(0);

    let avg_function_length = if !function_complexities.is_empty() {
        function_complexities.iter().map(|f| f.length).sum::<usize>() as f32
            / function_complexities.len() as f32
    } else {
        0.0
    };

    // Keep only large functions (length > 30 or complexity > 5)
    let large_functions: Vec<FunctionInfo> = function_complexities
        .into_iter()
        .filter(|f| f.length > 30 || f.complexity > 5)
        .collect();

    ComplexityMetrics {
        cyclomatic,
        cognitive,
        max_nesting,
        max_function_length,
        avg_function_length,
        large_functions,
    }
}

fn count_decision_points(content: &str) -> usize {
    let mut count = 0;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("if ")
            || trimmed.starts_with("else if ")
            || trimmed.starts_with("elif ")
            || trimmed.contains("&& ")
            || trimmed.contains("|| ")
            || trimmed.starts_with("match ")
            || trimmed.starts_with("case ")
            || trimmed.starts_with("for ")
            || trimmed.starts_with("while ")
            || trimmed.starts_with("loop ")
        {
            count += 1;
        }
    }
    count
}

fn compute_risk_score(code_lines: usize, complexity: &ComplexityMetrics, classes: usize) -> f32 {
    let mut score: f32 = 0.0;

    // Size risk
    if code_lines > 500 {
        score += 0.3;
    } else if code_lines > 200 {
        score += 0.1;
    }

    // Complexity risk
    if complexity.cyclomatic > 15 {
        score += 0.3;
    } else if complexity.cyclomatic > 7 {
        score += 0.15;
    }

    // Cognitive complexity risk
    if complexity.cognitive > 20 {
        score += 0.2;
    } else if complexity.cognitive > 10 {
        score += 0.1;
    }

    // Nesting risk
    if complexity.max_nesting > 5 {
        score += 0.15;
    } else if complexity.max_nesting > 3 {
        score += 0.05;
    }

    // Large functions risk
    if !complexity.large_functions.is_empty() {
        score += 0.1;
    }

    // Class count risk (too many classes = high coupling)
    if classes > 10 {
        score += 0.1;
    }

    score.min(1.0)
}

/// Compute metrics for multiple files and return summary
pub fn compute_project_metrics(files: &[(String, String)]) -> ProjectMetrics {
    let file_metrics: Vec<FileMetrics> = files
        .iter()
        .map(|(path, content)| compute_metrics(path, content))
        .collect();

    let total_lines: usize = file_metrics.iter().map(|m| m.lines).sum();
    let total_code_lines: usize = file_metrics.iter().map(|m| m.code_lines).sum();
    let total_functions: usize = file_metrics.iter().map(|m| m.functions).sum();
    let avg_complexity = if !file_metrics.is_empty() {
        file_metrics
            .iter()
            .map(|m| m.complexity.cyclomatic as f32)
            .sum::<f32>()
            / file_metrics.len() as f32
    } else {
        0.0
    };

    let high_risk_files: Vec<String> = file_metrics
        .iter()
        .filter(|m| m.risk_score > 0.5)
        .map(|m| m.path.clone())
        .collect();

    let most_complex_files: Vec<(String, usize)> = {
        let mut sorted = file_metrics
            .iter()
            .map(|m| (m.path.clone(), m.complexity.cyclomatic))
            .collect::<Vec<_>>();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));
        sorted.into_iter().take(10).collect()
    };

    ProjectMetrics {
        total_files: file_metrics.len(),
        total_lines,
        total_code_lines,
        total_functions,
        avg_complexity,
        high_risk_files,
        most_complex_files,
        file_metrics,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetrics {
    pub total_files: usize,
    pub total_lines: usize,
    pub total_code_lines: usize,
    pub total_functions: usize,
    pub avg_complexity: f32,
    pub high_risk_files: Vec<String>,
    pub most_complex_files: Vec<(String, usize)>,
    pub file_metrics: Vec<FileMetrics>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rust_metrics() {
        let content = r#"
pub fn login() {
    if true {
        for i in 0..10 {
            println!("{}", i);
        }
    }
}

struct User {
    name: String,
}

impl User {
    fn new() -> Self {
        Self { name: String::new() }
    }
}
"#;
        let metrics = compute_metrics("src/auth.rs", content);
        assert!(metrics.lines > 0);
        assert!(metrics.functions >= 2);
        assert!(metrics.classes >= 1);
        assert!(metrics.complexity.cyclomatic >= 2); // if + for
    }

    #[test]
    fn test_complexity_high() {
        let content = r#"
fn complex() {
    if a {
        if b {
            for i in 0..10 {
                if c {
                    while d {
                        match e {
                            1 => {},
                            2 => {},
                            _ => {},
                        }
                    }
                }
            }
        }
    }
}
"#;
        let metrics = compute_metrics("src/complex.rs", content);
        assert!(metrics.complexity.cyclomatic > 5);
        assert!(metrics.complexity.max_nesting > 3);
    }

    #[test]
    fn test_risk_score() {
        let content = "fn simple() { println!(\"hi\"); }";
        let metrics = compute_metrics("src/simple.rs", content);
        assert!(metrics.risk_score < 0.3);

        let complex_content = "fn complex() {\n".to_string()
            + &"    if a {\n".repeat(20)
            + &"    }\n".repeat(20);
        let complex_metrics = compute_metrics("src/complex.rs", &complex_content);
        assert!(complex_metrics.risk_score > 0.3);
    }
}
