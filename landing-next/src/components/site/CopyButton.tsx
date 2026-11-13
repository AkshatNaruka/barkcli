"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copy text to the clipboard, with a fallback for older/insecure contexts. */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * A copy control that reports what happened.
 *
 * Says "Copy" before, "Copied" after success, and "Press ⌘C" when the browser
 * refused — it never claims to have copied something it did not.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  className = "",
  iconOnly = false,
  ariaLabel,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  iconOnly?: boolean;
  ariaLabel?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  const onClick = useCallback(async () => {
    const ok = await copyText(value);
    setState(ok ? "copied" : "failed");
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setState("idle"), 2000);
  }, [value]);

  const text =
    state === "copied" ? copiedLabel : state === "failed" ? "Press ⌘C" : label;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? `${label}: ${value}`}
      className={
        className ||
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-line bg-raised px-3 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
      }
      data-state={state}
    >
      {state === "copied" ? (
        <Check className="size-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {!iconOnly && <span aria-live="polite">{text}</span>}
      {iconOnly && <span className="sr-only" aria-live="polite">{text}</span>}
    </button>
  );
}
