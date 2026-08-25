import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-white/50">
      <Link href="/" className="hover:text-white transition-colors">
        barkcli
      </Link>
      {items.map((item) => (
        <span key={item.href}>
          <span className="mx-2">/</span>
          <Link href={item.href} className="hover:text-white transition-colors">
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
