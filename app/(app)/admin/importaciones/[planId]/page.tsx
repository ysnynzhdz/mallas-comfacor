import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { getAreas, getGrades, getPeriods, getProjectsOfPlan } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { publicarImportacion } from "@/app/actions/admin";
import { CATEGORY_LABEL } from "@/lib/table";
import type { Plan } from "@/lib/types";

const NIVEL: Record<string, string> = {
  error: "bg-red-50 text-red-900 border-red-300",
  advertencia: "bg-amber-50 text-amber-900 border-amber-300",
  info: "bg-slate-50 text-slate-700 border-slate-200",
};

export default async function RevisarImportacion({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ publicada?: string }>;
}) {
  await requireAdmin();
  const { planId } = await params;
  const sp = await searchParams;
  const s = await createClient();
  const { data: planData } = await s.from("curriculum_plans").select("*, year:academic_years(year)").eq("id", planId).maybeSingle();
  if (!planData) notFound();
  const plan = planData as Plan & { year: { year: number } };
  const { data: jobData } = await s.from("import_jobs").select("summary, alerts, corrections, source:document_sources(file_name, sha256)").eq("plan_id", planId).maybeSingle();
  const job = jobData as unknown as {
    summary: Record<string, unknown>;
    alerts: { nivel: string; ubicacion: string; mensaje: string }[];
    corrections: {
      ortografia?: { antes: string; despues: string; veces: number; ubicaciones?: string[] }[];
      estructura?: { tipo: string; ubicacion: string; antes: string; despues: string }[];
    };
    source: { file_name: string; sha256: string };
  } | null;
  const { data: subjData } = await s.from("subjects").select("id, name").eq("area_id", plan.area_id);
  const subjName = (id: string | null) => (id ? ((subjData ?? []).find((x) => x.id === id)?.name ?? "") : "");
  const orto = job?.corrections?.ortografia ?? [];
  const estr = job?.corrections?.estructura ?? [];
  const TIPO: Record<string, string> = { limpieza_nombre: "Nombre de unidad limpiado", nombre_propuesto: "Nombre propuesto (no tenía)", sin_nombre: "Sigue sin nombre" };
  const [areas, grades, periods, projects] = await Promise.all([getAreas(), getGrades(), getPeriods(), getProjectsOfPlan(planId)]);
  const area = areas.find((a) => a.id === plan.area_id)!;
  const published = plan.status === "publicada";
  const vq = `?vigencia=${plan.year.year}`;
  const colsSet = new Map<string, string>();
  projects.forEach((p) => p.columns.forEach((c) => colsSet.set(c.label, c.category)));

  return (
    <div>
      <p className="mb-2"><Link href="/admin/importaciones" className="text-sm font-semibold text-institucional hover:underline">← Importaciones</Link></p>
      {sp.publicada && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 font-semibold text-green-800">Malla publicada. Los docentes ya pueden consultarla.</p>}
      <div className="tarjeta mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Revisión de importación · {area.name} · {plan.year.year}</h1>
          <StatusBadge plan={plan.status} />
        </div>
        {job && (
          <p className="mt-1 text-sm text-slate-600">
            Archivo: {job.source.file_name} · {String(job.summary.grados)} grados · {String(job.summary.proyectos)} proyectos · {String(job.summary.filas)} filas ·
            verificación: {String(job.summary.textos_documento)} textos del documento, {String(job.summary.textos_no_encontrados)} sin encontrar
          </p>
        )}
      </div>

      <h2 className="mb-2 text-lg font-bold">1. Grados y períodos encontrados</h2>
      <p className="mb-3 text-sm text-slate-600">Abra cada uno para revisar la vista previa y, si hace falta, corregir errores de importación.</p>
      <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Grado</th>{periods.map((p) => <th key={p.id} className="p-2 text-left">{p.name}</th>)}</tr></thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.id} className="border-t border-slate-100">
                <td className="p-2 font-semibold">{g.name}</td>
                {periods.map((pe) => {
                  const list = projects.filter((x) => x.grade_id === g.id && x.period_id === pe.id);
                  return (
                    <td key={pe.id} className="p-2 align-top">
                      {list.length ? (
                        list.map((p) => (
                          <Link
                            key={p.id}
                            href={`/areas/${area.slug}/${g.slug}/${pe.number}${vq}${p.subject_id ? `&asignatura=${p.subject_id}` : ""}`}
                            className="mb-1 block text-institucional hover:underline"
                          >
                            {subjName(p.subject_id) && <strong>{subjName(p.subject_id)} · </strong>}
                            {p.label} {p.number_text}: {p.name || <em className="text-amber-700">sin nombre</em>}
                            {p.name_is_proposed && <em className="ml-1 text-sky-700">(nombre propuesto)</em>}
                          </Link>
                        ))
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-bold">2. Columnas y su categoría</h2>
      <p className="mb-3 text-sm text-slate-600">Los títulos se conservan como en el Word; la categoría sirve para el buscador y el comparador.</p>
      <ul className="mb-6 grid gap-2 md:grid-cols-2">
        {[...colsSet.entries()].map(([label, cat]) => (
          <li key={label} className="rounded-lg bg-white p-2 text-sm ring-1 ring-slate-200"><strong>{label}</strong> → {CATEGORY_LABEL[cat] ?? cat}</li>
        ))}
      </ul>

      <h2 className="mb-2 text-lg font-bold">3. Alertas para revisar</h2>
      <ul className="mb-6 space-y-2">
        {(job?.alerts ?? [])
          .slice()
          .sort((a, b) => ["error", "advertencia", "info"].indexOf(a.nivel) - ["error", "advertencia", "info"].indexOf(b.nivel))
          .map((a, i) => (
            <li key={i} className={`rounded-lg border p-3 text-sm ${NIVEL[a.nivel] ?? ""}`}>
              <strong className="uppercase">{a.nivel}</strong> · {a.ubicacion}: {a.mensaje}
            </li>
          ))}
      </ul>

      <h2 className="mb-2 text-lg font-bold">Correcciones aplicadas en la plataforma</h2>
      <p className="mb-3 text-sm text-slate-600">
        El documento Word original no se modificó. En la plataforma se corrigieron solo errores evidentes de ortografía y tildes, y la
        estructura de los nombres de unidad. Cada cambio queda aquí para su revisión.
      </p>
      <details className="tarjeta mb-3">
        <summary className="cursor-pointer font-semibold">Ortografía y tildes: {orto.reduce((n, c) => n + (c.veces ?? 1), 0)} cambios ({orto.length} palabras distintas)</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">Antes</th><th className="p-2 text-left">Después</th><th className="p-2 text-left">Veces</th><th className="p-2 text-left">Dónde</th></tr></thead>
            <tbody>
              {orto.map((c, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="p-2 text-red-800 line-through">{c.antes}</td>
                  <td className="p-2 font-semibold text-green-800">{c.despues}</td>
                  <td className="p-2">{c.veces}</td>
                  <td className="p-2 text-slate-600">{(c.ubicaciones ?? []).slice(0, 4).join("; ")}{(c.ubicaciones ?? []).length > 4 ? " …" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="tarjeta mb-6">
        <summary className="cursor-pointer font-semibold">Estructura (nombres de unidad): {estr.length} cambios</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {estr.map((c, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-2">
              <strong>{TIPO[c.tipo] ?? c.tipo}</strong> · {c.ubicacion}
              {c.antes && <> · antes: <span className="text-red-800">«{c.antes}»</span></>}
              {c.despues && <> · ahora: <span className="font-semibold text-green-800">«{c.despues}»</span></>}
            </li>
          ))}
        </ul>
      </details>

      <p className="mb-6"><Link href={`/areas/${area.slug}/informacion${vq}`} className="btn-secundario">Ver información general importada</Link></p>

      {!published && (
        <section className="tarjeta border-2 border-institucional">
          <h2 className="mb-2 text-lg font-bold">4. Aprobar y publicar</h2>
          <p className="mb-3 text-sm text-slate-600">
            Al publicar, cada proyecto queda como versión 1 y los docentes podrán consultarlo. Después, los cambios solo se hacen con solicitudes.
          </p>
          <ActionForm action={publicarImportacion} className="space-y-3">
            <input type="hidden" name="planId" value={planId} />
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirmo" value="1" className="mt-1 size-5" />
              <span>Revisé la vista previa y las alertas de {area.name}, y autorizo publicar esta malla.</span>
            </label>
            <label className="etiqueta" htmlFor="notes">Observaciones (opcional)</label>
            <textarea id="notes" name="notes" rows={2} className="campo" />
            <button className="btn-primario">Publicar malla de {area.name}</button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
