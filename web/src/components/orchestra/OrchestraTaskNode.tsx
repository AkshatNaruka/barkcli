import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Icon } from "../Icon";
import type { PlanTask } from "../../lib/types";
import { TASK_NODE_W } from "./workflowLayout";
import { TASK_STATUS_LABEL, taskDot, taskFill } from "./taskStatus";

export interface OrchestraTaskNodeData {
  task: PlanTask;
  agentName?: string;
  selected?: boolean;
}

export const OrchestraTaskNode = memo(function OrchestraTaskNode(
  props: NodeProps & { data: OrchestraTaskNodeData },
) {
  const { data, selected } = props;
  const task = data.task;
  const fill = taskFill(task.status);
  const hasProblem = task.status === "failed" || task.status === "blocked" || !!task.error;
  return (
    <div
      className="relative rounded-xl bg-card text-left"
      style={{
        width: TASK_NODE_W,
        boxShadow: selected
          ? "0 0 0 1.5px color-mix(in srgb, var(--accent) 75%, transparent), 0 8px 24px -16px rgba(0,0,0,.5)"
          : "0 0 0 1px color-mix(in srgb, var(--border) 85%, transparent)",
      }}
      title={task.title}
    >
      <div
        className="absolute inset-y-2 left-0 w-[3px] rounded-r"
        style={{ background: fill, opacity: selected ? 1 : 0.85 }}
        aria-hidden
      />
      <div className="px-3 py-2.5 pl-3.5">
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${taskDot(task.status)}`} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium leading-snug text-text">{task.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] text-muted">
              <span className="rounded bg-white/[0.04] px-1 py-px text-muted-strong">{task.role}</span>
              <span style={{ color: fill === "var(--border-strong)" ? undefined : fill }} className={fill === "var(--border-strong)" ? "text-muted" : ""}>
                {TASK_STATUS_LABEL[task.status]}
              </span>
              {task.gate_passed && <span className="text-success">gate</span>}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-muted">
          <span className="truncate">{data.agentName || task.agent_id || "unassigned"}</span>
          {task.branch && (
            <span className="ml-auto inline-flex items-center gap-0.5 truncate font-mono text-[9px] text-muted/80" title={task.branch}>
              <Icon name="branch" size={9} />
              {task.branch.length > 18 ? `…${task.branch.slice(-16)}` : task.branch}
            </span>
          )}
          {hasProblem && !task.branch && <Icon name="warn" size={10} className="ml-auto text-danger" />}
        </div>
      </div>
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0, width: 6, height: 10, left: -2, border: "none" }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0, width: 6, height: 10, right: -2, border: "none" }} />
    </div>
  );
});
