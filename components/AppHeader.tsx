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
    ...(isAdmin
      ? [
          { href: "/admin", label: "Panel" },
          { href: "/admin/solicitudes", label: "Solicitudes" },
          { href: "/admin/importaciones", label: "Importaciones" },
          { href: "/admin/docentes", label: "Docentes" },
          { href: "/admin/vigencias", label: "Vigencias" },
        ]
      : []),
  ];
  return (
    <header className="bg-institucional text-white shadow">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/inicio" className="flex items-center gap-2">
          <Logo size={40} />
          <span className="text-lg font-black tracking-wide">MALLAS COMFACOR</span>
        </Link>
        <nav aria-label="Menú principal" className="order-3 flex w-full flex-wrap gap-1 md:order-2 md:ml-6 md:w-auto">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/15">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="order-2 ml-auto flex items-center gap-2 md:order-3">
          <Link
            href="/notificaciones"
            className="relative rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/15"
            aria-label={`Notificaciones: ${unread} sin leer`}
          >
            🔔
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-bold">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link href="/perfil" className="hidden rounded-lg px-3 py-2 text-sm font-semibold hover:bg-white/15 sm:block">
            {profile.full_name || profile.email}
          </Link>
          <form action={salir}>
            <button className="rounded-lg border border-white/40 px-3 py-2 text-sm font-semibold hover:bg-white/15">Salir</button>
          </form>
        </div>
      </div>
    </header>
  );
}
