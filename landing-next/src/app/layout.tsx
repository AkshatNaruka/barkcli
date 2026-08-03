import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "barkcli — git-native task management",
  description:
    "barkcli is a single-binary CLI tool for task tracking. Tasks are YAML files committed to your repo. No cloud. No subscription.",
  openGraph: {
    title: "barkcli — git-native task management",
    description:
      "A single binary. Tasks are YAML in your repo. No cloud. No subscription.",
    url: "https://getbarkcli.dev",
    siteName: "barkcli",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} scroll-smooth`}
    >
      <body className="min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
