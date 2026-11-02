import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";

export default function BoardsPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Core Concepts", href: "/docs/concepts" },
          { label: "Boards", href: "/docs/concepts/boards" },
        ]}
      />
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Boards</h1>
      <p className="mb-8 text-lg text-white/60">
        Boards are collections of columns and cards. Each board is a separate .board file in your repository.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Board Structure</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80">{`.board/
├── config.json          # Project configuration
├── my-project.board     # Board file
├── backend.board        # Another board
├── history/             # Operation history
├── sessions/            # Agent sessions
├── snapshots/           # Checkpoints
├── context/             # Code context mappings
└── sprints/             # Sprint data`}</pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Creating Boards</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# Create with default columns
barkcli create my-project

# List all boards
barkcli boards`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Board File Format</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`columns:
  - id: todo
    name: Todo
  - id: doing
    name: Doing
  - id: review
    name: Review
  - id: done
    name: Done
cards:
  - id: implement-auth
    title: Implement Google OAuth
    column: doing
    priority: high
    labels:
      - backend
    assignee: alice`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Board Configuration</h2>
        <p className="mb-4 text-white/60">Configure in <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm">.board/config.json</code>:</p>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`{
  "default_board": "my-project",
  "columns": [
    { "id": "todo", "name": "Todo" },
    { "id": "doing", "name": "Doing" },
    { "id": "review", "name": "Review" },
    { "id": "done", "name": "Done" }
  ]
}`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Multiple Boards</h2>
        <p className="mb-4 text-white/60">Use multiple boards for different contexts:</p>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`barkcli create frontend
barkcli create backend
barkcli create devops

# Work on specific board
barkcli frontend add "Fix CSS layout"
barkcli backend add "Optimize queries"`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Git Integration</h2>
        <p className="mb-4 text-white/60">Board files are committed to git:</p>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# See what changed
barkcli my-project log

# Diff against git ref
barkcli my-project diff main

# Undo last change
barkcli my-project undo`}</code></pre>
      </section>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-2 text-lg font-semibold">Related</h3>
        <div className="flex gap-4 text-sm">
          <Link href="/docs/commands/create" className="text-[#B8845C] hover:underline">create command</Link>
          <Link href="/docs/commands/boards" className="text-[#B8845C] hover:underline">boards command</Link>
          <Link href="/docs/concepts/tasks" className="text-[#B8845C] hover:underline">Tasks</Link>
        </div>
      </div>
    </>
  );
}
