import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { contextOf, fecha, listRequests } from "@/lib/requests";

const MSG: Record<string, string> = { aprobar: "Solicitud aprobada y publicada.", rechazar: "Solicitud rechazada; se notificó al docente." };

export default async function Solicitudes({ searchParams }: { searchParams: Promise<{ hecho?: string; ver?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const todas = sp.ver === "todas";
  const list = await listRequests(todas ? {} : { status: ["pendiente"] });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{todas ? "Todas las solicitudes" : "Solicitudes pendientes de aprobación"}</h1>
        <Link href={todas ? "/admin/solicitudes" : "/admin/solicitudes?ver=todas"} className="btn-secundario">
          {todas ? "Ver solo pendientes" : "Ver todas"}
        </Link>
      </div>
      {sp.hecho && MSG[sp.hecho] && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 font-semibold text-green-800">{MSG[sp.hecho]}</p>}
      {list.length === 0 ? (
        <p className="tarjeta text-slate-600">No hay solicitudes {todas ? "" : "pendientes"}.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const c = contextOf(r);
            return (
              <li key={r.id}>
                <Link href={`/admin/solicitudes/${r.id}`} className="tarjeta block border-l-8 hover:shadow-md" style={{ borderLeftColor: c.color }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{c.text}</span>
                    <StatusBadge request={r.status} />
                  </div>
                  <p className="text-sm text-slate-600">
                    {r.requester?.full_name || r.requester?.email} · enviada {fecha(r.submitted_at ?? r.created_at)}
                  </p>
                  {r.summary && <p className="texto-celda mt-1 text-sm">“{r.summary}”</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
