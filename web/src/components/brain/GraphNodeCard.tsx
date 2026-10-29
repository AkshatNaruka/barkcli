import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Icon } from "../Icon";
import { TIER, KIND_ICON, NODE_W } from "./layout";

export interface BrainNodeData {
  label: string;
  kind: string;
  tier?: string;
  importance: number;
  dimmed?: boolean;
  focus?: boolean;
}

// Borderless knowledge-node card — color lives in the dot, text stays neutral.
// Selection/focus is a soft accent ring; dimming keeps graph context visible.
export const GraphNodeCard = memo(function GraphNodeCard({ data }: { data: BrainNodeData }) {
  const tier = data.tier ? TIER[data.tier] : undefined;
  const icon = KIND_ICON[data.kind] || "layers";
  return (
    <div
      className="bg-card rounded-xl px-3 py-2.5"
      style={{
        width: NODE_W,
        boxShadow:
          data.focus
            ? "0 0 0 1.5px color-mix(in srgb, var(--accent) 75%, transparent)"
            : "0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)",
        opacity: data.dimmed ? 0.28 : 1,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-muted flex" title={data.kind}>
          <Icon name={icon as any} size={11} />
        </span>
        {tier && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tier.color }} title={tier.label} />}
        <span className="ml-auto text-[9px] text-muted tabular-nums">{Math.round(data.importance * 100)}%</span>
      </div>
      <div className="text-[12.5px] font-medium text-text leading-snug line-clamp-2">{data.label}</div>
      <div className="h-[3px] rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(6, data.importance * 100)}%`,
            background: tier ? tier.color : "var(--accent)",
          }}
        />
      </div>
      {/* Invisible handles so edges dock without visible connectors */}
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0, width: 2, height: 2, left: -1, border: "none" }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0, width: 2, height: 2, right: -1, border: "none" }} />
    </div>
  );
});
