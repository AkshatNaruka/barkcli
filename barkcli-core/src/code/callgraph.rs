use std::collections::{HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};

/// A call graph edge: caller -> callee
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallEdge {
    pub caller: String,
    pub callee: String,
    pub caller_file: String,
    pub callee_file: Option<String>,
}

/// Call graph summary for a specific symbol or file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallGraphSummary {
    pub symbol: String,
    pub file: String,
    pub callers: Vec<CallerInfo>,
    pub callees: Vec<CalleeInfo>,
    pub fan_in: usize,  // number of callers
    pub fan_out: usize, // number of callees
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallerInfo {
    pub symbol: String,
    pub file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalleeInfo {
    pub symbol: String,
    pub file: Option<String>,
}

/// Project-wide call graph built from symbol references
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CallGraph {
    /// All edges in the graph
    pub edges: Vec<CallEdge>,
    /// Symbol name -> files it appears in
    #[serde(default)]
    pub symbol_files: HashMap<String, HashSet<String>>,
    /// File -> symbols defined in it
    #[serde(default)]
    pub file_symbols: HashMap<String, Vec<String>>,
    /// Reverse index: symbol -> files that reference it (not define)
    #[serde(default)]
    pub symbol_references: HashMap<String, HashSet<String>>,
}

impl CallGraph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Build call graph from file symbols and their references
    pub fn build(
        files: &[(String, Vec<String>, Vec<String>)], // (path, definitions, references)
    ) -> Self {
        let mut graph = CallGraph::new();

        // Index definitions
        for (path, defs, _) in files {
            graph.file_symbols.insert(path.clone(), defs.clone());
            for sym in defs {
                graph
                    .symbol_files
                    .entry(sym.clone())
                    .or_default()
                    .insert(path.clone());
            }
        }

        // Index references and build edges
        for (path, defs, refs) in files {
            for ref_sym in refs {
                graph
                    .symbol_references
                    .entry(ref_sym.clone())
                    .or_default()
                    .insert(path.clone());

                // Try to find which definition this reference points to
                if let Some(callee_files) = graph.symbol_files.get(ref_sym) {
                    for callee_file in callee_files {
                        graph.edges.push(CallEdge {
                            caller: defs.first().cloned().unwrap_or_default(),
                            callee: ref_sym.clone(),
                            caller_file: path.clone(),
                            callee_file: Some(callee_file.clone()),
                        });
                    }
                }
            }
        }

        graph
    }

    /// Get call graph summary for a specific file
    pub fn summary_for_file(&self, file: &str) -> Option<CallGraphSummary> {
        let symbols = self.file_symbols.get(file)?;
        let main_symbol = symbols.first()?.clone();

        let mut callers = Vec::new();
        let mut callees = Vec::new();

        // Find callers: symbols that reference symbols in this file
        for (ref_sym, ref_files) in &self.symbol_references {
            if ref_files.contains(file) {
                // This symbol references something in our file
                for ref_file in ref_files {
                    if ref_file != file {
                        callers.push(CallerInfo {
                            symbol: ref_sym.clone(),
                            file: ref_file.clone(),
                        });
                    }
                }
            }
        }

        // Find callees: symbols this file references
        for edge in &self.edges {
            if edge.caller_file == file {
                callees.push(CalleeInfo {
                    symbol: edge.callee.clone(),
                    file: edge.callee_file.clone(),
                });
            }
        }

        // Deduplicate
        callers.sort_by(|a, b| a.symbol.cmp(&b.symbol));
        callers.dedup_by(|a, b| a.symbol == b.symbol && a.file == b.file);

        callees.sort_by(|a, b| a.symbol.cmp(&b.symbol));
        callees.dedup_by(|a, b| a.symbol == b.symbol && a.file == b.file);

        let fan_in = callers.len();
        let fan_out = callees.len();

        Some(CallGraphSummary {
            symbol: main_symbol,
            file: file.to_string(),
            callers,
            callees,
            fan_in,
            fan_out,
        })
    }

    /// Get call graph summary for a specific symbol
    pub fn summary_for_symbol(&self, symbol: &str) -> Option<CallGraphSummary> {
        let files = self.symbol_files.get(symbol)?;
        let file = files.iter().next()?.clone();
        self.summary_for_file(&file)
    }

    /// Impact analysis: what symbols/files would be affected if this file changes
    pub fn impact_analysis(&self, file: &str) -> Vec<String> {
        let mut affected = HashSet::new();
        let mut queue = VecDeque::new();

        // Get symbols defined in this file
        let file_symbols = self.file_symbols.get(file);
        if let Some(symbols) = file_symbols {
            // For each symbol defined in this file, find files that reference it
            for symbol in symbols {
                if let Some(ref_files) = self.symbol_references.get(symbol) {
                    for ref_file in ref_files {
                        if ref_file != file && !affected.contains(ref_file) {
                            affected.insert(ref_file.clone());
                            queue.push_back(ref_file.clone());
                        }
                    }
                }
            }
        }

        // BFS to find transitive callers
        while let Some(current) = queue.pop_front() {
            // Get symbols defined in the current file
            if let Some(current_symbols) = self.file_symbols.get(&current) {
                for symbol in current_symbols {
                    if let Some(ref_files) = self.symbol_references.get(symbol) {
                        for ref_file in ref_files {
                            if !affected.contains(ref_file) && ref_file != file {
                                affected.insert(ref_file.clone());
                                queue.push_back(ref_file.clone());
                            }
                        }
                    }
                }
            }
        }

        affected.into_iter().collect()
    }

    /// Dependencies: what files does this file depend on
    pub fn dependencies_of(&self, file: &str) -> Vec<String> {
        let mut deps = HashSet::new();

        for edge in &self.edges {
            if edge.caller_file == file {
                if let Some(ref callee_file) = edge.callee_file {
                    deps.insert(callee_file.clone());
                }
            }
        }

        deps.into_iter().collect()
    }

    /// Get all symbols defined in a file
    pub fn symbols_in_file(&self, file: &str) -> Vec<String> {
        self.file_symbols
            .get(file)
            .cloned()
            .unwrap_or_default()
    }

    /// Get all files that reference a symbol
    pub fn files_referencing(&self, symbol: &str) -> Vec<String> {
        self.symbol_references
            .get(symbol)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .collect()
    }

    /// Detect circular dependencies
    pub fn detect_cycles(&self) -> Vec<Vec<String>> {
        let mut cycles = Vec::new();
        let mut visited = HashSet::new();
        let mut rec_stack = HashSet::new();

        for file in self.file_symbols.keys() {
            if !visited.contains(file) {
                self.dfs_cycle_detect(file, &mut visited, &mut rec_stack, &mut cycles);
            }
        }

        cycles
    }

    fn dfs_cycle_detect(
        &self,
        node: &str,
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
        cycles: &mut Vec<Vec<String>>,
    ) {
        visited.insert(node.to_string());
        rec_stack.insert(node.to_string());

        for edge in &self.edges {
            if edge.caller_file == node {
                if let Some(ref callee_file) = edge.callee_file {
                    if !visited.contains(callee_file) {
                        self.dfs_cycle_detect(callee_file, visited, rec_stack, cycles);
                    } else if rec_stack.contains(callee_file) {
                        cycles.push(vec![node.to_string(), callee_file.clone()]);
                    }
                }
            }
        }

        rec_stack.remove(node);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_call_graph_basic() {
        let files = vec![
            (
                "src/main.rs".to_string(),
                vec!["main".to_string()],
                vec!["helper".to_string()],
            ),
            (
                "src/helper.rs".to_string(),
                vec!["helper".to_string()],
                vec![],
            ),
        ];

        let graph = CallGraph::build(&files);
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].caller, "main");
        assert_eq!(graph.edges[0].callee, "helper");
    }

    #[test]
    fn test_impact_analysis() {
        let files = vec![
            (
                "src/core.rs".to_string(),
                vec!["core_fn".to_string()],
                vec![],
            ),
            (
                "src/lib.rs".to_string(),
                vec!["lib_fn".to_string()],
                vec!["core_fn".to_string()],
            ),
            (
                "src/app.rs".to_string(),
                vec!["app_fn".to_string()],
                vec!["lib_fn".to_string()],
            ),
        ];

        let graph = CallGraph::build(&files);
        let affected = graph.impact_analysis("src/core.rs");
        assert!(affected.contains(&"src/lib.rs".to_string()));
        assert!(affected.contains(&"src/app.rs".to_string()));
    }

    #[test]
    fn test_dependencies() {
        let files = vec![
            (
                "src/main.rs".to_string(),
                vec!["main".to_string()],
                vec!["helper".to_string(), "utils".to_string()],
            ),
            (
                "src/helper.rs".to_string(),
                vec!["helper".to_string()],
                vec![],
            ),
            (
                "src/utils.rs".to_string(),
                vec!["utils".to_string()],
                vec![],
            ),
        ];

        let graph = CallGraph::build(&files);
        let deps = graph.dependencies_of("src/main.rs");
        assert!(deps.contains(&"src/helper.rs".to_string()));
        assert!(deps.contains(&"src/utils.rs".to_string()));
    }
}
