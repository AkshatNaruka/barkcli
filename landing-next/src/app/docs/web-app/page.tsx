import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Web App Guide — barkcli",
  description:
    "Complete guide to the barkcli web interface. Manage boards, memory, specs, and orchestration from your browser.",
  path: "/docs/web-app",
});

const features = [
  {
    title: "Board Management",
    description: "Kanban board with drag-and-drop, table view, and list view. Add, edit, move, and delete cards.",
    command: "barkcli serve --open",
  },
  {
    title: "Memory System",
    description: "Cross-session knowledge base with 4 tiers (working, short-term, long-term, external) and BM25 search.",
    command: "Navigate to Memory tab",
  },
  {
    title: "Specs & Requirements",
    description: "Manage specifications with requirements, status tracking, coverage reports, and traceability.",
    command: "Navigate to Specs tab",
  },
  {
    title: "Orchestration (Agents)",
    description: "Agent registry, task queue, and orchestration cycles for AI-powered task management.",
    command: "Navigate to Agents tab",
  },
  {
    title: "Timeline & Tools",
    description: "Checkpoints, undo, snapshots, blame, diff, validate/doctor, and import/export.",
    command: "Navigate to Timeline tab",
  },
  {
    title: "Real-time Updates",
    description: "WebSocket-based live reload. All changes reflected instantly across browser tabs.",
    command: "Automatic on all changes",
  },
];

const shortcuts = [
  { keys: "Cmd/Ctrl + K", desc: "Command palette" },
  { keys: "Cmd/Ctrl + Z", desc: "Undo last change" },
  { keys: "N", desc: "New card (on Board view)" },
  { keys: "?", desc: "Show keyboard shortcuts" },
];

const tabs = [
  { name: "Mind", desc: "Homepage — health, blockers, stale work, next actions (also reachable as Dashboard)" },
  { name: "Board", desc: "Kanban board with drag-and-drop (switch between board/table/list views)" },
  { name: "Specs", desc: "Specifications with requirements, status tracking, coverage" },
  { name: "Sprints", desc: "Start/end sprints, see sprint progress" },
  { name: "Code", desc: "Search code symbols, see which cards are linked to which files" },
  { name: "Agents", desc: "Agent registry, task queue, run orchestration cycles (route: agents/orchestrate)" },
  { name: "Memory", desc: "Cross-session knowledge base, project facts" },
  { name: "Skills", desc: "BMAD skills versioned in repo (mvp/planning/scrum-master/test)" },
  { name: "Docs", desc: "Bundled markdown docs served from /api/docs" },
  { name: "Calendar", desc: "Cards organized by due date" },
  { name: "Reports", desc: "Effort by column/area, priority breakdown, sprint burndown charts" },
  { name: "Timeline", desc: "Checkpoints, undo, diff, blame, validate/doctor, import/export" },
  { name: "Activity", desc: "Combined timeline of history entries and agent sessions" },
  { name: "Settings", desc: "Board config, columns, theme" },
  { name: "AI Agent", desc: "Copy-paste MCP setup prompt for Claude/OpenCode/Cursor" },
];

