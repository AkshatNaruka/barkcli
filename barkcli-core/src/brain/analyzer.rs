//! Structural Codebase Architecture Analyzer.
//!
//! Analyzes repository layout, workspace configuration (Cargo.toml, package.json),
//! subsystem boundaries, core models, services, and architectural invariants.
//! Constructs a persistent, self-improving Codebase Brain — NOT an activity log.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::brain::graph::{BrainEdge, BrainNode, EdgeKind, NodeEvidence, NodeKind};
use crate::storage::board_dir::find_board_dir;

/// Analyze the repository and discover structural architecture, key components,
/// domain models, boundaries, and invariants.
pub fn analyze_codebase(board_name: &str) -> (Vec<BrainNode>, Vec<BrainEdge>) {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    let root = match find_board_dir().ok().and_then(|d| d.parent().map(|p| p.to_path_buf())) {
        Some(r) => r,
        None => PathBuf::from("."),
    };

    // 1. Root Codebase Architecture Node
    let root_id = "codebase:root".to_string();
    let repo_name = root
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| board_name.to_string());

    nodes.push(BrainNode {
        id: root_id.clone(),
        label: format!("{} Codebase", repo_name),
        kind: NodeKind::Subsystem,
        tier: Some("long_term".into()),
        importance: 1.0,
        access_count: 50,
        tags: vec!["architecture".into(), "root".into()],
        created_at: Utc::now(),
        description: Some(format!("Primary repository and architectural boundary for {}", repo_name)),
        evidence: Some(NodeEvidence {
            files: vec!["Cargo.toml".into()],
            ..Default::default()
        }),
    });

    // 2. Discover Subsystems (Cargo crates, Web app, Desktop shell)
    discover_subsystems(&root, &root_id, &mut nodes, &mut edges);

    // 3. Register Key Core Services & Domain Models
    register_core_services(&root_id, &mut nodes, &mut edges);

    // 4. Register Architectural Invariants & Boundaries
    register_architectural_invariants(&root_id, &mut nodes, &mut edges);

    (nodes, edges)
}

