import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fecha } from "@/lib/requests";
import { marcarLeidas } from "@/app/actions/notificaciones";

const TIPO: Record<string, string> = {
  solicitud_recibida: "Solicitud recibida",
  solicitud_aprobada: "Modificación aprobada",
  solicitud_rechazada: "Modificación rechazada",
  observacion: "Observación",
  malla_publicada: "Nueva malla publicada",
  vigencia_nueva: "Nueva vigencia",
};

export default async function Notificaciones() {
  await requireUser();
  const s = await createClient();
  const { data } = await s
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at, area:areas(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (data ?? []) as unknown as {
    id: string; type: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string; area: { name: string } | null;
  }[];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Notificaciones</h1>
        {unread > 0 && (
          <form action={marcarLeidas}>
            <button className="btn-secundario">Marcar todas como leídas ({unread})</button>
          </form>
        )}
      </div>
      {list.length === 0 ? (
        <p className="tarjeta text-slate-600">No tiene notificaciones.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id} className={`tarjeta p-4 ${n.read_at ? "opacity-70" : "border-l-4 border-l-institucional"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold">{TIPO[n.type] ?? n.type}</span>
                {n.area && <span>· {n.area.name}</span>}
                <span>· {fecha(n.created_at)}</span>
                {!n.read_at && <span className="rounded bg-red-100 px-2 font-bold text-red-800">Sin leer</span>}
              </div>
              <p className="mt-1 font-bold">{n.title}</p>
              <p className="texto-celda text-sm">{n.body}</p>
              <div className="mt-2 flex gap-2">
                {n.link && (
                  <Link href={n.link} className="btn-secundario min-h-9 text-sm">
                    Abrir
                  </Link>
                )}
                {!n.read_at && (
                  <form action={marcarLeidas}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="btn-secundario min-h-9 text-sm">Marcar como leída</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
