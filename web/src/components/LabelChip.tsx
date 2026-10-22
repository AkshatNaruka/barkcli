import React from "react";
import { labelColor } from "../lib/labels";

// Modern SaaS label chip: colored dot + neutral text on a soft tinted fill —
// the dot carries the color, the label text stays readable in every theme.
export const LabelChip = React.memo(function LabelChip({ name }: { name: string }) {
  const { color } = labelColor(name);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-px rounded-full shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      title={`Label: ${name}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {name}
    </span>
  );
});
