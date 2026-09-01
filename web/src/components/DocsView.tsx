import React, { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { fetchDocs, fetchDoc, type DocEntry } from "../lib/api";

// Curated display order for docs
const DOC_ORDER = [
  "USAGE_MANUAL",
  "COMMANDS",
  "WEB_APP_GUIDE",
  "API_REFERENCE",
  "MCP_AGENTS",
  "CONTEXT",
  "INTERFACES",
  "ADVANCED",
  "AI_AGENT_PROMPT",
];

function sortDocs(docs: DocEntry[]): DocEntry[] {
  const index = new Map(DOC_ORDER.map((s, i) => [s, i]));
  return [...docs].sort((a, b) => {
    const ai = index.has(a.slug) ? index.get(a.slug)! : 999;
    const bi = index.has(b.slug) ? index.get(b.slug)! : 999;
    return ai - bi;
  });
}

// Short descriptions for each doc
const DOC_DESCRIPTIONS: Record<string, string> = {
  USAGE_MANUAL: "Getting started and complete usage guide",
  COMMANDS: "Full CLI command reference",
  WEB_APP_GUIDE: "Web app navigation and features",
  API_REFERENCE: "REST API endpoints documentation",
  MCP_AGENTS: "MCP server and agent integration",
  CONTEXT: "Code context and file linking",
  INTERFACES: "TUI, Web, VS Code, and Docker",
  ADVANCED: "Sessions, checkpoints, sprints, hooks",
  AI_AGENT_PROMPT: "Copy-paste prompt for AI agents",
};

export function DocsView() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchDocs().then((d) => {
      const sorted = sortDocs(d);
      setDocs(sorted);
      if (sorted.length > 0 && !activeDoc) {
        setActiveDoc(sorted[0].slug);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!activeDoc) return;
    setLoadingDoc(true);
    fetchDoc(activeDoc).then((c) => {
      setContent(c || "# Not found");
      setLoadingDoc(false);
      // Scroll to top when doc changes
      const el = document.getElementById("docs-content");
      if (el) el.scrollTop = 0;
    });
  }, [activeDoc]);

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs;
    const q = searchQuery.toLowerCase();
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.slug.toLowerCase().includes(q) ||
        (DOC_DESCRIPTIONS[d.slug] || "").toLowerCase().includes(q)
    );
  }, [docs, searchQuery]);

  // Extract headings from markdown for TOC
  const headings = useMemo(() => {
    const matches = content.match(/^#{1,3}\s+.+$/gm) || [];
    return matches.map((m) => {
      const level = m.match(/^(#{1,3})/)?.[1].length || 1;
      const text = m.replace(/^#{1,3}\s+/, "");
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return { level, text, id };
    });
  }, [content]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted text-sm">Loading docs...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-surface/50">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <input
              type="text"
              placeholder="Search docs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text text-xs"
              >
                x
              </button>
            )}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {filteredDocs.map((doc) => (
            <button
              key={doc.slug}
              onClick={() => setActiveDoc(doc.slug)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                activeDoc === doc.slug
                  ? "bg-accent/10 text-accent border-r-2 border-accent"
                  : "text-muted-strong hover:text-text hover:bg-card"
              }`}
            >
              <div className="font-medium truncate">{doc.title}</div>
              {DOC_DESCRIPTIONS[doc.slug] && (
                <div className="text-[10px] text-muted mt-0.5 truncate">
                  {DOC_DESCRIPTIONS[doc.slug]}
                </div>
              )}
            </button>
          ))}
          {filteredDocs.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted text-center">
              No docs match "{searchQuery}"
            </div>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document content */}
        <div id="docs-content" className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-6">
            {loadingDoc ? (
              <div className="space-y-3">
                <div className="h-6 bg-surface rounded w-48 animate-pulse" />
                <div className="h-4 bg-surface rounded w-full animate-pulse" />
                <div className="h-4 bg-surface rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-surface rounded w-5/6 animate-pulse" />
              </div>
            ) : (
              <article className="docs-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-bold text-text mb-4 pb-2 border-b border-border">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg font-semibold text-text mt-8 mb-3 pb-1 border-b border-border/50">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base font-semibold text-text mt-6 mb-2">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm text-muted-strong leading-relaxed mb-3">
                        {children}
                      </p>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-hover underline underline-offset-2"
                      >
                        {children}
                      </a>
                    ),
                    ul: ({ children }) => (
                      <ul className="text-sm text-muted-strong list-disc list-inside mb-3 space-y-1">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="text-sm text-muted-strong list-decimal list-inside mb-3 space-y-1">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed">{children}</li>
                    ),
                    code: ({ className, children, ...props }) => {
                      const isInline = !className;
                      if (isInline) {
                        return (
                          <code
                            className="bg-surface text-accent-text px-1.5 py-0.5 rounded text-xs font-mono"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children }) => (
                      <pre className="bg-surface border border-border rounded-lg p-4 mb-4 overflow-x-auto text-xs font-mono leading-relaxed">
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-3 border-accent pl-4 my-4 text-sm text-muted italic">
                        {children}
                      </blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full text-xs border-collapse">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-surface border-b border-border">{children}</thead>
                    ),
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children }) => (
                      <tr className="border-b border-border/50 hover:bg-card/50">{children}</tr>
                    ),
                    th: ({ children }) => (
                      <th className="text-left px-3 py-2 font-medium text-text">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-muted-strong">{children}</td>
                    ),
                    hr: () => <hr className="border-border my-6" />,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-text">{children}</strong>
                    ),
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>
            )}
          </div>
        </div>

        {/* Table of contents */}
        {headings.length > 2 && (
          <aside className="w-48 shrink-0 border-l border-border overflow-y-auto py-4 px-3 hidden xl:block">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              On this page
            </div>
            <nav className="space-y-1">
              {headings.map((h, i) => (
                <a
                  key={i}
                  href={`#${h.id}`}
                  className={`block text-[11px] text-muted hover:text-text transition-colors truncate ${
                    h.level === 2 ? "pl-0" : h.level === 3 ? "pl-3" : "pl-6"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
