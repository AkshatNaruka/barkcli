import React, { useRef } from "react";

export function PaneResizeHandle({ label, width, min, max, onChange, reverse = false }: {
  label: string; width: number; min: number; max: number; onChange: (value: number) => void; reverse?: boolean;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (value: number) => onChange(Math.min(max, Math.max(min, value)));
  return <div role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} className="pane-resize"
    onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resize(width + (event.key === "ArrowRight" ? 16 : -16) * (reverse ? -1 : 1)); }
      if (event.key === "Home") { event.preventDefault(); resize(min); }
      if (event.key === "End") { event.preventDefault(); resize(max); }
    }}
    onPointerDown={(event) => { drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => { if (drag.current) resize(drag.current.width + (event.clientX - drag.current.x) * (reverse ? -1 : 1)); }}
    onPointerUp={(event) => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { drag.current = null; }} />;
}
