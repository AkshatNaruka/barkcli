"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Play } from "lucide-react";
import { BASE_PATH as BASE, DEMO_REPLAY_URL, ON_PAGES } from "@/lib/pages";

type Tab = {
  id: string;
  label: string;
  title: string;
  caption: string;
  callouts: string[];
  kind: "image" | "video";
  src: string;
  width: number;
  height: number;
  alt: string;
  chrome: string;
};

const TABS: Tab[] = [
  {
    id: "board",
    label: "Board",
    title: "A board your agents can read",
    caption:
      "Every card carries its spec id, so spec → card → task → code stays traceable. The board is a YAML file in your repository, not a row in someone's database.",
    callouts: ["Spec traceability per card", "Drag, filter, or edit the YAML", "Diffable in a pull request"],
    kind: "image",
    src: "/screenshots/board-light.webp",
    width: 2880,
    height: 1800,
    alt: "BarkCLI board view with columns, cards, and spec links",
    chrome: "localhost:4321 · Board",
  },
  {
    id: "mind",
    label: "Mind",
    title: "What is happening, in one view",
    caption:
      "Mind compiles project health, blockers, stale work, and next actions into a single snapshot — the same snapshot an agent reads before it starts.",
    callouts: ["Health and blockers", "Stale work surfaced", "Compiled locally, no LLM required"],
    kind: "image",
    src: "/screenshots/mind-dark.webp",
    width: 2880,
    height: 1800,
    alt: "BarkCLI Mind view summarising project health and next actions",
    chrome: "localhost:4321 · Mind",
  },
  {
    id: "brain",
    label: "Brain",
    title: "Architecture, not vibes",
    caption:
      "The Brain maps subsystems, modules, services, and invariants with source evidence, then hands agents the structural constraints of your project.",
    callouts: ["2D flow and 3D orbit", "Evidence links to source", "Invariants injected into context"],
    kind: "image",
    src: "/screenshots/brain-dark.webp",
    width: 2880,
    height: 1800,
    alt: "BarkCLI Brain view showing a repository architecture graph",
    chrome: "localhost:4321 · Brain",
  },
  {
    id: "calendar",
    label: "Calendar",
    title: "Deadlines that survive the agents",
    caption:
      "Scheduled and due work sits on a calendar built from the same board data. Nothing needs a second sync service.",
    callouts: ["Due dates by month", "Overdue work first", "Same YAML source"],
    kind: "image",
    src: "/screenshots/calendar-light.webp",
    width: 2880,
    height: 1800,
    alt: "BarkCLI calendar view with cards placed on due dates",
    chrome: "localhost:4321 · Calendar",
  },
  {
    id: "run",
    label: "Agent run",
    title: "Three agents, one acceptance gate",
    caption:
      "A recorded run: parallel worktrees, live agent rows, gate verdicts, and the merge train. Recorded from the Mind view, not simulated for the website.",
    callouts: ["Parallel worktrees", "Gate verdict per attempt", "Merge train in finish order"],
    kind: "video",
    src: "/run-agents-demo.mp4",
    width: 1280,
    height: 720,
    alt: "Recorded BarkCLI run with three agents in worktrees and a merge train",
    chrome: "barkcli run --agents 3 · recorded",
  },
];

export function ProductShowcase() {
  const [active, setActive] = useState(TABS[0].id);
  const reduce = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0];

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="product" className="relative border-t border-line py-20 md:py-28">
      <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-copper">
              The workspace
            </p>
            <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
              See the real thing.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-[1.65] text-muted">
              Screenshots and a recording from the app you get, not a marketing mock. Light and
              dark themes both ship.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start md:self-auto">
            {ON_PAGES && (
              <a
                href={DEMO_REPLAY_URL}
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-copper px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-copper-soft"
              >
                <Play className="size-3.5" aria-hidden />
                Live demo
              </a>
            )}
            <a
              href="https://github.com/AkshatNaruka/barkcli#quick-start"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Run it locally
            </a>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Product surfaces"
          onKeyDown={onKeyDown}
          className="mt-8 flex flex-wrap gap-1.5"
        >
          {TABS.map((tab, index) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.id)}
                className={`inline-flex min-h-9 items-center rounded-md border px-3 text-[12.5px] transition-colors ${
                  selected
                    ? "border-copper/40 bg-copper/10 text-copper-soft"
                    : "border-line text-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          tabIndex={0}
          className="mt-5 grid gap-6 rounded-xl border border-line bg-surface p-3 sm:p-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-7"
        >
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-lg border border-line-strong/60 bg-bg-deep"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line bg-white/[0.02] px-3 py-2">
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="size-2 rounded-full bg-[#e5675e]/70" />
                <span className="size-2 rounded-full bg-[#d9a35c]/70" />
                <span className="size-2 rounded-full bg-[#42c995]/70" />
              </div>
              <span className="truncate font-mono text-[10px] text-muted-dim">
                {current.chrome}
              </span>
            </div>
            {current.kind === "image" ? (
              <Image
                src={`${BASE}${current.src}`}
                alt={current.alt}
                width={current.width}
                height={current.height}
                className="h-auto w-full"
                sizes="(min-width: 1120px) 700px, (min-width: 640px) 90vw, 100vw"
              />
            ) : (
              <video
                className="h-auto w-full"
                width={current.width}
                height={current.height}
                autoPlay={!reduce}
                muted
                loop
                playsInline
                controls={Boolean(reduce)}
                preload="metadata"
                aria-label={current.alt}
              >
                <source src={`${BASE}/run-agents-demo.webm`} type="video/webm" />
                <source src={`${BASE}/run-agents-demo.mp4`} type="video/mp4" />
              </video>
            )}
          </motion.div>

          <div className="flex flex-col justify-center px-1 pb-2 sm:px-2">
            <h3 className="font-display text-[19px] font-medium leading-tight tracking-[-0.015em] text-fg">
              {current.title}
            </h3>
            <p className="mt-2.5 text-[13.5px] leading-[1.65] text-muted">{current.caption}</p>
            <ul className="mt-4 space-y-1.5">
              {current.callouts.map((callout) => (
                <li
                  key={callout}
                  className="flex items-start gap-2 text-[12.5px] leading-snug text-fg/75"
                >
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-copper" aria-hidden />
                  {callout}
                </li>
              ))}
            </ul>
            {current.kind === "video" && reduce && (
              <p className="mt-3 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-dim">
                <Play className="size-3" aria-hidden />
                Autoplay off for reduced motion
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
