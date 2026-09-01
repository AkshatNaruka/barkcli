import type { Metadata } from "next";
import { DocsNav } from "@/components/docs-nav";

export const metadata: Metadata = {
  title: {
    default: "Compare",
    template: "%s · barkcli Compare",
  },
  description:
    "See how barkcli compares to Linear, Jira, Trello, Notion, and other project management tools.",
};

export default function CompareLayout({
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
