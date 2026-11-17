import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { requireUser } from "@/lib/auth";
import { contextOf, fecha, listRequests } from "@/lib/requests";
import { descartarBorrador, enviarBorrador } from "@/app/actions/propuestas";

export default async function MisSolicitudes({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const { profile } = await requireUser();
  const sp = await searchParams;
  const list = await listRequests({ mine: profile.id });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Mis solicitudes de modificación</h1>
      {sp.guardado === "enviado" && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 font-semibold text-green-800">
          Propuesta enviada al administrador.
        </p>
      )}
      {list.length === 0 ? (
        <p className="tarjeta text-slate-600">Todavía no ha propuesto cambios.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const c = contextOf(r);
            return (
              <li key={r.id} className="tarjeta border-l-8" style={{ borderLeftColor: c.color }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={c.href} className="font-bold text-institucional hover:underline">
                    {c.text}
                  </Link>
                  <StatusBadge request={r.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {r.projects.label} {r.projects.number_text}: {r.projects.name || "(sin nombre)"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Creada: {fecha(r.created_at)} · Enviada: {fecha(r.submitted_at)} · Decisión: {fecha(r.decided_at)}
                </p>
                {r.summary && <p className="texto-celda mt-2 text-sm">“{r.summary}”</p>}
                {r.reviewer_notes && (
                  <p className="mt-2 rounded-lg bg-slate-100 p-2 text-sm">
                    <strong>Observaciones del administrador:</strong> {r.reviewer_notes}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(r.status === "borrador" || r.status === "rechazado") && (
                    <Link
                      href={`/areas/${r.projects.plan.area.slug}/${r.projects.grade.slug}/${r.projects.period.number}/editar?vigencia=${r.projects.plan.year.year}`}
                      className="btn-secundario min-h-9 text-sm"
                    >
                      {r.status === "rechazado" ? "Corregir y reenviar" : "Continuar editando"}
                    </Link>
                  )}
                  {r.status === "borrador" && (
                    <>
                      <form action={enviarBorrador}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <button className="btn-primario min-h-9 text-sm">Enviar a aprobación</button>
                      </form>
                      <form action={descartarBorrador}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <button className="btn-secundario min-h-9 text-sm text-red-700">Descartar borrador</button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
