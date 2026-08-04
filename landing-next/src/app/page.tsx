"use client";

import { useState, useEffect, useRef } from "react";
import {
  motion,
  useInView,
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ───────────────────────────────────────────────
   Utilities
   ─────────────────────────────────────────────── */

function useCountUp(end: number, duration = 1800, start = 0) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, end, duration, start]);

  return { ref, count };
}

function useTypewriter(words: string[], speed = 50, startDelay = 800) {
  const [index, setIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) {
      const t = setTimeout(() => setStarted(true), startDelay);
      return () => clearTimeout(t);
    }
    if (index >= words.length) return;
    if (charCount < words[index].length) {
      const t = setTimeout(() => setCharCount((c) => c + 1), speed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setIndex((i) => i + 1);
      setCharCount(0);
    }, 300);
    return () => clearTimeout(t);
  }, [index, charCount, words, speed, started, startDelay]);

  return {
    typed: words.slice(0, index).map((w) => w).join("\n") +
      (index < words.length ? "\n" + words[index].slice(0, charCount) : ""),
    done: index >= words.length,
    started,
  };
}

/* ───────────────────────────────────────────────
   Animations
   ─────────────────────────────────────────────── */

function Reveal({
  children,
  className = "",
  once = true,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  once?: boolean;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.6, ease: "easeOut" as const, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ───────────────────────────────────────────────
   Copy button with feedback
   ─────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-3 text-xs font-mono text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/40 rounded-lg px-3 py-1.5 transition-colors shrink-0 cursor-pointer"
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="text-[#059669]"
          >
            Copied!
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            Copy
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ───────────────────────────────────────────────
   Terminal block
   ─────────────────────────────────────────────── */

function TerminalBlock({
  children,
  showDots = false,
  className = "",
  glow = false,
}: {
  children: React.ReactNode;
  showDots?: boolean;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={`relative ${glow ? "group" : ""}`}>
      {glow && (
        <div className="absolute -inset-[1px] rounded-2xl bg-primary/10 opacity-0 group-hover:opacity-100 blur transition-opacity duration-500" />
      )}
      <div
        className={`relative rounded-2xl overflow-hidden shadow-sm border border-border ${className}`}
        style={{ backgroundColor: "var(--terminal)" }}
      >
        {showDots ? (
          <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-xs text-white/30 font-mono tracking-wider select-none">
              TERMINAL
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white/15" />
              <span className="w-2 h-2 rounded-full bg-white/15" />
              <span className="w-2 h-2 rounded-full bg-white/15" />
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Typewriter terminal
   ─────────────────────────────────────────────── */

function TypewriterDemo() {
  const lines = [
    "$ barkcli init",
    "",
    '$ barkcli add "Fix auth bug" -p high -l backend',
    '$ barkcli add "Write onboarding docs"',
    "$ barkcli list",
    "",
    "$ barkcli move fix-auth-bug doing",
    "$ barkcli done fix-auth-bug",
    "",
    "$ barkcli log && barkcli undo && barkcli diff",
  ];
  const { typed, done } = useTypewriter(lines, 35, 1200);

  return (
    <pre className="p-8 text-sm leading-8 font-mono overflow-x-auto min-h-[320px]">
      {typed.split("\n").map((line, i) => (
        <span key={i}>
          {line.startsWith("$") ? (
            <>
              <span className="text-white/30">$</span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-white font-medium"
              >
                {line.slice(1)}
              </motion.span>
            </>
          ) : line.startsWith('"') || line.startsWith("-") ? (
            <span className="text-gray-300">{line}</span>
          ) : (
            <span className="text-gray-300">{line}</span>
          )}
          {"\n"}
        </span>
      ))}
      {done ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="cursor-blink text-[#059669]"
        >
          █
        </motion.span>
      ) : (
        <span className="text-white/40">█</span>
      )}
    </pre>
  );
}

/* ───────────────────────────────────────────────
   Nav with scroll-aware background
   ─────────────────────────────────────────────── */

function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 20);
  });

  return (
    <motion.header
      animate={{
        backgroundColor: scrolled
          ? "rgba(255,255,255,0.92)"
          : "rgba(255,255,255,0.85)",
        boxShadow: scrolled
          ? "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)"
          : "0 0 0 rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.2 }}
      className="sticky top-0 z-50 backdrop-blur-md border-b border-border"
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <motion.a
          href="#"
          className="flex items-center gap-2.5 no-underline"
          whileHover={{ scale: 1.02 }}
        >
          <motion.span
            className="text-xl"
            whileHover={{ rotate: [0, -10, 10, -5, 0] }}
            transition={{ duration: 0.5 }}
          >
            🐶
          </motion.span>
          <span className="text-lg font-bold tracking-tight font-mono text-foreground">
            barkcli
          </span>
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-border/60 text-muted-foreground rounded px-1.5 py-0"
          >
            v0.2.0
          </Badge>
        </motion.a>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          {["Features", "Demo", "Pricing"].map((item) => (
            <motion.a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="hover:text-foreground transition-colors"
              whileHover={{ y: -1 }}
            >
              {item}
            </motion.a>
          ))}
          <a
            href="https://x.com/probiex007"
            className="hover:text-foreground transition-colors"
          >
            X
          </a>
          <motion.a href="#install" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button size="sm" className="font-semibold">
              Install
            </Button>
          </motion.a>
        </nav>
      </div>
    </motion.header>
  );
}

/* ───────────────────────────────────────────────
   Hero
   ─────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative max-w-3xl mx-auto px-6 pt-24 pb-8 text-center overflow-hidden">
      {/* ambient bg glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/30 rounded-full blur-[120px] pointer-events-none" />

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="relative text-xs text-muted-foreground mb-6 font-mono tracking-wider uppercase"
      >
        git-native task management
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
        className="relative text-5xl md:text-7xl font-extrabold tracking-tight leading-none mb-6 text-foreground"
      >
        Tasks in your repo.
        <br />
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="text-muted-foreground font-semibold"
        >
          No cloud. No subscription.
        </motion.span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="relative text-lg text-muted-foreground max-w-xl mx-auto mb-2 leading-relaxed"
      >
        A single binary. Your tasks are YAML files — commit them, diff them, own
        them.
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="relative text-sm text-muted-foreground mb-10"
      >
        Like{" "}
        <span className="text-foreground font-semibold">git</span> but for your
        todo list.
      </motion.p>

      <motion.div
        id="install"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
        className="relative max-w-lg mx-auto mb-4"
      >
        <TerminalBlock glow>
          <div className="flex items-center p-4">
            <span className="text-primary/70 mr-2 select-none font-mono text-sm">
              $
            </span>
            <code className="flex-1 text-sm text-gray-300 font-mono overflow-x-auto">
              curl -fsSL https://getbarkcli.dev | sh
            </code>
            <CopyButton text="curl -fsSL https://getbarkcli.dev | sh" />
          </div>
        </TerminalBlock>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.4 }}
        className="text-xs text-muted-foreground font-mono"
      >
        macOS · Linux · Windows
      </motion.p>
    </section>
  );
}

/* ───────────────────────────────────────────────
   KPI strip with animated counters
   ─────────────────────────────────────────────── */

function KPI() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const duration = 1500;

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="border-y border-border"
    >
      <div className="max-w-4xl mx-auto px-6 py-14">
        <div className="grid grid-cols-3 gap-8 text-center">
          {[
            { value: 1, label: "BINARY" },
            { value: 3, label: "INTERFACES" },
            { value: 49, label: "ONE-TIME", prefix: "$" },
          ].map(({ value, label, prefix = "" }) => {
            const { ref: cr, count } = useCountUp(value, duration);
            return (
              <div key={label} className={label === "INTERFACES" ? "border-x border-border" : ""}>
                <div ref={cr} className="text-3xl font-bold font-mono text-foreground tabular-nums">
                  {prefix}
                  {count}
                </div>
                <div className="text-xs text-muted-foreground mt-2 font-mono tracking-wider">
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

/* ───────────────────────────────────────────────
   Features
   ─────────────────────────────────────────────── */

const features = [
  {
    icon: (
      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" d="M8 9l3 3-3 3m5 0h3M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
      </svg>
    ),
    title: "Terminal-first",
    desc: "Interactive TUI with vim keys, command palette, themes, and query syntax.",
    code: "barkcli tui",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path strokeLinecap="round" d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: "Web Kanban",
    desc: "Drag-and-drop board, table, calendar, and list views. Live-reload via WebSocket.",
    code: "barkcli serve --open",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
      </svg>
    ),
    title: "Git-native",
    desc: "Plain YAML in your repo. PRs show card diffs. git merge = sync.",
    code: "barkcli diff HEAD~1",
  },
];

function Features() {
  return (
    <section id="features" className="max-w-5xl mx-auto px-6 py-28">
      <Reveal>
        <h2 className="text-3xl font-bold text-center mb-2">Built for how you work.</h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="text-muted-foreground text-center mb-16 max-w-lg mx-auto font-mono text-sm">
          Terminal. Browser. IDE. Same data, same commands.
        </p>
      </Reveal>
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={{
          hidden: { transition: {} },
          visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
        }}
        className="grid md:grid-cols-3 gap-3"
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={{
              hidden: { opacity: 0, y: 24, scale: 0.97 },
              visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5 } },
            }}
            whileHover={{ y: -4, boxShadow: "0 8px 30px rgba(0,0,0,0.06)" }}
            className="bg-white border border-border rounded-2xl p-8 transition-colors duration-300 cursor-default"
          >
            <motion.div
              className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-5"
              whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
              transition={{ duration: 0.4 }}
            >
              {f.icon}
            </motion.div>
            <h3 className="font-semibold mb-1.5 text-foreground">{f.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {f.desc}
            </p>
            <code className="text-xs text-primary/60 font-mono">{f.code}</code>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

/* ───────────────────────────────────────────────
   AI Teaser
   ─────────────────────────────────────────────── */

function AITeaser() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Reveal>
      <motion.section
        ref={ref}
        className="max-w-4xl mx-auto px-6 pb-28"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
      >
        <div className="relative bg-accent/40 border border-primary/10 rounded-3xl p-12 md:p-16 text-center overflow-hidden">
          {/* Subtle inner glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-primary/5 rounded-full blur-[80px]" />

          <h2 className="relative text-3xl font-bold mb-4 text-foreground">
            Let AI break down your tasks.
          </h2>
          <p className="relative text-muted-foreground max-w-md mx-auto mb-10 font-mono text-sm">
            Describe the task. barkcli generates the cards.
          </p>
          <div className="relative max-w-sm mx-auto">
            <TerminalBlock>
              <pre className="p-5 text-sm leading-7 font-mono">
                <span className="text-white/30">$</span>{" "}
                <span className="text-white font-medium">barkcli ai</span>{" "}
                <span className="text-gray-300">"Implement JWT auth"</span>
                {"\n\n"}
                <span className="text-white/40">Generated 6 tasks:</span>
                {"\n"}
                <span className="text-[#059669]">1.</span>{" "}
                <span className="text-white">Set up JWT middleware</span>{" "}
                <span className="text-white/30">[high]</span>
                {"\n"}
                <span className="text-[#059669]">2.</span>{" "}
                <span className="text-white">Create refresh token endpoint</span>{" "}
                <span className="text-white/30">[high]</span>
                {"\n"}
                <span className="text-[#059669]">3.</span>{" "}
                <span className="text-white">Add token blacklisting</span>{" "}
                <span className="text-white/30">[medium]</span>
                {"\n"}
                <span className="text-white/30">...</span>
              </pre>
            </TerminalBlock>
          </div>
        </div>
      </motion.section>
    </Reveal>
  );
}

/* ───────────────────────────────────────────────
   Pricing
   ─────────────────────────────────────────────── */

const tiers = [
  {
    name: "Free",
    price: "$0",
    desc: "All the basics.",
    cta: "Install",
    href: "#install",
    highlight: false,
    features: [
      "Unlimited tasks & boards",
      "Terminal TUI · Web Kanban",
      "Git history · undo · diff",
      "VS Code · Neovim · JetBrains",
    ],
  },
  {
    name: "Pro",
    price: "$49",
    desc: "AI, reports, templates.",
    cta: "Buy Pro",
    href: "#",
    highlight: true,
    badge: "POPULAR",
    features: [
      "Everything in Free",
      "AI task breakdown",
      "Weekly reports",
      "Auto changelog",
      "Analytics & stats",
      "5 templates (43 tasks)",
    ],
  },
  {
    name: "Team",
    price: "$149",
    desc: "Collaboration, 5 seats.",
    cta: "Buy Team",
    href: "#",
    highlight: false,
    features: [
      "Everything in Pro",
      "Conflict resolution",
      "Sprint planning",
      "GitHub sync",
      "Team dashboard",
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="max-w-5xl mx-auto px-6 py-28">
      <Reveal>
        <h2 className="text-3xl font-bold text-center mb-2 text-foreground">
          Pay once. Use forever.
        </h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="text-muted-foreground text-center mb-14 font-mono text-sm">
          Your tasks stay yours — in your git repo — forever.
        </p>
      </Reveal>
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={{
          hidden: { transition: {} },
          visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
        }}
        className="grid md:grid-cols-3 gap-3"
      >
        {tiers.map((tier) => (
          <motion.div
            key={tier.name}
            variants={{
              hidden: { opacity: 0, y: 24, scale: 0.97 },
              visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5 } },
            }}
            whileHover={{ y: -3 }}
            className={`bg-white rounded-2xl p-8 relative transition-colors ${
              tier.highlight
                ? "border-2 border-primary shadow-[0_0_30px_rgba(139,94,60,0.1)]"
                : "border border-border"
            }`}
          >
            {tier.badge && (
              <motion.span
                initial={{ opacity: 0, y: -8 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold font-mono"
              >
                {tier.badge}
              </motion.span>
            )}
            <h3
              className={`text-lg font-semibold mb-1 text-foreground ${
                tier.highlight ? "mt-2" : ""
              }`}
            >
              {tier.name}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">{tier.desc}</p>
            <div className="text-4xl font-bold mb-1 font-mono text-foreground">
              {tier.price}
            </div>
            <p className="text-xs text-muted-foreground mb-6 font-mono">
              {tier.name === "Pro"
                ? "ONE-TIME · LIFETIME"
                : tier.name === "Team"
                ? "ONE-TIME · 5 SEATS"
                : "\u00A0"}
            </p>
            <a href={tier.href} className="block mb-8">
              <Button
                variant={tier.highlight ? "default" : "outline"}
                className="w-full font-semibold"
              >
                {tier.cta}
              </Button>
            </a>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  {tier.highlight ? (
                    <motion.span
                      className="text-primary font-mono text-xs mt-0.5 shrink-0"
                      whileHover={{ rotate: 12, scale: 1.2 }}
                    >
                      ✦
                    </motion.span>
                  ) : (
                    <svg
                      className="w-4 h-4 text-[#059669] mt-0.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {f}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

/* ───────────────────────────────────────────────
   Testimonials
   ─────────────────────────────────────────────── */

const testimonials = [
  {
    quote: "Finally — project management without a subscription. My startup roadmap lives in git. Pushing tasks alongside code is magical.",
    name: "Alex Chen",
    role: "SaaS Founder",
    initials: "AC",
    color: "from-primary/80 to-primary",
  },
  {
    quote: "barkcli ai broke down 'ship MVP' into 14 tasks in 3 seconds. That alone is worth $49. I demo the TUI in my videos.",
    name: "Maria Santos",
    role: "Indie Hacker",
    initials: "MS",
    color: "from-amber-500 to-orange-500",
  },
  {
    quote: "Switched from Linear. Saved $120/yr. My tasks are YAML files I can grep and script. Git integration is the killer feature.",
    name: "Raj Patel",
    role: "Engineering Lead",
    initials: "RP",
    color: "from-green-500 to-emerald-600",
  },
];

function Testimonials() {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        hidden: { transition: {} },
        visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
      }}
      className="max-w-5xl mx-auto px-6 pb-28"
    >
      <Reveal>
        <h2 className="text-3xl font-bold text-center mb-14 text-foreground">
          Loved by builders.
        </h2>
      </Reveal>
      <div className="grid md:grid-cols-3 gap-3">
        {testimonials.map((t) => (
          <motion.div
            key={t.name}
            variants={{
              hidden: { opacity: 0, y: 24, scale: 0.97 },
              visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5 } },
            }}
            whileHover={{ y: -3, borderColor: "rgba(139,94,60,0.15)" }}
            className="bg-white border border-border rounded-xl p-6 transition-colors duration-300"
          >
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              &ldquo;{t.quote}&rdquo;
            </p>
            <div className="flex items-center gap-3">
              <motion.div
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-xs font-semibold text-white font-mono`}
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                {t.initials}
              </motion.div>
              <div>
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

/* ───────────────────────────────────────────────
   FAQ
   ─────────────────────────────────────────────── */

const faqs = [
  {
    q: "One-time. No subscription?",
    a: "Yes. Pay once, use forever. Tasks are YAML in your git repo — no vendor lock-in.",
  },
  {
    q: "How is it different from Linear?",
    a: "No cloud. No per-user pricing. Single binary. Works offline. Tasks are plain YAML.",
  },
  {
    q: "What happens when you buy Pro?",
    a: "License key. barkcli license activate <key>. Offline validation. Use on all your machines.",
  },
  {
    q: "Refund policy?",
    a: "30 days. No questions asked. If it doesn't improve your workflow, we refund.",
  },
];

function FAQ() {
  return (
    <section className="max-w-2xl mx-auto px-6 pb-28">
      <Reveal>
        <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
          Questions
        </h2>
      </Reveal>
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={{
          hidden: { transition: {} },
          visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
        }}
      >
        <Accordion className="space-y-2">
          {faqs.map((faq) => (
            <motion.div key={faq.q} variants={{
              hidden: { opacity: 0, y: 24, scale: 0.97 },
              visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5 } },
            }}>
              <AccordionItem
                value={faq.q}
                className="border border-border rounded-xl px-5"
              >
                <AccordionTrigger className="font-medium text-foreground hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      </motion.div>
    </section>
  );
}

/* ───────────────────────────────────────────────
   CTA
   ─────────────────────────────────────────────── */

function CTA() {
  return (
    <Reveal>
      <section className="max-w-xl mx-auto px-6 pb-28 text-center">
        <h2 className="text-3xl font-bold mb-4 text-foreground">
          Start tracking in 10 seconds.
        </h2>
        <p className="text-muted-foreground mb-8 font-mono text-sm">
          Free forever for the basics. Pro when you need more.
        </p>
        <div className="flex items-center justify-center gap-4">
          <motion.a
            href="#install"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            <Button size="lg" className="font-semibold">
              Install free
            </Button>
          </motion.a>
          <motion.a
            href="#pricing"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            <Button variant="outline" size="lg" className="font-medium">
              View pricing
            </Button>
          </motion.a>
        </div>
      </section>
    </Reveal>
  );
}

/* ───────────────────────────────────────────────
   Footer
   ─────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-border py-10 text-center text-xs text-muted-foreground font-mono">
      <p>
        barkcli ·{" "}
        <motion.a
          href="https://x.com/probiex007"
          className="hover:text-primary transition-colors"
          whileHover={{ y: -1 }}
        >
          X
        </motion.a>{" "}
        · 30-day refund guarantee
      </p>
    </footer>
  );
}

/* ───────────────────────────────────────────────
   Page
   ─────────────────────────────────────────────── */

export default function Home() {
  return (
    <>
      <Nav />
      <main className="pt-16">
        <Hero />
        <section id="demo" className="max-w-2xl mx-auto px-6 pb-24">
          <TerminalBlock showDots>
            <TypewriterDemo />
          </TerminalBlock>
          <p className="text-center mt-4 font-mono text-xs text-muted-foreground">
            Also:{" "}
            <span className="text-primary font-medium">barkcli tui</span> ·{" "}
            <span className="text-primary font-medium">barkcli serve</span> ·{" "}
            <span className="text-primary font-medium">barkcli ai</span>
          </p>
        </section>
        <KPI />
        <Features />
        <AITeaser />
        <Pricing />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
