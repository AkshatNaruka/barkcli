import { source } from "@/lib/source";
import {
  DocsLayout as FumadocsLayout,
  type DocsLayoutProps,
} from "fumadocs-ui/layouts/docs";

const links = [
  {
    text: "Docs",
    url: "/docs",
  },
  {
    text: "Guides",
    url: "/docs/guides/team-workflow",
  },
  {
    text: "GitHub",
    url: "https://github.com/AkshatNaruka/barkcli",
    external: true,
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const tree = source.pageTree;

  return (
    <FumadocsLayout
      tree={tree}
      links={links}
      nav={{
        title: (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 text-white flex items-center justify-center text-xs font-mono font-bold shadow-sm">
              b
            </div>
            <span className="font-semibold text-sm tracking-tight">
              barkcli
            </span>
            <span className="text-[10px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded-md">
              v0.2.0
            </span>
          </div>
        ),
      }}
      sidebar={{
        footer: (
          <div className="text-xs text-muted-foreground py-2 space-y-1">
            <div>barkcli v0.2.0 · MIT License</div>
            <div>
              <a
                href="https://github.com/AkshatNaruka/barkcli"
                className="hover:text-foreground transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        ),
      }}
    >
      {children}
    </FumadocsLayout>
  );
}
