//! Deterministic relation inference for the brain graph.

use std::collections::{HashMap, HashSet};

use crate::brain::graph::{BrainEdge, BrainGraph, EdgeKind};
use crate::memory::store::Memory;
use crate::models::SessionEntry;

/// Build all edges between already-populated nodes.
pub fn build_edges(
    graph: &mut BrainGraph,
    memory: &Memory,
    sessions: &[SessionEntry],
    id_map: &HashMap<String, String>, // collapsed duplicate memory ids
) {
    let mapped = |id: &str| id_map.get(id).cloned().unwrap_or_else(|| id.to_string());

    // memory -> session links
    for entry in &memory.entries {
        if let Some(src) = &entry.source {
            if let Some(rest) = src.strip_prefix("session:") {
                graph.edges.push(BrainEdge {
                    from: mapped(&entry.id),
                    to: format!("session:{}", rest),
                    kind: EdgeKind::DerivedFrom,
                    weight: 1.0,
                });
            }
        }

        // memory -> card links via tags
        for t in &entry.tags {
            if let Some(c) = t.strip_prefix("card:") {
                graph.edges.push(BrainEdge {
                    from: mapped(&entry.id),
                    to: format!("card:{}", c),
                    kind: EdgeKind::Related,
                    weight: 0.8,
                });
            }
        }

        // memory -> agent via tag
        for t in &entry.tags {
            if let Some(a) = t.strip_prefix("agent:") {
                graph.edges.push(BrainEdge {
                    from: mapped(&entry.id),
                    to: format!("agent:{}", a),
                    kind: EdgeKind::ProducedBy,
                    weight: 0.6,
                });
            }
        }
    }

    // session -> card / agent links
    for s in sessions {
        for c in &s.matched_card_ids {
            graph.edges.push(BrainEdge {
                from: format!("session:{}", s.id),
                to: format!("card:{}", c),
                kind: EdgeKind::TouchedCard,
                weight: 1.0,
            });
        }
        if let Some(a) = &s.agent {
            graph.edges.push(BrainEdge {
                from: format!("session:{}", s.id),
                to: format!("agent:{}", a),
                kind: EdgeKind::ProducedBy,
                weight: 1.0,
            });
        }
    }

    // memories in the same session are interconnected
    let mut by_session: HashMap<String, Vec<String>> = HashMap::new();
    for entry in &memory.entries {
        if let Some(src) = &entry.source {
            if let Some(rest) = src.strip_prefix("session:") {
                by_session.entry(rest.to_string()).or_default().push(entry.id.clone());
            }
        }
    }
    for ids in by_session.values() {
        for i in 0..ids.len() {
            for j in (i + 1)..ids.len() {
                graph.edges.push(BrainEdge {
                    from: mapped(&ids[i]),
                    to: mapped(&ids[j]),
                    kind: EdgeKind::SameSession,
                    weight: 0.7,
                });
            }
        }
    }

    // shared tags (>= 2) -> related
    let entries: Vec<&_> = memory.entries.iter().collect();
    for i in 0..entries.len() {
        for j in (i + 1)..entries.len() {
            let a: HashSet<&String> = entries[i].tags.iter().collect();
            let b: HashSet<&String> = entries[j].tags.iter().collect();
            let shared = a.intersection(&b).count();
            if shared >= 2 {
                graph.edges.push(BrainEdge {
                    from: mapped(&entries[i].id),
                    to: mapped(&entries[j].id),
                    kind: EdgeKind::Related,
                    weight: (0.4 + 0.1 * shared as f32).min(1.0),
                });
            }
        }
    }

    // content similarity -> related
    for i in 0..entries.len() {
        for j in (i + 1)..entries.len() {
            let ta = crate::memory::search::tokenize(&entries[i].content);
            let tb = crate::memory::search::tokenize(&entries[j].content);
            let sim = crate::memory::search::cosine_similarity(&ta, &tb);
            if sim > 0.45 && sim <= 0.95 {
                graph.edges.push(BrainEdge {
                    from: mapped(&entries[i].id),
                    to: mapped(&entries[j].id),
                    kind: EdgeKind::Related,
                    weight: sim,
                });
            }
        }
    }

    // facts -> session sources
    for (i, fact) in memory.project_facts.iter().enumerate() {
        for src in &fact.sources {
            if let Some(rest) = src.strip_prefix("session:") {
                graph.edges.push(BrainEdge {
                    from: format!("fact-{}", i),
                    to: format!("session:{}", rest),
                    kind: EdgeKind::FactOf,
                    weight: fact.confidence,
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::store::MemoryEntry;
    use crate::memory::MemoryTier;

    #[test]
    fn same_session_links_memories() {
        let mut memory = Memory::default();
        let mut e1 = MemoryEntry::new("did a thing", MemoryTier::ShortTerm);
        e1.source = Some("session:s1".into());
        let mut e2 = MemoryEntry::new("did another thing", MemoryTier::ShortTerm);
        e2.source = Some("session:s1".into());
        memory.entries.push(e1);
        memory.entries.push(e2);

        let mut graph = BrainGraph::default();
        build_edges(&mut graph, &memory, &[], &HashMap::new());
        assert!(graph.edges.iter().any(|e| e.kind == EdgeKind::SameSession));
    }

    #[test]
    fn shared_tags_create_related_edge() {
        let mut memory = Memory::default();
        let mut e1 = MemoryEntry::new("alpha", MemoryTier::ShortTerm);
        e1.tags = vec!["a".into(), "b".into()];
        let mut e2 = MemoryEntry::new("beta", MemoryTier::ShortTerm);
        e2.tags = vec!["a".into(), "b".into()];
        memory.entries.push(e1);
        memory.entries.push(e2);

        let mut graph = BrainGraph::default();
        build_edges(&mut graph, &memory, &[], &HashMap::new());
        assert!(graph.edges.iter().any(|e| e.kind == EdgeKind::Related));
    }
}
