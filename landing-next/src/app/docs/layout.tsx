import type { Metadata } from "next";
import { DocsNav } from "@/components/docs-nav";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s · barkcli Docs",
  },
  description:
    "Complete documentation for barkcli — git-native task management. Commands, guides, and API reference.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <DocsNav />
      <main className="mx-auto max-w-4xl px-6 py-12">{children}</main>
    </div>
  );
}
