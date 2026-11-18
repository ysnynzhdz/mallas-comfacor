import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/StatusBadge";
import { fecha } from "@/lib/requests";
import type { PlanStatus } from "@/lib/types";

export default async function Importaciones() {
  await requireAdmin();
  const s = await createClient();
  const { data } = await s
    .from("import_jobs")
    .select("id, status, summary, alerts, started_at, plan_id, source:document_sources(file_name), plan:curriculum_plans(status, area:areas(name), year:academic_years(year))")
    .order("started_at", { ascending: false });
  const jobs = (data ?? []) as unknown as {
    id: string; status: string; summary: Record<string, number>; alerts: { nivel: string }[]; started_at: string; plan_id: string;
    source: { file_name: string }; plan: { status: PlanStatus; area: { name: string }; year: { year: number } } | null;
  }[];
  const { data: copies } = await s
    .from("curriculum_plans")
    .select("id, status, area:areas(name), year:academic_years(year)")
    .in("status", ["en_revision", "importada", "pendiente_aprobacion"]);
  const withJob = new Set(jobs.map((j) => j.plan_id));
  const pendingCopies = ((copies ?? []) as unknown as { id: string; status: PlanStatus; area: { name: string }; year: { year: number } }[]).filter(
    (c) => !withJob.has(c.id),
  );
  return (
    <div>
      {pendingCopies.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-bold">Copias de vigencia por revisar y publicar</h2>
          <ul className="grid gap-2 md:grid-cols-3">
            {pendingCopies.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/importaciones/${c.id}`} className="tarjeta flex items-center justify-between gap-2 hover:border-tinta-suave">
                  <span className="font-semibold">{c.area.name} · {c.year.year}</span>
                  <StatusBadge plan={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Importaciones de documentos</h1>
        <Link href="/admin/importaciones/cargar" className="btn-primario">＋ Cargar una importación</Link>
      </div>
      {jobs.length === 0 ? (
        <p className="tarjeta">Todavía no se ha cargado ninguna importación.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const errors = j.alerts.filter((a) => a.nivel === "error").length;
            const warns = j.alerts.filter((a) => a.nivel === "advertencia").length;
            return (
              <li key={j.id}>
                <Link href={`/admin/importaciones/${j.plan_id}`} className="tarjeta block hover:border-tinta-suave">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{j.plan?.area.name} · {j.plan?.year.year}</span>
                    {j.plan && <StatusBadge plan={j.plan.status} />}
                  </div>
                  <p className="text-sm text-slate-600">
                    {j.source.file_name} · cargada {fecha(j.started_at)} · {j.summary.grados} grados · {j.summary.proyectos} proyectos · {j.summary.filas} filas
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-semibold text-red-700">{errors} alerta(s) importantes</span> ·{" "}
                    <span className="font-semibold text-amber-700">{warns} advertencia(s)</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
