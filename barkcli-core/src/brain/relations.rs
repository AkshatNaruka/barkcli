//! Deterministic relation inference for the brain graph.
//! Connects architectural subsystems, modules, domain models, decisions,
//! conventions, pitfalls, and verified facts.

use std::collections::{HashMap, HashSet};

use crate::brain::graph::{BrainEdge, BrainGraph, EdgeKind};
use crate::memory::store::Memory;
use crate::models::SessionEntry;

/// Build all edges between already-populated nodes in the graph.
pub fn build_edges(
    graph: &mut BrainGraph,
    memory: &Memory,
    _sessions: &[SessionEntry],
    id_map: &HashMap<String, String>, // collapsed duplicate memory ids
) {
    let node_ids: HashSet<String> = graph.nodes.iter().map(|n| n.id.clone()).collect();
    let mapped = |id: &str| id_map.get(id).cloned().unwrap_or_else(|| id.to_string());

    // 1. Link memory / fact nodes to architectural components
    for entry in &memory.entries {
        let from_id = mapped(&entry.id);
        if !node_ids.contains(&from_id) {
            continue;
        }

        let content_lower = entry.content.to_lowercase();

        // Connect to subsystems based on content / tags
        if content_lower.contains("web") || content_lower.contains("react") || content_lower.contains("ui") {
            if node_ids.contains("subsystem:web") {
                graph.edges.push(BrainEdge {
                    from: "subsystem:web".into(),
                    to: from_id.clone(),
                    kind: EdgeKind::ConstrainedBy,
                    weight: 0.8,
                });
            }
        }
        if content_lower.contains("storage") || content_lower.contains("board") || content_lower.contains("file") {
            if node_ids.contains("module:core:storage") {
                graph.edges.push(BrainEdge {
                    from: "module:core:storage".into(),
                    to: from_id.clone(),
                    kind: EdgeKind::ConstrainedBy,
                    weight: 0.8,
                });
            }
        }
        if content_lower.contains("agent") || content_lower.contains("worktree") || content_lower.contains("queue") {
            if node_ids.contains("service:task_queue") {
                graph.edges.push(BrainEdge {
                    from: "service:task_queue".into(),
                    to: from_id.clone(),
                    kind: EdgeKind::ConstrainedBy,
                    weight: 0.85,
                });
            }
        }
        if content_lower.contains("server") || content_lower.contains("api") || content_lower.contains("websocket") {
            if node_ids.contains("api:http_rest") {
                graph.edges.push(BrainEdge {
                    from: "api:http_rest".into(),
                    to: from_id.clone(),
                    kind: EdgeKind::ConstrainedBy,
                    weight: 0.8,
                });
            }
        }
        if content_lower.contains("desktop") || content_lower.contains("tauri") || content_lower.contains("menu") {
            if node_ids.contains("subsystem:desktop") {
                graph.edges.push(BrainEdge {
                    from: "subsystem:desktop".into(),
                    to: from_id.clone(),
                    kind: EdgeKind::ConstrainedBy,
                    weight: 0.8,
                });
            }
        }
    }

    // 2. Shared tags (>= 2) -> Related
    let valid_entries: Vec<&_> = memory
        .entries
        .iter()
        .filter(|e| node_ids.contains(&mapped(&e.id)))
        .collect();

    for i in 0..valid_entries.len() {
        for j in (i + 1)..valid_entries.len() {
            let a: HashSet<&String> = valid_entries[i].tags.iter().collect();
            let b: HashSet<&String> = valid_entries[j].tags.iter().collect();
            let shared = a.intersection(&b).count();
            if shared >= 2 {
                let from = mapped(&valid_entries[i].id);
                let to = mapped(&valid_entries[j].id);
                if from != to {
                    graph.edges.push(BrainEdge {
                        from,
                        to,
                        kind: EdgeKind::Related,
                        weight: (0.4 + 0.1 * shared as f32).min(1.0),
                    });
                }
            }
        }
    }

    // 3. Content semantic similarity -> Related
    for i in 0..valid_entries.len() {
        for j in (i + 1)..valid_entries.len() {
            let ta = crate::memory::search::tokenize(&valid_entries[i].content);
            let tb = crate::memory::search::tokenize(&valid_entries[j].content);
            let sim = crate::memory::search::cosine_similarity(&ta, &tb);
            if sim > 0.45 && sim <= 0.95 {
                let from = mapped(&valid_entries[i].id);
                let to = mapped(&valid_entries[j].id);
                if from != to {
                    graph.edges.push(BrainEdge {
                        from,
                        to,
                        kind: EdgeKind::Related,
                        weight: sim,
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::graph::BrainNode;
    use crate::brain::graph::NodeKind;
    use crate::memory::store::MemoryEntry;
    use crate::memory::MemoryTier;
    use chrono::Utc;

    #[test]
    fn shared_tags_create_related_edge() {
        let mut memory = Memory::default();
        let mut e1 = MemoryEntry::new("alpha architecture rule", MemoryTier::ShortTerm);
        e1.tags = vec!["arch".into(), "rule".into()];
        let mut e2 = MemoryEntry::new("beta architecture rule", MemoryTier::ShortTerm);
        e2.tags = vec!["arch".into(), "rule".into()];
        memory.entries.push(e1.clone());
        memory.entries.push(e2.clone());

        let mut graph = BrainGraph::default();
        graph.nodes.push(BrainNode {
            id: e1.id.clone(),
            label: "e1".into(),
            kind: NodeKind::Memory,
            tier: None,
            importance: 0.8,
            access_count: 0,
            tags: e1.tags.clone(),
            created_at: Utc::now(),
            description: None,
            evidence: None,
        });
        graph.nodes.push(BrainNode {
            id: e2.id.clone(),
            label: "e2".into(),
            kind: NodeKind::Memory,
            tier: None,
            importance: 0.8,
            access_count: 0,
            tags: e2.tags.clone(),
            created_at: Utc::now(),
            description: None,
            evidence: None,
        });

        build_edges(&mut graph, &memory, &[], &HashMap::new());
        assert!(graph.edges.iter().any(|e| e.kind == EdgeKind::Related));
    }
}
