import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";

export default function ProjectsPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Core Concepts", href: "/docs/concepts" },
          { label: "Projects", href: "/docs/concepts/projects" },
        ]}
      />
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Projects</h1>
      <p className="mb-8 text-lg text-white/60">
        A project is any codebase that contains a .board/ directory. barkcli works in any git repository.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Project Structure</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80">{`my-project/
├── .board/              # barkcli metadata (gitignored)
│   ├── config.json
│   ├── *.board          # Board files
│   ├── history/
│   ├── sessions/
│   ├── snapshots/
│   ├── context/
│   └── sprints/
├── src/                 # Your source code
├── package.json
└── .git/`}</pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Initializing a Project</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# In your project root
barkcli init`}</code></pre>
        <p className="mt-3 text-sm text-white/60">Creates .board/ directory, config.json, and .gitignore entries.</p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Team Workflow</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# Team member 1
barkcli init
barkcli create sprint-1
barkcli sprint-1 add "Feature A" -p high
git add .board
git commit -m "Add sprint-1 board"
git push

# Team member 2
git pull
barkcli sprint-1 list
barkcli sprint-1 move feature-a doing
git add .board
git commit -m "Move Feature A to doing"
git push`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Environment Variables</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-3 text-left font-semibold text-white/80">Variable</th>
                <th className="pb-3 text-left font-semibold text-white/80">Description</th>
              </tr>
            </thead>
            <tbody className="text-white/60">
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">BARKCLI_BOARD</td><td>Default board name</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">BARKCLI_TOKEN</td><td>API authentication token</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">OPENAI_API_KEY</td><td>OpenAI API key (for AI features)</td></tr>
              <tr><td className="py-2 font-mono text-[#B8845C]">ANTHROPIC_API_KEY</td><td>Anthropic API key (for AI features)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-2 text-lg font-semibold">Related</h3>
        <div className="flex gap-4 text-sm">
          <Link href="/docs/commands/init" className="text-[#B8845C] hover:underline">init command</Link>
          <Link href="/docs/concepts/boards" className="text-[#B8845C] hover:underline">Boards</Link>
          <Link href="/docs/advanced" className="text-[#B8845C] hover:underline">Advanced</Link>
        </div>
      </div>
    </>
  );
}
