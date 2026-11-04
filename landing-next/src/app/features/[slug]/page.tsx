import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FEATURES_DATA, getFeatureBySlug } from "@/lib/features";
import {
  Brain,
  Terminal,
  Search,
  Clock,
  Sparkles,
  Layers,
  FolderOpen,
  Bot,
  Database,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Code2,
  Cpu,
} from "lucide-react";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return FEATURES_DATA.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) return {};

  return {
    title: `${feature.title} — barkcli`,
    description: feature.description,
    openGraph: {
      title: `${feature.title} · barkcli Features`,
      description: feature.description,
      type: "website",
    },
  };
}

const ICON_MAP: Record<string, React.ElementType> = {
  Brain,
  Terminal,
  Search,
  Clock,
  Sparkles,
  Layers,
  FolderOpen,
  Bot,
  Database,
};

export default async function FeatureDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) notFound();

  const Icon = ICON_MAP[feature.iconName] || Sparkles;
  const currentIndex = FEATURES_DATA.findIndex((f) => f.slug === slug);
  const prevFeature = currentIndex > 0 ? FEATURES_DATA[currentIndex - 1] : null;
  const nextFeature = currentIndex < FEATURES_DATA.length - 1 ? FEATURES_DATA[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-[#060709] text-white selection:bg-[#B8845C]/30 selection:text-white">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060709]/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/#features" className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Overview</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B8845C]" />
            <Link href="/" className="font-semibold tracking-tight text-white hover:text-white/80">
              barkcli
            </Link>
            <span className="text-white/30">/</span>
            <Link href="/features" className="text-xs font-mono text-[#E5AA7A] hover:underline">
              features
            </Link>
            <span className="text-white/30">/</span>
            <span className="text-xs font-mono text-white/50">{feature.slug}</span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/AkshatNaruka/barkcli"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-white/80 hover:text-white"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="pt-20 pb-16 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-gradient pointer-events-none opacity-40" />
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-[#B8845C]/30 bg-[#B8845C]/10 text-xs font-mono text-[#E5AA7A] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E5AA7A]" />
            {feature.category.toUpperCase()}
          </div>

          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center mb-6 shadow-xl shadow-[#B8845C]/10">
            <Icon className="w-8 h-8 text-[#B8845C]" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-6">
            {feature.title}
          </h1>

          <p className="text-lg md:text-xl text-white/75 max-w-2xl mx-auto leading-relaxed mb-8">
            {feature.description}
          </p>

          {/* Quick Terminal Snippet */}
          <div className="max-w-xl mx-auto bg-black/60 border border-white/15 rounded-xl p-3 sm:p-4 text-left font-mono text-xs sm:text-sm text-[#E5AA7A] flex items-center justify-between shadow-2xl backdrop-blur-md">
            <span className="truncate">{feature.code}</span>
            <span className="text-white/30 text-[11px] ml-2 shrink-0">Terminal</span>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-6 pb-28 space-y-16">
        {/* Deep Overview */}
        <section className="border border-white/10 rounded-2xl p-8 bg-white/[0.02] backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#B8845C]" />
            Architecture Overview
          </h2>
          <p className="text-white/70 leading-relaxed text-base mb-6">
            {feature.overview}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/10">
            {feature.architecture.map((arch, i) => (
              <div key={i} className="p-4 rounded-xl bg-black/40 border border-white/5">
                <div className="font-semibold text-sm text-white mb-1.5">{arch.title}</div>
                <div className="text-xs text-white/60 leading-relaxed">{arch.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Key Capabilities */}
        <section className="border border-white/10 rounded-2xl p-8 bg-white/[0.02] backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-[#B8845C]" />
            Key Capabilities
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feature.capabilities.map((cap, i) => (
              <li key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.01] border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-sm text-white/80 leading-relaxed">{cap}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CLI Usage & Live Outputs */}
        <section className="border border-white/10 rounded-2xl p-8 bg-white/[0.02] backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-[#B8845C]" />
            Command Line Workflows
          </h2>
          <div className="space-y-6">
            {feature.cliExamples.map((ex, i) => (
              <div key={i} className="rounded-xl bg-black/60 border border-white/10 overflow-hidden font-mono text-xs">
                <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-white/60 text-[11px] flex items-center justify-between">
                  <span>{ex.desc}</span>
                  <span className="text-white/30 font-mono">Example #{i + 1}</span>
                </div>
                <div className="p-4 space-y-2">
                  <div className="text-[#E5AA7A] font-semibold">$ {ex.cmd}</div>
                  {ex.output && (
                    <pre className="text-white/60 whitespace-pre-wrap leading-relaxed border-t border-white/5 pt-2 font-mono">
                      {ex.output}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Documentation Link Callout */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 rounded-2xl border border-[#B8845C]/30 bg-[#B8845C]/10 gap-4">
          <div>
            <div className="font-semibold text-white text-base mb-1">Want to dive deeper into the code?</div>
            <div className="text-xs text-white/60">Read technical guides, MCP schemas, and configuration options.</div>
          </div>
          <Link
            href={feature.docsHref}
            className="px-4 py-2 bg-[#B8845C] hover:bg-[#a5764f] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
          >
            <span>Read Docs</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Bottom Pagination */}
        <div className="flex items-center justify-between pt-8 border-t border-white/10 text-sm">
          {prevFeature ? (
            <Link
              href={`/features/${prevFeature.slug}`}
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{prevFeature.title}</span>
            </Link>
          ) : (
            <div />
          )}

          {nextFeature && (
            <Link
              href={`/features/${nextFeature.slug}`}
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors ml-auto"
            >
              <span>{nextFeature.title}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
