"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { Check, FileText, GitMerge, ShieldCheck, Sparkles } from "lucide-react";
import { ClaudeCodeLogo, CodexLogo, OpenCodeLogo } from "@/components/AgentLogos";

const STEPS = [
  {
    label: "Intent",
    title: "You describe the outcome",
    body:
      "One sentence is enough. BarkCLI turns it into a spec with acceptance criteria before any agent touches code, so success is defined up front.",
    proof: 'barkcli run "Add Google OAuth login" --yes',
    chips: ["spec", "acceptance criteria", "no agent yet"],
  },
  {
    label: "Plan and dispatch",
    title: "Work splits into isolated attempts",
    body:
      "The spec becomes child tasks, and each task gets its own git worktree and branch. Three agents can edit the same repository at once without touching your checkout or each other.",
    proof: "barkcli dispatch --role builder --agents 3",
    chips: ["3 worktrees", "own branch", "no lock collisions"],
  },
  {
    label: "Build and verify",
    title: "Your tests decide what is done",
    body:
      "Each agent builds in its worktree, then the project's own test command runs there. A failure is fed back to that agent with the logs. An agent's claim of success is never the answer.",
    proof: 'barkcli verify --gate "cargo test --all"',
    chips: ["gate > self-report", "retry with logs", "failure recorded"],
  },
  {
    label: "Review and merge",
    title: "Only passing work reaches you",
    body:
      "Gate-passing branches converge on a review queue and merge in finish order through a merge train. You see the diff and the verdict, and merge in one step.",
    proof: "barkcli review && barkcli merge-train",
    chips: ["diff + verdict", "finish order", "1-click merge"],
  },
];

const AGENTS = [
  { Logo: ClaudeCodeLogo, name: "claude-code", branch: "bark/oauth-flow-4a" },
  { Logo: CodexLogo, name: "codex", branch: "bark/token-store-7b" },
  { Logo: OpenCodeLogo, name: "opencode", branch: "bark/diff-audit-8c" },
];

/**
 * The signature scroll story.
 *
 * The diagram highlights the stage the reader is currently on. Nothing is
 * pinned or hijacked: the steps scroll normally, the diagram sticks on wide
 * screens, and on small screens the diagram is replaced by the same facts in
 * text form.
 */
