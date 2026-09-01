import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";

export default function TasksPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Core Concepts", href: "/docs/concepts" },
          { label: "Tasks", href: "/docs/concepts/tasks" },
        ]}
      />
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Tasks</h1>
      <p className="mb-8 text-lg text-white/60">
        Tasks (also called cards) are the fundamental unit of work in barkcli. Each task is a YAML entry in a .board file.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Task Structure</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-3 text-left font-semibold text-white/80">Field</th>
                <th className="pb-3 text-left font-semibold text-white/80">Type</th>
                <th className="pb-3 text-left font-semibold text-white/80">Description</th>
              </tr>
            </thead>
            <tbody className="text-white/60">
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">id</td><td>string</td><td>Auto-generated from title</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">title</td><td>string</td><td>Human-readable task name</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">column</td><td>string</td><td>Current workflow stage</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">priority</td><td>enum</td><td>high, medium, low</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">description</td><td>string</td><td>Detailed task description</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">labels</td><td>string[]</td><td>Tags for categorization</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">assignee</td><td>string</td><td>Person responsible</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">due</td><td>date</td><td>Due date</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">effort</td><td>number</td><td>Story points or time estimate</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">checklist</td><td>array</td><td>Subtasks with completion status</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 font-mono text-[#B8845C]">comments</td><td>array</td><td>Discussion threads</td></tr>
              <tr><td className="py-2 font-mono text-[#B8845C]">links</td><td>array</td><td>Relationships to other tasks</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Creating Tasks</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`barkcli <board> add "Implement OAuth" \\
  --priority high \\
  --label backend \\
  --assignee alice \\
  --due 2025-02-01 \\
  --effort 5`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Task States</h2>
        <p className="mb-4 text-white/60">Tasks move through columns in your workflow:</p>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80">todo → doing → review → done</pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Task Links</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# Parent-child hierarchy
barkcli <board> link implement-auth auth-jwt --as parent

# Related tasks
barkcli <board> link login-bug oauth-fix --as related

# Blocked-by
barkcli <board> deploy-feature db-migration --as blocked-by

# View hierarchy
barkcli <board> tree`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">YAML Format</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`id: implement-auth
title: Implement Google OAuth
column: doing
priority: high
labels:
  - backend
  - security
assignee: alice
due: 2025-02-01
effort: 5
checklist:
  - text: Set up OAuth credentials
    done: true
  - text: Implement callback handler
    done: false
links:
  - type: parent
    target: auth-system`}</code></pre>
      </section>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="mb-2 text-lg font-semibold">Related</h3>
        <div className="flex gap-4 text-sm">
          <Link href="/docs/commands/add" className="text-[#B8845C] hover:underline">add command</Link>
          <Link href="/docs/commands/list" className="text-[#B8845C] hover:underline">list command</Link>
          <Link href="/docs/concepts/boards" className="text-[#B8845C] hover:underline">Boards</Link>
        </div>
      </div>
    </>
  );
}
