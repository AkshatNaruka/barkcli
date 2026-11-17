import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Icon } from "../Icon";
import { TIER, KIND_ICON, NODE_W, NODE_H } from "./layout";

export interface BrainNodeData {
  label: string;
  kind: string;
  tier?: string;
  importance: number;
  tags?: string[];
  focus?: boolean;
}

const SIDES = [
  { position: Position.Top, name: "top" },
  { position: Position.Right, name: "right" },
  { position: Position.Bottom, name: "bottom" },
  { position: Position.Left, name: "left" },
];

const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: "none",
  background: "transparent",
  pointerEvents: "none",
};

// A label, not a document: icon + kind + tier dot + two lines of title. The
// description, importance and evidence live in the inspector so the map stays
// scannable at a glance.
export const GraphNodeCard = memo(function GraphNodeCard({ data }: { data: BrainNodeData }) {
  const tier = data.tier ? TIER[data.tier] : undefined;
  const icon = KIND_ICON[data.kind] || "layers";

  return (
    <div
      className="brain-node flex flex-col justify-center gap-[3px] rounded-lg border border-border/70 bg-card px-2.5"
      style={{
        width: NODE_W,
        height: NODE_H,
        boxShadow: data.focus
          ? "0 0 0 1.5px color-mix(in srgb, var(--accent) 75%, transparent)"
          : "0 1px 2px rgba(0, 0, 0, 0.18)",
        background: data.focus ? "color-mix(in srgb, var(--accent) 10%, var(--card))" : undefined,
      }}
      title={data.label}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex shrink-0 text-muted" aria-hidden>
          <Icon name={icon as any} size={11} />
        </span>
        <span className="truncate font-mono text-[9px] uppercase tracking-wider text-muted/70">
          {data.kind}
        </span>
        {tier && (
          <span
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: tier.color }}
            title={tier.label}
          />
        )}
      </div>
      <div className="line-clamp-2 text-[11.5px] font-medium leading-[1.25] text-text">{data.label}</div>

      {/* One handle per side so edges dock on the facing edge and stay straight. */}
      {SIDES.map(({ position, name }) => (
        <React.Fragment key={name}>
          <Handle
            id={`s-${name}`}
            type="source"
            position={position}
            isConnectable={false}
            style={HANDLE_STYLE}
          />
          <Handle
            id={`t-${name}`}
            type="target"
            position={position}
            isConnectable={false}
            style={HANDLE_STYLE}
          />
        </React.Fragment>
      ))}
    </div>
  );
});
