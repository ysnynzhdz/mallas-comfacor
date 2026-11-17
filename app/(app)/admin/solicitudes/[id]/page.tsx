import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { DiffView } from "@/components/DiffView";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_SELECT, contextOf, fecha, type RequestRow } from "@/lib/requests";
import { decidirSolicitud } from "@/app/actions/admin";
import type { Snapshot } from "@/lib/types";

export default async function RevisarSolicitud({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireAdmin();
  const { id } = await params;
  const s = await createClient();
  const { data } = await s.from("change_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as unknown as RequestRow;
  const c = contextOf(r);
  const { data: base } = await s
    .from("curriculum_versions")
    .select("snapshot")
    .eq("project_id", r.project_id)
    .eq("version_no", r.base_version_no)
    .maybeSingle();
  const { data: records } = await s
    .from("approval_records")
    .select("action, notes, created_at, actor:profiles(full_name)")
    .eq("change_request_id", id)
    .order("created_at");
  const conflict = r.projects.version_no !== r.base_version_no;
  const own = r.requested_by === profile.id;

  return (
    <div>
      <p className="mb-2"><Link href="/admin/solicitudes" className="text-sm font-semibold text-institucional hover:underline">← Volver a solicitudes</Link></p>
      <div className="tarjeta mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{c.text}</h1>
          <StatusBadge request={r.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Propuesta de <strong>{r.requester?.full_name || r.requester?.email}</strong> · creada {fecha(r.created_at)} · enviada {fecha(r.submitted_at)}
        </p>
        <p className="mt-1 text-sm text-slate-600">Basada en la versión {r.base_version_no}. Versión publicada actual: {r.projects.version_no}.</p>
        {r.summary && <p className="texto-celda mt-3 rounded-lg bg-slate-100 p-3"><strong>Explicación del docente:</strong> {r.summary}</p>}
        <p className="mt-3"><Link href={c.href} className="text-sm font-semibold text-institucional underline" target="_blank">Ver la malla publicada</Link></p>
      </div>

      <h2 className="mb-3 text-lg font-bold">Comparación: versión publicada frente a la propuesta</h2>
      {base ? (
        <DiffView before={base.snapshot as Snapshot} after={r.proposed} />
      ) : (
        <p className="tarjeta text-amber-800">No se encontró la versión base para comparar.</p>
      )}

      {(records ?? []).length > 0 && (
        <section className="tarjeta mt-6">
          <h2 className="mb-2 font-bold">Registro</h2>
          <ul className="space-y-1 text-sm">
            {(records as unknown as { action: string; notes: string | null; created_at: string; actor: { full_name: string } | null }[]).map((x, i) => (
              <li key={i}>{fecha(x.created_at)} · <strong>{x.action}</strong> por {x.actor?.full_name}{x.notes ? `: ${x.notes}` : ""}</li>
            ))}
          </ul>
        </section>
      )}

      {r.status === "pendiente" && (
        <section className="tarjeta mt-6 border-2 border-institucional">
          <h2 className="mb-3 text-lg font-bold">Decisión</h2>
          {own && <p className="mb-3 rounded-lg bg-blue-50 p-3 text-sm">Esta propuesta es suya. Como administrador puede aprobarla; quedará registrado.</p>}
          {conflict && (
            <p className="mb-3 rounded-lg bg-orange-50 p-3 text-sm font-semibold text-orange-900">
              Atención: la malla cambió después de que se preparó esta propuesta. Si la aprueba, reemplazará los cambios publicados después.
              Revise la malla publicada antes de decidir.
            </p>
          )}
          <ActionForm action={decidirSolicitud} className="space-y-3">
            <input type="hidden" name="id" value={r.id} />
            {conflict && <input type="hidden" name="forzar" value="1" />}
            <label className="etiqueta" htmlFor="notes">Observaciones (obligatorias para rechazar)</label>
            <textarea id="notes" name="notes" rows={3} className="campo" />
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="aprobar" className="btn-primario">✔ Aprobar y publicar</button>
              <button name="decision" value="rechazar" className="btn-peligro">✖ Rechazar</button>
              <button name="decision" value="observacion" className="btn-secundario">💬 Solo enviar observación</button>
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
