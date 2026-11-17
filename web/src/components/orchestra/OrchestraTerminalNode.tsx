import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Icon } from "../Icon";
import { TERMINAL_NODE_W } from "./workflowLayout";
import type { WorkflowTerminalLabel } from "./workflowLayout";

export interface OrchestraTerminalNodeData extends WorkflowTerminalLabel {
  variant: "start" | "end";
}

const TONE_CLASS: Record<NonNullable<WorkflowTerminalLabel["tone"]>, string> = {
  idle: "border-border bg-card text-muted",
  active: "border-accent/35 bg-accent-soft text-accent-text",
  done: "border-success/25 bg-success-soft text-success",
  warn: "border-warning/30 bg-warning-soft text-warning",
};

export const OrchestraTerminalNode = memo(function OrchestraTerminalNode(
  props: NodeProps & { data: OrchestraTerminalNodeData },
) {
  const { data } = props;
  const tone = TONE_CLASS[data.tone || "idle"];
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${tone}`}
      style={{ width: TERMINAL_NODE_W, minHeight: 56 }}
      title={[data.title, data.subtitle].filter(Boolean).join(" — ")}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bg/55">
        <Icon name={data.variant === "start" ? "spark" : "branch"} size={13} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11.5px] font-medium leading-tight">{data.title}</div>
        {data.subtitle && (
          <div className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug opacity-80">
            {data.subtitle}
          </div>
        )}
      </div>
      {data.variant === "start" ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          style={{ opacity: 0, width: 6, height: 10, right: -2, border: "none" }}
        />
      ) : (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          style={{ opacity: 0, width: 6, height: 10, left: -2, border: "none" }}
        />
      )}
    </div>
  );
});
