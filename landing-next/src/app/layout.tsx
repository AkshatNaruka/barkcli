import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { MCP_TOOL_COUNT } from "@/lib/mcp";

// Body copy, display headlines, and commands. Three families, one job each.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const grotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://akshatnaruka.github.io/barkcli";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "barkcli — The management layer for AI agents",
    template: "%s · barkcli",
  },
  description:
    `You write the intent. Agents do the work. You review what's finished. barkcli plans the work, assigns it to your coding agents, has them build and test in isolated worktrees, and sends you only passing work to review. ${MCP_TOOL_COUNT} MCP tools. One binary, no cloud, no accounts. Free and open source (MIT).`,
  keywords: [
    "management layer for ai agents",
    "ai agent orchestration",
    "verification before review",
    "acceptance test gates for ai",
    "ai agent worktrees",
    "human in the loop review queue",
    "agent merge train",
    "claude code orchestration",
    "opencode alternative",
    "codex agent harness",
    "cursor mcp tools",
    "local-first ai tooling",
    "open source ai agent tooling",
    "barkcli",
    "living context engine",
    "collective memory for agents",
  ],
  applicationName: "barkcli",
  authors: [{ name: "Akshat Naruka", url: "https://github.com/AkshatNaruka" }],
  creator: "Akshat Naruka",
  publisher: "barkcli",
  category: "developer tools",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "barkcli",
    title: "barkcli — The management layer for AI agents",
    description:
      "You write the intent. Agents do the work. You review what's finished. barkcli plans, assigns to agents in isolated worktrees, gates on real tests, and sends you finished work to review.",
    images: [
      {
        url: `${SITE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "barkcli — The management layer for AI agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "barkcli — The management layer for AI agents",
    description:
      `You write the intent. Agents do the work. You review what's finished. Plans, isolated worktrees, test gates, and human review. ${MCP_TOOL_COUNT} MCP tools. No cloud. Free & open source (MIT).`,
    creator: "@probiex007",
    images: [`${SITE_URL}/opengraph-image`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: "barkcli",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080B10",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "barkcli",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: [
        "https://github.com/AkshatNaruka/barkcli",
        "https://github.com/AkshatNaruka",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "support",
        email: "narukaakshat@gmail.com",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "barkcli",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows",
      url: SITE_URL,
      description:
        `The management layer between humans and AI coding agents. Tasks, specs, memory, skills, and agent runs live in your repo — CLI, web app, and ${MCP_TOOL_COUNT} MCP tools. One binary, no cloud, no accounts.`,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      license: "https://github.com/AkshatNaruka/barkcli/blob/main/LICENSE",
      codeRepository: "https://github.com/AkshatNaruka/barkcli",
      author: {
        "@type": "Person",
        name: "Akshat Naruka",
        url: "https://github.com/AkshatNaruka",
      },
      featureList: [
        "Management layer for AI coding agents",
        "Mind snapshot and overview",
        "skills.sh skill registry and lockfile",
        "Agent task queue with review gate",
        "CLI, Terminal UI, Web App, VS Code extension",
        "YAML-based board files with spec traceability",
        "Four-tier local memory",
        `${MCP_TOOL_COUNT} MCP tools for AI coding agents`,
        "Sprint management",
        "Session capture and checkpoints",
        "Import/export",
      ],
      screenshot: `${SITE_URL}/opengraph-image`,
      softwareVersion: "0.4.0",
      downloadUrl: "https://github.com/AkshatNaruka/barkcli/releases",
      installUrl: `${SITE_URL}/docs/getting-started`,
    },
    {
      "@type": "WebSite",
      name: "barkcli",
      url: SITE_URL,
      description:
        "The management layer between humans and AI coding agents. Tasks, specs, memory, and agent runs live in your repo.",
      inLanguage: "en",
      publisher: {
        "@type": "Organization",
        name: "barkcli",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Documentation",
          item: `${SITE_URL}/docs`,
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is barkcli?",
          acceptedAnswer: {
            "@type": "Answer",
            text: `barkcli is an open-source (MIT) management layer between humans and AI coding agents. Tasks, specs, memory, skills, and agent runs live in your git repo. It provides a CLI, terminal UI, web app, and ${MCP_TOOL_COUNT} MCP tools for AI agents.`,
          },
        },
        {
          "@type": "Question",
          name: "Is barkcli free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. barkcli is free and open source under the MIT license — the CLI is free forever, with no per-seat pricing and no account required. A hosted team layer (multiplayer sessions, cloud sync, analytics) is planned at $99/month per team.",
          },
        },
        {
          "@type": "Question",
          name: "Does barkcli work with Claude Code, OpenCode, and Cursor?",
          acceptedAnswer: {
            "@type": "Answer",
            text: `Yes. barkcli exposes ${MCP_TOOL_COUNT} MCP tools and works as an MCP server with Claude Code, OpenCode, Cursor, and any MCP-compatible AI agent. See the integrations page for setup.`,
          },
        },
        {
          "@type": "Question",
          name: "Does barkcli upload my tasks to the cloud?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Tasks are YAML files committed to your git repository. barkcli runs fully locally and can work offline with no accounts.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${grotesk.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="canonical" href={SITE_URL} />
        <meta name="theme-color" content="#080B10" />
        <meta name="msapplication-TileColor" content="#080B10" />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
