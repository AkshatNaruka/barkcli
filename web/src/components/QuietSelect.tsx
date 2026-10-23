import React from "react";
import { Icon } from "./Icon";

// Ghost select: native dropdown reliability, styled like a quiet app control.
// The closed side shows label + chevron only — no border, no native chrome
// (appearance-none avoids the OS-native white pill artifact in Chromium).
export function QuietSelect({
  className = "",
  chevronClass = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { chevronClass?: string }) {
  return (
    <div className="relative inline-flex items-center min-w-0">
      <select
        {...props}
        className={`appearance-none bg-transparent rounded-md text-xs text-muted hover:text-text cursor-pointer focus:outline-none disabled:opacity-50 truncate pr-6 ${className}`}
      >
        {children}
      </select>
      <span className={`pointer-events-none absolute right-1.5 text-muted flex ${chevronClass}`}>
        <Icon name="chevR" size={11} className="rotate-90" />
      </span>
    </div>
  );
}
