import { ArrowUpRight, Code2, Globe, Laptop, Terminal } from "lucide-react";
import { Reveal } from "./Reveal";
import { DEMO_REPLAY_URL, ON_PAGES } from "@/lib/pages";

const SURFACES = [
  {
    icon: Laptop,
    title: "macOS app",
    subtitle: "Bark.app",
    body:
      "A native desktop app with the local runtime embedded: command palette, threads with a timeline scrubber, embedded browser, and in-app updates from releases.",
    meta: "ad-hoc signed · auto-updates",
  },
  {
    icon: Terminal,
    title: "CLI & TUI",
    subtitle: "barkcli",
    body:
      "Script the whole loop: create a board, run intent, verify a gate, review a diff, merge. The terminal board is the same data with vim keys.",
    meta: "barkcli run · barkcli review",
  },
  {
    icon: Globe,
    title: "Web app",
    subtitle: "barkcli serve",
    body:
      "The full management surface in a browser: Board, Mind, Brain, Reports, Specs, and agent threads, served by the binary on your machine.",
    meta: "localhost:4321",
  },
  {
    icon: Code2,
    title: "VS Code",
    subtitle: "extension",
    body:
      "Open and edit board files as a real board inside the editor, so the plan lives next to the code it describes.",
    meta: "custom editor",
  },
];

export function InterfacesSection() {
  return (
    <section className="relative border-t border-line py-20 md:py-28">
      <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-copper">
            Choose your interface
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
            One workflow, four ways in.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-[1.65] text-muted">
            Every surface reads and writes the same repository data. Start in the terminal, review
            in the app, and hand the same tasks to an agent over MCP.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SURFACES.map((surface, index) => (
            <Reveal key={surface.title} delay={index * 0.05}>
              <div className="flex h-full flex-col rounded-xl border border-line bg-surface/60 p-5">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-md border border-line bg-bg/60">
                    <surface.icon className="size-4 text-copper" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[13.5px] font-medium leading-none text-fg">
                      {surface.title}
                    </h3>
                    <p className="mt-1 font-mono text-[10px] text-muted-dim">{surface.subtitle}</p>
                  </div>
                </div>
                <p className="mt-4 flex-1 text-[12.5px] leading-[1.65] text-muted">{surface.body}</p>
                <div className="mt-4 border-t border-line pt-3">
                  <p className="font-mono text-[10px] text-muted-dim">{surface.meta}</p>
                  {ON_PAGES && surface.title === "Web app" && (
                    <a
                      href={DEMO_REPLAY_URL}
                      className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-copper-soft underline-offset-4 hover:underline"
                    >
                      Open the hosted demo
                      <ArrowUpRight className="size-3" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
