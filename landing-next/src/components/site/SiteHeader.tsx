"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "./Brand";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "/docs", label: "Docs", route: true },
];

const GITHUB = "https://github.com/AkshatNaruka/barkcli";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
        frame = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // A real menu: Escape closes, focus moves into the panel and comes back,
  // and the page behind cannot scroll away under it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line/80 bg-bg/85 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/70"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-5 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md no-underline transition-opacity hover:opacity-90"
          aria-label="barkcli home"
        >
          <BrandLockup />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) =>
            item.route ? (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2.5 text-[13px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2.5 text-[13px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
              >
                {item.label}
              </a>
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-md px-3 py-2.5 text-[13px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg sm:inline-flex"
          >
            GitHub
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
          <a
            href="#install"
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-copper px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-copper-soft"
          >
            Install
          </a>
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-10 items-center justify-center rounded-md border border-line text-fg transition-colors hover:border-line-strong lg:hidden"
          >
            {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            ref={panelRef}
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-line bg-bg/95 backdrop-blur-xl lg:hidden"
          >
            <nav aria-label="Mobile" className="mx-auto flex max-w-[1120px] flex-col px-5 py-3">
              {NAV.map((item) =>
                item.route ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-2 py-3 text-[15px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-2 py-3 text-[15px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
                  >
                    {item.label}
                  </a>
                )
              )}
              <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
                <a
                  href="#install"
                  onClick={() => setOpen(false)}
                  className="flex h-10 flex-1 items-center justify-center rounded-md bg-copper text-[14px] font-medium text-ink"
                >
                  Install barkcli
                </a>
                <a
                  href={GITHUB}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] text-muted"
                >
                  GitHub
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
