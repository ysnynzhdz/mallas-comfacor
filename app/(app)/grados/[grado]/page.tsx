import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CurriculumTable } from "@/components/CurriculumTable";
import { requireUser } from "@/lib/auth";
import { getAreas, getGradeBySlug, getPeriods, getPlansForYear, resolveYear } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Column, RowSnap } from "@/lib/types";

type P = { id: string; plan_id: string; subject_id: string | null; label: string; number_text: string; name: string; purpose_label: string; purpose: string; columns: Column[] };

export default async function GradoConsolidado({
  params,
  searchParams,
}: {
  params: Promise<{ grado: string }>;
  searchParams: Promise<{ vigencia?: string; periodo?: string }>;
}) {
  await requireUser();
  const { grado } = await params;
  const sp = await searchParams;
  const grade = await getGradeBySlug(grado);
  if (!grade) notFound();
  const [areas, periods, year] = await Promise.all([getAreas(), getPeriods(), resolveYear(sp.vigencia)]);
  if (!year) notFound();
  const period = periods.find((p) => String(p.number) === sp.periodo) ?? periods[0];
  const plans = await getPlansForYear(year.id);
  const s = await createClient();
  const { data: projData } = await s
    .from("projects")
    .select("id, plan_id, subject_id, label, number_text, name, purpose_label, purpose, columns")
    .eq("grade_id", grade.id)
    .eq("period_id", period.id)
    .in("plan_id", plans.length ? plans.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"]);
  const projects = (projData ?? []) as P[];
  const { data: rowData } = await s
    .from("curriculum_rows")
    .select("id, project_id, cells, origin_row_id, position")
    .in("project_id", projects.length ? projects.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"])
    .order("position");
  const { data: subjData } = await s.from("subjects").select("id, name");
  const rowsOf = (pid: string): RowSnap[] =>
    (rowData ?? []).filter((r) => r.project_id === pid).map((r) => ({ id: r.id, cells: r.cells, origin_row_id: r.origin_row_id }));
  const q = (n: number) => `?${new URLSearchParams({ ...(sp.vigencia ? { vigencia: String(year.year) } : {}), periodo: String(n) })}`;
  const withData = areas.filter((a) => plans.some((pl) => pl.area_id === a.id && projects.some((p) => p.plan_id === pl.id)));
  const without = areas.filter((a) => !withData.includes(a));

  return (
    <div>
      <Breadcrumbs items={[{ href: "/inicio", label: "Inicio" }, { href: "/grados", label: "Vista por grado" }, { label: grade.name }]} />
      <h1 className="mb-1 text-2xl font-bold">{grade.name} · todas las áreas</h1>
      <p className="mb-4 text-slate-600">Vigencia {year.year}. Abra cada área para ver su malla completa del período.</p>
      <nav aria-label="Períodos" className="mb-6 flex flex-wrap gap-2">
        {periods.map((p) => (
          <Link key={p.id} href={`/grados/${grade.slug}${q(p.number)}`} aria-current={p.id === period.id ? "page" : undefined}
            className={p.id === period.id ? "btn-institucional" : "btn-secundario"}>
            {p.name}
          </Link>
        ))}
      </nav>

      <div className="space-y-3">
        {withData.map((a) => {
          const plan = plans.find((pl) => pl.area_id === a.id)!;
          const list = projects.filter((p) => p.plan_id === plan.id);
          return (
            <details key={a.id} className="tarjeta border-l-8" style={{ borderLeftColor: a.color }}>
              <summary className="cursor-pointer list-none">
                <span className="text-xs font-bold uppercase text-slate-500">{a.name}</span>
                {list.map((p) => (
                  <span key={p.id} className="block font-bold leading-snug">
                    {p.subject_id && <span className="text-institucional">{(subjData ?? []).find((x) => x.id === p.subject_id)?.name}: </span>}
                    {p.label} {p.number_text} · {p.name || "(Sin nombre en el documento)"}
                  </span>
                ))}
                <span className="mt-1 block text-sm text-institucional underline">Ver malla del período ▾</span>
              </summary>
              {list.map((p) => (
                <div key={p.id} className="mt-4">
                  {list.length > 1 && <h3 className="mb-1 font-bold">{(subjData ?? []).find((x) => x.id === p.subject_id)?.name}</h3>}
                  {p.purpose && (
                    <p className="mb-2 text-sm"><strong className="text-institucional">{p.purpose_label}:</strong> {p.purpose}</p>
                  )}
                  <CurriculumTable columns={p.columns} rows={rowsOf(p.id)} />
                  <p className="mt-2">
                    <Link className="text-sm font-semibold text-institucional underline"
                      href={`/areas/${a.slug}/${grade.slug}/${period.number}${p.subject_id ? `?asignatura=${p.subject_id}` : ""}`}>
                      Abrir en la página del área →
                    </Link>
                  </p>
                </div>
              ))}
            </details>
          );
        })}
      </div>
      {without.length > 0 && (
        <p className="mt-6 text-sm text-slate-500">
          Sin malla registrada para {grade.name} en este período: {without.map((a) => a.name).join(", ")}.
        </p>
      )}
    </div>
  );
}
