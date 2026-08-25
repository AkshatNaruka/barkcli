use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Test file classification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TestType {
    Unit,
    Integration,
    EndToEnd,
    Unknown,
}

impl TestType {
    pub fn from_path(path: &str) -> Self {
        let lower = path.to_lowercase();
        if lower.contains("test") || lower.contains("spec") {
            if lower.contains("integration") || lower.contains("e2e") || lower.contains("end_to_end") {
                TestType::Integration
            } else if lower.contains("e2e") || lower.contains("end_to_end") {
                TestType::EndToEnd
            } else {
                TestType::Unit
            }
        } else {
            TestType::Unknown
        }
    }
}

/// A test file and what it tests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestFile {
    pub path: String,
    pub test_type: TestType,
    pub test_functions: Vec<String>,
    pub imports: Vec<String>,
    pub tested_symbols: Vec<String>,
}

/// Coverage report for a set of files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverageReport {
    pub total_files: usize,
    pub files_with_tests: usize,
    pub files_without_tests: usize,
    pub test_coverage_ratio: f32,
    pub coverage_gaps: Vec<CoverageGap>,
    pub test_files: Vec<TestFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverageGap {
    pub file: String,
    pub symbols: Vec<String>,
    pub test_type: Option<TestType>,
    pub priority: GapPriority,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GapPriority {
    Critical, // Core business logic without tests
    High,     // Public API without tests
    Medium,   // Internal functions without tests
    Low,      // Helper utilities without tests
}

/// Test map: production code -> test files
#[derive(Debug, Clone, Default)]
pub struct TestMap {
    pub production_to_tests: HashMap<String, Vec<String>>,
    pub test_files: Vec<TestFile>,
    pub symbol_to_test: HashMap<String, Vec<String>>,
}

impl TestMap {
    pub fn new() -> Self {
        Self::default()
    }

    /// Build test map from project files
    pub fn build(_root: &Path, files: &[(String, Vec<String>, Vec<String>)]) -> Self {
        let mut map = TestMap::new();
        let mut test_files = Vec::new();

        // Classify files as test or production
        let mut production_files = Vec::new();
        for (path, defs, refs) in files {
            if is_test_file(path) {
                let test_file = TestFile {
                    path: path.clone(),
                    test_type: TestType::from_path(path),
                    test_functions: defs.clone(),
                    imports: refs.clone(),
                    tested_symbols: Vec::new(),
                };
                test_files.push(test_file);
            } else {
                production_files.push((path.clone(), defs.clone(), refs.clone()));
            }
        }

        // For each production file, find which test files reference it
        for (prod_path, prod_defs, _) in &production_files {
            let mut covering_tests = Vec::new();

            for test_file in &test_files {
                // Check if test imports or references symbols from production file
                let imports_prod = test_file.imports.iter().any(|imp| {
                    prod_defs.iter().any(|def| imp.contains(def))
                        || prod_path.contains(&imp.replace("::", "/"))
                });

                // Check if test function names suggest they test production symbols
                let tests_prod = test_file.test_functions.iter().any(|test_fn| {
                    prod_defs.iter().any(|def| {
                        let test_lower = test_fn.to_lowercase();
                        let def_lower = def.to_lowercase();
                        test_lower.contains(&def_lower)
                            || def_lower.contains(&test_lower.trim_start_matches("test_"))
                    })
                });

                if imports_prod || tests_prod {
                    covering_tests.push(test_file.path.clone());
                }
            }

            if !covering_tests.is_empty() {
                map.production_to_tests
                    .insert(prod_path.clone(), covering_tests);
            }
        }

        // Build symbol-to-test mapping
        for test_file in &test_files {
            for symbol in &test_file.tested_symbols {
                map.symbol_to_test
                    .entry(symbol.clone())
                    .or_default()
                    .push(test_file.path.clone());
            }
        }

        map.test_files = test_files;
        map
    }

    /// Get tests for a production file
    pub fn tests_for_file(&self, file: &str) -> Vec<&str> {
        self.production_to_tests
            .get(file)
            .map(|v| v.iter().map(|s| s.as_str()).collect())
            .unwrap_or_default()
    }

    /// Get production files covered by a test file
    pub fn covered_by_test(&self, test_file: &str) -> Vec<&str> {
        self.production_to_tests
            .iter()
            .filter(|(_, tests)| tests.iter().any(|t| t == test_file))
            .map(|(path, _)| path.as_str())
            .collect()
    }
}

/// Check if a file is a test file based on naming conventions
pub fn is_test_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    let name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    // Common test file patterns
    name.starts_with("test_")
        || name.ends_with("_test.rs")
        || name.ends_with(".test.ts")
        || name.ends_with(".test.js")
        || name.ends_with(".test.tsx")
        || name.ends_with(".test.jsx")
        || name.ends_with("_test.py")
        || name.ends_with("test_*.py")
        || name.ends_with(".spec.ts")
        || name.ends_with(".spec.js")
        || name.ends_with(".spec.tsx")
        || name.ends_with(".spec.jsx")
        || lower.contains("/tests/")
        || lower.contains("/test/")
        || lower.contains("__tests__")
        || lower.contains("/spec/")
}

