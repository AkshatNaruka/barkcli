import { Check, X } from "lucide-react";
import { Reveal } from "./Reveal";

const FACTS = [
  { title: "Files in your repo", body: "Boards, specs, memory, and run records are YAML/JSON you can diff and roll back." },
  { title: "Works offline", body: "One native binary. No account, no sync service, no cloud round-trip to plan work." },
  { title: "MIT, no telemetry", body: "The CLI and desktop app are free and open source, with nothing phoning home." },
];

/**
 * The trust argument: separate what an agent claims from what the gate proved.
 * Deliberately shows a failure — a tool that only ever shows green checks is
 * not demonstrating verification.
 */
export function TrustSection() {
  return (
    <section className="relative border-t border-line bg-bg-deep/50 py-20 md:py-28">
      <div className="mx-auto grid w-full max-w-[1120px] gap-12 px-5 md:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-copper">
            Honest by construction
          </p>
          <h2 className="mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
            Trust the verdict, not the vibe.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-[1.65] text-muted">
            An agent saying &ldquo;done&rdquo; is a claim. BarkCLI runs your project&rsquo;s own
            test command inside the worktree and records the exit status. Failure is not hidden —
            it is fed back and retried, or reported to you.
          </p>
          <ul className="mt-6 space-y-3">
            {FACTS.map((fact) => (
              <li key={fact.title} className="flex gap-3">
                <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border border-success/30 bg-success/10">
                  <Check className="size-2.5 text-success" aria-hidden />
                </span>
                <p className="text-[13.5px] leading-relaxed text-muted">
                  <span className="font-medium text-fg/85">{fact.title}.</span> {fact.body}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <Reveal>
          <div className="overflow-hidden rounded-xl border border-line bg-[#070a0f]">
            <div className="flex items-center justify-between border-b border-line bg-white/[0.02] px-3.5 py-2.5">
              <span className="font-mono text-[10.5px] text-muted-dim">verify · worktree</span>
              <span className="rounded border border-danger/30 bg-danger/10 px-1.5 py-0.5 font-mono text-[9.5px] text-danger">
                gate failed
              </span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[11.5px] leading-[1.9] text-muted">
              <code>
                <span className="text-muted-dim">$</span> barkcli verify --gate{" "}
                <span className="text-copper-soft">&quot;cargo test --all&quot;</span>
                {"\n"}
                <span className="text-muted-dim">  worktree</span> bark/token-store-7b
                {"\n"}
                <span className="text-muted-dim">  agent   </span> codex · tester
                {"\n\n"}
                <span className="text-danger">  ✗</span> cargo test --all
                {"\n"}
                <span className="text-muted-dim">    test auth::refresh ... FAILED</span>
                {"\n"}
                <span className="text-muted-dim">    test auth::expiry  ... FAILED</span>
                {"\n"}
                <span className="text-danger">    2 failed, 0 passed</span>
                {"\n\n"}
                <span className="text-muted-dim">  ↻ failure logs appended to the next attempt</span>
                {"\n"}
                <span className="text-muted-dim">  task state</span> retrying{" "}
                <span className="text-muted-dim">(1/3)</span>
                {"\n\n"}
                <span className="text-success">  ✓ retry passed</span> 14 tests ·{" "}
                <span className="text-muted-dim">0 failures</span>
                {"\n"}
                <span className="text-success">  ✓ review queue</span> gate verdict attached
              </code>
            </pre>
            <div className="flex items-center gap-2 border-t border-line bg-white/[0.015] px-3.5 py-2.5">
              <X className="size-3 text-danger" aria-hidden />
              <p className="text-[10.5px] leading-snug text-muted-dim">
                The failure is part of the record — you can inspect both attempts.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
