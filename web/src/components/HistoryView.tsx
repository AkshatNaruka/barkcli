import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from "@xyflow/react";
import { Icon } from "./Icon";
import {
  fetchBundles,
  scanBundles,
  approveBundle,
  rejectBundle,
  sealBundle,
  fetchGitCommits,
  fetchCommitDiff,
  assignCommitToAgent,
  fetchAgentsList,
  type GitCommit,
  type GitDiffResponse,
  type AgentItem,
} from "../lib/api";
import type { Bundle } from "../lib/types";
import { labelColor } from "../lib/labels";

// ── Kind Chip ─────────────────────────────────────────────────────────────
function KindChip({ kind }: { kind: string }) {
  const { color } = labelColor(kind || "chore");
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {kind}
    </span>
  );
}

// ── Custom n8n-style Workflow Commit Node ─────────────────────────────────
const CommitFlowNode = React.memo(function CommitFlowNode({
  data,
  selected,
}: {
  data: {
    commit: GitCommit;
    onSelect: (sha: string) => void;
    onAssign: (commit: GitCommit) => void;
  };
  selected?: boolean;
}) {
  const c = data.commit;
  return (
    <div
      onClick={() => data.onSelect(c.sha)}
      className={`rounded-xl px-3.5 py-3 bg-card border transition-all cursor-pointer select-none shadow-sm ${
        selected
          ? "border-accent ring-2 ring-accent/35 shadow-lg scale-[1.02]"
          : "border-border hover:border-border-strong hover:shadow-md"
      }`}
      style={{ width: 260 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 8,
          height: 8,
          background: "var(--accent)",
          border: "2px solid var(--card)",
          left: -4,
        }}
      />
      <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
        <span className="font-mono bg-surface px-1.5 py-0.5 rounded text-accent-text font-semibold border border-border">
          {c.sha ? c.sha.slice(0, 7) : ""}
        </span>
        <span className="truncate max-w-[110px]" title={c.author || ""}>
          {c.author || "Unknown"}
        </span>
      </div>

      <div className="text-xs font-medium text-text leading-snug line-clamp-2 mb-2">
        {c.subject || "No subject"}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border">
        <div className="flex items-center gap-2 font-mono">
          {(c.additions ?? 0) > 0 && <span className="text-success">+{c.additions}</span>}
          {(c.deletions ?? 0) > 0 && <span className="text-danger">-{c.deletions}</span>}
          {(c.additions ?? 0) === 0 && (c.deletions ?? 0) === 0 && <span>0 diff</span>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onAssign(c);
          }}
          className="px-2 py-0.5 rounded bg-accent-soft text-accent-text hover:bg-accent hover:text-white transition-colors font-medium flex items-center gap-1"
          title="Create and assign task to agent"
        >
          <Icon name="robot" size={10} />
          <span>Assign</span>
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 8,
          height: 8,
          background: "var(--accent)",
          border: "2px solid var(--card)",
          right: -4,
        }}
      />
    </div>
  );
});

const nodeTypes = {
  commitNode: CommitFlowNode,
};