/// Check if a file is production code (not test, not config, not generated)
pub fn is_production_file(path: &str) -> bool {
    !is_test_file(path)
        && !is_config_file(path)
        && !is_generated_file(path)
}

fn is_config_file(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    name == "package.json"
        || name == "tsconfig.json"
        || name == "cargo.toml"
        || name == "pyproject.toml"
        || name == "go.mod"
        || name == "go.sum"
        || name == ".gitignore"
        || name == "dockerfile"
        || name == "docker-compose.yml"
        || name.ends_with(".config.js")
        || name.ends_with(".config.ts")
        || name.ends_with(".config.mjs")
}

fn is_generated_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("/generated/")
        || lower.contains("/gen/")
        || lower.contains("/dist/")
        || lower.contains("/build/")
        || lower.contains("/.next/")
        || path.ends_with(".generated.ts")
        || path.ends_with(".generated.js")
}

/// Generate coverage report for a set of files
pub fn coverage_for_files(
    files: &[(String, Vec<String>, Vec<String>)],
) -> CoverageReport {
    let test_map = TestMap::build(Path::new("."), files);

    let production_files: Vec<_> = files
        .iter()
        .filter(|(path, _, _)| is_production_file(path))
        .collect();

    let total_files = production_files.len();
    let files_with_tests: Vec<_> = production_files
        .iter()
        .filter(|(path, _, _)| !test_map.tests_for_file(path).is_empty())
        .collect();

    let files_without_tests: Vec<_> = production_files
        .iter()
        .filter(|(path, _, _)| test_map.tests_for_file(path).is_empty())
        .collect();

    let test_coverage_ratio = if total_files > 0 {
        files_with_tests.len() as f32 / total_files as f32
    } else {
        1.0
    };

    // Build coverage gaps
    let coverage_gaps: Vec<CoverageGap> = files_without_tests
        .iter()
        .map(|(path, defs, _)| CoverageGap {
            file: path.to_string(),
            symbols: defs.clone(),
            test_type: None,
            priority: GapPriority::Medium,
        })
        .collect();

    CoverageReport {
        total_files,
        files_with_tests: files_with_tests.len(),
        files_without_tests: files_without_tests.len(),
        test_coverage_ratio,
        coverage_gaps,
        test_files: test_map.test_files,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_detection() {
        assert!(is_test_file("src/auth_test.rs"));
        assert!(is_test_file("tests/test_auth.py"));
        assert!(is_test_file("src/auth.test.ts"));
        assert!(is_test_file("src/__tests__/auth.test.js"));
        assert!(!is_test_file("src/auth.rs"));
        assert!(!is_test_file("src/main.ts"));
    }

    #[test]
    fn test_type_classification() {
        assert_eq!(TestType::from_path("tests/unit/test_auth.rs"), TestType::Unit);
        assert_eq!(
            TestType::from_path("tests/integration/test_api.rs"),
            TestType::Integration
        );
        assert_eq!(
            TestType::from_path("tests/e2e/test_flow.rs"),
            TestType::Integration
        );
    }

    #[test]
    fn test_coverage_ratio() {
        let files = vec![
            ("src/main.rs".to_string(), vec!["main".to_string()], vec![]),
            ("src/auth.rs".to_string(), vec!["login".to_string()], vec![]),
            (
                "tests/test_auth.rs".to_string(),
                vec!["test_login".to_string()],
                vec!["login".to_string()],
            ),
        ];

        let report = coverage_for_files(&files);
        assert_eq!(report.total_files, 2);
        assert_eq!(report.files_with_tests, 1);
        assert_eq!(report.files_without_tests, 1);
        assert!((report.test_coverage_ratio - 0.5).abs() < 0.01);
    }
}
