import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "API Reference — barkcli",
  description:
    "Complete REST API reference for barkcli web server. All endpoints with request/response examples.",
  path: "/docs/api-reference",
});

const sections = [
  {
    title: "Board Endpoints",
    endpoints: [
      { method: "GET", path: "/api/boards", desc: "List all board names" },
      { method: "POST", path: "/api/boards/create", desc: "Create a new board" },
      { method: "DELETE", path: "/api/boards/:name", desc: "Delete a board" },
      { method: "GET", path: "/api/board?name=", desc: "Get board YAML" },
      { method: "PUT", path: "/api/board", desc: "Save board YAML" },
    ],
  },
  {
    title: "Card Endpoints",
    endpoints: [
      { method: "POST", path: "/api/board/cards/:id/comments", desc: "Add comment to card" },
    ],
  },
  {
    title: "Memory Endpoints",
    endpoints: [
      { method: "GET", path: "/api/memory?q=&tier=&limit=", desc: "List/search memories" },
      { method: "POST", path: "/api/memory", desc: "Add memory entry" },
      { method: "DELETE", path: "/api/memory/:id", desc: "Delete memory" },
      { method: "GET", path: "/api/memory/stats", desc: "Memory statistics" },
      { method: "POST", path: "/api/memory/fact", desc: "Add project fact" },
      { method: "GET", path: "/api/memory/facts", desc: "List project facts" },
    ],
  },
  {
    title: "Specs Endpoints",
    endpoints: [
      { method: "GET", path: "/api/specs", desc: "List specs" },
      { method: "POST", path: "/api/specs", desc: "Create spec" },
      { method: "GET", path: "/api/specs/:id", desc: "Get spec details" },
      { method: "PUT", path: "/api/specs/:id", desc: "Update spec" },
      { method: "DELETE", path: "/api/specs/:id", desc: "Delete spec" },
      { method: "POST", path: "/api/specs/:id/requirements", desc: "Add requirement" },
      { method: "PUT", path: "/api/specs/:id/requirements/:req_id", desc: "Update requirement" },
      { method: "GET", path: "/api/specs/:id/trace", desc: "Traceability view" },
      { method: "GET", path: "/api/specs/coverage", desc: "Coverage report" },
    ],
  },
  {
    title: "Checkpoint Endpoints",
    endpoints: [
      { method: "GET", path: "/api/checkpoints", desc: "List checkpoints" },
      { method: "POST", path: "/api/checkpoints", desc: "Save checkpoint" },
      { method: "POST", path: "/api/checkpoints/:id/restore", desc: "Restore checkpoint" },
    ],
  },
  {
    title: "Undo/Diff/Blame Endpoints",
    endpoints: [
      { method: "POST", path: "/api/undo", desc: "Undo last change" },
      { method: "GET", path: "/api/diff", desc: "Show diff from last state" },
      { method: "GET", path: "/api/blame/:card_id", desc: "Card change history" },
      { method: "POST", path: "/api/snapshot", desc: "Save named snapshot" },
    ],
  },
  {
    title: "Import/Export Endpoints",
    endpoints: [
      { method: "GET", path: "/api/export?format=", desc: "Export board (yaml/json)" },
      { method: "POST", path: "/api/import", desc: "Import board" },
    ],
  },
  {
    title: "Validate/Doctor Endpoints",
    endpoints: [
      { method: "GET", path: "/api/validate", desc: "Validate all boards" },
      { method: "POST", path: "/api/doctor", desc: "Auto-fix board issues" },
    ],
  },
  {
    title: "Management Endpoints",
    endpoints: [
      { method: "GET", path: "/api/tasks", desc: "List tasks" },
      { method: "POST", path: "/api/tasks", desc: "Create task" },
      { method: "GET", path: "/api/tasks/:id", desc: "Get task" },
      { method: "PUT", path: "/api/tasks/:id", desc: "Update task" },
      { method: "DELETE", path: "/api/tasks/:id", desc: "Delete task" },
      { method: "POST", path: "/api/tasks/:id/claim", desc: "Claim task for agent" },
      { method: "POST", path: "/api/tasks/:id/complete", desc: "Complete task" },
      { method: "POST", path: "/api/tasks/:id/fail", desc: "Fail task" },
      { method: "GET", path: "/api/agents", desc: "List agents" },
      { method: "POST", path: "/api/agents", desc: "Register agent" },
      { method: "GET", path: "/api/agents/:id", desc: "Get agent" },
      { method: "DELETE", path: "/api/agents/:id", desc: "Remove agent" },
      { method: "POST", path: "/api/orchestrate/cycle", desc: "Run orchestration cycle" },
      { method: "GET", path: "/api/orchestrate/status", desc: "Orchestration status" },
    ],
  },
  {
    title: "Other Endpoints",
    endpoints: [
      { method: "GET", path: "/api/history", desc: "Operation history" },
      { method: "GET", path: "/api/sessions", desc: "Agent sessions" },
      { method: "GET", path: "/api/context", desc: "Code context" },
      { method: "POST", path: "/api/context/sync", desc: "Git-aware context refresh" },
      { method: "GET", path: "/api/code?q=", desc: "Symbol search" },
      { method: "GET", path: "/api/config", desc: "AI configuration" },
      { method: "WS", path: "/ws", desc: "WebSocket for live reload" },
    ],
  },
];

const methodColors: Record<string, string> = {
  GET: "bg-green-500/10 text-green-400 border-green-500/20",
  POST: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  PUT: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  DELETE: "bg-red-500/10 text-red-400 border-red-500/20",
  WS: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

export default function ApiReferencePage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "API Reference", href: "/docs/api-reference" },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">API Reference</h1>
      <p className="mb-8 text-lg text-white/60">
        Complete REST API reference for the barkcli web server.
        All endpoints require authentication when <code className="text-[#B8845C]">--token</code> is used.
      </p>

      <div className="space-y-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-4 text-xl font-bold">{section.title}</h2>
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left text-white/50 font-medium">Method</th>
                    <th className="px-4 py-3 text-left text-white/50 font-medium">Endpoint</th>
                    <th className="px-4 py-3 text-left text-white/50 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {section.endpoints.map((ep, i) => (
                    <tr
                      key={`${ep.method}-${ep.path}`}
                      className={i < section.endpoints.length - 1 ? "border-b border-white/5" : ""}
                    >
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono border ${methodColors[ep.method] || ""}`}>
                          {ep.method}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-white/80 text-xs">{ep.path}</td>
                      <td className="px-4 py-2 text-white/60">{ep.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-3 text-lg font-bold">Authentication</h2>
        <p className="text-sm text-white/60 mb-3">
          When the server is started with <code className="text-[#B8845C]">--token</code>, all API endpoints require:
        </p>
        <ul className="space-y-2 text-sm text-white/60">
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">•</span>
            <span>Query parameter: <code className="text-white/80">?token=mysecret</code></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#B8845C]">•</span>
            <span>Header: <code className="text-white/80">Authorization: Bearer mysecret</code></span>
          </li>
        </ul>
        <p className="text-sm text-white/60 mt-3">
          Static assets (HTML, JS, CSS) are always public.
        </p>
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