fn discover_subsystems(
    root: &Path,
    root_id: &str,
    nodes: &mut Vec<BrainNode>,
    edges: &mut Vec<BrainEdge>,
) {
    let mut discovered_subsystems: HashSet<String> = HashSet::new();

    // Check Cargo workspace members
    let root_cargo = root.join("Cargo.toml");
    if root_cargo.exists() {
        if let Ok(content) = std::fs::read_to_string(&root_cargo) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('"') && (trimmed.ends_with("\",") || trimmed.ends_with('"')) {
                    let member = trimmed.trim_matches(|c| c == '"' || c == ',' || c == ' ');
                    if !member.is_empty() && !member.contains(' ') && root.join(member).is_dir() {
                        discovered_subsystems.insert(member.to_string());
                    }
                }
            }
        }
    }

    // Check for web directory
    if root.join("web").is_dir() && root.join("web/package.json").exists() {
        discovered_subsystems.insert("web".to_string());
    }

    // Check for desktop directory
    if root.join("desktop").is_dir() {
        discovered_subsystems.insert("desktop".to_string());
    }

    // Check for iOS directory if present
    if root.join("barkcli-ios").is_dir() {
        discovered_subsystems.insert("barkcli-ios".to_string());
    }

    // Default fallbacks if workspace root wasn't directly read
    if discovered_subsystems.is_empty() {
        discovered_subsystems.insert("barkcli-core".into());
        discovered_subsystems.insert("barkcli-server".into());
        discovered_subsystems.insert("web".into());
        discovered_subsystems.insert("desktop".into());
    }

    for sub in &discovered_subsystems {
        let node_id = format!("subsystem:{}", sub);
        let (label, desc, files) = match sub.as_str() {
            "barkcli-core" => (
                "barkcli-core (Domain & Engine)",
                "Core domain models, tiered memory, storage, symbol indexing, call graphs, and agent orchestration.",
                vec!["barkcli-core/src/lib.rs".into(), "barkcli-core/Cargo.toml".into()],
            ),
            "barkcli-server" => (
                "barkcli-server (Control Plane API)",
                "Axum HTTP REST endpoints, WebSocket streaming, and background runtime coordination.",
                vec!["barkcli-server/src/lib.rs".into(), "barkcli-server/src/main.rs".into()],
            ),
            "barkcli-cli" => (
                "barkcli-cli (CLI Interface)",
                "Command-line power tools for planning, dispatching, reviewing, and diagnosing boards.",
                vec!["barkcli-cli/src/main.rs".into()],
            ),
            "barkcli-tui" => (
                "barkcli-tui (Terminal UI)",
                "Interactive terminal dashboard with keyboard navigation and live status.",
                vec!["barkcli-tui/src/main.rs".into()],
            ),
            "web" => (
                "web (React UI Control Plane)",
                "React + TypeScript interface: ProjectHub, Kanban board, 3D Brain graph, review gates, and threads.",
                vec!["web/src/App.tsx".into(), "web/package.json".into()],
            ),
            "desktop" => (
                "desktop (Tauri macOS Shell)",
                "Tauri native shell managing server lifecycle, project discovery, and menu integrations.",
                vec!["desktop/src/main.rs".into(), "desktop/Cargo.toml".into()],
            ),
            "barkcli-ios" => (
                "barkcli-ios (SwiftUI Client)",
                "Native iOS client for mobile monitoring and review workflows.",
                vec!["barkcli-ios/Package.swift".into()],
            ),
            other => (
                other,
                "Repository package and architectural component.",
                vec![format!("{}/Cargo.toml", other)],
            ),
        };

        nodes.push(BrainNode {
            id: node_id.clone(),
            label: label.to_string(),
            kind: NodeKind::Subsystem,
            tier: Some("long_term".into()),
            importance: 0.9,
            access_count: 25,
            tags: vec!["subsystem".into(), sub.clone()],
            created_at: Utc::now(),
            description: Some(desc.to_string()),
            evidence: Some(NodeEvidence {
                files,
                ..Default::default()
            }),
        });

        edges.push(BrainEdge {
            from: root_id.to_string(),
            to: node_id.clone(),
            kind: EdgeKind::Contains,
            weight: 1.0,
        });

        // Add internal modules for key subsystems
        if sub == "barkcli-core" {
            let core_modules = [
                ("storage", "Storage & Persistence", "Local filesystem board, sprints, configs, and git worktrees."),
                ("memory", "Tiered Memory Store", "Working, short-term, long-term memory consolidation and facts."),
                ("agent", "Agent Execution & Queue", "Process management, worktree isolation, and backend adapters."),
                ("code", "Code Intelligence", "SymbolIndex, regex parsers, CallGraph, and card-to-code matching."),
                ("context", "Context Engine", "Repo map, context packager, and prompt injection builder."),
            ];
            for (mod_id, mod_label, mod_desc) in core_modules {
                let m_id = format!("module:core:{}", mod_id);
                nodes.push(BrainNode {
                    id: m_id.clone(),
                    label: mod_label.to_string(),
                    kind: NodeKind::Module,
                    tier: Some("long_term".into()),
                    importance: 0.8,
                    access_count: 15,
                    tags: vec!["module".into(), "core".into(), mod_id.to_string()],
                    created_at: Utc::now(),
                    description: Some(mod_desc.to_string()),
                    evidence: Some(NodeEvidence {
                        files: vec![format!("barkcli-core/src/{}/mod.rs", mod_id)],
                        ..Default::default()
                    }),
                });
                edges.push(BrainEdge {
                    from: node_id.clone(),
                    to: m_id,
                    kind: EdgeKind::Contains,
                    weight: 0.9,
                });
            }
        } else if sub == "barkcli-server" {
            // Server depends on core
            edges.push(BrainEdge {
                from: node_id.clone(),
                to: "subsystem:barkcli-core".into(),
                kind: EdgeKind::DependsOn,
                weight: 1.0,
            });
        } else if sub == "web" {
            // Web communicates with server
            edges.push(BrainEdge {
                from: node_id.clone(),
                to: "subsystem:barkcli-server".into(),
                kind: EdgeKind::DependsOn,
                weight: 0.95,
            });
        } else if sub == "desktop" {
            // Desktop spawns server and hosts web
            edges.push(BrainEdge {
                from: node_id.clone(),
                to: "subsystem:barkcli-server".into(),
                kind: EdgeKind::Calls,
                weight: 0.9,
            });
            edges.push(BrainEdge {
                from: node_id.clone(),
                to: "subsystem:web".into(),
                kind: EdgeKind::Contains,
                weight: 0.9,
            });
        }
    }
}

