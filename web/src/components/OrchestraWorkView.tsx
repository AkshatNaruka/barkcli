import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { OrchestrateView } from "./OrchestrateView";
import type {
  AgentProfile,
  AssignmentRecommendation,
  Board,
  OrchestraSnapshot,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  ProductPlan,
} from "../lib/types";
import {
  approveOrchestraPlan,
  approveRun,
  answerOrchestraQuestion,
  assignOrchestraTask,
  cancelOrchestraPlan,
  createOrchestraPlan,
  dispatchOrchestraPlan,
  fetchOrchestra,
  fetchOrchestraAssignments,
  mergeRun,
  retryOrchestraTask,
} from "../lib/api";

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  running: "Running",
  needs_attention: "Needs attention",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TASK_STATUS_LABEL: Record<PlanTaskStatus, string> = {
  waiting: "Waiting",
  ready: "Ready",
  running: "Running",
  review: "Needs review",
  merged: "Merged",
  failed: "Failed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

function planTone(status: PlanStatus) {
  if (status === "running") return "text-accent-text bg-accent-soft border-accent/30";
  if (status === "completed") return "text-success bg-success-soft border-success/25";
  if (status === "needs_attention") return "text-warning bg-warning-soft border-warning/25";
  if (status === "cancelled") return "text-muted bg-white/[0.03] border-border";
  if (status === "awaiting_approval") return "text-warning bg-warning-soft border-warning/25";
  return "text-muted bg-white/[0.03] border-border";
}

function taskTone(status: PlanTaskStatus) {
  if (status === "running") return "text-accent-text";
  if (status === "review") return "text-warning";
  if (status === "merged") return "text-success";
  if (status === "failed") return "text-danger";
  if (status === "ready") return "text-text";
  if (status === "cancelled") return "text-muted";
  return "text-muted";
}

function taskDot(status: PlanTaskStatus) {
  if (status === "running") return "bg-accent animate-pulse";
  if (status === "review") return "bg-warning";
  if (status === "merged") return "bg-success";
  if (status === "failed") return "bg-danger";
  if (status === "ready") return "bg-text/60";
  if (status === "cancelled") return "bg-muted";
  return "bg-border-strong";
}

function shortGoal(goal: string) {
  return goal.length > 92 ? `${goal.slice(0, 90)}…` : goal;
}

export function OrchestraWorkView({
  boardName,
  board,
}: {
  boardName: string | null;
  board: Board | null;
}) {
  const [mode, setMode] = useState<"plans" | "live">("plans");
  const [snapshot, setSnapshot] = useState<OrchestraSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState("");
  const [whyTask, setWhyTask] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<
    Record<string, AssignmentRecommendation[]>
  >({});
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});

  const load = useCallback(
    async (initial = false, advance = false) => {
      if (initial) setLoading(true);
      const next = await fetchOrchestra(advance);
      if (next) setSnapshot(next);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    void load(true);
  }, [load, boardName]);

  const plans = snapshot?.plans || [];
  const active = plans.some(
    (plan) => plan.status === "running" || plan.status === "needs_attention"
  );

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void load(false, true);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [active, load]);

  useEffect(() => {
    const cards = (board?.cards || []).filter((card) => card.column !== "done");
    if (!selectedCard && cards[0]) setSelectedCard(cards[0].id);
    if (selectedCard && !cards.some((card) => card.id === selectedCard)) {
      setSelectedCard(cards[0]?.id || "");
    }
  }, [board, selectedCard]);

  const profiles = useMemo(
    () => (snapshot?.team || []).map((member) => member.profile),
    [snapshot]
  );
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );

  const refresh = async () => {
    await load(false, false);
  };

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const createPlan = async () => {
    if (!selectedCard) return;
    await runAction("create", async () => {
      const plan = await createOrchestraPlan(selectedCard);
      if (!plan) throw new Error("Plan could not be created.");
    });
  };

  const showWhy = async (planId: string, taskId: string) => {
    const key = `${planId}:${taskId}`;
    if (whyTask === key) {
      setWhyTask(null);
      return;
    }
    setWhyTask(key);
    if (!recommendations[key]) {
      const ranked = await fetchOrchestraAssignments(planId, taskId);
      setRecommendations((current) => ({ ...current, [key]: ranked }));
    }
  };

  const cards = (board?.cards || []).filter((card) => card.column !== "done");
  const pending = snapshot?.pending_approvals || [];
  const capacity = snapshot?.capacity;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
          <button
            onClick={() => setMode("plans")}
            className={`rounded px-2 py-1 text-[10.5px] ${
              mode === "plans" ? "bg-white/[0.06] text-text" : "text-muted hover:text-text"
            }`}
          >
            Team work
          </button>
          <button
            onClick={() => setMode("live")}
            className={`rounded px-2 py-1 text-[10.5px] ${
              mode === "live" ? "bg-white/[0.06] text-text" : "text-muted hover:text-text"
            }`}
          >
            Live attempts
          </button>
        </div>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 font-mono">
            <Icon name="pulse" size={10} />
            {capacity?.active_tasks ?? 0}/{capacity?.max_parallel ?? 2} slots
          </span>
          <span>{capacity?.team_size ?? 0} agents</span>
          {pending.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-warning">
              <Icon name="bell" size={10} />
              {pending.length} approval{pending.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>

      {mode === "live" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <OrchestrateView boardName={boardName} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1060px] px-5 py-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-medium tracking-tight text-text">
                    Orchestra
                  </h2>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
                    intent → plan → worktrees → gate → review → merge
                  </span>
                </div>
                <p className="mt-1 max-w-[640px] text-[12px] leading-relaxed text-muted">
                  Pick a card, review the plan, then dispatch. Each task gets a child
                  card, a worktree, and one accountable agent. Dependencies wait for a
                  passing gate; merge stays human-approved.
                </p>
              </div>
              {pending.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-[10.5px] text-warning">
                  Merge train: {pending.length} gate-passed run
                  {pending.length === 1 ? "" : "s"} waiting on you.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/45 px-3 py-2.5">
              <Icon name="spark" size={13} className="text-accent-text" />
              <span className="text-[11px] text-muted">Plan a card</span>
              <select
                value={selectedCard}
                onChange={(e) => setSelectedCard(e.target.value)}
                className="min-w-[250px] flex-1 rounded border border-border bg-surface px-2 py-1.5 text-[11.5px] text-text outline-none focus:border-accent"
              >
                <option value="">Choose a card…</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.title}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void createPlan()}
                disabled={!selectedCard || busy === "create"}
                className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
              >
                <Icon name="layers" size={12} />
                {busy === "create" ? "Planning…" : "Propose plan"}
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[11px] text-danger">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-16 text-center text-[12px] text-muted">Loading orchestra…</div>
            ) : plans.length === 0 ? (
              <div className="mt-8 rounded-lg border border-border bg-card/35 px-5 py-10 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-accent-text">
                  <Icon name="subtasks" size={17} />
                </div>
                <h3 className="mt-3 text-[13.5px] font-medium text-text">No plan yet</h3>
                <p className="mx-auto mt-1 max-w-[430px] text-[11.5px] leading-relaxed text-muted">
                  Choose a card above. The Product Owner proposes tasks, roles,
                  dependencies, acceptance criteria, and the first slice. Nothing runs
                  until you approve.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    profiles={profiles}
                    profileById={profileById}
                    busy={busy}
                    whyTask={whyTask}
                    recommendations={recommendations}
                    onApprove={() =>
                      runAction(`approve:${plan.id}`, async () => {
                        const approved = await approveOrchestraPlan(plan.id);
                        if (!approved) throw new Error("Plan approval failed.");
                      })
                    }
                    onDispatch={() =>
                      runAction(`dispatch:${plan.id}`, async () => {
                        const report = await dispatchOrchestraPlan(plan.id);
                        if (!report) throw new Error("Dispatch failed.");
                      })
                    }
                    onCancel={() =>
                      runAction(`cancel:${plan.id}`, async () => {
                        const cancelled = await cancelOrchestraPlan(plan.id);
                        if (!cancelled) throw new Error("Stop failed.");
                      })
                    }
                    onRetry={(task) =>
                      runAction(`retry:${plan.id}:${task.id}`, async () => {
                        const result = await retryOrchestraTask(plan.id, task.id);
                        if (!result) throw new Error("Retry failed.");
                      })
                    }
                    onMerge={(task) =>
                      runAction(`merge:${plan.id}:${task.id}`, async () => {
                        if (!task.run_id) throw new Error("Task has no run to merge.");
                        const result = await mergeRun(task.run_id, true);
                        if (!result) throw new Error("Merge failed.");
                      })
                    }
                    onReject={(task) =>
                      runAction(`reject:${plan.id}:${task.id}`, async () => {
                        if (!task.run_id) return;
                        await approveRun(task.run_id, false, "Changes requested");
                      })
                    }
                    onAssign={(task, agentId) =>
                      runAction(`assign:${plan.id}:${task.id}`, async () => {
                        const assigned = await assignOrchestraTask(plan.id, task.id, agentId);
                        if (!assigned) throw new Error("Assignment failed.");
                      })
                    }
                    onWhy={(task) => showWhy(plan.id, task.id)}
                    onAnswer={(questionId, answer) =>
                      runAction(`answer:${plan.id}:${questionId}`, async () => {
                        const answered = await answerOrchestraQuestion(
                          plan.id,
                          questionId,
                          answer
                        );
                        if (!answered) throw new Error("Answer failed.");
                        setQuestionDrafts((current) => ({ ...current, [questionId]: "" }));
                      })
                    }
                    questionDrafts={questionDrafts}
                    onQuestionDraft={(questionId, value) =>
                      setQuestionDrafts((current) => ({ ...current, [questionId]: value }))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  profiles,
  profileById,
  busy,
  whyTask,
  recommendations,
  onApprove,
  onDispatch,
  onCancel,
  onRetry,
  onMerge,
  onReject,
  onAssign,
  onWhy,
  onAnswer,
  questionDrafts,
  onQuestionDraft,
}: {
  plan: ProductPlan;
  profiles: AgentProfile[];
  profileById: Map<string, AgentProfile>;
  busy: string | null;
  whyTask: string | null;
  recommendations: Record<string, AssignmentRecommendation[]>;
  onApprove: () => Promise<void>;
  onDispatch: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRetry: (task: PlanTask) => Promise<void>;
  onMerge: (task: PlanTask) => Promise<void>;
  onReject: (task: PlanTask) => Promise<void>;
  onAssign: (task: PlanTask, agentId: string) => Promise<void>;
  onWhy: (task: PlanTask) => void;
  onAnswer: (questionId: string, answer: string) => Promise<void>;
  questionDrafts: Record<string, string>;
  onQuestionDraft: (questionId: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(plan.status === "awaiting_approval");
  const done = plan.tasks.filter((task) => task.status === "merged").length;
  const gatePassed = plan.tasks.filter((task) => task.gate_passed).length;
  const running = plan.tasks.filter((task) => task.status === "running").length;
  const openQuestions = plan.questions.filter((question) => !question.answer);

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <div className="flex w-full items-start gap-3 px-3.5 py-3 hover:bg-white/[0.02]">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
        <span className="mt-0.5 text-muted">
          <Icon name={expanded ? "arrowDown" : "chevR"} size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-medium text-text">{plan.title}</span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[9.5px] ${planTone(plan.status)}`}
            >
              {PLAN_STATUS_LABEL[plan.status]}
            </span>
            {plan.first_slice && (
              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-muted">
                first: {plan.first_slice}
              </span>
            )}
            {openQuestions.length > 0 && (
              <span className="rounded border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-[9px] text-warning">
                {openQuestions.length} question{openQuestions.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
            {plan.summary || shortGoal(plan.title)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
            <span>{plan.tasks.length} tasks</span>
            <span className="text-border-strong">·</span>
            <span className="text-success">{done} merged</span>
            <span className="text-border-strong">·</span>
            <span className="text-warning">{gatePassed} gated</span>
            <span className="text-border-strong">·</span>
            <span className="text-accent-text">{running} running</span>
            {plan.recommended_team.length > 0 && (
              <>
                <span className="text-border-strong">·</span>
                <span>team {plan.recommended_team.join(" / ")}</span>
              </>
            )}
          </div>
        </div>
        </button>
        <div className="shrink-0">
          {plan.status === "awaiting_approval" && (
            <button
              onClick={() => void onApprove()}
              disabled={busy === `approve:${plan.id}`}
              className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1.5 text-[10.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <Icon name="check" size={11} />
              Approve plan
            </button>
          )}
          {plan.status === "approved" && (
            <button
              onClick={() => void onDispatch()}
              disabled={busy === `dispatch:${plan.id}`}
              className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1.5 text-[10.5px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <Icon name="branch" size={11} />
              Dispatch
            </button>
          )}
          {plan.status === "running" && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void onDispatch()}
                disabled={busy === `dispatch:${plan.id}`}
                className="rounded border border-border bg-surface px-2 py-1.5 text-[10.5px] text-text hover:bg-white/[0.04] disabled:opacity-50"
              >
                Fill slots
              </button>
              <button
                onClick={() => void onCancel()}
                disabled={busy === `cancel:${plan.id}`}
                className="rounded border border-danger/30 px-2 py-1.5 text-[10.5px] text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                Stop
              </button>
            </div>
          )}
          {plan.status === "needs_attention" && (
            <button
              onClick={() => void onCancel()}
              disabled={busy === `cancel:${plan.id}`}
              className="rounded border border-danger/30 px-2 py-1.5 text-[10.5px] text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              Stop plan
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/70 px-3.5 py-3">
          {plan.acceptance_criteria.length > 0 && (
            <div className="mb-3 rounded border border-border bg-surface/50 px-2.5 py-2">
              <div className="text-[9.5px] uppercase tracking-[0.12em] text-muted">
                Plan acceptance
              </div>
              <ul className="mt-1 space-y-0.5">
                {plan.acceptance_criteria.map((criterion) => (
                  <li key={criterion} className="text-[10.5px] text-muted-strong">
                    · {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {openQuestions.length > 0 && (
            <div className="mb-3 space-y-2">
              {openQuestions.map((question) => (
                <div
                  key={question.id}
                  className="rounded border border-warning/25 bg-warning-soft/40 px-2.5 py-2"
                >
                  <div className="flex items-center gap-1.5 text-[10.5px] text-warning">
                    <Icon name="comment" size={11} />
                    {question.blocking ? "Blocking question" : "Question"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text">{question.text}</div>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      value={questionDrafts[question.id] || ""}
                      onChange={(e) => onQuestionDraft(question.id, e.target.value)}
                      placeholder="Answer for the team…"
                      className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-[10.5px] text-text outline-none focus:border-accent"
                    />
                    <button
                      onClick={() =>
                        void onAnswer(question.id, questionDrafts[question.id] || "")
                      }
                      disabled={!questionDrafts[question.id]?.trim()}
                      className="rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
                    >
                      Answer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {plan.tasks.map((task) => {
              const key = `${plan.id}:${task.id}`;
              const agent = task.agent_id ? profileById.get(task.agent_id) : undefined;
              const candidates = profiles.filter(
                (profile) => profile.role === task.role && profile.status === "active"
              );
              const actionBusy =
                busy?.startsWith(`retry:${plan.id}:${task.id}`) ||
                busy?.startsWith(`merge:${plan.id}:${task.id}`) ||
                busy?.startsWith(`reject:${plan.id}:${task.id}`) ||
                busy?.startsWith(`assign:${plan.id}:${task.id}`);
              return (
                <div
                  key={task.id}
                  className="rounded border border-border/80 bg-surface/40 px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${taskDot(task.status)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] font-medium text-text">
                          {task.title}
                        </span>
                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-muted">
                          {task.role}
                        </span>
                        <span className={`text-[9.5px] ${taskTone(task.status)}`}>
                          {TASK_STATUS_LABEL[task.status]}
                        </span>
                        {task.gate_passed && (
                          <span className="text-[9px] text-success">gate passed</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] text-muted">
                        <span>#{task.id}</span>
                        {task.depends_on.length > 0 && (
                          <span>after {task.depends_on.join(", ")}</span>
                        )}
                        {task.branch && (
                          <span className="inline-flex items-center gap-0.5 font-mono text-[9px]">
                            <Icon name="branch" size={9} />
                            {task.branch}
                          </span>
                        )}
                        {agent && <span>{agent.name}</span>}
                      </div>
                      {task.error && (
                        <div className="mt-1 rounded bg-danger-soft px-1.5 py-1 text-[9.5px] text-danger">
                          {task.error}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {candidates.length > 0 && task.status !== "running" && (
                        <select
                          value={task.agent_id || ""}
                          onChange={(e) => {
                            if (e.target.value) void onAssign(task, e.target.value);
                          }}
                          className="max-w-[118px] rounded border border-border bg-surface px-1 py-0.5 text-[9.5px] text-muted outline-none focus:border-accent"
                          title="Manual assignment"
                        >
                          <option value="">Auto</option>
                          {candidates.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => onWhy(task)}
                        className="rounded px-1.5 py-0.5 text-[9.5px] text-muted hover:bg-white/[0.05] hover:text-text"
                        title="Why this agent?"
                      >
                        Why
                      </button>
                      {(task.status === "failed" || task.status === "blocked") && (
                        <button
                          onClick={() => void onRetry(task)}
                          disabled={actionBusy}
                          className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9.5px] text-text hover:bg-white/[0.04] disabled:opacity-50"
                        >
                          Retry
                        </button>
                      )}
                      {task.status === "review" && (
                        <>
                          <button
                            onClick={() => void onMerge(task)}
                            disabled={actionBusy || !task.run_id}
                            className="rounded bg-success/90 px-1.5 py-0.5 text-[9.5px] font-medium text-white hover:bg-success disabled:opacity-50"
                          >
                            Merge
                          </button>
                          <button
                            onClick={() => void onReject(task)}
                            disabled={actionBusy || !task.run_id}
                            className="rounded border border-border px-1.5 py-0.5 text-[9.5px] text-muted hover:text-danger hover:border-danger/30 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {whyTask === key && (
                    <div className="mt-2 rounded border border-border bg-card px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-[0.1em] text-muted">
                        Assignment reasoning
                      </div>
                      {(recommendations[key] || []).length === 0 ? (
                        <div className="mt-1 text-[10px] text-muted">
                          No active {task.role} has capacity. Pause/resume or hire another
                          agent.
                        </div>
                      ) : (
                        <div className="mt-1 space-y-1">
                          {(recommendations[key] || []).slice(0, 3).map((rec) => (
                            <div key={rec.agent_id} className="flex items-start gap-2">
                              <span className="min-w-[86px] text-[10px] text-text">
                                {rec.name}
                              </span>
                              <span className="text-[9.5px] text-muted">
                                {rec.reasons.join(" · ")}
                              </span>
                              <span className="ml-auto font-mono text-[9px] text-accent-text">
                                {rec.score}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {plan.risks.length > 0 && (
            <div className="mt-2.5 text-[9.5px] text-muted">
              <span className="uppercase tracking-[0.1em]">Risks</span>{" "}
              {plan.risks.join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
