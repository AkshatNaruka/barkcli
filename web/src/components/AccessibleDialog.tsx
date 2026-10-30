import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function AccessibleDialog({ label, onClose, children, className = "" }: { label: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const container = dialog.current;
    const siblings = Array.from(document.body.children).filter((element) => !element.contains(container));
    const saved = siblings.map((element) => [element, element.hasAttribute("inert")] as const);
    saved.forEach(([element]) => element.setAttribute("inert", ""));
    const focusable = () => Array.from(container?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]') || []).filter((element) => !element.closest("[hidden]") && (!element.closest("details:not([open])") || element.tagName === "SUMMARY"));
    (focusable()[0] || container)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); container?.focus(); return; }
      if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === container)) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); saved.forEach(([element, wasInert]) => { if (!wasInert) element.removeAttribute("inert"); }); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="bark-dialog-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div ref={dialog} className={`bark-dialog ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>, document.body);
}
