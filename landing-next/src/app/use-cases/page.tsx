import Link from "next/link";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { generatePageMetadata } from "@/lib/seo";
import { useCases } from "@/lib/usecases";

export const metadata: Metadata = generatePageMetadata({
  title: "Use Cases — barkcli",
  description:
    "How different teams and developers use barkcli for task management. Solo developers, small teams, AI workflows, and more.",
  path: "/use-cases",
});

export default function UseCasesPage() {
  return (
    <>
      <Breadcrumbs
        items={[{ label: "Use Cases", href: "/use-cases" }]}
      />

      <h1 className="mb-4 text-4xl font-bold tracking-tight">Use Cases</h1>
      <p className="mb-12 text-lg text-white/60">
        How different teams and developers use barkcli.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {useCases.map((uc) => (
          <Link
            key={uc.slug}
            href={`/use-cases/${uc.slug}`}
            className="group rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-3 text-3xl">{uc.icon}</div>
            <h2 className="mb-2 text-xl font-semibold text-white group-hover:text-white/90">
              {uc.title}
            </h2>
            <p className="text-sm text-white/50">{uc.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