// ── Little Cards Bundle Card ──────────────────────────────────────────────
function BundleCard({
  bundle,
  onApprove,
  onReject,
  onSeal,
  onInspectSha,
  onAssignFromBundle,
}: {
  bundle: Bundle;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSeal: (id: string) => void;
  onInspectSha: (sha: string) => void;
  onAssignFromBundle: (bundle: Bundle) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isUnsorted = bundle.id.endsWith("-unsorted");

  return (
    <div
      className={`rounded-xl p-4 mb-3 transition-all border ${
        isUnsorted
          ? "border-dashed border-border bg-card/60"
          : "border-border bg-card hover:border-border-strong shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <KindChip kind={bundle.kind} />
            {bundle.status === "sealed" && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-accent-text bg-accent-soft">
                sealed
              </span>
            )}
            <span className="text-xs font-mono text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
              {bundle.branch}
            </span>
            {bundle.confidence > 0 && (
              <span className="text-xs text-muted font-medium">
                {Math.round(bundle.confidence * 100)}% confidence
              </span>
            )}
          </div>

          <h4 className="font-semibold text-text text-sm leading-tight mt-1 truncate">
            {bundle.title}
          </h4>

          {bundle.summary && (
            <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2">
              {bundle.summary}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-muted flex-wrap">
            <span className="flex items-center gap-1">
              <Icon name="history" size={12} />
              {bundle.commit_count} {bundle.commit_count === 1 ? "commit" : "commits"}
            </span>
            <span className="font-mono text-[11px] text-muted">
              {bundle.first_sha?.slice(0, 7)}..{bundle.last_sha?.slice(0, 7)}
            </span>
            {bundle.card_id && (
              <span className="text-accent-text font-medium flex items-center gap-1">
                <Icon name="link" size={11} />
                {bundle.card_id}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onAssignFromBundle(bundle)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-accent-soft text-accent-text hover:bg-accent hover:text-white transition-colors font-medium flex items-center gap-1"
            title="Create agent task from this bundle"
          >
            <Icon name="robot" size={12} />
            <span>Assign</span>
          </button>

          {!bundle.status.includes("sealed") && (
            <>
              <button
                onClick={() => onApprove(bundle.id)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-success-soft text-success hover:opacity-85 transition-opacity font-medium"
              >
                Approve
              </button>
              <button
                onClick={() => onSeal(bundle.id)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-surface text-muted hover:text-text hover:bg-card transition-colors font-medium border border-border"
              >
                Seal
              </button>
              <button
                onClick={() => onReject(bundle.id)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-danger-soft text-danger hover:opacity-85 transition-opacity font-medium"
              >
                Reject
              </button>
            </>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs p-1.5 rounded-lg hover:bg-surface text-muted transition-colors"
            title={expanded ? "Collapse commits" : "Expand commits"}
          >
            <span className={`inline-flex transition-transform duration-200 ${expanded ? "" : "rotate-90"}`}>
              <Icon name="chevR" size={14} />
            </span>
          </button>
        </div>
      </div>

      {expanded && bundle.commits && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5">
          <div className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
            Bundle Commits
          </div>
          {bundle.commits.map((c: any) => (
            <div
              key={c.sha}
              onClick={() => onInspectSha(c.sha)}
              className="flex items-center justify-between gap-3 p-2 rounded-lg bg-surface hover:bg-card-hover border border-border cursor-pointer transition-colors text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-accent-text font-semibold">
                  {c.sha ? c.sha.slice(0, 7) : ""}
                </span>
                <span className="text-text truncate">{c.subject}</span>
              </div>
              <span className="text-muted text-[11px] shrink-0 font-mono">
                {c.author}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main HistoryView Component ────────────────────────────────────────────
export function HistoryView({ boardName }: { boardName: string | null }) {
  const [viewMode, setViewMode] = useState<"flow" | "tree" | "cards">("flow");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("HEAD");
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [scanning, setScanning] = useState(false);

  // Codex Diff Inspector Drawer
  const [inspectSha, setInspectSha] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<GitDiffResponse | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Assign to Agent Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDesc, setAssignDesc] = useState("");
  const [assignColumn, setAssignColumn] = useState("todo");
  const [assignPriority, setAssignPriority] = useState("medium");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [assignSha, setAssignSha] = useState("");
  const [assignFiles, setAssignFiles] = useState<string[]>([]);
  const [assignCriteria, setAssignCriteria] = useState<string[]>([
    "Project acceptance tests pass cleanly",
    "Branch passes merge acceptance gate",
  ]);
  const [newCriterion, setNewCriterion] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Show transient toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  // Load bundles, commits, and agents
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bundleRes, commitRes, agentRes] = await Promise.all([
        fetchBundles().catch(() => ({ bundles: [] })),
        fetchGitCommits(selectedBranch === "HEAD" ? undefined : selectedBranch, 60).catch(() => ({
          branch: "HEAD",
          branches: ["master"],
          commits: [],
        })),
        fetchAgentsList().catch(() => ({ agents: [] })),
      ]);
      setBundles(bundleRes.bundles || []);
      setCommits(commitRes.commits || []);
      setBranches(commitRes.branches || []);
      if (commitRes.branch && selectedBranch === "HEAD") {
        setSelectedBranch(commitRes.branch);
      }
      setAgents(agentRes.agents || []);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load diff when inspectSha changes
  useEffect(() => {
    if (!inspectSha) {
      setDiffData(null);
      return;
    }
    setLoadingDiff(true);
    fetchCommitDiff(inspectSha)
      .then((data) => setDiffData(data))
      .catch(() => setDiffData(null))
      .finally(() => setLoadingDiff(false));
  }, [inspectSha]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await scanBundles();
      await loadData();
      showToast("Scan finished: commit bundles updated");
    } finally {
      setScanning(false);
    }
  };

  const handleApprove = async (id: string) => {
    await approveBundle(id);
    await loadData();
  };

  const handleReject = async (id: string) => {
    await rejectBundle(id);
    await loadData();
  };

  const handleSeal = async (id: string) => {
    await sealBundle(id);
    await loadData();
  };

  // Open Assign Modal for a single commit
  const openAssignModalForCommit = (c: GitCommit) => {
    setAssignSha(c.sha);
    setAssignTitle(c.subject);
    setAssignDesc(
      `Autonomous execution derived from commit ${c.sha ? c.sha.slice(0, 8) : ""} authored by ${c.author || "Unknown"}.\n\nMessage:\n${c.body || c.subject || ""}`
    );
    setAssignFiles(c.files_changed || []);
    if (agents.length > 0 && !assignAgentId) {
      setAssignAgentId(agents[0].id);
    }
    setAssignModalOpen(true);
  };

  // Open Assign Modal from a bundle
  const openAssignModalForBundle = (b: Bundle) => {
    setAssignSha(b.first_sha || "");
    setAssignTitle(b.title);
    setAssignDesc(
      `Bundle execution for [${b.title}] across branch ${b.branch}.\n\nSummary:\n${b.summary || "No summary"}`
    );
    const files = (b.commits || []).flatMap((c: any) => c.files_changed || []);
    setAssignFiles(Array.from(new Set(files)));
    if (agents.length > 0 && !assignAgentId) {
      setAssignAgentId(agents[0].id);
    }
    setAssignModalOpen(true);
  };

  // Dispatch task to agent
  const handleDispatchTask = async () => {
    if (!assignTitle.trim()) return;
    setAssigning(true);
    try {
      const res = await assignCommitToAgent({
        board_name: boardName || undefined,
        commit_sha: assignSha || undefined,
        title: assignTitle.trim(),
        description: assignDesc.trim(),
        column: assignColumn,
        priority: assignPriority,
        agent_id: assignAgentId || undefined,
        files_context: assignFiles,
        acceptance_criteria: assignCriteria.filter((c) => c.trim().length > 0),
      });
      setAssignModalOpen(false);
      showToast(
        `Task [${res.card_id}] created and ${res.agent_id ? `assigned to ${res.agent_id}` : "queued"} successfully`
      );
      await loadData();
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
    } finally {
      setAssigning(false);
    }
  };

  // Filtering commits and bundles
  const filteredCommits = useMemo(() => {
    return commits.filter((c) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        c.subject.toLowerCase().includes(q) ||
        c.sha.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.files_changed.some((f) => f.toLowerCase().includes(q));

      if (!matchSearch) return false;
      if (filter === "all") return true;
      return c.subject.toLowerCase().startsWith(filter.toLowerCase());
    });
  }, [commits, search, filter]);

  const filteredBundles = useMemo(() => {
    return bundles.filter((b) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        b.title.toLowerCase().includes(q) ||
        (b.summary && b.summary.toLowerCase().includes(q)) ||
        b.branch.toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (filter === "all") return true;
      if (filter === "open") return b.status === "open";
      if (filter === "sealed") return b.status === "sealed";
      return b.kind === filter;
    });
  }, [bundles, search, filter]);

  // Construct ReactFlow nodes and edges for n8n Flow View
  const { flowNodes, flowEdges } = useMemo(() => {
    const list = filteredCommits.slice(0, 36);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const shaMap = new Set(list.map((c) => c.sha));

    list.forEach((c, index) => {
      // Horizontal linear sequence with gentle vertical wave
      const x = index * 290 + 60;
      const y = 140 + (index % 3) * 35;

      nodes.push({
        id: c.sha,
        type: "commitNode",
        position: { x, y },
        data: {
          commit: c,
          onSelect: (sha: string) => setInspectSha(sha),
          onAssign: (commit: GitCommit) => openAssignModalForCommit(commit),
        },
      });

      // Connect parents
      c.parents.forEach((parentSha) => {
        if (shaMap.has(parentSha)) {
          edges.push({
            id: `${parentSha}->${c.sha}`,
            source: parentSha,
            target: c.sha,
            animated: true,
            style: {
              stroke: "var(--accent)",
              strokeWidth: 2,
              opacity: 0.8,
            },
          });
        }
      });
    });

    return { flowNodes: nodes, flowEdges: edges };
  }, [filteredCommits]);

  return (
    <div className="w-full max-w-[1720px] mx-auto p-4 md:p-6 space-y-5">
      {/* Toast banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-card border border-success px-4 py-3 rounded-xl shadow-2xl text-text text-sm flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2.5 h-2.5 rounded-full bg-success" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-4 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-text">Git History & Workstream</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-accent-soft text-accent-text border border-accent/20">
              {selectedBranch}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Visualize branch topology, inspect commit diffs, and dispatch intent directly to autonomous agent worktrees.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Branch selector */}
          {branches.length > 0 && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="text-xs bg-surface border border-border rounded-lg px-2.5 py-1.5 text-text focus:outline-none focus:border-accent"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          {/* View Switcher: Flow (n8n), Tree (DAG), Cards (Bundles) */}
          <div className="flex items-center bg-surface p-1 rounded-xl border border-border">
            <button
              onClick={() => setViewMode("flow")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "flow"
                  ? "bg-card text-accent-text shadow-sm border border-border"
                  : "text-muted hover:text-text"
              }`}
            >
              <Icon name="layers" size={12} />
              <span>Flow Graph</span>
            </button>
            <button
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "tree"
                  ? "bg-card text-accent-text shadow-sm border border-border"
                  : "text-muted hover:text-text"
              }`}
            >
              <Icon name="history" size={12} />
              <span>Tree DAG</span>
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === "cards"
                  ? "bg-card text-accent-text shadow-sm border border-border"
                  : "text-muted hover:text-text"
              }`}
            >
              <Icon name="board" size={12} />
              <span>Cards</span>
            </button>
          </div>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="text-xs px-3.5 py-2 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Icon name="spark" size={13} />
            <span>{scanning ? "Analyzing..." : "Scan Bundles"}</span>
          </button>
        </div>
      </div>

      {/* Notion Style Quick Intelligence Callout */}
      <div className="p-3.5 rounded-xl bg-surface border border-border text-xs text-text flex items-start gap-3">
        <span className="text-base select-none mt-0.5">💡</span>
        <div className="flex-1">
          <div className="font-semibold text-text">Workstream Intelligence & Agent Handoff</div>
          <div className="text-muted mt-0.5 leading-relaxed">
            Click any commit node or row to open the Codex code inspector and examine diffs. Use the{" "}
            <span className="text-accent-text font-medium">Assign</span> button to turn any git commit into an isolated agent task complete with verified context files and acceptance criteria.
          </div>
        </div>
        <div className="flex items-center gap-4 text-muted shrink-0 text-[11px] font-mono border-l border-border pl-4">
          <div>
            <span className="text-text font-semibold">{commits.length}</span> commits
          </div>
          <div>
            <span className="text-text font-semibold">{bundles.length}</span> bundles
          </div>
          <div>
            <span className="text-text font-semibold">{agents.length}</span> agents ready
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", "feat", "fix", "refactor", "docs", "chore", "test", "mixed"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-all font-medium ${
                filter === f
                  ? "bg-accent-soft text-accent-text border border-accent/25"
                  : "text-muted hover:text-text hover:bg-surface"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commits, authors, files..."
            className="w-full text-xs bg-card border border-border rounded-xl px-3 py-1.5 text-text placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Visualizer Body */}
      {loading ? (
        <div className="h-[460px] flex items-center justify-center bg-card border border-border rounded-2xl text-muted text-sm">
          Loading git workstream topology...
        </div>
      ) : (
        <div className="relative">
          {/* 1. FLOW VIEW (n8n node graph) */}
          {viewMode === "flow" && (
            <div className="h-[620px] bg-card border border-border rounded-2xl overflow-hidden shadow-inner">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={1.5}
              >
                <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
                <Controls showInteractive={false} className="!bg-card !border-border !rounded-xl" />
                <MiniMap
                  nodeColor="var(--accent)"
                  maskColor="rgba(0, 0, 0, 0.65)"
                  className="!bg-surface !border !border-border !rounded-xl"
                />
              </ReactFlow>
            </div>
          )}

          {/* 2. TREE VIEW (Git DAG lanes) */}
          {viewMode === "tree" && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border shadow-sm">
              <div className="px-4 py-3 bg-surface text-xs font-semibold text-muted flex items-center justify-between">
                <span>Commit & Branch Topology</span>
                <span>Actions</span>
              </div>
              {filteredCommits.length === 0 ? (
                <div className="p-8 text-center text-muted text-sm">No commits found matching query.</div>
              ) : (
                filteredCommits.map((c, idx) => (
                  <div
                    key={c.sha}
                    onClick={() => setInspectSha(c.sha)}
                    className="p-3.5 hover:bg-surface/80 transition-colors flex items-center justify-between gap-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Tree Track Bead */}
                      <div className="flex flex-col items-center justify-center shrink-0 w-6">
                        <span className="w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-accent-soft group-hover:scale-125 transition-transform" />
                        {idx < filteredCommits.length - 1 && (
                          <span className="w-0.5 h-6 bg-border mt-1" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-accent-text font-bold bg-surface px-1.5 py-0.5 rounded border border-border">
                            {c.sha ? c.sha.slice(0, 7) : ""}
                          </span>
                          <span className="text-xs font-semibold text-text truncate">
                            {c.subject}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted mt-1 font-mono">
                          <span>{c.author || "Unknown"}</span>
                          <span>•</span>
                          <span>{c.date ? c.date.slice(0, 10) : ""}</span>
                          <span>•</span>
                          <span className="text-success font-semibold">+{(c.additions ?? 0)}</span>
                          <span className="text-danger font-semibold">-{(c.deletions ?? 0)}</span>
                          <span>•</span>
                          <span>{(c.files_changed || []).length} files</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectSha(c.sha);
                        }}
                        className="text-xs px-2.5 py-1 rounded-lg bg-surface hover:bg-card-hover text-muted hover:text-text border border-border transition-colors font-medium"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openAssignModalForCommit(c);
                        }}
                        className="text-xs px-3 py-1 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors font-medium flex items-center gap-1 shadow-sm"
                      >
                        <Icon name="robot" size={11} />
                        <span>Assign</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 3. CARDS VIEW (Bundles) */}
          {viewMode === "cards" && (
            <div className="space-y-4">
              {filteredBundles.length === 0 ? (
                <div className="p-12 text-center text-muted text-sm bg-card border border-border rounded-2xl">
                  No bundles found. Click "Scan Bundles" to group commits with AI heuristics.
                </div>
              ) : (
                filteredBundles.map((b) => (
                  <BundleCard
                    key={b.id}
                    bundle={b}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onSeal={handleSeal}
                    onInspectSha={(sha) => setInspectSha(sha)}
                    onAssignFromBundle={(bundle) => openAssignModalForBundle(bundle)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Codex Code & Diff Inspector Drawer */}
      {inspectSha && (
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-card border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-sm font-bold text-accent-text bg-card px-2 py-0.5 rounded border border-border">
                {inspectSha ? inspectSha.slice(0, 8) : ""}
              </span>
              <h3 className="text-sm font-semibold text-text truncate">Codex Diff Inspector</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const c = commits.find((x) => x.sha === inspectSha);
                  if (c) openAssignModalForCommit(c);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover transition-colors flex items-center gap-1.5"
              >
                <Icon name="robot" size={12} />
                <span>Create Task</span>
              </button>
              <button
                onClick={() => setInspectSha(null)}
                className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-card transition-colors"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
            {loadingDiff ? (
              <div className="py-12 text-center text-muted">Loading diff from git repository...</div>
            ) : diffData ? (
              <>
                {/* Commit Summary */}
                <div className="p-3 rounded-xl bg-surface border border-border space-y-2">
                  <div className="text-sm font-semibold text-text font-sans">{diffData.message}</div>
                  <div className="flex items-center gap-3 text-muted text-[11px] pt-1 border-t border-border">
                    <span className="text-success">+{diffData.additions} additions</span>
                    <span className="text-danger">-{diffData.deletions} deletions</span>
                    <span>{diffData.files_changed.length} files modified</span>
                  </div>
                </div>

                {/* Files Pill List */}
                {diffData.files_changed.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-sans font-medium text-muted uppercase tracking-wider">
                      Affected Files
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {diffData.files_changed.map((file) => (
                        <span
                          key={file}
                          className="px-2 py-1 rounded-md bg-surface text-text border border-border text-[11px] font-mono truncate max-w-full"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diff Viewer with Syntax Highlighting */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-sans font-medium text-muted uppercase tracking-wider">
                    Unified Diff
                  </div>
                  <div className="rounded-xl bg-surface border border-border p-3 overflow-x-auto text-[11px] leading-relaxed max-h-[500px]">
                    {diffData.diff ? (
                      diffData.diff.split("\n").map((line, idx) => {
                        const isAdd = line.startsWith("+") && !line.startsWith("+++");
                        const isDel = line.startsWith("-") && !line.startsWith("---");
                        const isHeader = line.startsWith("@@") || line.startsWith("diff --git");

                        return (
                          <div
                            key={idx}
                            className={`whitespace-pre font-mono px-1 rounded-sm ${
                              isAdd
                                ? "bg-success-soft text-success"
                                : isDel
                                ? "bg-danger-soft text-danger"
                                : isHeader
                                ? "text-accent-text font-bold opacity-80"
                                : "text-muted"
                            }`}
                          >
                            {line || " "}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-muted">No text changes in commit diff.</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-muted">Unable to load commit diff.</div>
            )}
          </div>
        </div>
      )}

      {/* Assign to Agent Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-accent-soft text-accent-text">
                  <Icon name="robot" size={16} />
                </span>
                <div>
                  <h3 className="font-bold text-text text-base">Assign Intent to Agent</h3>
                  <p className="text-xs text-muted">Deploy task to isolated agent worktree with acceptance gate</p>
                </div>
              </div>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-text hover:bg-surface"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-medium mb-1">Task Title</label>
                <input
                  type="text"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-text focus:outline-none focus:border-accent text-xs"
                />
              </div>

              <div>
                <label className="block text-muted font-medium mb-1">Intent & Context</label>
                <textarea
                  rows={3}
                  value={assignDesc}
                  onChange={(e) => setAssignDesc(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl p-3 text-text focus:outline-none focus:border-accent text-xs leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-medium mb-1">Assign Agent</label>
                  <select
                    value={assignAgentId}
                    onChange={(e) => setAssignAgentId(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-2.5 py-2 text-text focus:outline-none focus:border-accent"
                  >
                    <option value="">Auto Dispatch (Orchestrator)</option>
                    {agents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} ({ag.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Priority</label>
                  <select
                    value={assignPriority}
                    onChange={(e) => setAssignPriority(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-2.5 py-2 text-text focus:outline-none focus:border-accent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Context Files */}
              {assignFiles.length > 0 && (
                <div>
                  <label className="block text-muted font-medium mb-1">Context Files ({assignFiles.length})</label>
                  <div className="max-h-24 overflow-y-auto bg-surface border border-border rounded-xl p-2 space-y-1">
                    {assignFiles.map((file) => (
                      <div key={file} className="font-mono text-[11px] text-text truncate">
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acceptance Criteria */}
              <div>
                <label className="block text-muted font-medium mb-1">Acceptance Gate Criteria</label>
                <div className="space-y-1 mb-2">
                  {assignCriteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-surface text-text">
                      <span className="text-success font-bold">✓</span>
                      <span className="flex-1 truncate">{c}</span>
                      <button
                        onClick={() => setAssignCriteria(assignCriteria.filter((_, idx) => idx !== i))}
                        className="text-muted hover:text-danger px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCriterion}
                    onChange={(e) => setNewCriterion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCriterion.trim()) {
                        e.preventDefault();
                        setAssignCriteria([...assignCriteria, newCriterion.trim()]);
                        setNewCriterion("");
                      }
                    }}
                    placeholder="Add test or verification criterion..."
                    className="flex-1 bg-surface border border-border rounded-xl px-3 py-1.5 text-text focus:outline-none focus:border-accent text-xs"
                  />
                  <button
                    onClick={() => {
                      if (newCriterion.trim()) {
                        setAssignCriteria([...assignCriteria, newCriterion.trim()]);
                        setNewCriterion("");
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-surface border border-border text-text hover:bg-card transition-colors font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatchTask}
                disabled={assigning || !assignTitle.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <Icon name="spark" size={13} />
                <span>{assigning ? "Dispatching..." : "Dispatch to Worktree"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
