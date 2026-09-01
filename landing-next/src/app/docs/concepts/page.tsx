import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";

const concepts = [
  {
    title: "Tasks",
    description: "The fundamental unit of work — title, priority, labels, assignee, due date, checklist, comments, and links.",
    href: "/docs/concepts/tasks",
  },
  {
    title: "Boards",
    description: "Collections of columns and cards. Each board is a separate .board YAML file in your repository.",
    href: "/docs/concepts/boards",
  },
  {
    title: "Projects",
    description: "Any codebase with a .board/ directory. barkcli works in any git repository.",
    href: "/docs/concepts/projects",
  },
  {
    title: "Code Context",
    description: "Links between tasks and source code files. See which files each task touches.",
    href: "/docs/concepts/code-context",
  },
];

export default function ConceptsPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Core Concepts", href: "/docs/concepts" }]} />
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Core Concepts</h1>
      <p className="mb-12 text-lg text-white/60">
        Understand the mental model of barkcli before diving into commands and guides.
      </p>

      <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-3 text-lg font-semibold">The Hierarchy</h2>
        <div className="font-mono text-sm text-white/70">
          <div>Project</div>
          <div className="ml-4">└── Board (.board/*.board)</div>
          <div className="ml-8">└── Task (card)</div>
          <div className="ml-12">└── Code Context (linked files)</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {concepts.map((concept) => (
          <Link
            key={concept.href}
            href={concept.href}
            className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <h2 className="mb-2 text-lg font-semibold text-white flex items-center gap-2">
              {concept.title}
              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h2>
            <p className="text-sm text-white/50">{concept.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
