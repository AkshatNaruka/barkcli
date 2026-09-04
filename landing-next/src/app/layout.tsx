import type { Metadata, Viewport } from "next";
import { Manrope, Italiana, Marck_Script } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const italiana = Italiana({
  weight: "400",
  variable: "--font-italiana",
  subsets: ["latin"],
});

const marck = Marck_Script({
  weight: "400",
  variable: "--font-marck",
  subsets: ["latin"],
});

const SITE_URL = "https://barkcli.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "barkcli — The management layer for AI agents",
    template: "%s · barkcli",
  },
  description:
    "barkcli is the management layer between humans and AI coding agents. Tasks, specs, memory, skills, and agent runs live in your repo — CLI, web app, and 51 MCP tools. One binary, no cloud, no accounts. Free and open source (MIT).",
  keywords: [
    "management layer for ai agents",
    "ai agent orchestration",
    "ai project manager",
    "git kanban",
    "git-native task management",
    "kanban board CLI",
    "terminal kanban",
    "task tracking for developers",
    "project management git",
    "offline kanban",
    "open source project management",
    "barkcli",
    "yaml task management",
    "developer productivity",
    "mcp server",
    "ai coding agents",
    "code context",
    "agent skills",
    "spec driven development",
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
      "The management layer between humans and AI coding agents. Tasks, specs, memory, and agent runs live in your repo. Free and open source.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "barkcli — Git-native task management",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "barkcli — The management layer for AI agents",
    description:
      "Tasks, specs, memory, and agent runs live in your repo. CLI, web app, and 51 MCP tools. No cloud. Free and open source (MIT).",
    creator: "@probiex007",
    images: [`${SITE_URL}/og-image.png`],
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
  themeColor: "#8B5E3C",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "barkcli",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux, Windows",
      url: SITE_URL,
      description:
        "The management layer between humans and AI coding agents. Tasks, specs, memory, skills, and agent runs live in your repo — CLI, web app, and 51 MCP tools. One binary, no cloud, no accounts.",
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
        "BMAD skills in repo",
        "Agent task queue with review gate",
        "CLI, Terminal UI, Web App, VS Code extension",
        "YAML-based board files with spec traceability",
        "Four-tier local memory",
        "51 MCP tools for AI coding agents",
        "Sprint management",
        "Session capture and checkpoints",
        "Import/export",
      ],
      screenshot: `${SITE_URL}/og-image.png`,
      softwareVersion: "0.3.0",
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
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/docs?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
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
      className={`${manrope.variable} ${italiana.variable} ${marck.variable}`}
    >
      <head>
        <link rel="canonical" href={SITE_URL} />
        <meta name="theme-color" content="#8B5E3C" />
        <meta name="msapplication-TileColor" content="#8B5E3C" />
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
