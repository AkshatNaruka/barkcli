import React from "react";
import { ResponsiveContainer } from "recharts";

export interface ChartContainerProps {
  /** Chart height in px. Defaults to 240. */
  height?: number;
  /** Optional title rendered above the chart. */
  title?: string;
  /** Optional subtitle/description. */
  description?: string;
  /** Loading state. */
  loading?: boolean;
  /** Empty state message. */
  emptyMessage?: string;
  /** Whether data is empty. */
  isEmpty?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function ChartContainer({
  height = 240,
  title,
  description,
  loading,
  emptyMessage = "No data available",
  isEmpty,
  children,
  className = "",
}: ChartContainerProps) {
  if (loading) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {title && <h3 className="text-[12px] font-semibold text-text">{title}</h3>}
        {description && <p className="text-[11px] text-muted">{description}</p>}
        <div
          className="flex items-center justify-center rounded-lg border border-border/40 bg-surface/30"
          style={{ height }}
        >
          <span className="text-[11px] text-muted animate-pulse">Loading…</span>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {title && <h3 className="text-[12px] font-semibold text-text">{title}</h3>}
        {description && <p className="text-[11px] text-muted">{description}</p>}
        <div
          className="flex items-center justify-center rounded-lg border border-dashed border-border/40 bg-surface/20"
          style={{ height }}
        >
          <span className="text-[11px] text-muted">{emptyMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {title && <h3 className="text-[12px] font-semibold text-text">{title}</h3>}
      {description && <p className="text-[11px] text-muted">{description}</p>}
      <ResponsiveContainer width="100%" height={height}>
        {children as any}
      </ResponsiveContainer>
    </div>
  );
}
