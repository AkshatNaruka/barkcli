import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Autopilot Guide — barkcli",
  description:
    "Run barkcli on autopilot: type intent, approve plans, merge. Agents do everything between — no CLI commands to memorize.",
  path: "/docs/autopilot",
});

const steps = [
  {
    n: "1",
    title: "Type intent",
    body: "Describe what you want in plain language — in the Mind tab's intent box, or via the API. barkcli classifies it into a card + spec, offline if needed.",
    code: 'POST /api/intake {"text": "Add Google OAuth", "kind": "feature"}',
  },
  {
    n: "2",
    title: "Approve the plan",
    body: "The agent proposes a decomposition (child cards + acceptance criteria). You approve, edit, or reject — this is the first human gate. Approval writes the exact same cards as plan --tasks.",
    code: "POST /api/autopilot/approve",
  },
  {
    n: "3",
    title: "Agents work",
    body: "Coding agents pull atomic work packets (packet_claim), implement, test, and complete them. No human commands — Mind shows live phase and counts.",
    code: "GET /api/autopilot/status",
  },
  {
    n: "4",
    title: "Review & merge",
    body: "Completed work is validated against acceptance criteria, tests, and commits. You merge (second human gate) or request changes. Checkpoints + undo cover recovery.",
    code: "POST /api/review",
  },
];

export default function AutopilotGuidePage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Autopilot Guide", href: "/docs/autopilot" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Autopilot Guide</h1>
      <p className="mb-8 text-lg text-white/60">
        You decide <strong className="text-white">what</strong> gets built — at two gates:
        plan approval and merge. Agents do everything between. No CLI commands to memorize.
      </p>

      <div className="mb-12 rounded-xl border border-[#B8845C]/20 bg-[#B8845C]/5 p-6">
        <h2 className="mb-3 text-lg font-bold">Fastest start</h2>
        <div className="bg-black/50 rounded-lg p-4 font-mono text-sm space-y-1">
          <div><span className="text-[#B8845C]">$</span> barkcli init --yes</div>
          <div><span className="text-[#B8845C]">$</span> barkcli serve --open</div>
        </div>
        <p className="text-sm text-white/60 mt-4">
          Then type intent in the Mind tab. That&apos;s the whole manual.
        </p>
      </div>

      <div className="space-y-4 mb-12">
        {steps.map((s) => (
          <div key={s.n} className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-7 h-7 rounded-full bg-[#B8845C]/15 border border-[#B8845C]/30 flex items-center justify-center text-sm font-bold text-[#B8845C]">
                {s.n}
              </span>
              <h2 className="text-xl font-bold">{s.title}</h2>
            </div>
            <p className="text-sm text-white/60 mb-3">{s.body}</p>
            <code className="text-xs text-[#B8845C] bg-black/30 px-2 py-1 rounded font-mono">
              {s.code}
            </code>
          </div>
        ))}
      </div>

      <h2 className="mb-4 text-2xl font-bold">Agent loop (for coding agents)</h2>
      <div className="mb-12 rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60 mb-3">
          Agents steer through MCP — 56 tools including the autopilot set:
        </p>
        <ul className="space-y-2 text-sm text-white/60">
          <li><code className="text-white/80">autopilot_status</code> — phase, gates, next action</li>
          <li><code className="text-white/80">packet_claim</code> — atomic top-packet claim</li>
          <li><code className="text-white/80">autopilot_propose</code> — propose a plan (creates gate)</li>
          <li><code className="text-white/80">task_complete / task_fail</code> — report outcomes</li>
        </ul>
      </div>

      <div className="flex gap-4 text-sm">
        <Link href="/docs/web-app" className="text-[#B8845C] hover:underline">Web App Guide →</Link>
        <Link href="/docs/commands" className="text-[#B8845C] hover:underline">Command reference (power users) →</Link>
      </div>

      <div className="mt-8">
        <Link
          href="/docs"
          className="text-[#B8845C] hover:text-[#B8845C]/80 text-sm transition-colors"
        >
          ← Back to Docs
        </Link>
      </div>
    </>
  );
}