export default function WebAppGuidePage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Web App Guide", href: "/docs/web-app" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Web App Guide</h1>
      <p className="mb-8 text-lg text-white/60">
        The web app provides a full-featured browser interface for managing your boards.
        No CLI knowledge required.
      </p>

      {/* Quick Start */}
      <div className="mb-12 rounded-xl border border-[#B8845C]/20 bg-[#B8845C]/5 p-6">
        <h2 className="mb-3 text-lg font-bold">Quick Start</h2>
        <p className="text-sm text-white/60 mb-4">
          Start the web app with a single command:
        </p>
        <div className="bg-black/50 rounded-lg p-4 font-mono text-sm">
          <span className="text-[#B8845C]">$</span> barkcli serve --open
        </div>
        <p className="text-sm text-white/60 mt-4">
          The app opens at <code className="text-[#B8845C]">http://localhost:4321</code>.
          If no <code className="text-white/80">.board/</code> directory exists, barkcli automatically creates one with a default board.
        </p>
      </div>

      {/* Features Grid */}
      <h2 className="mb-6 text-2xl font-bold">Features</h2>
      <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-white/10 bg-white/5 p-6"
          >
            <h3 className="mb-2 text-lg font-semibold text-white">{feature.title}</h3>
            <p className="text-sm text-white/50 mb-3">{feature.description}</p>
            <code className="text-xs text-[#B8845C] bg-black/30 px-2 py-1 rounded">
              {feature.command}
            </code>
          </div>
        ))}
      </div>

      {/* Navigation Tabs */}
      <h2 className="mb-6 text-2xl font-bold">Navigation Tabs</h2>
      <div className="mb-12 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-white/10">
          {tabs.map((tab) => (
            <div key={tab.name} className="p-4 border-b border-white/5 last:border-b-0">
              <h3 className="text-sm font-semibold text-white">{tab.name}</h3>
              <p className="text-xs text-white/50 mt-1">{tab.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <h2 className="mb-6 text-2xl font-bold">Keyboard Shortcuts</h2>
      <div className="mb-12 rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="space-y-3">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between">
              <span className="text-sm text-white/70">{shortcut.desc}</span>
              <kbd className="px-2 py-1 bg-black/50 border border-white/10 rounded text-xs font-mono text-white/60">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* Daemon Mode */}
      <h2 className="mb-6 text-2xl font-bold">Background Mode</h2>
      <div className="mb-12 rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/60 mb-4">
          Run the web app as a background daemon:
        </p>
        <div className="space-y-3">
          <div className="bg-black/50 rounded-lg p-3 font-mono text-sm">
            <span className="text-[#B8845C]">$</span> barkcli serve --daemon [--port 4321] [--token mysecret]
          </div>
          <div className="bg-black/50 rounded-lg p-3 font-mono text-sm">
            <span className="text-[#B8845C]">$</span> barkcli serve --status
          </div>
          <div className="bg-black/50 rounded-lg p-3 font-mono text-sm">
            <span className="text-[#B8845C]">$</span> barkcli serve --stop [--port 4321]
          </div>
          <div className="bg-black/50 rounded-lg p-3 font-mono text-sm">
            <span className="text-[#B8845C]">$</span> barkcli serve --kill [--port 4321]
          </div>
        </div>
        <p className="text-sm text-white/60 mt-4">
          The daemon writes its PID to <code className="text-white/80">.board/server.pid</code> (port/host in <code className="text-white/80">.board/server.json</code>) and watches board files for live WebSocket reload. Default port is <code className="text-white/80">4321</code>. With <code className="text-white/80">--token</code>, pass <code className="text-white/80">?token=</code> or <code className="text-white/80">Authorization: Bearer</code> on /api/* and /ws.
        </p>
      </div>

      {/* Board Management */}
      <h2 className="mb-6 text-2xl font-bold">Board Management</h2>
      <div className="mb-12 space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-2 text-lg font-semibold">View Modes</h3>
          <p className="text-sm text-white/60 mb-3">
            Switch between three views on the Board tab:
          </p>
          <ul className="space-y-2 text-sm text-white/60">
            <li className="flex items-start gap-2">
              <span className="text-[#B8845C]">•</span>
              <span><strong className="text-white">Board</strong> — Classic kanban columns with drag-and-drop</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#B8845C]">•</span>
              <span><strong className="text-white">Table</strong> — Spreadsheet-like view with sortable columns</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#B8845C]">•</span>
              <span><strong className="text-white">List</strong> — Compact list sorted by priority</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-2 text-lg font-semibold">Card Operations</h3>
          <ul className="space-y-2 text-sm text-white/60">
            <li className="flex items-start gap-2">
              <span className="text-[#B8845C]">•</span>
              <span><strong className="text-white">Add</strong> — Click + on column header, press N, or use Cmd+K</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#B8845C]">•</span>
              <span><strong className="text-white">Edit</strong> — Click any card to open edit form</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#B8845C]">•</span>
              <span><strong className="text-white">Move</strong> — Drag card to another column</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#B8845C]">•</span>
              <span><strong className="text-white">Delete</strong> — Delete from card form (with undo toast)</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Tips */}
      <h2 className="mb-6 text-2xl font-bold">Tips</h2>
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <ul className="space-y-3 text-sm text-white/60">
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">1.</span>
            <span>Use keyboard shortcuts — they're faster than clicking</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">2.</span>
            <span>Pin important cards — they stay at the top of columns</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">3.</span>
            <span>Add labels — filter cards by label in the board view</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">4.</span>
            <span>Set due dates — see cards on the Calendar tab</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">5.</span>
            <span>Use specs — track requirements alongside cards</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">6.</span>
            <span>Save checkpoints — before major changes</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">7.</span>
            <span>Check the Mind tab — quick overview of project health</span>
          </li>
        </ul>
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
