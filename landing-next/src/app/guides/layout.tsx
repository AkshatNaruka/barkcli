import type { Metadata } from "next";
import { DocsNav } from "@/components/docs-nav";

export const metadata: Metadata = {
  title: {
    default: "Guides",
    template: "%s · barkcli Guides",
  },
  description:
    "Step-by-step guides for using barkcli effectively in your workflow.",
};

export default function GuidesLayout({
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
