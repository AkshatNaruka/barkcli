import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";

const guides = [
  {
    slug: "migrate-from-linear",
    title: "Migrating from Linear",
    description: "Export tasks from Linear and import them into barkcli.",
    sections: [
      {
        title: "Step 1: Export from Linear",
        content: "Use Linear's export feature or API to get your tasks as CSV or JSON.",
        code: "# Linear has a built-in CSV export\n# Or use the API\n# GET https://api.linear.app/issues?assignedTo=me",
      },
      {
        title: "Step 2: Convert to barkcli YAML",
        content: "Convert your exported data to barkcli's YAML format.",
        code: `# Create a tasks.yaml file
title: My Project
columns:
  - id: todo
    name: Todo
  - id: doing
    name: Doing
  - id: done
    name: Done
cards:
  - id: linear-issue-1
    title: "Fix login bug"
    column: todo
    priority: high
    labels: [bug]`,
      },
      {
        title: "Step 3: Import to barkcli",
        content: "Initialize barkcli and import your tasks.",
        code: `barkcli init
barkcli import main tasks.yaml
barkcli list  # Verify import`,
      },
      {
        title: "Step 4: Commit and Share",
        content: "Commit the .board directory to your repo.",
        code: `git add .board
git commit -m "feat: migrate tasks from Linear"
git push`,
      },
    ],
  },
  {
    slug: "migrate-from-jira",
    title: "Migrating from Jira",
    description: "Move from Jira to barkcli for engineering tasks.",
    sections: [
      {
        title: "Step 1: Export from Jira",
        content: "Use Jira's export to CSV feature.",
        code: "# In Jira: Issues > Export > CSV (All fields)\n# Or use Jira API for bulk export",
      },
      {
        title: "Step 2: Map Fields",
        content: "Map Jira fields to barkcli properties.",
        code: `# Jira Priority → barkcli Priority
# High → high
# Medium → medium
# Low → low

# Jira Labels → barkcli Labels
# backend → backend

# Jira Status → barkcli Column
# To Do → todo
# In Progress → doing
# Done → done`,
      },
      {
        title: "Step 3: Import",
        content: "Convert and import your tasks.",
        code: `# Convert CSV to YAML (use a script or manually)
barkcli init
barkcli import main tasks.yaml
barkcli status  # Verify import`,
      },
    ],
  },
  {
    slug: "team-setup",
    title: "Team Setup",
    description: "Set up barkcli for a team with git-based collaboration.",
    sections: [
      {
        title: "Step 1: Initialize in Shared Repo",
        content: "One team member initializes barkcli in the shared repo.",
        code: `barkcli init
git add .board
git commit -m "chore: initialize barkcli"
git push`,
      },
      {
        title: "Step 2: Team Members Pull",
        content: "Other team members pull the changes.",
        code: `git pull
barkcli list  # See the same board`,
      },
      {
        title: "Step 3: Work with Branches",
        content: "Create feature branches and work on tasks.",
        code: `git checkout -b feature/auth
barkcli move jwt-login doing
# ... work on tasks ...
barkcli done jwt-login
git add .board
git commit -m "feat: complete JWT login"
git push`,
      },
      {
        title: "Step 4: Merge and Sync",
        content: "Merge branches and sync task changes.",
        code: `git checkout main
git merge feature/auth
barkcli list  # See updated board`,
      },
    ],
  },
  {
    slug: "ai-agent-setup",
    title: "AI Agent Setup",
    description: "Configure MCP server for coding agent integration.",
    sections: [
      {
        title: "Step 1: Start MCP Server",
        content: "Start the barkcli MCP server.",
        code: "barkcli mcp",
      },
      {
        title: "Step 2: Configure Your Agent",
        content: "Add barkcli as an MCP server in your agent's config.",
        code: `# For OpenCode (.opencode/config.json)
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}

# For Claude Code (.claude/settings.json)
{
  "mcpServers": {
    "barkcli": {
      "command": "barkcli",
      "args": ["mcp"]
    }
  }
}`,
      },
      {
        title: "Step 3: Use MCP Tools",
        content: "Your agent can now use 25+ barkcli tools.",
        code: `# Agent can now:
# - List tasks: board_list, card_list
# - Create tasks: card_create
# - Search code: code_search
# - Get call graphs: callgraph_get
# - Register as agent: agent_register`,
      },
    ],
  },
  {
    slug: "multi-board",
    title: "Multi-Board Workflow",
    description: "Manage multiple boards for different projects or teams.",
    sections: [
      {
        title: "Create Boards",
        content: "Create separate boards for different purposes.",
        code: `barkcli boards create backend
barkcli boards create frontend
barkcli boards create devops`,
      },
      {
        title: "Switch Between Boards",
        content: "Switch the default board or target specific boards.",
        code: `barkcli switch backend          # set default
barkcli list -b frontend       # target specific board
barkcli add "API refactor" -b backend`,
      },
      {
        title: "Board Structure",
        content: "Each board has its own cards and columns.",
        code: `.board/
├── backend.board    # Backend tasks
├── frontend.board   # Frontend tasks
└── devops.board     # DevOps tasks`,
      },
    ],
  },
  {
    slug: "ci-cd-integration",
    title: "CI/CD Integration",
    description: "Automate task workflows with GitHub Actions or GitLab CI.",
    sections: [
      {
        title: "GitHub Actions",
        content: "Automate task workflows with GitHub Actions.",
        code: `# .github/workflows/barkcli.yml
name: Barkcli
on:
  push:
    paths:
      - ".board/**"
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: barkcli sync --push`,
      },
      {
        title: "GitLab CI",
        content: "Automate with GitLab CI.",
        code: `# .gitlab-ci.yml
barkcli-sync:
  script:
    - barkcli sync --push
  only:
    changes:
      - ".board/**"`,
      },
      {
        title: "Auto-Changelog",
        content: "Generate changelog from task history.",
        code: `# Generate changelog from completed tasks
barkcli log --since 7d --format markdown > CHANGELOG.md

# Or use barkcli report
barkcli report > weekly-report.md`,
      },
    ],
  },
];

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = guides.find((g) => g.slug === slug);
  if (!guide) return {};

  return generatePageMetadata({
    title: `${guide.title} — barkcli Guide`,
    description: guide.description,
    path: `/guides/${slug}`,
  });
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = guides.find((g) => g.slug === slug);
  if (!guide) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Guides", href: "/guides" },
          { label: guide.title, href: `/guides/${slug}` },
        ]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">{guide.title}</h1>
      <p className="mb-12 text-lg text-white/60">{guide.description}</p>

      <div className="space-y-12">
        {guide.sections.map((section) => (
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
          href="/guides"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          ← All Guides
        </Link>
      </div>
    </>
  );
}
