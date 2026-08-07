import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "barkcli — Git-native task management",
  description:
    "A git-native kanban board that lives in your repo. CLI, terminal UI, web app and VS Code extension — one binary, no cloud.",
  openGraph: {
    title: "barkcli — Git-native task management",
    description: "Tasks in your repo. No cloud required.",
    url: "https://barkcli.vercel.app",
    siteName: "barkcli",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${italiana.variable} ${marck.variable}`}>
      <body>{children}</body>
    </html>
  );
}
