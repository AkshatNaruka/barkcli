import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import { Icon } from "./Icon";
import { QuietSelect } from "./QuietSelect";
import type { AgentProfile, AssignmentRecommendation, PlanTask, ProductPlan } from "../lib/types";
import { OrchestraTaskNode, type OrchestraTaskNodeData } from "./orchestra/OrchestraTaskNode";
import { buildWorkflowGraph } from "./orchestra/workflowLayout";
import { TASK_STATUS_LABEL, taskDot, taskFill, taskTone } from "./orchestra/taskStatus";

const NODE_TYPES = { orchestraTask: OrchestraTaskNode };

export function OrchestraWorkflowGraph({
  plan,
  profiles,
  profileById,
  busy,
  whyTask,
  recommendations,
  onRetry,
  onMerge,
  onReject,
  onAssign,
  onWhy,
}: {
  plan: ProductPlan;
  profiles: AgentProfile[];
  profileById: Map<string, AgentProfile>;
  busy: string | null;
  whyTask: string | null;
  recommendations: Record<string, AssignmentRecommendation[]>;
  onRetry: (task: PlanTask) => Promise<void>;
  onMerge: (task: PlanTask) => Promise<void>;
  onReject: (task: PlanTask) => Promise<void>;
  onAssign: (task: PlanTask, agentId: string) => Promise<void>;
  onWhy: (task: PlanTask) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tasks = plan.tasks || [];

  useEffect(() => {
    if (!selectedId) return;
    if (!tasks.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tasks, selectedId]);

  const base = useMemo(() => buildWorkflowGraph(tasks), [tasks]);
  const nodes = useMemo(() => {
    return base.nodes.map((n) => {
      const task = (n.data as { task: PlanTask }).task;
      const agentName = task.agent_id ? profileById.get(task.agent_id)?.name : undefined;
      return {
        ...n,
        selected: n.id === selectedId,
        data: { task, agentName, selected: n.id === selectedId } satisfies OrchestraTaskNodeData,
      } as Node;
    });
  }, [base.nodes, profileById, selectedId]);

  const edges = useMemo(() => {
    return base.edges.map((e): Edge => {
      const target = tasks.find((t) => t.id === e.target);
      const source = tasks.find((t) => t.id === e.source);
      const active = e.source === selectedId || e.target === selectedId;
      const done = source?.status === "merged" || source?.gate_passed;
      return {
        ...e,
        style: {
          stroke: done ? "color-mix(in srgb, var(--success) 55%, var(--border-strong))" : "var(--border-strong)",
          strokeWidth: active ? 1.8 : 1.25,
          opacity: active ? 0.95 : target?.status === "waiting" || target?.status === "cancelled" ? 0.3 : 0.65,
        },
        animated: target?.status === "running" || target?.status === "ready",
      };
    });
  }, [base.edges, tasks, selectedId]);

  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) || null : null;

  if (tasks.length === 0) {
    return <div className="rounded border border-border bg-surface/40 px-3 py-6 text-center text-[11px] text-muted">No tasks in this plan.</div>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1"><Icon name="subtasks" size={11} /> Workflow</span>
        <span>·</span>
        <span>{tasks.length} tasks · {edges.length} dependencies</span>
        <span className="ml-auto text-[9.5px]">Select a node for details and actions</span>
      </div>
      <div className={`grid gap-2 ${selectedTask ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"}`}>
        <div className="min-h-[320px] h-[clamp(320px,42vh,520px)] overflow-hidden rounded-lg border border-border bg-surface/35">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodeClick={(_, node) => setSelectedId((id) => (id === node.id ? null : node.id))}
            onPaneClick={() => setSelectedId(null)}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            edgesReconnectable={false}
            onlyRenderVisibleElements
            zoomOnDoubleClick={false}
            minZoom={0.15}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.05 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
            <Controls position="bottom-left" showInteractive={false} />
            {tasks.length <= 24 && (
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(n) => {
                  const task = (n.data as { task?: PlanTask } | undefined)?.task;
                  return task ? taskFill(task.status) : "var(--muted)";
                }}
                nodeStrokeWidth={0}
                style={{ width: 140, height: 84, background: "var(--card)", borderRadius: 10 }}
                maskColor="rgba(120, 120, 130, 0.28)"
              />
            )}
          </ReactFlow>
        </div>

        {selectedTask && (
          <TaskDetailsPanel
            planId={plan.id}
            task={selectedTask}
            profiles={profiles}
            profileById={profileById}
            busy={busy}
            whyTask={whyTask}
            recommendations={recommendations}
            onRetry={onRetry}
            onMerge={onMerge}
            onReject={onReject}
            onAssign={onAssign}
            onWhy={onWhy}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
      {!selectedTask && tasks.length > 0 && (
        <div className="text-[9.5px] text-muted/80">
          Tip: dependencies flow left → right. Running/ready edges animate; merged/gated dependencies are highlighted.
        </div>
      )}
    </div>
  );
}

function TaskDetailsPanel({
  planId,
  task,
  profiles,
  profileById,
  busy,
  whyTask,
  recommendations,
  onRetry,
  onMerge,
  onReject,
  onAssign,
  onWhy,
  onClose,
}: {
  planId: string;
  task: PlanTask;
  profiles: AgentProfile[];
  profileById: Map<string, AgentProfile>;
  busy: string | null;
  whyTask: string | null;
  recommendations: Record<string, AssignmentRecommendation[]>;
  onRetry: (task: PlanTask) => Promise<void>;
  onMerge: (task: PlanTask) => Promise<void>;
  onReject: (task: PlanTask) => Promise<void>;
  onAssign: (task: PlanTask, agentId: string) => Promise<void>;
  onWhy: (task: PlanTask) => void;
  onClose: () => void;
}) {
  const key = `${planId}:${task.id}`;
  const agent = task.agent_id ? profileById.get(task.agent_id) : undefined;
  const candidates = profiles.filter((profile) => profile.role === task.role && profile.status === "active");
  const actionBusy =
    busy?.startsWith(`retry:${planId}:${task.id}`) ||
    busy?.startsWith(`merge:${planId}:${task.id}`) ||
    busy?.startsWith(`reject:${planId}:${task.id}`) ||
    busy?.startsWith(`assign:${planId}:${task.id}`);

  return (
    <div className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${taskDot(task.status)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-[12.5px] font-medium leading-snug text-text">{task.title}</h4>
            <button type="button" onClick={onClose} className="shrink-0 rounded p-0.5 text-muted hover:bg-white/[0.05] hover:text-text" title="Close details"><Icon name="x" size={12} /></button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-muted-strong">{task.role}</span>
            <span className={taskTone(task.status)}>{TASK_STATUS_LABEL[task.status]}</span>
            {task.gate_passed && <span className="text-success">gate passed</span>}
            <span className="font-mono text-muted">#{task.id}</span>
          </div>
        </div>
      </div>

      {task.description && <p className="mt-2 text-[11px] leading-relaxed text-muted-strong">{task.description}</p>}
      <dl className="mt-2 space-y-1 text-[10px]">
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Agent</dt><dd className="text-text">{agent?.name || task.agent_id || "Unassigned"}</dd></div>
        {task.depends_on.length > 0 && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">After</dt><dd className="font-mono text-muted-strong">{task.depends_on.join(", ")}</dd></div>}
        {task.branch && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Branch</dt><dd className="truncate font-mono text-muted-strong" title={task.branch}>{task.branch}</dd></div>}
        {task.worktree && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Worktree</dt><dd className="truncate font-mono text-muted-strong" title={task.worktree}>{task.worktree}</dd></div>}
        {task.run_id && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Run</dt><dd className="font-mono text-muted-strong">{task.run_id}</dd></div>}
      </dl>

      {task.error && (
        <div className="mt-2 rounded border border-danger/25 bg-danger-soft px-2 py-1.5 text-[10px] text-danger">
          <div className="font-medium">Problem</div>
          <div className="mt-0.5 break-words">{task.error}</div>
        </div>
      )}

      {task.acceptance_criteria?.length > 0 && (
        <details className="mt-2 rounded border border-border bg-surface/40 px-2 py-1.5">
          <summary className="cursor-pointer text-[10px] text-muted">Acceptance criteria ({task.acceptance_criteria.length})</summary>
          <ul className="mt-1 space-y-0.5">{task.acceptance_criteria.map((c) => <li key={c} className="text-[10px] text-muted-strong">· {c}</li>)}</ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {candidates.length > 0 && task.status !== "running" && (
          <QuietSelect
            value={task.agent_id || ""}
            onChange={(e) => { if (e.target.value) void onAssign(task, e.target.value); }}
            className="max-w-[140px] rounded border border-border bg-surface px-1.5 py-1 text-[10px] text-muted outline-none focus:border-accent"
            title="Manual assignment"
          >
            <option value="">Auto assign</option>
            {candidates.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </QuietSelect>
        )}
        <button type="button" onClick={() => onWhy(task)} className="rounded border border-border bg-surface px-2 py-1 text-[10px] text-muted hover:bg-white/[0.04] hover:text-text">Why</button>
        {(task.status === "failed" || task.status === "blocked") && (
          <button type="button" onClick={() => void onRetry(task)} disabled={actionBusy} className="rounded border border-border bg-surface px-2 py-1 text-[10px] text-text hover:bg-white/[0.04] disabled:opacity-50">Retry</button>
        )}
        {task.status === "review" && (
          <>
            <button type="button" onClick={() => void onMerge(task)} disabled={actionBusy || !task.run_id} className="rounded bg-success/90 px-2 py-1 text-[10px] font-medium text-white hover:bg-success disabled:opacity-50">Merge</button>
            <button type="button" onClick={() => void onReject(task)} disabled={actionBusy || !task.run_id} className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:border-danger/30 hover:text-danger disabled:opacity-50">Reject</button>
          </>
        )}
      </div>

      {whyTask === key && (
        <div className="mt-2 rounded border border-border bg-surface/50 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-[0.1em] text-muted">Assignment reasoning</div>
          {(recommendations[key] || []).length === 0 ? (
            <div className="mt-1 text-[10px] text-muted">No active {task.role} has capacity. Pause/resume or hire another agent.</div>
          ) : (
            <div className="mt-1 space-y-1">
              {(recommendations[key] || []).slice(0, 3).map((rec) => (
                <div key={rec.agent_id} className="flex items-start gap-2">
                  <span className="min-w-[86px] text-[10px] text-text">{rec.name}</span>
                  <span className="text-[9.5px] text-muted">{rec.reasons.join(" · ")}</span>
                  <span className="ml-auto font-mono text-[9px] text-accent-text">{rec.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
