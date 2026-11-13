"use client";

import { useEffect, useRef, useState } from "react";
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
 * Scroll-linked run diagram.
 *
 * The four stages scroll normally; the diagram sticks beside them on wide
 * screens and lights up whichever stage the reader has reached. Nothing is
 * pinned or hijacked: the scroll drives a highlight, not the page.
 */
export function ScrollStory() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const anchor = window.innerHeight / 2;
      const progress = (anchor - rect.top) / Math.max(rect.height, 1);
      const next = Math.min(
        STEPS.length - 1,
        Math.max(0, Math.floor(progress * STEPS.length)),
      );
      setActive((current) => (current === next ? current : next));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section id="how" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mb-4">
            The run
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Four stages.
            <br />
            <span className="text-white/40">One gate.</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            Every run takes the same path, whether you drive it from the CLI, the desktop app, or
            your agent over MCP. The diagram follows the stage you are reading.
          </p>
        </div>

        <div
          ref={trackRef}
          className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16"
        >
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
                    className={`border-l-2 pl-5 transition-colors duration-300 ${
                      isActive ? "border-[#B8845C]" : "border-white/10"
                    }`}
                  >
                    <p
                      className={`font-mono text-[10.5px] uppercase tracking-[0.16em] transition-colors duration-300 ${
                        isActive ? "text-[#B8845C]" : "text-white/30"
                      }`}
                    >
                      {step.label}
                    </p>
                    <h3 className="mt-2 text-xl sm:text-2xl font-semibold text-white">
                      {step.title}
                    </h3>
                    <p className="mt-3 max-w-md text-sm text-white/50 leading-relaxed">
                      {step.body}
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {step.chips.map((chip) => (
                        <li
                          key={chip}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] text-white/40"
                        >
                          {chip}
                        </li>
                      ))}
                    </ul>
                    <code className="mt-4 block max-w-full truncate rounded-xl border border-white/10 bg-black/60 px-3 py-2 font-mono text-[11px] text-[#E5AA7A]">
                      $ {step.proof}
                    </code>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="hidden lg:block">
            <div className="sticky top-24">
              <StoryDiagram active={active} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryDiagram({ active }: { active: number }) {
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0A0B0E]/85">
      <div className="pointer-events-none absolute inset-0 bark-grid-pattern opacity-50" aria-hidden />

      <svg
        viewBox="0 0 1000 800"
        className="absolute inset-0 w-full h-full"
        fill="none"
        aria-hidden
      >
        {/* intent to worktrees */}
        {[
          "M300 400 C360 400, 340 250, 400 250",
          "M300 400 C350 400, 350 400, 400 400",
          "M300 400 C360 400, 340 550, 400 550",
        ].map((d) => (
          <path
            key={d}
            d={d}
            stroke={active >= 1 ? "#B8845C" : "rgba(255,255,255,0.12)"}
            strokeWidth={active >= 1 ? 1.6 : 1.2}
            strokeLinecap="round"
            className={active >= 1 ? "flow-dash" : undefined}
            opacity={active >= 1 ? 1 : 0.55}
          />
        ))}

        {/* worktrees to gate */}
        {[
          "M600 250 C680 250, 660 330, 720 330",
          "M600 400 C660 400, 660 330, 720 330",
          "M600 550 C680 550, 660 330, 720 330",
        ].map((d) => (
          <path
            key={d}
            d={d}
            stroke={active >= 2 ? "#34D399" : "rgba(255,255,255,0.12)"}
            strokeWidth={active >= 2 ? 1.6 : 1.2}
            strokeLinecap="round"
            className={active >= 2 ? "flow-dash" : undefined}
            opacity={active >= 2 ? 1 : 0.5}
          />
        ))}

        {/* gate to review */}
        <path
          d="M820 400 L820 470"
          stroke={active >= 3 ? "#B8845C" : "rgba(255,255,255,0.12)"}
          strokeWidth={active >= 3 ? 1.6 : 1.2}
          strokeLinecap="round"
          className={active >= 3 ? "flow-dash" : undefined}
        />
      </svg>

      <Node x={17} y={50} tone={active === 0 ? "copper" : "idle"}>
        <Sparkles className="w-3.5 h-3.5 text-[#E5AA7A]" aria-hidden />
        <span className="text-[11.5px] font-medium text-white">Intent</span>
        <span className="mt-0.5 block font-mono text-[9px] text-white/40">plain language</span>
      </Node>

      {AGENTS.map((agent, index) => (
        <Node
          key={agent.name}
          x={50}
          y={31 + index * 19}
          tone={active === 1 ? "copper" : active > 1 ? "success" : "idle"}
          wide
        >
          <div className="flex items-center gap-1.5">
            <agent.Logo className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono text-[10px] text-white/85">{agent.name}</span>
          </div>
          <span className="mt-0.5 block truncate font-mono text-[8.5px] text-white/35">
            {agent.branch}
          </span>
        </Node>
      ))}

      <Node x={84} y={41} tone={active >= 2 ? "success" : "idle"}>
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
        <span className="text-[11.5px] font-medium text-white">Gate</span>
        <span className="mt-0.5 block font-mono text-[9px] text-white/40">cargo test</span>
      </Node>

      <Node x={84} y={62} tone={active === 3 ? "copper" : "idle"}>
        <GitMerge className="w-3.5 h-3.5 text-[#E5AA7A]" aria-hidden />
        <span className="text-[11.5px] font-medium text-white">Review</span>
        <span className="mt-0.5 block font-mono text-[9px] text-white/40">merge train</span>
      </Node>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/10 bg-black/40 px-3 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/45">
          {active === 0 && <FileText className="w-3 h-3" aria-hidden />}
          {active === 1 && <Sparkles className="w-3 h-3" aria-hidden />}
          {active === 2 && <ShieldCheck className="w-3 h-3" aria-hidden />}
          {active === 3 && <Check className="w-3 h-3" aria-hidden />}
          {STEPS[active].label}
        </span>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((step, index) => (
            <span
              key={step.label}
              className={`h-0.5 w-5 rounded-full transition-colors ${
                index <= active ? "bg-[#B8845C]" : "bg-white/15"
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
      ? "border-[#B8845C]/60 bg-[#B8845C]/10 shadow-[0_0_30px_-8px_rgba(184,132,92,0.75)]"
      : tone === "success"
        ? "border-emerald-500/40 bg-emerald-500/10"
        : "border-white/10 bg-white/[0.02]";

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-2 text-center backdrop-blur-sm transition-all duration-300 ${
        wide ? "w-[27%]" : "w-[21%]"
      } ${ring}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
