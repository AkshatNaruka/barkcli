"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * The site's single entrance animation.
 *
 * Content is server-rendered visible and stays visible if JavaScript never
 * runs — the hidden state is only applied after mount, and only to elements
 * that are still below the fold. Reduced-motion preferences skip it entirely.
 * Nothing here branches on a media query during render, so hydration always
 * matches the server's output.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top > window.innerHeight - 64) setHidden(true);
  }, []);

  useEffect(() => {
    if (!hidden) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHidden(false);
          observer.disconnect();
        }
      },
      { rootMargin: "-64px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hidden]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translateY(${y}px)` : "none",
        transition: hidden
          ? "none"
          : `opacity 550ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 550ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