export function ScrollStory() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start center", "end center"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, Math.floor(value * STEPS.length)));
    setActive((current) => (current === next ? current : next));
  });

  return (
    <section id="how" className="relative border-t border-line py-20 md:py-28">
      <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
            One intent in. Verified code out.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-[1.65] text-muted">
            The same four stages every time, whether you drive them from the CLI, the desktop
            app, or your agent over MCP.
          </p>
        </div>

        <div ref={track} className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
          <ol className="space-y-10 lg:space-y-0">
            {STEPS.map((step, index) => {
              const isActive = index === active;
              return (
                <li
                  key={step.label}
                  className="lg:flex lg:min-h-[62vh] lg:flex-col lg:justify-center"
                  aria-current={isActive ? "step" : undefined}
                >
                  <div
                    className={`border-l pl-5 transition-colors duration-300 ${
                      isActive ? "border-copper" : "border-line"
                    }`}
                  >
                    <p
                      className={`font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors ${
                        isActive ? "text-copper" : "text-muted-dim"
                      }`}
                    >
                      {step.label}
                    </p>
                    <h3 className="mt-2 font-display text-[20px] font-medium leading-tight tracking-[-0.015em] text-fg sm:text-[22px]">
                      {step.title}
                    </h3>
                    <p className="mt-3 max-w-md text-[14px] leading-[1.7] text-muted">
                      {step.body}
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {step.chips.map((chip) => (
                        <li
                          key={chip}
                          className="rounded border border-line bg-white/[0.02] px-2 py-0.5 font-mono text-[10px] text-muted-dim"
                        >
                          {chip}
                        </li>
                      ))}
                    </ul>
                    <code className="mt-4 block max-w-full truncate rounded-md border border-line bg-surface px-2.5 py-2 font-mono text-[11px] text-copper-soft">
                      $ {step.proof}
                    </code>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Desktop diagram: fixed, and highlighted by scroll position. */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <StoryDiagram active={active} reduce={Boolean(reduce)} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryDiagram({ active, reduce }: { active: number; reduce: boolean }) {
  const link = (on: boolean, gate = false) =>
    on ? (gate ? "var(--color-success)" : "var(--color-copper)") : "var(--color-line)";

  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-xl border border-line bg-surface/70">
      <div className="pointer-events-none absolute inset-0 bark-grid opacity-40" aria-hidden />

      <svg
        viewBox="0 0 1000 800"
        className="absolute inset-0 size-full"
        fill="none"
        aria-hidden
      >
        {/* intent → worktrees */}
        {[
          "M300 400 C360 400, 340 250, 400 250",
          "M300 400 C350 400, 350 400, 400 400",
          "M300 400 C360 400, 340 550, 400 550",
        ].map((d) => (
          <motion.path
            key={d}
            d={d}
            stroke={link(active >= 1)}
            strokeWidth={active >= 1 ? 1.6 : 1.2}
            className={active >= 1 && !reduce ? "flow-dash" : undefined}
            initial={false}
            animate={{ opacity: active >= 1 ? 1 : 0.55 }}
            transition={{ duration: 0.35 }}
          />
        ))}

        {/* worktrees → gate */}
        {[
          "M600 250 C680 250, 660 330, 720 330",
          "M600 400 C660 400, 660 330, 720 330",
          "M600 550 C680 550, 660 330, 720 330",
        ].map((d) => (
          <motion.path
            key={d}
            d={d}
            stroke={active >= 2 ? "var(--color-success)" : "var(--color-line)"}
            strokeWidth={active >= 2 ? 1.6 : 1.2}
            className={active >= 2 && !reduce ? "flow-dash" : undefined}
            initial={false}
            animate={{ opacity: active >= 2 ? 1 : 0.5 }}
            transition={{ duration: 0.35 }}
          />
        ))}

        {/* gate → review */}
        <motion.path
          d="M820 400 L820 470"
          stroke={active >= 3 ? "var(--color-copper)" : "var(--color-line)"}
          strokeWidth={active >= 3 ? 1.6 : 1.2}
          className={active >= 3 && !reduce ? "flow-dash" : undefined}
        />
      </svg>

      {/* Intent */}
      <Node x={17} y={50} tone={active === 0 ? "copper" : "idle"}>
        <Sparkles className="size-3.5" aria-hidden />
        <span className="text-[11.5px] font-medium">Intent</span>
        <span className="mt-0.5 block font-mono text-[9px] text-muted-dim">plain language</span>
      </Node>

      {/* Worktrees */}
      {AGENTS.map((agent, index) => (
        <Node
          key={agent.name}
          x={50}
          y={31 + index * 19}
          tone={active === 1 ? "copper" : active > 1 ? "success" : "idle"}
          wide
        >
          <div className="flex items-center gap-1.5">
            <agent.Logo className="size-3.5 shrink-0" />
            <span className="font-mono text-[10px] text-fg/90">{agent.name}</span>
          </div>
          <span className="mt-0.5 block truncate font-mono text-[8.5px] text-muted-dim">
            {agent.branch}
          </span>
        </Node>
      ))}

      {/* Gate */}
      <Node x={84} y={41} tone={active === 2 ? "success" : active > 2 ? "success" : "idle"}>
        <ShieldCheck className="size-3.5" aria-hidden />
        <span className="text-[11.5px] font-medium">Gate</span>
        <span className="mt-0.5 block font-mono text-[9px] text-muted-dim">cargo test</span>
      </Node>

      {/* Review */}
      <Node x={84} y={62} tone={active === 3 ? "copper" : "idle"}>
        <GitMerge className="size-3.5" aria-hidden />
        <span className="text-[11.5px] font-medium">Review</span>
        <span className="mt-0.5 block font-mono text-[9px] text-muted-dim">merge train</span>
      </Node>

      {/* Legend of the current stage */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-line bg-bg/60 px-3 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-dim">
          {active === 0 && <FileText className="size-3" aria-hidden />}
          {active === 1 && <Sparkles className="size-3" aria-hidden />}
          {active === 2 && <ShieldCheck className="size-3" aria-hidden />}
          {active === 3 && <Check className="size-3" aria-hidden />}
          {STEPS[active].label}
        </span>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((step, index) => (
            <span
              key={step.label}
              className={`h-0.5 w-5 rounded-full transition-colors ${
                index <= active ? "bg-copper" : "bg-line-strong"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Node({
  x,
  y,
  tone,
  wide = false,
  children,
}: {
  x: number;
  y: number;
  tone: "copper" | "success" | "idle";
  wide?: boolean;
  children: React.ReactNode;
}) {
  const ring =
    tone === "copper"
      ? "border-copper/50 bg-copper/[0.08] shadow-[0_0_24px_-6px_rgba(217,149,92,0.55)]"
      : tone === "success"
        ? "border-success/40 bg-success/[0.06]"
        : "border-line bg-raised/80";

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-2 text-center text-fg transition-all duration-300 ${
        wide ? "w-[27%]" : "w-[21%]"
      } ${ring}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
