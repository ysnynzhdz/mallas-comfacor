import Link from "next/link";

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Ubicación" className="mb-4 text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            {it.href ? (
              <Link href={it.href} className="font-medium text-institucional hover:underline">
                {it.label}
              </Link>
            ) : (
              <span className="font-semibold text-slate-800">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
