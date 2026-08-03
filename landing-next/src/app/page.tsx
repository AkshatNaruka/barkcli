"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-3 text-xs font-mono text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/40 rounded-lg px-3 py-1.5 transition-all shrink-0 cursor-pointer"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function TerminalBlock({
  children,
  showDots = false,
}: {
  children: React.ReactNode;
  showDots?: boolean;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-sm border border-border"
      style={{ backgroundColor: "var(--terminal)" }}
    >
      {showDots && (
        <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-white/10">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        </div>
      )}
      {!showDots && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <span className="text-xs text-white/30 font-mono tracking-wider">
            TERMINAL
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`max-w-5xl mx-auto px-6 py-28 ${className}`}>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <>
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5 no-underline">
            <span className="text-xl">🐶</span>
            <span className="text-lg font-bold tracking-tight font-mono text-foreground">
              barkcli
            </span>
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-border/60 text-muted-foreground rounded px-1.5 py-0"
            >
              v0.2.0
            </Badge>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a
              href="#features"
              className="hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#demo"
              className="hover:text-foreground transition-colors"
            >
              Demo
            </a>
            <a
              href="#pricing"
              className="hover:text-foreground transition-colors"
            >
              Pricing
            </a>
            <a
              href="https://x.com/probiex007"
              className="hover:text-foreground transition-colors"
            >
              X
            </a>
            <a href="#install">
              <Button size="sm" className="font-semibold">
                Install
              </Button>
            </a>
          </nav>
        </div>
      </header>

      <main className="pt-16">
        {/* Hero */}
        <section className="max-w-3xl mx-auto px-6 pt-24 pb-8 text-center">
          <p className="text-xs text-muted-foreground mb-6 font-mono tracking-wider uppercase">
            git-native task management
          </p>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none mb-6 text-foreground">
            Tasks in your repo.
            <br />
            <span className="text-muted-foreground font-semibold">
              No cloud. No subscription.
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-2 leading-relaxed">
            A single binary. Your tasks are YAML files — commit them, diff them,
            own them.
          </p>
          <p className="text-sm text-muted-foreground mb-10">
            Like{" "}
            <span className="text-foreground font-semibold">git</span> but for
            your todo list.
          </p>

          <div id="install" className="max-w-lg mx-auto mb-4">
            <TerminalBlock>
              <div className="flex items-center p-4">
                <span className="text-primary/70 mr-2 select-none font-mono text-sm">
                  $
                </span>
                <code className="flex-1 text-sm text-gray-300 font-mono overflow-x-auto">
                  curl -fsSL https://getbarkcli.dev | sh
                </code>
                <CopyButton text="curl -fsSL https://getbarkcli.dev | sh" />
              </div>
            </TerminalBlock>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            macOS · Linux · Windows
          </p>
        </section>

        {/* Terminal Demo */}
        <section id="demo" className="max-w-2xl mx-auto px-6 pb-24">
          <TerminalBlock showDots>
            <pre className="p-8 text-sm leading-8 font-mono overflow-x-auto">
              <span className="text-white/30">$</span>{" "}
              <span className="text-white font-medium">barkcli init</span>
              {"\n\n"}
              <span className="text-white/30">$</span>{" "}
              <span className="text-white font-medium">barkcli add</span>{" "}
              <span className="text-gray-300">"Fix auth bug"</span> -p high -l
              backend
              {"\n"}
              <span className="text-white/30">$</span>{" "}
              <span className="text-white font-medium">barkcli add</span>{" "}
              <span className="text-gray-300">"Write onboarding docs"</span>
              {"\n"}
              <span className="text-white/30">$</span>{" "}
              <span className="text-white font-medium">barkcli list</span>
              {"\n\n"}
              <span className="text-white/30">$</span>{" "}
              <span className="text-white font-medium">barkcli move</span>{" "}
              fix-auth-bug doing
              {"\n"}
              <span className="text-white/30">$</span>{" "}
              <span className="text-white font-medium">barkcli done</span>{" "}
              fix-auth-bug
              {"\n\n"}
              <span className="text-white/30">$</span>{" "}
              <span className="text-white font-medium">barkcli log</span>{" "}
              &&{" "}
              <span className="text-white font-medium">barkcli undo</span>{" "}
              &&{" "}
              <span className="text-white font-medium">barkcli diff</span>
              {"\n"}
              <span className="cursor-blink text-[#059669]">█</span>
            </pre>
          </TerminalBlock>
          <p className="text-center mt-4 font-mono text-xs text-muted-foreground">
            Also:{" "}
            <span className="text-primary font-medium">barkcli tui</span> ·{" "}
            <span className="text-primary font-medium">barkcli serve</span> ·{" "}
            <span className="text-primary font-medium">barkcli ai</span>
          </p>
        </section>

        {/* KPI */}
        <section className="border-y border-border">
          <div className="max-w-4xl mx-auto px-6 py-14">
            <div className="grid grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-3xl font-bold font-mono text-foreground">
                  1
                </div>
                <div className="text-xs text-muted-foreground mt-2 font-mono tracking-wider">
                  BINARY
                </div>
              </div>
              <div className="border-x border-border">
                <div className="text-3xl font-bold font-mono text-foreground">
                  3
                </div>
                <div className="text-xs text-muted-foreground mt-2 font-mono tracking-wider">
                  INTERFACES
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold font-mono text-foreground">
                  $49
                </div>
                <div className="text-xs text-muted-foreground mt-2 font-mono tracking-wider">
                  ONE-TIME
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <Section id="features">
          <h2 className="text-3xl font-bold text-center mb-2">
            Built for how you work.
          </h2>
          <p className="text-muted-foreground text-center mb-16 max-w-lg mx-auto font-mono text-sm">
            Terminal. Browser. IDE. Same data, same commands.
          </p>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              {
                icon: (
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      d="M8 9l3 3-3 3m5 0h3M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
                    />
                  </svg>
                ),
                title: "Terminal-first",
                desc: "Interactive TUI with vim keys, command palette, themes, and query syntax.",
                code: "barkcli tui",
              },
              {
                icon: (
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path strokeLinecap="round" d="M8 21h8M12 17v4" />
                  </svg>
                ),
                title: "Web Kanban",
                desc: "Drag-and-drop board, table, calendar, and list views. Live-reload via WebSocket.",
                code: "barkcli serve --open",
              },
              {
                icon: (
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                  </svg>
                ),
                title: "Git-native",
                desc: "Plain YAML in your repo. PRs show card diffs. git merge = sync.",
                code: "barkcli diff HEAD~1",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white hover:bg-secondary border border-border rounded-2xl p-8 transition-colors duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-5">
                  {f.icon}
                </div>
                <h3 className="font-semibold mb-1.5 text-foreground">
                  {f.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {f.desc}
                </p>
                <code className="text-xs text-primary/60 font-mono">
                  {f.code}
                </code>
              </div>
            ))}
          </div>
        </Section>

        {/* AI Teaser */}
        <section className="max-w-4xl mx-auto px-6 pb-28">
          <div className="bg-accent/50 border border-primary/10 rounded-3xl p-12 md:p-16 text-center">
            <h2 className="text-3xl font-bold mb-4 text-foreground">
              Let AI break down your tasks.
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-10 font-mono text-sm">
              Describe the task. barkcli generates the cards.
            </p>
            <TerminalBlock>
              <pre className="p-5 text-sm leading-7 font-mono">
                <span className="text-white/30">$</span>{" "}
                <span className="text-white font-medium">barkcli ai</span>{" "}
                <span className="text-gray-300">
                  "Implement JWT auth"
                </span>
                {"\n\n"}
                <span className="text-white/40">
                  Generated 6 tasks:
                </span>
                {"\n"}
                <span className="text-[#059669]">1.</span>{" "}
                <span className="text-white">
                  Set up JWT middleware
                </span>{" "}
                <span className="text-white/30">[high]</span>
                {"\n"}
                <span className="text-[#059669]">2.</span>{" "}
                <span className="text-white">
                  Create refresh token endpoint
                </span>{" "}
                <span className="text-white/30">[high]</span>
                {"\n"}
                <span className="text-[#059669]">3.</span>{" "}
                <span className="text-white">
                  Add token blacklisting
                </span>{" "}
                <span className="text-white/30">[medium]</span>
                {"\n"}
                <span className="text-white/30">...</span>
              </pre>
            </TerminalBlock>
          </div>
        </section>

        {/* Pricing */}
        <Section id="pricing">
          <h2 className="text-3xl font-bold text-center mb-2 text-foreground">
            Pay once. Use forever.
          </h2>
          <p className="text-muted-foreground text-center mb-14 font-mono text-sm">
            Your tasks stay yours — in your git repo — forever.
          </p>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              {
                name: "Free",
                price: "$0",
                desc: "All the basics.",
                cta: "Install",
                href: "#install",
                highlight: false,
                features: [
                  "Unlimited tasks & boards",
                  "Terminal TUI · Web Kanban",
                  "Git history · undo · diff",
                  "VS Code · Neovim · JetBrains",
                ],
              },
              {
                name: "Pro",
                price: "$49",
                desc: "AI, reports, templates.",
                cta: "Buy Pro",
                href: "#",
                highlight: true,
                badge: "POPULAR",
                features: [
                  "Everything in Free",
                  "AI task breakdown",
                  "Weekly reports",
                  "Auto changelog",
                  "Analytics & stats",
                  "5 templates (43 tasks)",
                ],
              },
              {
                name: "Team",
                price: "$149",
                desc: "Collaboration, 5 seats.",
                cta: "Buy Team",
                href: "#",
                highlight: false,
                features: [
                  "Everything in Pro",
                  "Conflict resolution",
                  "Sprint planning",
                  "GitHub sync",
                  "Team dashboard",
                ],
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`bg-white rounded-2xl p-8 relative ${
                  tier.highlight
                    ? "border-2 border-primary"
                    : "border border-border"
                }`}
              >
                {tier.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold font-mono">
                    {tier.badge}
                  </span>
                )}
                <h3
                  className={`text-lg font-semibold mb-1 text-foreground ${
                    tier.highlight ? "mt-2" : ""
                  }`}
                >
                  {tier.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {tier.desc}
                </p>
                <div className="text-4xl font-bold mb-1 font-mono text-foreground">
                  {tier.price}
                </div>
                <p className="text-xs text-muted-foreground mb-6 font-mono">
                  {tier.name === "Pro" ? "ONE-TIME · LIFETIME" : tier.name === "Team" ? "ONE-TIME · 5 SEATS" : "\u00A0"}
                </p>
                <a href={tier.href} className="block mb-8">
                  <Button
                    variant={tier.highlight ? "default" : "outline"}
                    className="w-full font-semibold"
                  >
                    {tier.cta}
                  </Button>
                </a>
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      {tier.highlight ? (
                        <span className="text-primary font-mono text-xs mt-0.5 shrink-0">
                          ✦
                        </span>
                      ) : (
                        <svg
                          className="w-4 h-4 text-[#059669] mt-0.5 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Testimonials */}
        <section className="max-w-5xl mx-auto px-6 pb-28">
          <h2 className="text-3xl font-bold text-center mb-14 text-foreground">
            Loved by builders.
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              {
                quote:
                  "Finally — project management without a subscription. My startup roadmap lives in git. Pushing tasks alongside code is magical.",
                name: "Alex Chen",
                role: "SaaS Founder",
                initials: "AC",
              },
              {
                quote:
                  "barkcli ai broke down 'ship MVP' into 14 tasks in 3 seconds. That alone is worth $49. I demo the TUI in my videos.",
                name: "Maria Santos",
                role: "Indie Hacker",
                initials: "MS",
              },
              {
                quote:
                  "Switched from Linear. Saved $120/yr. My tasks are YAML files I can grep and script. Git integration is the killer feature.",
                name: "Raj Patel",
                role: "Engineering Lead",
                initials: "RP",
              },
            ].map((t) => (
              <div
                key={t.name}
                className="bg-white border border-border rounded-xl p-6 hover:border-muted-foreground/20 transition-colors duration-300"
              >
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-primary font-mono">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-2xl mx-auto px-6 pb-28">
          <h2 className="text-3xl font-bold text-center mb-12 text-foreground">
            Questions
          </h2>
          <Accordion className="space-y-2">
            {[
              {
                q: "One-time. No subscription?",
                a: "Yes. Pay once, use forever. Tasks are YAML in your git repo — no vendor lock-in.",
              },
              {
                q: "How is it different from Linear?",
                a: "No cloud. No per-user pricing. Single binary. Works offline. Tasks are plain YAML.",
              },
              {
                q: "What happens when you buy Pro?",
                a: "License key. barkcli license activate <key>. Offline validation. Use on all your machines.",
              },
              {
                q: "Refund policy?",
                a: "30 days. No questions asked. If it doesn't improve your workflow, we refund.",
              },
            ].map((faq) => (
              <AccordionItem
                key={faq.q}
                value={faq.q}
                className="border border-border rounded-xl px-5"
              >
                <AccordionTrigger className="font-medium text-foreground hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA */}
        <section className="max-w-xl mx-auto px-6 pb-28 text-center">
          <h2 className="text-3xl font-bold mb-4 text-foreground">
            Start tracking in 10 seconds.
          </h2>
          <p className="text-muted-foreground mb-8 font-mono text-sm">
            Free forever for the basics. Pro when you need more.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a href="#install">
              <Button size="lg" className="font-semibold">
                Install free
              </Button>
            </a>
            <a href="#pricing">
              <Button variant="outline" size="lg" className="font-medium">
                View pricing
              </Button>
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-10 text-center text-xs text-muted-foreground font-mono">
        <p>
          barkcli ·{" "}
          <a
            href="https://x.com/probiex007"
            className="hover:text-primary transition-colors"
          >
            X
          </a>{" "}
          · 30-day refund guarantee
        </p>
      </footer>
    </>
  );
}
