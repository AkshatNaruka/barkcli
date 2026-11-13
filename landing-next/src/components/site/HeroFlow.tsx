"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, GitMerge, ShieldCheck, Sparkles } from "lucide-react";
import { ClaudeCodeLogo, CodexLogo, OpenCodeLogo } from "@/components/AgentLogos";

type Tone = "success" | "copper" | "muted";

const TONE: Record<Tone, { chip: string; dot: string }> = {
  success: {
    chip: "border-success/25 bg-success/10 text-success",
    dot: "bg-success",
  },
  copper: {
    chip: "border-copper/30 bg-copper/10 text-copper-soft",
    dot: "bg-copper",
  },
  muted: {
    chip: "border-line bg-white/[0.03] text-muted-dim",
    dot: "bg-muted-dim",
  },
};

const AGENTS = [
  {
    name: "claude-code",
    role: "builder",
    branch: "bark/oauth-flow-4a",
    status: "tests passed",
    tone: "success" as Tone,
    Logo: ClaudeCodeLogo,
  },
  {
    name: "codex",
    role: "tester",
    branch: "bark/token-store-7b",
    status: "running tests",
    tone: "copper" as Tone,
    Logo: CodexLogo,
  },
  {
    name: "opencode",
    role: "reviewer",
    branch: "bark/diff-audit-8c",
    status: "queued",
    tone: "muted" as Tone,
    Logo: OpenCodeLogo,
  },
];

/** One segment of the vertical run rail. */
function Rail({ active = false }: { active?: boolean }) {
  return (
    <div className="relative flex w-4 shrink-0 flex-col items-center">
      <span
        className={`h-full w-px ${active ? "rail-flow" : "bg-line"}`}
        aria-hidden
      />
    </div>
  );
}

/**
 * The hero visual: a run, as BarkCLI actually reports it.
 *
 * Static sample data, labelled as such — this is a visualisation of the
 * pipeline (intent → worktrees → gate → review), not a fake live execution.
 */
export function HeroFlow() {
  const reduce = useReducedMotion();
  // Every animated element keeps an explicit target, so a later reduced-motion
  // preference can never strand it at its hidden initial state.
  const rise = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
  };
  const timing = (delay: number) => ({
    duration: reduce ? 0 : 0.45,
    delay: reduce ? 0 : delay,
    ease: [0.16, 1, 0.3, 1] as const,
  });

  return (
    <motion.div
      className="relative w-full min-w-0"
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_60%_20%,rgba(217,149,92,0.14),transparent_70%)]"
        aria-hidden
      />

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)]">
        {/* Window chrome */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white/[0.015] px-3.5 py-2.5">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#e5675e]/70" />
            <span className="size-2.5 rounded-full bg-[#d9a35c]/70" />
            <span className="size-2.5 rounded-full bg-[#42c995]/70" />
          </div>
          <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-dim">
            barkcli run &quot;Add OAuth login&quot; --agents 3
          </code>
          <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-dim">
            sample
          </span>
        </div>

        <div className="p-3.5 sm:p-4">
          {/* Intent */}
          <motion.div {...rise} transition={timing(0.08)} className="flex gap-3">
            <div className="relative flex w-4 shrink-0 justify-center">
              <span className="h-full w-px bg-line" aria-hidden />
              <span className="absolute left-1/2 top-4 size-[7px] -translate-x-1/2 rounded-full bg-copper ring-4 ring-surface" />
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-copper" aria-hidden />
                <span className="text-[12.5px] font-medium text-fg">Intent</span>
                <span className="font-mono text-[10px] text-muted-dim">planning</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                &ldquo;Add Google OAuth login&rdquo; planned into{" "}
                <span className="text-fg">3 verifiable tasks</span> with acceptance criteria.
              </p>
            </div>
          </motion.div>

          {/* Worktrees */}
          <div className="flex gap-3">
            <Rail />
            <div className="min-w-0 flex-1 pb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-dim">
                  3 isolated worktrees
                </span>
                <span className="font-mono text-[10px] text-muted-dim">no lock contention</span>
              </div>
              <ul className="space-y-1.5">
                {AGENTS.map((agent, index) => (
                  <motion.li
                    key={agent.branch}
                    {...rise}
                    transition={timing(0.16 + index * 0.07)}
                    className="flex items-center gap-2.5 rounded-lg border border-line bg-white/[0.02] px-2.5 py-2"
                  >
                    <agent.Logo className="size-4 shrink-0 text-fg/80" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="truncate font-mono text-[11px] text-fg/90">
                          {agent.name}
                        </span>
                        <span className="hidden shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-dim sm:inline">
                          {agent.role}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-muted-dim">
                        {agent.branch}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9.5px] ${TONE[agent.tone].chip}`}
                    >
                      {agent.status}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>

          {/* Gate */}
          <motion.div
            {...rise}
            transition={timing(0.4)}
            className="flex gap-3"
          >
            <div className="relative flex w-4 shrink-0 justify-center">
              <span className="h-full w-px bg-line" aria-hidden />
              <span className="absolute left-1/2 top-4 size-[7px] -translate-x-1/2 rounded-full bg-success ring-4 ring-surface" />
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ShieldCheck className="size-3.5 text-success" aria-hidden />
                <span className="text-[12.5px] font-medium text-fg">Acceptance gate</span>
                <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                  cargo test --all
                </code>
                <span className="font-mono text-[10.5px] text-success">14 passed</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-dim">
                Done means the gate passed in the worktree — not that the agent said so.
              </p>
            </div>
          </motion.div>

          {/* Review */}
          <motion.div
            {...rise}
            transition={timing(0.48)}
            className="flex items-center gap-3 rounded-lg border border-copper/25 bg-copper/[0.07] px-2.5 py-2.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper/10">
              <GitMerge className="size-3.5 text-copper" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-fg">Review queue</span>
                <span className="rounded-full border border-copper/30 bg-copper/10 px-1.5 py-px font-mono text-[9.5px] text-copper-soft">
                  1 ready
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-dim">
                merge train · 1 merged · 1 waiting on you
              </p>
            </div>
            <Check className="size-3.5 shrink-0 text-success" aria-hidden />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
