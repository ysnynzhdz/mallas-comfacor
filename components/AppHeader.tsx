import Link from "next/link";
import { Logo } from "@/components/Logo";
import { salir } from "@/app/actions/auth";
import type { Profile } from "@/lib/types";

export function AppHeader({ profile, unread }: { profile: Profile; unread: number }) {
  const isAdmin = profile.role === "admin";
  const links = [
    { href: "/inicio", label: "Inicio" },
    { href: "/buscar", label: "Buscar" },
    { href: "/grados", label: "Por grado" },
    { href: "/comparar", label: "Comparar" },
    { href: "/mis-solicitudes", label: "Mis solicitudes" },
  ];
  const admin = [
    { href: "/admin", label: "Panel" },
    { href: "/admin/solicitudes", label: "Solicitudes" },
    { href: "/admin/importaciones", label: "Importaciones" },
    { href: "/admin/docentes", label: "Docentes" },
    { href: "/admin/vigencias", label: "Vigencias" },
  ];
  const first = (profile.full_name || profile.email).split(" ")[0];
  return (
    <header className="bg-tinta text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/inicio" className="flex items-center gap-3">
          <Logo size={38} />
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-wide">Mallas COMFACOR</span>
            <span className="block text-xs text-white/70">I.E. COMFACOR Jaime Exbrayat</span>
          </span>
        </Link>
        <nav aria-label="Menú principal" className="order-3 -mx-2 flex w-full flex-wrap items-center gap-0.5 lg:order-2 lg:mx-0 lg:w-auto">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-2 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white">
              {l.label}
            </Link>
          ))}
          {isAdmin && (
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium text-white/90 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                Administración
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="transition-transform group-open:rotate-180">
                  <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </summary>
              <div className="absolute left-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-linea bg-white py-1 text-tinta shadow-lg">
                {admin.map((l) => (
                  <Link key={l.href} href={l.href} className="block px-4 py-2 text-sm hover:bg-institucional-claro">
                    {l.label}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
        <div className="order-2 ml-auto flex items-center gap-1 lg:order-3">
          <Link
            href="/notificaciones"
            className="relative rounded-md p-2 hover:bg-white/10"
            aria-label={`Notificaciones: ${unread} sin leer`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-xs font-bold text-tinta">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link href="/perfil" className="hidden rounded-md px-2.5 py-2 text-sm font-medium text-white/90 hover:bg-white/10 sm:block">
            {first}
          </Link>
          <form action={salir}>
            <button className="rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium hover:bg-white/10">Salir</button>
          </form>
        </div>
      </div>
      <div className="franja-vueltiao" aria-hidden />
    </header>
  );
}
