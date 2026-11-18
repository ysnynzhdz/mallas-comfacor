import Link from "next/link";

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Ubicación" className="mb-5 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-slate-400">/</span>}
            {it.href ? (
              <Link href={it.href} className="text-slate-600 hover:text-accion hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-tinta">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
