use anyhow::{Context, Result};

use crate::brain::graph::BrainGraph;
use crate::util::style;

/// `barkcli brain <subcommand>` — Inspect the memory brain graph.
///
/// Subcommands:
///   stats            Node/edge counts by kind and tier
///   graph [--json]   Dump the graph (human table or JSON)
///   neighbors <id>   Show nodes connected to a node
pub fn run_brain(args: &[String]) -> Result<()> {
    let sub = args.first().map(|s| s.as_str()).unwrap_or("stats");
    let rest = &args[1..];

    match sub {
        "stats" | "status" => run_stats(),
        "graph" | "dump" => run_graph(rest),
        "neighbors" | "related" => run_neighbors(rest),
        "help" | "--help" | "-h" => {
            println!("Usage: barkcli brain [stats|graph|neighbors]");
            Ok(())
        }
        other => anyhow::bail!("unknown brain subcommand '{}'", other),
    }
}

fn run_stats() -> Result<()> {
    let board = default_board()?;
    let graph = BrainGraph::load(&board)?;

    println!("{} Brain graph for '{}':", style::accent("Brain:"), board);
    println!("  Nodes: {}   Edges: {}", graph.nodes.len(), graph.edges.len());

    let mut by_kind: std::collections::HashMap<&str, usize> = Default::default();
    let mut by_tier: std::collections::HashMap<&str, usize> = Default::default();
    for n in &graph.nodes {
        *by_kind.entry(kind_str(n.kind)).or_insert(0) += 1;
        if let Some(t) = &n.tier {
            *by_tier.entry(t).or_insert(0) += 1;
        }
    }
    println!("  By kind:");
    for (k, v) in &by_kind {
        println!("    {}: {}", k, v);
    }
    println!("  By layer (tier):");
    for (t, v) in &by_tier {
        println!("    {}: {}", t, v);
    }

    let degrees = graph.degree_map();
    let mut top: Vec<(&String, &usize)> = degrees.iter().collect();
    top.sort_by(|a, b| b.1.cmp(a.1));
    if !top.is_empty() {
        println!("  Most connected nodes:");
        for (id, d) in top.iter().take(5) {
            println!("    {} ({} links)", id, d);
        }
    }
    Ok(())
}

fn run_graph(args: &[String]) -> Result<()> {
    let board = default_board()?;
    let graph = BrainGraph::load(&board)?;
    if args.iter().any(|a| a == "--json") {
        println!("{}", serde_json::to_string_pretty(&graph)?);
        return Ok(());
    }
    for n in &graph.nodes {
        println!(
            "  [{}] {} — {} (importance {:.2})",
            kind_str(n.kind),
            n.id,
            truncate(&n.label, 60),
            n.importance
        );
    }
    println!();
    for e in &graph.edges {
        println!(
            "  {} --({:?}, {:.2})--> {}",
            e.from, e.kind, e.weight, e.to
        );
    }
    Ok(())
}

fn run_neighbors(args: &[String]) -> Result<()> {
    let board = default_board()?;
    let graph = BrainGraph::load(&board)?;
    let id = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .context("usage: barkcli brain neighbors <node-id>")?;
    let neighbors = graph.neighbors(id);
    if neighbors.is_empty() {
        println!("{} No connections for '{}'", style::muted("Brain:"), id);
        return Ok(());
    }
    println!("{} {} connected to:", style::accent("Brain:"), neighbors.len());
    for n in neighbors {
        println!(
            "  - [{}] {} — {} (importance {:.2})",
            kind_str(n.kind),
            n.id,
            truncate(&n.label, 60),
            n.importance
        );
    }
    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

fn kind_str(k: crate::brain::graph::NodeKind) -> &'static str {
    match k {
        crate::brain::graph::NodeKind::Memory => "memory",
        crate::brain::graph::NodeKind::Fact => "fact",
        crate::brain::graph::NodeKind::Session => "session",
        crate::brain::graph::NodeKind::Card => "card",
        crate::brain::graph::NodeKind::Agent => "agent",
    }
}

fn default_board() -> Result<String> {
    let board_dir = crate::storage::board_dir::find_board_dir()?;
    let config = crate::storage::config_store::read_config(&board_dir)?;
    config
        .default_board
        .or_else(|| {
            let root = board_dir.parent()?;
            std::fs::read_dir(root)
                .ok()?
                .filter_map(|e| e.ok())
                .find(|e| {
                    e.path()
                        .extension()
                        .map(|ext| ext == "board")
                        .unwrap_or(false)
                })
                .map(|e| {
                    e.path()
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                })
        })
        .ok_or_else(|| anyhow::anyhow!("No boards found. Run barkcli create <name> first."))
}
