import React from "react";

export interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  /** Format a value for display. */
  formatValue?: (value: number | string) => string;
  /** Format the label. */
  formatLabel?: (label: string) => string;
  /** Additional className. */
  className?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
  className = "",
}: ChartTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const displayLabel = formatLabel ? formatLabel(String(label ?? "")) : label;

  return (
    <div
      className={`rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2 shadow-lg text-[11.5px] ${className}`}
    >
      {displayLabel && (
        <div className="font-semibold text-text mb-1">{displayLabel}</div>
      )}
      <div className="space-y-0.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color || entry.fill }}
            />
            <span className="text-muted-strong">{entry.name}:</span>
            <span className="font-mono text-text tabular-nums">
              {formatValue ? formatValue(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
