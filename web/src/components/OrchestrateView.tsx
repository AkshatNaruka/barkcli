import React, { useState, useEffect, useCallback } from "react";
import { Lozenge } from "./Lozenge";
import { agentColor } from "../lib/agents";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  active_tasks: string[];
  completed_tasks: string[];
  failed_tasks: string[];
}

interface Task {
  id: string;
  card_id: string;
  title: string;
  description: string;
  status: string;
  assigned_agent?: string;
  priority: string;
  created_at: string;
}

const STATUS_TONE: Record<string, "gray" | "blue" | "amber" | "green" | "red"> = {
  Idle: "green",
  Working: "amber",
  Paused: "gray",
  Error: "red",
  Pending: "gray",
  Assigned: "blue",
  InProgress: "amber",
  Completed: "green",
  Failed: "red",
};

function StatusPill({ status }: { status: string }) {
  return <Lozenge tone={STATUS_TONE[status] || "gray"}>{status.replace(/([A-Z])/g, " $1").trim()}</Lozenge>;
}

export function OrchestrateView({ boardName }: { boardName: string | null }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [orchStatus, setOrchStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRole, setNewAgentRole] = useState("ScrumMaster");
  const [cycleResult, setCycleResult] = useState<any>(null);
  const [taskFilter, setTaskFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, tasksRes, statusRes] = await Promise.all([
        fetch("/api/agents").then(r => r.json()).catch(() => ({ agents: [] })),
        fetch(`/api/tasks${boardName ? `?name=${boardName}` : ""}${taskFilter ? `${boardName ? "&" : "?"}status=${taskFilter}` : ""}`).then(r => r.json()).catch(() => ({ tasks: [] })),
        fetch("/api/orchestrate/status").then(r => r.json()).catch(() => null),
      ]);
      setAgents(agentsRes.agents || []);
      setTasks(tasksRes.tasks || []);
      setOrchStatus(statusRes);
    } catch {}
    setLoading(false);
  }, [boardName, taskFilter]);

  useEffect(() => { load(); }, [load]);

  const handleRegister = async () => {
    if (!newAgentId.trim() || !newAgentName.trim()) return;
    await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: newAgentId, name: newAgentName, role: newAgentRole }),
    });
    setNewAgentId("");
    setNewAgentName("");
    setShowRegister(false);
    load();
  };

  const handleDeleteAgent = async (id: string) => {
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    load();
  };

  const handleRunCycle = async () => {
    const res = await fetch("/api/orchestrate/cycle", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setCycleResult(data);
      load();
    }
  };

  const handleDeleteTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Agents Panel */}
      <div className="w-72 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Agents</h3>
          <button
            onClick={() => setShowRegister(!showRegister)}
            className="text-xs text-accent hover:text-accent/80"
          >
            + Register
          </button>
        </div>

        {showRegister && (
          <div className="p-3 border-b border-border bg-surface/50 space-y-2">
            <input
              type="text"
              value={newAgentId}
              onChange={e => setNewAgentId(e.target.value)}
              placeholder="Agent ID"
              className="w-full bg-card border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-muted"
            />
            <input
              type="text"
              value={newAgentName}
              onChange={e => setNewAgentName(e.target.value)}
              placeholder="Agent name"
              className="w-full bg-card border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-muted"
            />
            <select
              value={newAgentRole}
              onChange={e => setNewAgentRole(e.target.value)}
              className="w-full bg-card border border-border rounded px-2 py-1.5 text-xs text-text"
            >
              <option value="ScrumMaster">Scrum Master</option>
              <option value="ProductOwner">Product Owner</option>
              <option value="TechLead">Tech Lead</option>
              <option value="ProjectManager">Project Manager</option>
            </select>
            <button
              onClick={handleRegister}
              disabled={!newAgentId.trim() || !newAgentName.trim()}
              className="w-full px-3 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent/80 disabled:opacity-50"
            >
              Register
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 bg-surface rounded animate-pulse" />)}
            </div>
          ) : agents.length === 0 ? (
            <p className="text-xs text-muted text-center py-8">No agents registered</p>
          ) : (
            agents.map(a => {
              const brand = agentColor(a.id, a.name);
              return (
              <div key={a.id} className="p-3 border-b border-border group hover:bg-surface/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-text flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: brand ?? "var(--muted)" }}
                        title={brand ? `Brand color: ${brand}` : undefined}
                      />
                      {a.name}
                    </p>
                    <p className="text-[10px] font-mono mt-0.5" style={brand ? { color: brand } : undefined}>
                      <span className={brand ? undefined : "text-muted"}>{a.id}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteAgent(a.id)}
                    className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 text-xs"
                  >
                    x
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <StatusPill status={a.status} />
                  <span className="text-[10px] text-muted">{a.role}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted">
                  <span>{a.active_tasks.length} active</span>
                  <span>{a.completed_tasks.length} done</span>
                  <span>{a.failed_tasks.length} failed</span>
                </div>
              </div>
              );
            }))}
        </div>

        {/* Orchestration Status */}
        {orchStatus && (
          <div className="p-3 border-t border-border shrink-0">
            <h4 className="text-xs font-semibold text-text mb-2">Orchestration</h4>
            <div className="space-y-1 text-[10px] text-muted">
              <div className="flex justify-between">
                <span>Status</span>
                <span className="text-text">{orchStatus.status}</span>
              </div>
              <div className="flex justify-between">
                <span>Cycles</span>
                <span className="text-text">{orchStatus.cycle_count}</span>
              </div>
              <div className="flex justify-between">
                <span>Dispatched</span>
                <span className="text-text">{orchStatus.tasks_dispatched}</span>
              </div>
              <div className="flex justify-between">
                <span>Completed</span>
                <span className="text-green-400">{orchStatus.tasks_completed}</span>
              </div>
              <div className="flex justify-between">
                <span>Failed</span>
                <span className="text-red-400">{orchStatus.tasks_failed}</span>
              </div>
            </div>
            <button
              onClick={handleRunCycle}
              className="w-full mt-2 px-3 py-1.5 bg-accent text-white text-xs rounded font-medium hover:bg-accent/80"
            >
              Run Cycle
            </button>
            {cycleResult && (
              <div className="mt-2 p-2 bg-surface rounded text-[10px] text-muted">
                <p>Last cycle: {cycleResult.tasks_created} created, {cycleResult.tasks_dispatched} dispatched</p>
                {cycleResult.insights?.map((i: string, idx: number) => (
                  <p key={idx} className="mt-1 text-accent">{i}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tasks Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-text">Task Queue</h3>
          <div className="flex items-center gap-2">
            <select
              value={taskFilter}
              onChange={e => setTaskFilter(e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1 text-xs text-text"
            >
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="InProgress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
            </select>
            <span className="text-xs text-muted">{tasks.length} tasks</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-surface rounded animate-pulse" />)}
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No tasks in queue</p>
          ) : (
            <div className="divide-y divide-border">
              {tasks.map(t => (
                <div key={t.id} className="p-3 hover:bg-surface/50 group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusPill status={t.status} />
                      <span className="text-xs font-medium text-text">{t.title}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteTask(t.id)}
                      className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 text-xs"
                    >
                      x
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted">
                    <span className="font-mono">{t.card_id}</span>
                    <span>Priority: {t.priority}</span>
                    {t.assigned_agent && (() => {
                      const brand = agentColor(t.assigned_agent);
                      return (
                        <span>
                          Agent:{" "}
                          <span className="font-mono" style={brand ? { color: brand } : undefined}>
                            {t.assigned_agent}
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
