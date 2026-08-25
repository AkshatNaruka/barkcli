"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/docs", label: "Docs" },
  { href: "/compare", label: "Compare" },
  { href: "/use-cases", label: "Use Cases" },
  { href: "/integrations", label: "Integrations" },
  { href: "/guides", label: "Guides" },
];

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
          barkcli
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <a
          href="https://github.com/AkshatNaruka/barkcli"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-white/60 hover:text-white transition-colors"
        >
          GitHub
        </a>
      </div>
    </nav>
  );
}
