import { source } from "@/lib/source";
import {
  DocsLayout as FumadocsLayout,
  type DocsLayoutProps,
} from "fumadocs-ui/layouts/docs";

export default function Layout({ children }: { children: React.ReactNode }) {
  const tree = source.pageTree;

  return (
    <FumadocsLayout
      tree={tree}
      nav={{
        title: "barkcli",
        logo: (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent text-white flex items-center justify-center text-[10px] font-mono font-bold">
              b
            </div>
            <span className="font-semibold text-sm">barkcli</span>
          </div>
        ),
        links: [
          {
            text: "GitHub",
            url: "https://github.com/AkshatNaruka/barkcli",
            external: true,
          },
        ],
      }}
      sidebar={{
        footer: (
          <div className="text-xs text-muted-foreground py-2">
            barkcli v0.2.0
          </div>
        ),
      }}
    >
      {children}
    </FumadocsLayout>
  );
}
