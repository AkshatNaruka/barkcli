import type { Metadata } from "next";
import Link from "next/link";
import { BenchmarkPlayground } from "./playground";

export const metadata: Metadata = {
  title: "Context benchmark — 57× less context to cold-start an agent",
  description:
    "How much context does an agent need before its first real edit? barkcli's project_context.md replaces ~29k tokens of listing, searching and reading with one 515-token file. Deterministic, re-runnable on any repo, no LLM in the loop.",
};

const BREAKDOWN = [
  { step: "Directory listing", detail: "the agent finds where work lives — every file path in the repo", cold: 18965 },
  { step: "Reading candidates", detail: "top hit files opened line-by-line to reconstruct state", cold: 10139 },
  { step: "Keyword locating", detail: "searches over card titles + code to guess active work", cold: 298 },
];

export default function BenchmarkPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white antialiased">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <Link href="/" className="text-white/40 hover:text-white/70 text-xs font-mono transition-colors">
          ← barkcli
        </Link>

        <p className="text-[#B8845C] text-xs font-mono font-semibold tracking-widest uppercase mt-10 mb-4">
          Interactive · paste your own numbers
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
          One file instead of
          <br />
          <span className="bg-gradient-to-r from-[#B8845C] to-[#D4A574] bg-clip-text text-transparent">twenty-nine thousand tokens.</span>
        </h1>
        <p className="text-white/50 text-sm leading-relaxed mt-5 max-w-2xl">
          Every cold agent session starts the same way: <em>list</em> the repo to find where work
          lives, <em>search</em> for active tasks, <em>read</em> candidate files to reconstruct
          state — before the first real edit. barkcli&apos;s auto-maintained{" "}
          <code className="text-[#D4A574]">project_context.md</code> is that state, compiled,
          verified against git, and ~515 tokens. The page below is the measurement.
        </p>

        {/* The headline strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10">
          {[
            { n: "~29,402", label: "cold tokens" },
            { n: "515", label: "with context file" },
            { n: "2%", label: "of the cold payload" },
            { n: "57.1×", label: "smaller" },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="text-2xl sm:text-3xl font-bold text-[#B8845C] font-mono">{s.n}</div>
              <div className="text-white/40 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Methodology */}
        <h2 className="text-2xl font-bold tracking-tight mt-16 mb-2">What the benchmark measures</h2>
        <p className="text-white/50 text-sm leading-relaxed">
          A deterministic proxy for agent cold-start — no LLM runs, no vendors involved. It
          simulates what an agent must do without the context file, tokenized the same way the
          file itself is counted:
        </p>
        <div className="mt-6 space-y-3">
          {BREAKDOWN.map((b) => (
            <div key={b.step} className="bg-white/[0.02] border border-white/10 rounded-2xl p-5">
              <div className="flex items-baseline justify-between gap-4">
                <div className="text-sm font-semibold">{b.step}</div>
                <div className="text-[#B8845C] font-mono text-sm shrink-0">~{b.cold.toLocaleString()} tk</div>
              </div>
              <p className="text-white/40 text-xs mt-1 leading-relaxed">{b.detail}</p>
            </div>
          ))}
          <div className="bg-[#B8845C]/[0.06] border border-[#B8845C]/20 rounded-2xl p-5">
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-sm font-semibold">One read of project_context.md</div>
              <div className="text-[#D4A574] font-mono text-sm shrink-0">~515 tk</div>
            </div>
            <p className="text-white/40 text-xs mt-1 leading-relaxed">
              Generated, staleness-checked, and reconciled against git by <code>barkcli context digest</code> /
              <code> verify</code>. Hand-edited sections are preserved and flagged in a verification
              footer when drifted.
            </p>
          </div>
        </div>

        <h2 className="text-2xl font-bold tracking-tight mt-16 mb-2">Trust it on your own repo</h2>
        <p className="text-white/50 text-sm leading-relaxed">
          The proxy is deterministic — same repo, same numbers. Run it, then paste the output
          below to visualize your own ratio (everything stays in your browser):
        </p>
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 mt-4">
          <code className="text-[#059669] text-xs font-mono">barkcli context benchmark --json</code>
        </div>

        <BenchmarkPlayground />

        <h2 className="text-2xl font-bold tracking-tight mt-16 mb-3">Honest limits</h2>
        <ul className="text-white/50 text-sm leading-relaxed space-y-2 list-disc pl-5">
          <li>
            It&apos;s a <em>proxy</em>: no LLM is in the loop, so it measures token payloads, not
            comprehension. A 57× cheaper payload is necessary — an agent still has to read the file.
          </li>
          <li>
            Thin repos under-report: no cards, no files to read → low cold numbers. Try it on a repo
            with a real board.
          </li>
          <li>
            Lockfiles, build output and page HTML are excluded from scanning; titles used for
            searching come from your actual cards.
          </li>
          <li>
            Claimed on the barkcli repo itself @ <code className="text-white/40">339f66a</code>,
            Oct&nbsp;2026 (29,402 → 515 = <strong className="text-white/70">57.1×</strong>; a
            conservative 3-candidate variant reads 44× less).
          </li>
        </ul>

        <div className="mt-14 pt-8 border-t border-white/10 flex flex-wrap gap-3">
          <Link
            href="/"
            className="border border-white/10 hover:border-white/20 rounded-full px-5 py-2.5 text-xs font-mono text-white/60 hover:text-white transition-colors"
          >
            ← back
          </Link>
          <Link
            href="/docs"
            className="bg-[#B8845C] hover:bg-[#C79465] rounded-full px-5 py-2.5 text-xs font-mono text-white transition-colors"
          >
            read the docs →
          </Link>
        </div>
      </div>
    </main>
  );
}
