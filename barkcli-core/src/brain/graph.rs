//! Brain graph: nodes (memories, facts, sessions, cards, agents) connected by
//! typed edges. Persisted at `.board/memory/<board>.graph.json`, rebuilt on
//! every consolidation. Layers == memory tiers (Working/ShortTerm/LongTerm/
//! External); nodes carry importance; edges carry weight.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::storage::board_dir::find_board_dir;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Memory,
    Fact,
    Session,
    Card,
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    DerivedFrom,
    TouchedCard,
    Related,
    SameSession,
    ProducedBy,
    FactOf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainNode {
    pub id: String,
    pub label: String,
    pub kind: NodeKind,
    /// Memory tier when kind=memory; facts map to long_term, sessions to
    /// short_term, cards/agents to external (layer assignment).
    pub tier: Option<String>,
    pub importance: f32,
    pub access_count: u32,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
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
            return Ok(Self { version: 1, ..Default::default() });
        }
        let content = std::fs::read_to_string(&path).context("failed to read brain graph")?;
        Ok(serde_json::from_str(&content).unwrap_or_default())
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

    /// Rebuild the graph from memory entries + sessions + facts.
    pub fn build(board: &str) -> Result<Self> {
        use crate::brain::relations;
        use crate::memory::MemoryStore;
        use crate::storage::sessions::read_sessions;

        let store = MemoryStore::open(board)?;
        let sessions = read_sessions(board)?;

        let mut graph = BrainGraph { version: 1, ..Default::default() };

        let mut seen: HashSet<String> = HashSet::new();

        // Memory nodes (with near-duplicate collapse > 0.95 content cosine)
        let mut id_map: HashMap<String, String> = HashMap::new();
        let mut kept_tokens: Vec<(String, Vec<String>)> = Vec::new();
        for entry in &store.memory.entries {
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
                graph.nodes.push(BrainNode {
                    id: entry.id.clone(),
                    label: entry.content.chars().take(80).collect(),
                    kind: NodeKind::Memory,
                    tier: Some(tier_str(entry.tier)),
                    importance: entry.importance,
                    access_count: entry.access_count,
                    tags: entry.tags.clone(),
                    created_at: entry.created_at,
                });
                seen.insert(entry.id.clone());
            }
        }

        // Fact nodes
        for (i, fact) in store.memory.project_facts.iter().enumerate() {
            let id = format!("fact-{}", i);
            graph.nodes.push(BrainNode {
                id: id.clone(),
                label: fact.fact.chars().take(80).collect(),
                kind: NodeKind::Fact,
                tier: Some("long_term".into()),
                importance: fact.confidence,
                access_count: 0,
                tags: vec![fact.category.clone()],
                created_at: fact.created_at,
            });
            seen.insert(id);
        }

        // Session nodes
        for s in &sessions {
            graph.nodes.push(BrainNode {
                id: format!("session:{}", s.id),
                label: s
                    .summary
                    .as_deref()
                    .or(s.prompt.as_deref())
                    .map(|t| t.chars().take(80).collect())
                    .unwrap_or_else(|| s.id.clone()),
                kind: NodeKind::Session,
                tier: Some("short_term".into()),
                importance: 0.5,
                access_count: 0,
                tags: s.agent.clone().map(|a| vec![format!("agent:{}", a)]).unwrap_or_default(),
                created_at: DateTime::parse_from_rfc3339(&s.at)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            });
        }

        // Card + agent nodes discovered via sessions
        let mut card_ids: HashSet<String> = HashSet::new();
        let mut agent_ids: HashSet<String> = HashSet::new();
        for s in &sessions {
            for c in &s.matched_card_ids {
                card_ids.insert(c.clone());
            }
            if let Some(a) = &s.agent {
                agent_ids.insert(a.clone());
            }
        }
        for entry in &store.memory.entries {
            for t in &entry.tags {
                if let Some(c) = t.strip_prefix("card:") {
                    card_ids.insert(c.to_string());
                }
            }
        }
        for c in &card_ids {
            graph.nodes.push(BrainNode {
                id: format!("card:{}", c),
                label: c.clone(),
                kind: NodeKind::Card,
                tier: Some("external".into()),
                importance: 0.5,
                access_count: 0,
                tags: Vec::new(),
                created_at: Utc::now(),
            });
        }
        for a in &agent_ids {
            graph.nodes.push(BrainNode {
                id: format!("agent:{}", a),
                label: a.clone(),
                kind: NodeKind::Agent,
                tier: Some("external".into()),
                importance: 0.5,
                access_count: 0,
                tags: Vec::new(),
                created_at: Utc::now(),
            });
        }

        relations::build_edges(&mut graph, &store.memory, &sessions, &id_map);

        // Dedup edges
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
