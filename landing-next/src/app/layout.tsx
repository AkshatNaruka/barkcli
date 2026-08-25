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
    default: "barkcli — Git-native task management",
    template: "%s · barkcli",
  },
  description:
    "A git-native kanban board that lives in your repo. CLI, terminal UI, and web app — one binary, no cloud, no accounts. Free and open source (MIT).",
  keywords: [
    "git kanban",
    "git-native task management",
    "kanban board CLI",
    "terminal kanban",
    "task tracking for developers",
    "project management git",
    "offline kanban",
    "open source project management",
    "barkcli",
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
    title: "barkcli — Tasks in your repo",
    description:
      "Git-native kanban board that lives in your repo. CLI, terminal UI, and web app — one binary, no cloud required.",
  },
  twitter: {
    card: "summary_large_image",
    title: "barkcli — Tasks in your repo",
    description:
      "Git-native kanban board that lives in your repo. CLI, terminal UI, and web app — one binary, no cloud required.",
    creator: "@probiex007",
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
        "Git-native kanban board that lives in your repo. CLI, terminal UI, and web app — one binary, no cloud.",
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
    },
    {
      "@type": "WebSite",
      name: "barkcli",
      url: SITE_URL,
      description:
        "Git-native kanban board that lives in your repo. CLI, terminal UI, and web app — one binary, no cloud.",
      inLanguage: "en",
      publisher: {
        "@type": "Organization",
        name: "barkcli",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
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
