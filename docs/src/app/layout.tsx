import "./src/styles/global.css";

import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "barkcli Documentation",
    template: "%s · barkcli",
  },
  description:
    "Git-native Kanban board CLI — tasks as YAML in your repo. Documentation, commands, and guides.",
  keywords: ["barkcli", "kanban", "cli", "git", "task-management"],
  openGraph: {
    title: "barkcli Documentation",
    description: "Git-native Kanban board CLI — tasks as YAML in your repo.",
    url: "https://docs.barkcli.vercel.app",
    siteName: "barkcli",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "barkcli Documentation",
    description: "Git-native Kanban board CLI — tasks as YAML in your repo.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