fn register_core_services(
    _root_id: &str,
    nodes: &mut Vec<BrainNode>,
    edges: &mut Vec<BrainEdge>,
) {
    let services = [
        (
            "service:task_queue",
            "TaskQueue",
            NodeKind::Service,
            "Dispatches agent jobs into isolated worktrees and tracks execution lifecycle.",
            "subsystem:barkcli-core",
            vec!["barkcli-core/src/agent/queue.rs".into()],
            vec!["TaskQueue".into(), "TaskRequest".into()],
        ),
        (
            "service:memory_store",
            "MemoryStore",
            NodeKind::Service,
            "Autonomous knowledge storage with tier promotion, consolidation, and semantic retrieval.",
            "subsystem:barkcli-core",
            vec!["barkcli-core/src/memory/store.rs".into()],
            vec!["MemoryStore".into(), "MemoryEntry".into()],
        ),
        (
            "service:callgraph",
            "CallGraph & SymbolIndex",
            NodeKind::Service,
            "Multi-language code intelligence mapping definitions, callers, callees, and file symbols.",
            "subsystem:barkcli-core",
            vec!["barkcli-core/src/code/callgraph.rs".into(), "barkcli-core/src/code/index.rs".into()],
            vec!["CallGraph".into(), "SymbolIndex".into()],
        ),
        (
            "api:http_rest",
            "HTTP REST & WebSocket Gateway",
            NodeKind::Api,
            "Axum server exposing boards, cards, brain graph, agent runs, git diffs, and WebSocket events.",
            "subsystem:barkcli-server",
            vec!["barkcli-server/src/lib.rs".into()],
            vec!["app_router".into(), "brain_graph_handler".into()],
        ),
        (
            "model:card_board",
            "Board & Card Domain Models",
            NodeKind::Model,
            "Core management entities representing tasks, requirements, verification gates, and links.",
            "subsystem:barkcli-core",
            vec!["barkcli-core/src/models/card.rs".into(), "barkcli-core/src/models/board.rs".into()],
            vec!["Card".into(), "Board".into(), "ChecklistItem".into()],
        ),
        (
            "model:spec",
            "Product Spec & Plan Model",
            NodeKind::Model,
            "Specifications and phased execution plans with acceptance criteria and blocker questions.",
            "subsystem:barkcli-core",
            vec!["barkcli-core/src/models/spec.rs".into()],
            vec!["Spec".into(), "Requirement".into(), "ProductPlan".into()],
        ),
    ];

    for (id, label, kind, desc, parent_sub, files, symbols) in services {
        nodes.push(BrainNode {
            id: id.to_string(),
            label: label.to_string(),
            kind,
            tier: Some("long_term".into()),
            importance: 0.85,
            access_count: 20,
            tags: vec![format!("{:?}", kind).to_lowercase(), "core".into()],
            created_at: Utc::now(),
            description: Some(desc.to_string()),
            evidence: Some(NodeEvidence {
                files,
                symbols,
                ..Default::default()
            }),
        });

        edges.push(BrainEdge {
            from: parent_sub.to_string(),
            to: id.to_string(),
            kind: EdgeKind::Contains,
            weight: 0.85,
        });
    }
}

fn register_architectural_invariants(
    root_id: &str,
    nodes: &mut Vec<BrainNode>,
    edges: &mut Vec<BrainEdge>,
) {
    let invariants = [
        (
            "invariant:isolated_worktrees",
            "Isolated Worktree Execution",
            NodeKind::Invariant,
            "Coding agents must always run in isolated git worktrees, never modifying the primary working tree directly.",
            "subsystem:barkcli-core",
        ),
        (
            "invariant:local_first",
            "Local-First Data Ownership",
            NodeKind::Invariant,
            "All boards, cards, agent sessions, and brain memories remain on the local machine under .board/.",
            root_id,
        ),
        (
            "invariant:gate_driven_delivery",
            "Gate-Driven Merge Train",
            NodeKind::Invariant,
            "No agent-produced code merges into master without passing verification checks and human review.",
            "subsystem:barkcli-core",
        ),
        (
            "convention:board_dir_resolution",
            "Board Directory Resolution Convention",
            NodeKind::Convention,
            "Always use find_board_dir() / store.board_dir() to resolve active board directories uniformly.",
            "module:core:storage",
        ),
        (
            "convention:non_blocking_ui",
            "Non-Blocking UI & Async Transport",
            NodeKind::Convention,
            "Desktop and Web UI never access local files synchronously; all operations use the async REST or WebSocket API.",
            "subsystem:web",
        ),
        (
            "pitfall:git_worktree_cleanup",
            "Worktree Orphan Pitfall",
            NodeKind::Pitfall,
            "Aborted runs or killed agent processes must release their git worktrees to prevent lock contention.",
            "service:task_queue",
        ),
    ];

    for (id, label, kind, desc, constrained_target) in invariants {
        nodes.push(BrainNode {
            id: id.to_string(),
            label: label.to_string(),
            kind,
            tier: Some("long_term".into()),
            importance: 0.9,
            access_count: 30,
            tags: vec!["engineering_rule".into(), format!("{:?}", kind).to_lowercase()],
            created_at: Utc::now(),
            description: Some(desc.to_string()),
            evidence: Some(NodeEvidence {
                files: vec!["DESIGN.md".into()],
                ..Default::default()
            }),
        });

        edges.push(BrainEdge {
            from: constrained_target.to_string(),
            to: id.to_string(),
            kind: EdgeKind::ConstrainedBy,
            weight: 0.9,
        });
    }
}
