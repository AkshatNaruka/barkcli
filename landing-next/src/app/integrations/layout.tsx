import type { Metadata } from "next";
import { DocsNav } from "@/components/docs-nav";

export const metadata: Metadata = {
  title: {
    default: "Integrations",
    template: "%s · barkcli Integrations",
  },
  description:
    "Integrate barkcli with GitHub, VS Code, MCP agents, CI/CD pipelines, and more.",
};

export default function IntegrationsLayout({
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
