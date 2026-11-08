//! Brain graph: persistent, self-improving knowledge graph of codebase architecture,
//! components, domain models, boundaries, and engineering knowledge (invariants,
//! conventions, decisions, pitfalls).
//! Persisted at `.board/memory/<board>.graph.json`, rebuilt on consolidation.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Subsystem,
    Module,
    Service,
    Api,
    Model,
    Decision,
    Convention,
    Pitfall,
    Invariant,
    Fact,
    // Compatibility aliases
    Memory,
    Session,
    Card,
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    DependsOn,
    Calls,
    Contains,
    Implements,
    ConstrainedBy,
    Addresses,
    TestedBy,
    Related,
    // Compatibility aliases
    DerivedFrom,
    TouchedCard,
    SameSession,
    ProducedBy,
    FactOf,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NodeEvidence {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub symbols: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainNode {
    pub id: String,
    pub label: String,
    pub kind: NodeKind,
    /// Memory tier / architectural layer assignment (e.g. long_term, working, external).
    pub tier: Option<String>,
    pub importance: f32,
    pub access_count: u32,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<NodeEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainEdge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
    pub weight: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BrainGraph {
    pub version: u32,
    pub nodes: Vec<BrainNode>,
    pub edges: Vec<BrainEdge>,
}

impl BrainGraph {
    pub fn load(board: &str) -> Result<Self> {
        let path = graph_path(board)?;
        if !path.exists() {
            // Build fresh architectural graph if none exists
            let g = Self::build(board).unwrap_or_else(|_| Self { version: 2, ..Default::default() });
            let _ = g.save(board);
            return Ok(g);
        }
        let content = std::fs::read_to_string(&path).context("failed to read brain graph")?;
        let graph: Self = serde_json::from_str(&content).unwrap_or_default();
        // If graph is v1 (legacy session-flooded) or missing architectural nodes, rebuild it
        if graph.version < 2 || !graph.nodes.iter().any(|n| n.kind == NodeKind::Subsystem) {
            let rebuilt = Self::build(board).unwrap_or(graph);
            let _ = rebuilt.save(board);
            return Ok(rebuilt);
        }
        Ok(graph)
    }

    pub fn save(&self, board: &str) -> Result<()> {
        let path = graph_path(board)?;
        let json = serde_json::to_string_pretty(self)?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    pub fn node(&self, id: &str) -> Option<&BrainNode> {
        self.nodes.iter().find(|n| n.id == id)
    }

    pub fn neighbors(&self, id: &str) -> Vec<&BrainNode> {
        let mut ids: Vec<&str> = Vec::new();
        for e in &self.edges {
            if e.from == id && !ids.contains(&e.to.as_str()) {
                ids.push(&e.to);
            } else if e.to == id && !ids.contains(&e.from.as_str()) {
                ids.push(&e.from);
            }
        }
        ids.iter().filter_map(|i| self.node(i)).collect()
    }

    pub fn degree(&self, id: &str) -> usize {
        self.edges
            .iter()
            .filter(|e| e.from == id || e.to == id)
            .count()
    }

    pub fn degree_map(&self) -> HashMap<String, usize> {
        let mut m = HashMap::new();
        for e in &self.edges {
            *m.entry(e.from.clone()).or_insert(0) += 1;
            *m.entry(e.to.clone()).or_insert(0) += 1;
        }
        m
    }

    /// Extract a focused subgraph starting from `root_id` up to `max_depth` hops.
    pub fn subgraph(&self, root_id: &str, max_depth: usize) -> Self {
        let mut visited: HashSet<String> = HashSet::new();
        let mut current_frontier: HashSet<String> = HashSet::new();
        current_frontier.insert(root_id.to_string());
        visited.insert(root_id.to_string());

        for _ in 0..max_depth {
            let mut next_frontier: HashSet<String> = HashSet::new();
            for id in &current_frontier {
                for edge in &self.edges {
                    if edge.from == *id && !visited.contains(&edge.to) {
                        visited.insert(edge.to.clone());
                        next_frontier.insert(edge.to.clone());
                    } else if edge.to == *id && !visited.contains(&edge.from) {
                        visited.insert(edge.from.clone());
                        next_frontier.insert(edge.from.clone());
                    }
                }
            }
            if next_frontier.is_empty() {
                break;
            }
            current_frontier = next_frontier;
        }

        let nodes: Vec<BrainNode> = self
            .nodes
            .iter()
            .filter(|n| visited.contains(&n.id))
            .cloned()
            .collect();
        let edges: Vec<BrainEdge> = self
            .edges
            .iter()
            .filter(|e| visited.contains(&e.from) && visited.contains(&e.to))
            .cloned()
            .collect();

        Self {
            version: self.version,
            nodes,
            edges,
        }
    }

    /// Return nodes ranked by degree centrality (most connected first).
    pub fn centrality_ranked_nodes(&self) -> Vec<(&BrainNode, usize)> {
        let degrees = self.degree_map();
        let mut ranked: Vec<(&BrainNode, usize)> = self
            .nodes
            .iter()
            .map(|n| {
                let d = degrees.get(&n.id).copied().unwrap_or(0);
                (n, d)
            })
            .collect();
        ranked.sort_by(|a, b| b.1.cmp(&a.1));
        ranked
    }

    /// Rebuild the Codebase Brain graph from:
    /// 1. Structural repository architecture analysis (subsystems, modules, services, APIs, invariants)
    /// 2. Durable engineering knowledge (decisions, conventions, verified facts)
    ///
    /// Ephemeral session activity notes ("Session worked broadly in...") are strictly filtered out.
    pub fn build(board: &str) -> Result<Self> {
        use crate::brain::analyzer::analyze_codebase;
        use crate::brain::relations;
        use crate::memory::MemoryStore;
        use crate::storage::sessions::read_sessions;

        let mut graph = BrainGraph { version: 2, ..Default::default() };
        let mut seen: HashSet<String> = HashSet::new();

        // 1. Analyze codebase structure to establish the architectural backbone
        let (arch_nodes, arch_edges) = analyze_codebase(board);
        for n in arch_nodes {
            seen.insert(n.id.clone());
            graph.nodes.push(n);
        }
        for e in arch_edges {
            graph.edges.push(e);
        }

        let store = MemoryStore::open(board)?;
        let sessions = read_sessions(board).unwrap_or_default();

        // 2. Project Facts -> High confidence knowledge nodes (Decisions, Conventions, Invariants)
        for (i, fact) in store.memory.project_facts.iter().enumerate() {
            let id = format!("fact-{}", i);
            if seen.contains(&id) {
                continue;
            }

            let category_lower = fact.category.to_lowercase();
            let kind = if category_lower.contains("decision") || category_lower.contains("adr") {
                NodeKind::Decision
            } else if category_lower.contains("convention") || category_lower.contains("style") {
                NodeKind::Convention
            } else if category_lower.contains("invariant") || category_lower.contains("rule") {
                NodeKind::Invariant
            } else if category_lower.contains("pitfall") || category_lower.contains("bug") {
                NodeKind::Pitfall
            } else {
                NodeKind::Fact
            };

            let label: String = fact.fact.chars().take(80).collect();
            let desc = fact.fact.clone();

            graph.nodes.push(BrainNode {
                id: id.clone(),
                label,
                kind,
                tier: Some("long_term".into()),
                importance: fact.confidence.max(0.6),
                access_count: 5,
                tags: vec![fact.category.clone()],
                created_at: fact.created_at,
                description: Some(desc),
                evidence: Some(NodeEvidence {
                    commit_sha: fact.sources.first().cloned(),
                    ..Default::default()
                }),
            });
            seen.insert(id.clone());

            // Link fact to relevant subsystem
            let target_subsystem = if fact.fact.contains("web") || fact.fact.contains("React") || fact.fact.contains("UI") {
                "subsystem:web"
            } else if fact.fact.contains("desktop") || fact.fact.contains("Tauri") {
                "subsystem:desktop"
            } else if fact.fact.contains("server") || fact.fact.contains("API") || fact.fact.contains("Axum") {
                "subsystem:barkcli-server"
            } else {
                "subsystem:barkcli-core"
            };

            graph.edges.push(BrainEdge {
                from: target_subsystem.into(),
                to: id,
                kind: EdgeKind::ConstrainedBy,
                weight: fact.confidence,
            });
        }

        // 3. Durable Memory entries: Filter out spam session notes
        let mut id_map: HashMap<String, String> = HashMap::new();
        let mut kept_tokens: Vec<(String, Vec<String>)> = Vec::new();

        for entry in &store.memory.entries {
            // STRICT FILTER: reject activity logs and blast-radius spam
            let content_lower = entry.content.to_lowercase();
            if content_lower.starts_with("session worked broadly in")
                || content_lower.contains("files touched")
                || content_lower.ends_with("session: single prompt; committed")
                || (content_lower.contains("session:") && content_lower.contains("committed"))
            {
                continue;
            }

            let tokens = crate::memory::search::tokenize(&entry.content);
            let mut keep = true;
            for (keep_id, keep_tokens) in &kept_tokens {
                if crate::memory::search::cosine_similarity(&tokens, keep_tokens) > 0.95 {
                    id_map.insert(entry.id.clone(), keep_id.clone());
                    keep = false;
                    break;
                }
            }

            if keep {
                kept_tokens.push((entry.id.clone(), tokens));
                id_map.insert(entry.id.clone(), entry.id.clone());

                let kind = if entry.tags.iter().any(|t| t == "decision") {
                    NodeKind::Decision
                } else if entry.tags.iter().any(|t| t == "convention") {
                    NodeKind::Convention
                } else if entry.tags.iter().any(|t| t == "pitfall") {
                    NodeKind::Pitfall
                } else {
                    NodeKind::Memory
                };

                let label: String = entry.content.chars().take(80).collect();
                let desc = entry.content.clone();

                graph.nodes.push(BrainNode {
                    id: entry.id.clone(),
                    label,
                    kind,
                    tier: Some(tier_str(entry.tier)),
                    importance: entry.importance,
                    access_count: entry.access_count,
                    tags: entry.tags.clone(),
                    created_at: entry.created_at,
                    description: Some(desc),
                    evidence: Some(NodeEvidence {
                        session_id: entry.source.clone(),
                        ..Default::default()
                    }),
                });
                seen.insert(entry.id.clone());
            }
        }

        // 4. Build semantic relations between memories, facts, and architecture
        relations::build_edges(&mut graph, &store.memory, &sessions, &id_map);

        // 5. Dedup edges
        let mut edge_set: HashSet<(String, String, EdgeKind)> = HashSet::new();
        graph.edges.retain(|e| edge_set.insert((e.from.clone(), e.to.clone(), e.kind)));

        // Sort nodes for stable output
        graph.nodes.sort_by(|a, b| a.id.cmp(&b.id));
        graph.edges.sort_by(|a, b| (&a.from, &a.to).cmp(&(&b.from, &b.to)));

        let _ = seen;
        Ok(graph)
    }
}

pub fn tier_str(tier: crate::memory::MemoryTier) -> String {
    match tier {
        crate::memory::MemoryTier::Working => "working".into(),
        crate::memory::MemoryTier::ShortTerm => "short_term".into(),
        crate::memory::MemoryTier::LongTerm => "long_term".into(),
        crate::memory::MemoryTier::External => "external".into(),
    }
}

fn graph_path(board: &str) -> Result<PathBuf> {
    let board_dir = find_board_dir()?;
    let dir = board_dir.join("memory");
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join(format!("{}.graph.json", board)))
}
