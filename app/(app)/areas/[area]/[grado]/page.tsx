import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getGradeBySlug, getPeriods } from "@/lib/data";
import { resolveArea } from "@/lib/context";
import { Descargas } from "@/components/Descargas";

export default async function GradoPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string; grado: string }>;
  searchParams: Promise<{ vigencia?: string }>;
}) {
  const { area: slug, grado } = await params;
  const { vigencia } = await searchParams;
  const { area, year, projects, subjects, vq } = await resolveArea(slug, vigencia);
  const grade = await getGradeBySlug(grado);
  if (!grade) notFound();
  const periods = await getPeriods();

  return (
    <div>
      <Breadcrumbs
        items={[{ href: "/inicio", label: "Inicio" }, { href: `/areas/${area.slug}${vq}`, label: area.name }, { label: grade.name }]}
      />
      <h1 className="mb-1 text-2xl font-bold">
        {area.name} · {grade.name}
      </h1>
      <p className="mb-3 text-slate-600">Vigencia {year.year}. Elija un período.</p>
      {projects.some((x) => x.grade_id === grade.id) && (
        <div className="mb-6">
          <Descargas label={`los 3 períodos de ${grade.name}`} query={{ area: area.slug, grado: grade.slug, vigencia: String(year.year) }} />
        </div>
      )}
      <ul className="grid gap-4 md:grid-cols-3">
        {periods.map((pe) => {
          const all = projects
            .filter((x) => x.grade_id === grade.id && x.period_id === pe.id)
            .sort((a, b) => (subjects.find((s) => s.id === a.subject_id)?.sort_order ?? -1) - (subjects.find((s) => s.id === b.subject_id)?.sort_order ?? -1));
          const p = all[0];
          if (all.length > 1) {
            return (
              <li key={pe.id} className="flex h-full flex-col gap-2 rounded-lg border-t-4 border-x border-b border-linea bg-white p-5" style={{ borderTopColor: area.color }}>
                <span className="text-sm font-semibold text-slate-500">{pe.name}</span>
                {all.map((x) => {
                  const sub = subjects.find((s) => s.id === x.subject_id);
                  const q = new URLSearchParams();
                  if (vigencia) q.set("vigencia", String(year.year));
                  if (x.subject_id) q.set("asignatura", x.subject_id);
                  return (
                    <Link key={x.id} href={`/areas/${area.slug}/${grade.slug}/${pe.number}?${q}`} className="rounded-lg bg-slate-50 p-2 hover:bg-institucional-claro">
                      <span className="block text-xs font-semibold text-institucional">{sub?.name ?? "General"}</span>
                      <span className="text-sm font-semibold leading-snug">{x.name || "(Sin nombre en el documento)"}</span>
                    </Link>
                  );
                })}
              </li>
            );
          }
          return (
            <li key={pe.id}>
              {p ? (
                <Link
                  href={`/areas/${area.slug}/${grade.slug}/${pe.number}${vq}`}
                  className="flex h-full flex-col rounded-lg border-t-4 border-x border-b border-linea bg-white p-5 hover:border-tinta-suave"
                  style={{ borderTopColor: area.color }}
                >
                  <span className="text-sm font-semibold text-slate-500">{pe.name}</span>
                  <span className="mt-1 text-xs font-semibold text-slate-500">
                    {p.label} {p.number_text}
                  </span>
                  <span className="mt-1 text-lg font-bold leading-snug">{p.name || "(Sin nombre en el documento)"}</span>
                </Link>
              ) : (
                <div className="rounded-lg bg-slate-100 p-5 text-slate-500">
                  <span className="text-sm font-semibold">{pe.name}</span>
                  <p className="mt-1">No existe una malla registrada para este período.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
