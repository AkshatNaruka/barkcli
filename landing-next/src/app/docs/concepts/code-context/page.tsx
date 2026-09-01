import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";

export default function CodeContextConceptPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Core Concepts", href: "/docs/concepts" },
          { label: "Code Context", href: "/docs/concepts/code-context" },
        ]}
      />
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Code Context</h1>
      <p className="mb-8 text-lg text-white/60">
        Code context links tasks to the source code they touch. This gives you visibility into which files each task affects.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2 text-white/60">
          <li><code className="rounded bg-white/10 px-1.5 py-0.5 text-sm font-mono">barkcli context scan</code> analyzes your codebase</li>
          <li>Matches task titles to code symbols using fuzzy matching</li>
          <li>Links are stored in <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm font-mono">.board/context/&lt;board&gt;.json</code></li>
          <li><code className="rounded bg-white/10 px-1.5 py-0.5 text-sm font-mono">barkcli context sync</code> refreshes git status</li>
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Commands</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# Scan and link code to tasks
barkcli context scan

# Check coverage
barkcli context status

# Manual linking
barkcli context link implement-auth src/auth/handler.ts

# View context for a card
barkcli context show implement-auth

# Search code symbols
barkcli code "AuthService"

# Git-aware sync
barkcli context sync`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">File Statuses</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-3 text-left font-semibold text-white/80">Status</th>
                <th className="pb-3 text-left font-semibold text-white/80">Description</th>
              </tr>
            </thead>
            <tbody className="text-white/60">
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-green-400">clean</td><td>File matches last commit</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-yellow-400">changed</td><td>File has uncommitted changes</td></tr>
              <tr><td className="py-2 font-mono text-white/40">unknown</td><td>File not tracked by git</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Supported Languages</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-3 text-left font-semibold text-white/80">Language</th>
                <th className="pb-3 text-left font-semibold text-white/80">Symbol Extraction</th>
              </tr>
            </thead>
            <tbody className="text-white/60">
              <tr className="border-b border-white/5"><td>JavaScript/TypeScript</td><td>Full (functions, classes, types)</td></tr>
              <tr className="border-b border-white/5"><td>Python</td><td>Full (functions, classes, methods)</td></tr>
              <tr className="border-b border-white/5"><td>Rust</td><td>Full (functions, structs, traits)</td></tr>
              <tr className="border-b border-white/5"><td>Go</td><td>Full (functions, types, interfaces)</td></tr>
              <tr><td>Other</td><td>File-level only</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-2 text-lg font-semibold">Related</h3>
        <div className="flex gap-4 text-sm">
          <Link href="/docs/code-context" className="text-[#B8845C] hover:underline">Code Context Guide</Link>
          <Link href="/docs/commands/context" className="text-[#B8845C] hover:underline">context command</Link>
          <Link href="/docs/commands/code" className="text-[#B8845C] hover:underline">code command</Link>
        </div>
      </div>
    </>
  );
}
