import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

const interfaces = [
  {
    slug: "cli",
    title: "Command Line Interface",
    description: "Full-featured CLI for scripts, automation, and power users.",
    sections: [
      {
        title: "Installation",
        content: "barkcli is installed via curl or cargo. See the Getting Started guide.",
        code: "curl -fsSL https://barkcli.vercel.app/install.sh | sh",
      },
      {
        title: "Basic Usage",
        content: "Every action is available from the command line.",
        code: `barkcli init                    # initialize project
barkcli add "Fix bug" -p high   # add task
barkcli list                    # show tasks
barkcli move fix-bug doing      # move task
barkcli done fix-bug            # mark done`,
      },
      {
        title: "Filtering",
        content: "Filter tasks by column, priority, or label.",
        code: `barkcli list -c doing           # filter by column
barkcli list -p high            # filter by priority
barkcli list -l backend         # filter by label`,
      },
      {
        title: "Scripting",
        content: "Use barkcli in scripts and CI/CD pipelines.",
        code: `# Auto-generate changelog
barkcli log --since 7d --format markdown > CHANGELOG.md

# Check for stale tasks
barkcli list -p high -c todo --format json | jq '.[] | .title'`,
      },
    ],
  },
  {
    slug: "tui",
    title: "Terminal UI",
    description: "Interactive kanban board in your terminal with vim-style navigation.",
    sections: [
      {
        title: "Launch",
        content: "Start the terminal UI from any project directory.",
        code: "barkcli tui",
      },
      {
        title: "Navigation",
        content: "Use vim keys or arrow keys to navigate.",
        code: `h/l or ←/→    Navigate columns
j/k or ↑/↓    Navigate cards
Enter          View card details
a              Add new card
e              Edit card
d              Delete card`,
      },
      {
        title: "Tabs",
        content: "Switch between views with number keys or Tab.",
        code: `1 Board         Kanban columns
2 List          Sortable backlog
3 Tree          Parent-child hierarchy
4 Agenda        Overdue/today/next-7
5 Reports       Sprint burndown
6 Code          Symbol search
7 Agents        Registered agents
8 Orchestrate   Task queue`,
      },
      {
        title: "Search and Filter",
        content: "Quick search and command palette.",
        code: `/              Search/filter cards
:              Command palette
q/Esc          Quit/Back`,
      },
    ],
  },
  {
    slug: "web",
    title: "Web App",
    description: "Browser-based kanban with drag-and-drop, calendar, and reports.",
    sections: [
      {
        title: "Launch",
        content: "Start the web server and open in your browser.",
        code: `barkcli serve --open             # open in browser
barkcli serve --port 8080        # custom port
barkcli serve --board backend    # specific board`,
      },
      {
        title: "Dashboard",
        content: "Overview of all boards, tasks, and recent activity.",
        code: `Dashboard · Board · Calendar · Reports · Code

Stat cards show:
- Total tasks
- Tasks in progress
- Completed this week
- Overdue tasks`,
      },
      {
        title: "Board View",
        content: "Kanban, table, and list sub-views with drag-and-drop.",
        code: `┌──────────┬──────────┬──────────┬──────────┐
│ Todo     │ Doing    │ Review   │ Done     │
│          │          │          │          │
│ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │
│ │Auth  │ │ │API   │ │ │Tests │ │ │Setup │ │
│ │UI    │ │ │DB    │ │ │      │ │ │CI/CD │ │
│ └──────┘ │ └──────┘ │ └──────┘ │ └──────┘ │
└──────────┴──────────┴──────────┴──────────┘`,
      },
      {
        title: "Security",
        content: "Binds to localhost by default. Use --host for LAN access.",
        code: `barkcli serve                    # localhost only
barkcli serve --host 0.0.0.0     # LAN access (warning)
barkcli serve --token mysecret   # require auth`,
      },
    ],
  },
  {
    slug: "vscode",
    title: "VS Code Extension",
    description: "Custom editor for .board files with visual kanban view.",
    sections: [
      {
        title: "Installation",
        content: "Install from the VS Code marketplace or CLI.",
        code: `code --install-extension barkcli.barkcli

# Or search "barkcli" in VS Code extensions`,
      },
      {
        title: "Usage",
        content: "Open .board files to see the kanban view.",
        code: `1. Open a project with barkcli init
2. Double-click any .board file
3. The kanban view opens automatically
4. Drag and drop cards between columns
5. Click cards to edit details`,
      },
      {
        title: "Features",
        content: "Custom editor with real-time sync.",
        code: `- Custom kanban editor for .board files
- Drag and drop cards
- Inline editing
- Git diff support
- Real-time sync with barkcli`,
      },
    ],
  },
];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return interfaces.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const iface = interfaces.find((i) => i.slug === slug);
  if (!iface) return {};

  return generatePageMetadata({
    title: `${iface.title} — barkcli`,
    description: iface.description,
    path: `/docs/interfaces/${slug}`,
  });
}

export default async function InterfacePage({ params }: PageProps) {
  const { slug } = await params;
  const iface = interfaces.find((i) => i.slug === slug);
  if (!iface) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Docs", href: "/docs" },
          { label: "Interfaces", href: "/docs/interfaces" },
          { label: iface.title, href: `/docs/interfaces/${slug}` },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">{iface.title}</h1>
      <p className="mb-12 text-lg text-white/60">{iface.description}</p>

      <div className="space-y-12">
        {iface.sections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
            <p className="mb-4 text-white/60">{section.content}</p>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <code>{section.code}</code>
            </pre>
          </div>
        ))}
      </div>

      <div className="mt-12 flex gap-4">
        <Link
          href="/docs/interfaces"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          ← All Interfaces
        </Link>
      </div>
    </>
  );
}
