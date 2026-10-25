import React from "react";
import { labelColor } from "../lib/labels";

// Quiet label chip: soft tint + colored text, no dot — reads as one system
// with the priority and status chips.
export const LabelChip = React.memo(function LabelChip({ name }: { name: string }) {
  const { color } = labelColor(name);
  return (
    <span
      className="inline-flex items-center text-[9px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded shrink-0"
      style={{
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        color: `color-mix(in srgb, ${color} 80%, var(--text))`,
      }}
      title={`Label: ${name}`}
    >
      {name}
    </span>
  );
});
